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
                const log = await clientDB.getActivityLog(userId) || { dailyStats: {}, totalQuestionsSolved: 0, totalTimeSavedMins: 0, subjects: {} };

                const today = new Date().toISOString().split('T')[0];
                if (!log.dailyStats[today]) {
                    log.dailyStats[today] = { solved: 0, correct: 0, wrong: 0 };
                }

                const count = body.count || 1;
                const correct = body.correct || 0;
                const wrong = body.wrong || 0;

                log.dailyStats[today].solved += count;
                log.dailyStats[today].correct += correct;
                log.dailyStats[today].wrong += wrong;
                log.totalQuestionsSolved = (log.totalQuestionsSolved || 0) + count;
                log.totalTimeSavedMins = (log.totalTimeSavedMins || 0) + count * 2; // ~2 min per question

                // Track subject
                if (body.subject) {
                    if (!log.subjects) log.subjects = {};
                    if (!log.subjects[body.subject]) log.subjects[body.subject] = { count: 0 };
                    log.subjects[body.subject].count += count;
                    if (body.materialName) log.subjects[body.subject].name = body.materialName;
                }

                await clientDB.saveActivityLog(userId, log);
                return jsonResponse({ success: true });
            }

            // ── PROFILE ──────────────────────────────────────
            if (path === '/api/profile' && method === 'GET') {
                const userId = getUserId();
                const log = await clientDB.getActivityLog(userId) || { dailyStats: {}, totalQuestionsSolved: 0, totalTimeSavedMins: 0, subjects: {} };

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

                return jsonResponse({
                    totalQuestionsSolved: log.totalQuestionsSolved || 0,
                    totalTimeSavedMins: log.totalTimeSavedMins || 0,
                    currentStreak: streak,
                    dailyStats: log.dailyStats || {},
                    subjects: log.subjects || {}
                });
            }

            // ── GENERATE IMAGE PROMPT ────────────────────────
            if (path === '/api/generate-image-prompt' && method === 'POST') {
                const apiKey = getApiKey();
                try {
                    const prompt = await clientAI.generateImagePrompt(body.question || '', apiKey);
                    return jsonResponse({ prompt });
                } catch (e) {
                    return jsonResponse({ prompt: 'educational concept illustration' });
                }
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
                    // Generate images locally
                    await clientImage.generateForQuestions(data.questions || [], userId);

                    const fileObj = {
                        id: generateId(),
                        filename: body.title || 'Creative Task',
                        subjectEmoji: data.subjectEmoji || '🎨',
                        questions: data.questions || [],
                        categories: data.categories || ['Design'],
                        type: 'creative',
                        transcript: `Creative task for ${body.author || 'Unknown Author'}: ${body.title}`,
                        summary: data.summary || '',
                        uploadedAt: new Date().toISOString(),
                        userId
                    };

                    await clientDB.saveLibraryItem(userId, fileObj);
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

                    // Generate images locally
                    await clientImage.generateForQuestions(data.questions || [], userId);

                    const fileObj = {
                        id: generateId(),
                        filename: data.suggestedTitle || file.name.replace(/\.[^.]+$/, ''),
                        subjectEmoji: data.subjectEmoji || '📄',
                        questions: data.questions || [],
                        categories: data.categories || ['Business'],
                        type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'doc',
                        transcript: text.substring(0, 20000),
                        summary: '',
                        uploadedAt: new Date().toISOString(),
                        userId
                    };

                    // Generate summary in background
                    fetchAISummary(text, fileObj.filename).then(summary => {
                        fileObj.summary = summary;
                        clientDB.saveLibraryItem(userId, fileObj);
                    }).catch(() => { });

                    await clientDB.saveLibraryItem(userId, fileObj);
                    return jsonResponse(fileObj);
                } catch (e) {
                    console.error('[Bridge] File upload error:', e);
                    return jsonResponse({ error: e.message }, 500);
                }
            }

            // ── YOUTUBE GENERATE ─────────────────────────────
            // YouTube needs a server proxy for transcript fetching (CORS)
            if (path === '/api/youtube/generate' && method === 'POST') {
                // If there's a URL, proxy the transcript through server, then generate locally
                if (body.url) {
                    try {
                        // Try fetching transcript from server proxy
                        const proxyRes = await _originalFetch('/api/youtube/transcript', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: body.url })
                        });

                        if (!proxyRes.ok) {
                            // Fallback: pass through to original server
                            return _originalFetch(url, options);
                        }

                        const proxyData = await proxyRes.json();
                        const transcript = proxyData.transcript || '';
                        const videoTitle = proxyData.title || 'YouTube Video';

                        if (!transcript || transcript.length < 50) {
                            return jsonResponse({ error: 'Could not extract transcript from this video.' }, 400);
                        }

                        const userId = getUserId();
                        const data = await fetchAIQuestions(transcript, videoTitle, 5);

                        // Generate images locally
                        await clientImage.generateForQuestions(data.questions || [], userId);

                        const fileObj = {
                            id: generateId(),
                            filename: data.suggestedTitle || videoTitle,
                            subjectEmoji: data.subjectEmoji || '▶️',
                            questions: data.questions || [],
                            categories: data.categories || ['Technology'],
                            type: 'youtube',
                            url: body.url,
                            transcript: transcript.substring(0, 20000),
                            summary: '',
                            uploadedAt: new Date().toISOString(),
                            userId
                        };

                        // Background summary
                        fetchAISummary(transcript, fileObj.filename).then(summary => {
                            fileObj.summary = summary;
                            clientDB.saveLibraryItem(userId, fileObj);
                        }).catch(() => { });

                        await clientDB.saveLibraryItem(userId, fileObj);
                        return jsonResponse(fileObj);
                    } catch (e) {
                        console.warn('[Bridge] YouTube local gen failed, falling through to server:', e.message);
                        return _originalFetch(url, options);
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

                    // Generate missing images locally
                    await clientImage.generateForQuestions(newQuestions, userId);

                    // Append to file
                    file.questions = [...(file.questions || []), ...newQuestions];
                    await clientDB.saveLibraryItem(userId, file);

                    return jsonResponse({ success: true, newQuestions });
                } catch (e) {
                    return jsonResponse({ error: e.message }, 500);
                }
            }

            // ── REELS SPAWN (Similar Questions) ──────────────
            if (path === '/api/reels/spawn' && method === 'POST') {
                try {
                    const result = await fetchAISimilar(
                        body.seedQuestion || '',
                        body.context || '',
                        body.type || 2,
                        body.existingQuestions || [],
                        body.sourceTitle || 'this material'
                    );

                    // Generate image for the new questions
                    const userId = getUserId();
                    await clientImage.generateForQuestions(result || [], userId);

                    return jsonResponse({ questions: result });
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

                    // Generate images
                    await clientImage.generateForQuestions(newQuestions, userId);

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
                // News generation requires server-side news fetching
                // Fall through to server
                return _originalFetch(url, options);
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
