/**
 * clientBridge.js — API Interception Bridge
 * 
 * Intercepts fetch() calls to server API endpoints and redirects them
 * to client-side modules (clientDB, clientAI, clientImage, clientParser, clientAuth).
 * 
 * This is loaded AFTER clientDB/clientAI/etc but BEFORE client_app.js.
 * It monkey-patches window.fetch so client_app.js works without code changes.
 */
(function () {
    'use strict';

    const _originalFetch = window.fetch;

    // Helper: get API key from settings
    function getApiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    }

    // Helper: get user id
    function getUserId() {
        return localStorage.getItem('study_user') || localStorage.getItem('user_name') || 'guest';
    }

    // Helper: generate UUID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // Helper: build JSON Response
    function jsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Helper: extract YouTube video ID from URL
    function extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/\#]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const p of patterns) {
            const m = url.match(p);
            if (m) return m[1];
        }
        return null;
    }

    // Helper: fetch YouTube transcript via Innertube API from browser
    // This may fail due to CORS — used as last-resort fallback
    async function fetchTranscriptFromBrowser(videoId) {
        const playerBody = {
            context: {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20240101.00.00',
                    hl: 'en',
                    gl: 'US'
                }
            },
            videoId: videoId
        };

        // Use _originalFetch to avoid our monkey-patch loop
        const playerRes = await _originalFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(playerBody)
        });

        if (!playerRes.ok) throw new Error(`Innertube player failed: ${playerRes.status}`);
        const playerData = await playerRes.json();

        const videoTitle = playerData?.videoDetails?.title || 'YouTube Video';
        const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!captions || captions.length === 0) {
            throw new Error('No captions available for this video');
        }

        // Prefer manual captions over auto-generated
        let track = captions.find(c => c.kind !== 'asr') || captions[0];
        const captionUrl = track.baseUrl + '&fmt=json3';

        const captionRes = await _originalFetch(captionUrl);
        if (!captionRes.ok) throw new Error(`Caption fetch failed: ${captionRes.status}`);
        const captionData = await captionRes.json();

        if (!captionData.events) throw new Error('No transcript events found');

        const segments = captionData.events
            .filter(e => e.segs)
            .map(e => ({
                text: e.segs.map(s => s.utf8).join(''),
                start: (e.tStartMs || 0) / 1000,
                duration: (e.dDurationMs || 0) / 1000
            }));

        const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();

        console.log(`[Bridge] Browser transcript: ${fullText.length} chars, lang: ${track.languageCode}`);

        return {
            title: videoTitle,
            transcript: fullText,
            language: track.languageCode || 'en'
        };
    }

    // Helper: pre-assign proxy image URLs so <img> tags load immediately
    function assignImageUrls(questions) {
        questions.forEach(q => {
            if (!q.imageUrl) {
                const prompt = q.imagePrompt || q.question || '';
                const clean = prompt.replace(/\?|-\s*T\d+/g, '').substring(0, 150);
                const encoded = encodeURIComponent(clean);
                const seed = Math.floor(Math.random() * 1000000);
                q.imageUrl = `/api/proxy/image?prompt=${encoded}&seed=${seed}&model=flux`;
            }
        });
    }

    // ── AI FALLBACK HELPERS ────────────────────────────────────
    async function fetchAIQuestions(text, title, count, context = '', distribution = 'standard', avoidQuestions = []) {
        const apiKey = getApiKey();
        if (apiKey && apiKey.length > 10) {
            return clientAI.generateQuestions(text, apiKey, count, title, context, null, distribution, avoidQuestions);
        }
        // Fallback to Server Proxy
        const res = await _originalFetch('/api/proxy/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, title, count, context, distribution, avoidQuestions })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }

    async function fetchAISummary(text, title) {
        const apiKey = getApiKey();
        if (apiKey && apiKey.length > 10) {
            return clientAI.generateSummary(text, apiKey, title);
        }
        // Fallback to Server Proxy
        const res = await _originalFetch('/api/proxy/generate-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, title })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.summary;
    }

    async function fetchAICreative(title, author, type, count) {
        const apiKey = getApiKey();
        if (apiKey && apiKey.length > 10) {
            return clientAI.generateCreativeQuestions(title, author, type, apiKey, count);
        }
        // Fallback to Server Proxy
        const res = await _originalFetch('/api/proxy/generate-creative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, author, type, count })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }

    async function fetchAISimilar(seedQuestion, context, type, existingQuestions, sourceTitle) {
        const apiKey = getApiKey();
        if (apiKey && apiKey.length > 10) {
            return clientAI.generateSimilarQuestions(seedQuestion, context, type, apiKey, existingQuestions, sourceTitle);
        }
        // Fallback to Server Proxy
        const res = await _originalFetch('/api/proxy/generate-similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seedQuestion, context, type, existingQuestions, sourceTitle })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data; // returns array
    }

    // ── Route Matching ────────────────────────────────────────
    function matchRoute(url) {
        const path = typeof url === 'string' ? url : url.pathname || '';
        // Strip base URL if absolute
        const cleanPath = path.replace(/^https?:\/\/[^/]+/, '');
        return cleanPath;
    }

    // ── MAIN FETCH INTERCEPT ──────────────────────────────────
    window.fetch = async function (url, options = {}) {
        const urlStr = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.toString());
        const isInternal = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);

        if (!isInternal) {
            return _originalFetch(url, options);
        }

        const path = matchRoute(url);
        const method = (options.method || 'GET').toUpperCase();

        let body = {};
        if (options.body) {
            if (typeof options.body === 'string') {
                try { body = JSON.parse(options.body); } catch (e) { body = {}; }
            } else if (options.body instanceof FormData) {
                body = options.body; // Keep as FormData
            }
        }

        try {
            // ── AUTH ──────────────────────────────────────────
            if (path === '/api/auth/login' && method === 'POST') {
                try {
                    const result = await clientAuth.login(body.userId, body.password);
                    return jsonResponse({ message: 'Login successful!', userId: result.userId, nickname: result.nickname });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 401);
                }
            }

            if (path === '/api/auth/register' && method === 'POST') {
                try {
                    const result = await clientAuth.register(body.userId, body.password, body.nickname);
                    return jsonResponse({ message: 'Account created!', userId: result.userId, nickname: result.nickname });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }

            // ── LIBRARY (GET) ────────────────────────────────
            if (path === '/api/library' && method === 'GET') {
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                return jsonResponse(items || []);
            }

            // ── LIBRARY DELETE ───────────────────────────────
            const deleteMatch = path.match(/^\/api\/library\/(.+)$/);
            if (deleteMatch && method === 'DELETE') {
                const fileId = deleteMatch[1];
                const userId = getUserId();
                await clientDB.deleteLibraryItem(userId, fileId);
                return jsonResponse({ success: true });
            }

            // ── MATERIAL BY ID (GET) ─────────────────────────
            const materialMatch = path.match(/^\/api\/materials\/([^/]+)$/);
            if (materialMatch && method === 'GET') {
                const fileId = materialMatch[1];
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === fileId);
                if (file) {
                    // Check for missing images and trigger background gen if needed
                    const missingImages = (file.questions || []).filter(q => !q.imageUrl);
                    if (missingImages.length > 0) {
                        console.log(`[Bridge] ${missingImages.length} images missing for ${fileId}. Triggering background generation...`);
                        clientImage.generateForQuestions(file.questions, userId).then(async () => {
                            await clientDB.saveLibraryItem(userId, file);
                            console.log(`[Bridge] Background generation complete for ${fileId}`);
                        }).catch(err => console.error('[Bridge] Background generation failed:', err));
                    }
                    return jsonResponse(file);
                }
                return jsonResponse({ error: 'Not found' }, 404);
            }

            // ── MATERIALS CATEGORIES UPDATE ──────────────────
            const catMatch = path.match(/^\/api\/materials\/([^/]+)\/categories$/);
            if (catMatch && method === 'POST') {
                const fileId = catMatch[1];
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === fileId);
                if (file) {
                    file.categories = body.categories || [];
                    await clientDB.saveLibraryItem(userId, file);
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ error: 'Not found' }, 404);
            }

            // ── CREATE MATERIAL ──────────────────────────────
            if (path === '/api/materials/create' && method === 'POST') {
                const userId = getUserId();
                const newMaterial = {
                    id: generateId(),
                    filename: body.name || 'Untitled',
                    subjectEmoji: body.subjectEmoji || '📄',
                    questions: [],
                    categories: [],
                    type: 'custom',
                    uploadedAt: new Date().toISOString(),
                    userId
                };
                await clientDB.saveLibraryItem(userId, newMaterial);
                return jsonResponse(newMaterial);
            }

            // ── ADD QUESTION ─────────────────────────────────
            if (path === '/api/questions/add' && method === 'POST') {
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === body.fileId);
                if (file) {
                    if (!file.questions) file.questions = [];
                    file.questions.push(body.question);
                    await clientDB.saveLibraryItem(userId, file);
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ error: 'File not found' }, 404);
            }

            // ── FILE UPDATE ──────────────────────────────────
            if (path === '/api/files/update' && method === 'POST') {
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === body.fileId);
                if (file) {
                    Object.assign(file, body.updates || {});
                    await clientDB.saveLibraryItem(userId, file);
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ error: 'Not found' }, 404);
            }

            // ── TOGGLE LIKE ──────────────────────────────────
            if (path === '/api/toggle-like' && method === 'POST') {
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === body.fileId);
                if (file && file.questions && file.questions[body.questionIndex] !== undefined) {
                    file.questions[body.questionIndex].isLiked = !file.questions[body.questionIndex].isLiked;
                    await clientDB.saveLibraryItem(userId, file);
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ error: 'Not found' }, 404);
            }

            // ── TRANSLATE ────────────────────────────────────
            if (path === '/api/translate' && method === 'POST') {
                const apiKey = getApiKey();
                if (!apiKey) return jsonResponse({ translation: body.text });
                try {
                    const result = await clientAI.translateText(body.text, body.targetLang, apiKey);
                    return jsonResponse({ translation: result });
                } catch (e) {
                    return jsonResponse({ translation: body.text });
                }
            }

            // ── TRACK SOLVE ──────────────────────────────────
            if (path === '/api/track/solve' && method === 'POST') {
                const userId = getUserId();
                const log = await clientDB.getActivityLog(userId) || { dailyStats: {}, totalQuestionsSolved: 0, totalTimeSavedMins: 0, materials: {} };

                // Migrate old 'subjects' to 'materials' if needed
                if (log.subjects && !log.materials) {
                    log.materials = {};
                }

                if (!log.materials) log.materials = {};

                const today = new Date().toISOString().split('T')[0];
                if (!log.dailyStats[today]) {
                    log.dailyStats[today] = { solved: 0, correct: 0, wrong: 0 };
                }

                const count = body.count || 1;
                const correct = body.correct || 0;
                const wrong = body.wrong || 0;
                // Correct = 2min saved, Wrong = 1min saved (still learned something)
                const timeSaved = (correct * 2) + (wrong * 1);

                log.dailyStats[today].solved += count;
                log.dailyStats[today].correct += correct;
                log.dailyStats[today].wrong += wrong;
                log.totalQuestionsSolved = (log.totalQuestionsSolved || 0) + count;
                log.totalTimeSavedMins = (log.totalTimeSavedMins || 0) + timeSaved;

                // Track per material (keyed by materialName for uniqueness)
                const materialName = body.materialName || 'Unknown';
                if (!log.materials[materialName]) {
                    log.materials[materialName] = { count: 0, correct: 0, wrong: 0, timeSaved: 0, emoji: body.subject || '📚' };
                }
                log.materials[materialName].count += count;
                log.materials[materialName].correct += correct;
                log.materials[materialName].wrong += wrong;
                log.materials[materialName].timeSaved += timeSaved;
                // Update emoji in case it changed
                if (body.subject) log.materials[materialName].emoji = body.subject;

                await clientDB.saveActivityLog(userId, log);
                return jsonResponse({ success: true });
            }

            // ── PROFILE ──────────────────────────────────────
            if (path === '/api/profile' && method === 'GET') {
                const userId = getUserId();
                const log = await clientDB.getActivityLog(userId) || { dailyStats: {}, totalQuestionsSolved: 0, totalTimeSavedMins: 0, materials: {} };

                // Calculate streak
                let streak = 0;
                const today = new Date();
                for (let i = 0; i < 365; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const key = d.toISOString().split('T')[0];
                    if (log.dailyStats[key] && log.dailyStats[key].solved > 0) {
                        streak++;
                    } else if (i > 0) {
                        break;
                    }
                }

                // Build topSubjects from materials, sorted by most practiced
                const materials = log.materials || {};
                const topSubjects = Object.entries(materials)
                    .map(([name, m]) => ({
                        name,
                        emoji: m.emoji || '📚',
                        count: m.count || 0,
                        correct: m.correct || 0,
                        wrong: m.wrong || 0,
                        timeSaved: m.timeSaved || 0,
                        accuracy: m.count > 0 ? Math.round((m.correct / m.count) * 100) : 0
                    }))
                    .sort((a, b) => b.count - a.count);

                return jsonResponse({
                    totalQuestionsSolved: log.totalQuestionsSolved || 0,
                    totalTimeSavedMins: log.totalTimeSavedMins || 0,
                    currentStreak: streak,
                    dailyStats: log.dailyStats || {},
                    topSubjects
                });
            }

            // ── GENERATE IMAGE PROMPT ────────────────────────
            if (path === '/api/generate-image-prompt' && method === 'POST') {
                // Return the question text directly as the prompt (literal approach)
                const literalPrompt = body.question || 'educational concept illustration';
                return jsonResponse({ prompt: literalPrompt });
            }

            // ── GENERATE IMAGE ───────────────────────────────
            if (path === '/api/generate-image' && method === 'POST') {
                try {
                    const q = { question: body.question || '', questionContext: body.context || '' };
                    const blobUrl = await clientImage.generateForQuestion(q, getUserId());
                    return jsonResponse({ imageUrl: blobUrl || null });
                } catch (e) {
                    return jsonResponse({ imageUrl: null });
                }
            }

            // ── CREATIVE GENERATE ────────────────────────────
            if (path === '/api/creative/generate' && method === 'POST') {
                try {
                    const userId = getUserId();
                    const data = await fetchAICreative(body.title, body.author, body.type, 10);

                    const creativeTypeCategoryMap = {
                        'movie': ['Philosophy / Thinking'],
                        'tvshow': ['Philosophy / Thinking'],
                        'book': ['Philosophy / Thinking'],
                        'music': ['Philosophy / Thinking'],
                        'art': ['Philosophy / Thinking'],
                    };
                    const fallbackCategory = creativeTypeCategoryMap[(body.type || '').toLowerCase()] || ['Philosophy / Thinking'];

                    const fileObj = {
                        id: generateId(),
                        filename: body.title || 'Creative Task',
                        subjectEmoji: data.subjectEmoji || '🎨',
                        questions: data.questions || [],
                        categories: (data.categories && data.categories.length > 0) ? data.categories : fallbackCategory,
                        type: 'creative',
                        transcript: `Creative task for ${body.author || 'Unknown Author'}: ${body.title}`,
                        summary: data.summary || '',
                        uploadedAt: new Date().toISOString(),
                        userId
                    };

                    // Pre-assign image URLs so UI can start loading immediately
                    assignImageUrls(fileObj.questions);

                    await clientDB.saveLibraryItem(userId, fileObj);

                    // Also cache images in IndexedDB in background
                    clientImage.generateForQuestions(fileObj.questions, userId).then(() => {
                        clientDB.saveLibraryItem(userId, fileObj);
                    }).catch(err => console.warn('[Bridge] Background image cache:', err.message));

                    return jsonResponse(fileObj);
                } catch (e) {
                    return jsonResponse({ error: e.message }, 500);
                }
            }

            // ── FILE UPLOAD (Document) ───────────────────────
            if (path === '/api/files' && method === 'POST') {
                try {
                    // Parse file from FormData
                    const file = body instanceof FormData ? body.get('file') : null;
                    if (!file) return jsonResponse({ error: 'No file provided' }, 400);

                    const text = await clientParser.parseFile(file);
                    if (!text || text.trim().length < 50) {
                        return jsonResponse({ error: 'Could not extract enough text from document.' }, 400);
                    }

                    const userId = getUserId();
                    const data = await fetchAIQuestions(text, file.name, 5);

                    const fileObj = {
                        id: generateId(),
                        filename: data.suggestedTitle || file.name.replace(/\.[^.]+$/, ''),
                        subjectEmoji: data.subjectEmoji || '📄',
                        questions: data.questions || [],
                        categories: (data.categories && data.categories.length > 0) ? data.categories : ['Philosophy / Thinking'],
                        type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'doc',
                        transcript: text.substring(0, 20000),
                        summary: '',
                        uploadedAt: new Date().toISOString(),
                        userId
                    };

                    // Pre-assign image URLs so UI can start loading immediately
                    assignImageUrls(fileObj.questions);

                    await clientDB.saveLibraryItem(userId, fileObj);

                    // Also cache images in IndexedDB in background
                    clientImage.generateForQuestions(fileObj.questions, userId).then(() => {
                        clientDB.saveLibraryItem(userId, fileObj);
                    }).catch(err => console.warn('[Bridge] Background image cache:', err.message));

                    // Generate summary in background
                    fetchAISummary(text, fileObj.filename).then(summary => {
                        fileObj.summary = summary;
                        clientDB.saveLibraryItem(userId, fileObj);
                    }).catch(() => { });

                    return jsonResponse(fileObj);
                } catch (e) {
                    console.error('[Bridge] File upload error:', e);
                    return jsonResponse({ error: e.message }, 500);
                }
            }

            // ── YOUTUBE GENERATE ─────────────────────────────
            if (path === '/api/youtube/generate' && method === 'POST') {
                if (body.url) {
                    let transcript = '';
                    let videoTitle = 'YouTube Video';

                    // Strategy 1: Try server proxy first (has 4 internal fallback strategies)
                    try {
                        console.log('[Bridge] YouTube: trying server proxy...');
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 60000);
                        const proxyRes = await _originalFetch('/api/youtube/transcript', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: body.url }),
                            signal: controller.signal
                        });
                        clearTimeout(timeout);

                        if (proxyRes.ok) {
                            const proxyData = await proxyRes.json();
                            transcript = proxyData.transcript || '';
                            videoTitle = proxyData.title || videoTitle;
                            if (transcript.length >= 50) {
                                console.log('[Bridge] YouTube: server proxy succeeded');
                            }
                        }
                    } catch (e) {
                        console.warn('[Bridge] YouTube: server proxy failed:', e.message);
                    }

                    // Strategy 2: Fetch transcript directly from browser (user's IP, not blocked)
                    if (!transcript || transcript.length < 50) {
                        try {
                            console.log('[Bridge] YouTube: trying browser-side transcript fetch...');
                            const videoId = extractVideoId(body.url);
                            if (videoId) {
                                const browserResult = await fetchTranscriptFromBrowser(videoId);
                                transcript = browserResult.transcript || '';
                                videoTitle = browserResult.title || videoTitle;
                                if (transcript.length >= 50) {
                                    console.log('[Bridge] YouTube: browser fetch succeeded');
                                }
                            }
                        } catch (e) {
                            console.warn('[Bridge] YouTube: browser fetch failed:', e.message);
                        }
                    }

                    // If both strategies failed
                    if (!transcript || transcript.length < 50) {
                        return jsonResponse({ error: 'Could not extract transcript from this video. The video may not have captions available.' }, 400);
                    }

                    try {
                        const userId = getUserId();
                        const data = await fetchAIQuestions(transcript, videoTitle, 5);

                        const fileObj = {
                            id: generateId(),
                            filename: data.suggestedTitle || videoTitle,
                            subjectEmoji: data.subjectEmoji || '▶️',
                            questions: data.questions || [],
                            categories: (data.categories && data.categories.length > 0) ? data.categories : ['Technology'],
                            type: 'youtube',
                            url: body.url,
                            transcript: transcript.substring(0, 20000),
                            summary: '',
                            uploadedAt: new Date().toISOString(),
                            userId
                        };

                        assignImageUrls(fileObj.questions);
                        await clientDB.saveLibraryItem(userId, fileObj);

                        clientImage.generateForQuestions(fileObj.questions, userId).then(() => {
                            clientDB.saveLibraryItem(userId, fileObj);
                        }).catch(err => console.warn('[Bridge] Background image cache:', err.message));

                        fetchAISummary(transcript, fileObj.filename).then(summary => {
                            fileObj.summary = summary;
                            clientDB.saveLibraryItem(userId, fileObj);
                        }).catch(() => { });

                        return jsonResponse(fileObj);
                    } catch (e) {
                        console.error('[Bridge] YouTube question generation failed:', e.message);
                        return jsonResponse({ error: 'Failed to generate questions: ' + e.message }, 500);
                    }
                }
                // No URL = daily YouTube quiz, fall through to server
                return _originalFetch(url, options);
            }

            // ── GENERATE MORE QUESTIONS ──────────────────────
            const genMoreMatch = path.match(/^\/api\/generate-more\/(.+)$/);
            if (genMoreMatch && method === 'POST') {
                const fileId = genMoreMatch[1];
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === fileId);

                if (!file) return jsonResponse({ error: 'File not found' }, 404);

                const text = file.transcript || '';
                const existingQs = (file.questions || []).map(q => q.question);

                try {
                    const data = await fetchAIQuestions(
                        text, file.filename, 3, '', body.mode || 'standard', existingQs
                    );

                    const newQuestions = data.questions || [];

                    // Pre-assign image URLs so UI can start loading immediately
                    assignImageUrls(newQuestions);

                    // Append to file immediately
                    file.questions = [...(file.questions || []), ...newQuestions];
                    await clientDB.saveLibraryItem(userId, file);

                    // Also cache images in IndexedDB in background
                    clientImage.generateForQuestions(newQuestions, userId).then(() => {
                        clientDB.saveLibraryItem(userId, file);
                    }).catch(err => console.warn('[Bridge] Background image cache:', err.message));

                    return jsonResponse({ success: true, newQuestions });
                } catch (e) {
                    return jsonResponse({ error: e.message }, 500);
                }
            }

            // ── REELS SPAWN (Similar Questions) ──────────────
            if (path === '/api/reels/spawn' && method === 'POST') {
                try {
                    // Client sends 'question', bridge needs 'seedQuestion'
                    const seedQuestion = body.seedQuestion || body.question || '';
                    if (!seedQuestion) return jsonResponse({ success: false, questions: [] });

                    const userId = getUserId();

                    // Look up source material for context
                    let context = body.context || '';
                    let sourceTitle = body.sourceTitle || 'this material';
                    let originId = body.originId || null;
                    let originFilename = '';
                    let originSubject = '📚';

                    if (originId) {
                        const items = await clientDB.getAllLibrary(userId);
                        const sourceFile = (items || []).find(f => f.id === originId);
                        if (sourceFile) {
                            if (!context) context = (sourceFile.transcript || '').substring(0, 15000);
                            sourceTitle = sourceFile.filename || sourceTitle;
                            originFilename = sourceFile.filename || '';
                            originSubject = sourceFile.subjectEmoji || '📚';
                        }
                    }

                    const existingQs = body.existingQuestions || [];

                    const result = await fetchAISimilar(
                        seedQuestion,
                        context,
                        body.type || 2,
                        existingQs,
                        sourceTitle
                    );

                    // Pre-assign image URLs
                    assignImageUrls(result || []);

                    // Cache images in background
                    clientImage.generateForQuestions(result || [], userId)
                        .catch(err => console.warn('[Bridge] Background image cache:', err.message));

                    // Wrap in format client expects: { question: {...}, originId, sourceTitle, ... }
                    const wrapped = (result || []).map(q => ({
                        question: q,
                        originId,
                        sourceTitle,
                        originFilename,
                        materialName: originFilename,
                        originSubject
                    }));

                    return jsonResponse({ success: true, questions: wrapped });
                } catch (e) {
                    console.error('[Bridge] Spawn failed:', e);
                    return jsonResponse({ questions: [] });
                }
            }

            // ── REELS PREGENERATED ───────────────────────────
            if (path === '/api/reels/pregenerated' && method === 'GET') {
                // No server-side pregeneration in local mode
                return jsonResponse([]);
            }

            // ── REELS GENERATE-MORE ──────────────────────────
            if (path === '/api/reels/generate-more' && method === 'POST') {
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const eligibleFiles = (items || []).filter(f =>
                    (f.type === 'youtube' && f.transcript) || (f.questions && f.questions.length > 0)
                );

                if (eligibleFiles.length === 0) return jsonResponse({ questions: [] });

                const randomFile = eligibleFiles[Math.floor(Math.random() * eligibleFiles.length)];
                const existingQs = (randomFile.questions || []).map(q => q.question);

                try {
                    const data = await fetchAIQuestions(
                        randomFile.transcript || '', randomFile.filename, 3, '', 'standard', existingQs
                    );

                    const newQuestions = (data.questions || []).map(q => ({
                        ...q,
                        originFilename: randomFile.filename,
                        originSubject: randomFile.subjectEmoji,
                        originId: randomFile.id
                    }));

                    // Pre-assign image URLs so UI can start loading immediately
                    assignImageUrls(newQuestions);

                    // Also cache images in IndexedDB in background
                    clientImage.generateForQuestions(newQuestions, userId)
                        .catch(err => console.warn('[Bridge] Background image cache:', err.message));

                    return jsonResponse({ questions: newQuestions });
                } catch (e) {
                    return jsonResponse({ questions: [] });
                }
            }

            // ── REELS CONSUME ────────────────────────────────
            if (path === '/api/reels/consume' && method === 'POST') {
                // No-op in client mode (no server buffer to consume)
                return jsonResponse({ success: true });
            }

            // ── SUMMARY GET ──────────────────────────────────
            const summaryGetMatch = path.match(/^\/api\/summary\/([^/]+)$/);
            if (summaryGetMatch && method === 'POST') {
                const fileId = summaryGetMatch[1];
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === fileId);

                if (!file) return jsonResponse({ error: 'Not found' }, 404);

                if (file.summary) return jsonResponse({ summary: file.summary });

                // Generate on the fly
                if (file.transcript) {
                    try {
                        const summary = await fetchAISummary(file.transcript, file.filename);
                        file.summary = summary;
                        await clientDB.saveLibraryItem(userId, file);
                        return jsonResponse({ summary });
                    } catch (e) {
                        return jsonResponse({ summary: 'Summary generation failed.' });
                    }
                }
                return jsonResponse({ summary: 'No transcript available for summary generation.' });
            }

            // ── SUMMARY UPDATE ───────────────────────────────
            const summaryUpdateMatch = path.match(/^\/api\/summary\/([^/]+)\/update$/);
            if (summaryUpdateMatch && method === 'POST') {
                const fileId = summaryUpdateMatch[1];
                const userId = getUserId();
                const items = await clientDB.getAllLibrary(userId);
                const file = (items || []).find(f => f.id === fileId);

                if (file) {
                    file.summary = body.summary || '';
                    await clientDB.saveLibraryItem(userId, file);
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ error: 'Not found' }, 404);
            }

            // ── NOTION STATUS ────────────────────────────────
            if (path === '/api/notion/status' && method === 'GET') {
                // Notion not supported in client mode
                return jsonResponse({ connected: false });
            }

            // ── NEWS GENERATE ────────────────────────────────
            if (path === '/api/news/generate' && method === 'POST') {
                // News fetching requires server-side RSS/API access
                // Intercept the response to assign image URLs
                try {
                    const serverRes = await _originalFetch(url, options);
                    if (serverRes.ok) {
                        const data = await serverRes.json();
                        if (data.questions && data.questions.length > 0) {
                            assignImageUrls(data.questions);

                            // Save to local DB and trigger background image caching
                            const userId = getUserId();
                            await clientDB.saveLibraryItem(userId, data);

                            clientImage.generateForQuestions(data.questions, userId).then(() => {
                                clientDB.saveLibraryItem(userId, data);
                            }).catch(err => console.warn('[Bridge] News image cache:', err.message));
                        }
                        return jsonResponse(data);
                    }
                    // Return the error response as-is
                    const errData = await serverRes.json().catch(() => ({ error: 'News quiz failed' }));
                    return jsonResponse(errData, serverRes.status);
                } catch (e) {
                    console.error('[Bridge] News generate error:', e);
                    return jsonResponse({ error: 'Failed to generate news quiz: ' + e.message }, 500);
                }
            }

            // ── SYNC NOTION ──────────────────────────────────
            if (path === '/api/sync-notion' && method === 'POST') {
                return jsonResponse({ error: 'Notion sync not available in local mode.' }, 400);
            }

        } catch (bridgeError) {
            console.error('[Bridge] Error handling request:', path, bridgeError);
            // Fall through to original fetch on bridge error
        }

        // ── FALLTHROUGH: Let unmatched requests go to original fetch ─
        return _originalFetch(url, options);
    };

    // ── Settings Logic ────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Load saved API key
        const keyInput = document.getElementById('settings-gemini-key');
        const saveBtn = document.getElementById('save-settings-btn');
        const statusEl = document.getElementById('settings-status');

        if (keyInput) {
            const savedKey = localStorage.getItem('gemini_api_key') || '';
            if (savedKey) keyInput.value = savedKey;
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const key = keyInput ? keyInput.value.trim() : '';
                localStorage.setItem('gemini_api_key', key);

                if (statusEl) {
                    statusEl.hidden = false;
                    statusEl.textContent = key ? '✅ API Key saved!' : '⚠️ API Key cleared.';
                    setTimeout(() => { statusEl.hidden = true; }, 3000);
                }
            });
        }

        // Export/Import Data
        const exportBtn = document.getElementById('export-data-btn');
        const importBtn = document.getElementById('import-data-btn');
        const importInput = document.getElementById('import-data-input');

        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    const userId = getUserId();
                    const library = await clientDB.getAllLibrary(userId);
                    const activityLog = await clientDB.getActivityLog(userId);
                    const settings = { gemini_api_key: localStorage.getItem('gemini_api_key') || '' };

                    const exportData = { version: 1, exportedAt: new Date().toISOString(), userId, library, activityLog, settings };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `insighter_backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                } catch (e) {
                    alert('Export failed: ' + e.message);
                }
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => { importInput && importInput.click(); });
        }

        if (importInput) {
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    if (!data.version || !data.library) {
                        throw new Error('Invalid backup file format.');
                    }

                    if (!confirm(`Import ${data.library.length} items from backup? This will merge with existing data.`)) return;

                    const userId = getUserId();
                    for (const item of data.library) {
                        await clientDB.saveLibraryItem(userId, item);
                    }

                    if (data.activityLog) {
                        await clientDB.saveActivityLog(userId, data.activityLog);
                    }

                    if (data.settings && data.settings.gemini_api_key) {
                        localStorage.setItem('gemini_api_key', data.settings.gemini_api_key);
                        if (keyInput) keyInput.value = data.settings.gemini_api_key;
                    }

                    alert('✅ Import successful! Refreshing...');
                    location.reload();

                } catch (e) {
                    alert('Import failed: ' + e.message);
                }

                importInput.value = '';
            });
        }
    });

    console.log('[ClientBridge] ✅ API interception active. All requests routed client-side.');
})();
