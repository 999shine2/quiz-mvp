// Capacitor API Configuration
// When running in Capacitor (iOS/Android), we need to use absolute URLs
// because the app is served from capacitor://localhost, not http://localhost:3001
const IS_CAPACITOR = window.Capacitor !== undefined;
const API_BASE_URL = IS_CAPACITOR ? 'http://localhost:3001' : '';

// Helper function to build API URLs
function apiUrl(path) {
    return API_BASE_URL + path;
}

console.log(`[API Config] Running in ${IS_CAPACITOR ? 'Capacitor' : 'Browser'} mode. Base URL: ${API_BASE_URL || 'relative'}`);

// Share Target: capture shared URL early (before any reload clears it)
(function captureSharedUrl() {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('shared_url');
    if (sharedUrl) {
        sessionStorage.setItem('pending_share_url', sharedUrl);
        // Clean URL without reload
        history.replaceState(null, '', '/');
    }
})();

/** Format a raw summary string (with [H]...[/H] headers and [PARA] markers) into styled HTML */
function formatSummaryHTML(raw) {
    let formatted = raw
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*)/gm, '• $1');

    const sections = formatted.split(/\[PARA\]|\n\n+/).filter(p => p.trim());
    if (sections.length > 1) {
        return sections.map((section, idx) => {
            let content = section.trim();
            const headerMatch = content.match(/^\[H\](.*?)\[\/H\]\s*/);
            let headerHtml = '';
            if (headerMatch) {
                content = content.replace(headerMatch[0], '').trim();
                headerHtml = `<h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: var(--primary-dark, #6366f1); letter-spacing: 0.02em;">${headerMatch[1]}</h4>`;
            }
            const divider = idx > 0 ? '<hr style="border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 0 0 16px 0;">' : '';
            return `${divider}<div style="margin: 0 0 18px 0;">${headerHtml}<p style="margin: 0; line-height: 1.8; font-size: 14px; color: var(--text-secondary, #475569);">${content.replace(/\n/g, '<br>')}</p></div>`;
        }).join('');
    }
    // Single block
    let content = formatted;
    const headerMatch = content.match(/^\[H\](.*?)\[\/H\]\s*/);
    if (headerMatch) {
        content = content.replace(headerMatch[0], '').trim();
        return `<h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: var(--primary-dark, #6366f1);">${headerMatch[1]}</h4><p style="line-height: 1.8; font-size: 14px; color: var(--text-secondary, #475569);">${content.replace(/\n/g, '<br>')}</p>`;
    }
    return `<p style="line-height: 1.8;">${content.replace(/\n/g, '<br>')}</p>`;
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Dynamic CSS Injection for Like Button ---
    const style = document.createElement('style');
    style.innerHTML = `
        .like-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            font-size: 1.5em;
            background: none;
            border: none;
            cursor: pointer;
            z-index: 20;
            transition: transform 0.2s;
        }
        .like-btn:hover {
            transform: scale(1.2);
        }
        .liked-view-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }
        .liked-view-header h2 {
            margin: 0;
        }
        .category-chip {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.2s;
            background: rgba(0,0,0,0.1);
            color: var(--text-muted);
            white-space: nowrap;
        }
        .category-chip.active {
            color: white;
            border-color: rgba(255,255,255,0.3);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);

    // --- Toggle Like Function ---
    async function toggleLike(questionObj, btnElement, fileId, index) {
        if (!questionObj || !fileId || index === undefined) return;

        // Optimistic UI Update
        const wasLiked = questionObj.isLiked;
        const newState = !wasLiked;
        questionObj.isLiked = newState;
        btnElement.innerHTML = newState ? '❤️' : '🤍';

        // Update global cache if exists
        // (This ensures returning to library shows correct state)

        try {
            await fetch(apiUrl('/api/toggle-like'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                },
                body: JSON.stringify({ fileId, questionIndex: index })
            });
        } catch (e) {
            console.error('Like toggle failed', e);
            // Revert
            questionObj.isLiked = wasLiked;
            btnElement.innerHTML = wasLiked ? '❤️' : '🤍';
            alert('Failed to save like.');
        }
    }

    // Translation helper
    function t(key) {
        const lang = localStorage.getItem('user_lang') || 'en';
        return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
    }

    // Translation cache to avoid redundant API calls
    const translationCache = {};

    // --- Auth Logic ---
    const loginScreen = document.getElementById('login-screen');
    const loginUserId = document.getElementById('login-userid');
    const loginPassword = document.getElementById('login-password');
    const loginPasswordConfirm = document.getElementById('login-password-confirm');
    const loginNickname = document.getElementById('login-nickname');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authTitle = document.getElementById('auth-title');
    const logoutBtn = document.getElementById('logout-btn');

    let isRegisterMode = false;
    let currentUser = localStorage.getItem('study_user');
    let currentUserNick = localStorage.getItem('user_nickname') || currentUser;

    function checkAuth() {
        if (!currentUser) {
            loginScreen.hidden = false;
            loginScreen.style.display = 'flex';
        } else {
            loginScreen.hidden = true;
            loginScreen.style.display = 'none';
            console.log('Logged in as:', currentUser, currentUserNick);
            // Ensure consistency
            localStorage.setItem('user_name', currentUser); // Legacy support
        }
    }

    // Toggle Login / Register
    if (authToggleLink) {
        authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            if (isRegisterMode) {
                authTitle.textContent = "Create Account";
                loginPasswordConfirm.hidden = false;
                loginNickname.hidden = false;
                loginBtn.style.display = 'none';
                registerBtn.style.display = 'block';
                authToggleLink.textContent = "Already have an account? Log In";
            } else {
                authTitle.textContent = "Welcome Back";
                loginPasswordConfirm.hidden = true;
                loginPasswordConfirm.value = '';
                loginNickname.hidden = true;
                loginBtn.style.display = 'block';
                registerBtn.style.display = 'none';
                authToggleLink.textContent = "New here? Create Account";
            }
        });
    }

    // Helper: Auth Request
    async function performAuth(endpoint, payload) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Authentication failed.");
                return false;
            }

            // Success
            currentUser = data.userId;
            currentUserNick = data.nickname || data.userId;

            localStorage.setItem('study_user', currentUser);
            localStorage.setItem('user_nickname', currentUserNick);
            localStorage.setItem('user_name', currentUser);
            if (data.token) {
                localStorage.setItem('auth_token', data.token);
            }

            alert(data.message || "Logged in successfully!");
            location.reload();
            return true;
        } catch (e) {
            console.error(e);
            alert("Network error during authentication.");
            return false;
        }
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const userId = loginUserId.value.trim();
            const password = loginPassword.value.trim();
            if (!userId || !password) return alert("Please enter ID and Password.");
            await performAuth('/api/auth/login', { userId, password });
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const userId = loginUserId.value.trim();
            const password = loginPassword.value.trim();
            const confirmPw = loginPasswordConfirm.value.trim();
            const nickname = loginNickname.value.trim();
            if (!userId || !password || !confirmPw || !nickname) return alert("Please fill all fields.");
            if (password !== confirmPw) return alert("Passwords do not match.");
            await performAuth('/api/auth/register', { userId, password, nickname });
        });
    }


    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Log out?')) {
                localStorage.removeItem('study_user');
                localStorage.removeItem('user_name');
                localStorage.removeItem('auth_token');
                location.reload();
            }
        });
    }

    checkAuth();

    // Handle shared YouTube URL (from Share Target API)
    if (currentUser) {
        const pendingUrl = sessionStorage.getItem('pending_share_url');
        if (pendingUrl && (pendingUrl.includes('youtube.com') || pendingUrl.includes('youtu.be'))) {
            sessionStorage.removeItem('pending_share_url');
            // Delay slightly to ensure DOM is ready
            setTimeout(() => {
                // Switch to upload view
                if (window.switchView) window.switchView('upload');
                // Switch to YouTube tab
                const ytTab = document.querySelector('[data-tab="youtube"]');
                if (ytTab) ytTab.click();
                // Fill the URL
                const ytInput = document.getElementById('youtube-input');
                if (ytInput) {
                    ytInput.value = pendingUrl;
                    ytInput.dispatchEvent(new Event('input'));
                }
                console.log('[Share Target] YouTube URL loaded:', pendingUrl);
            }, 300);
        }
    }

    // Load library data early for recent uploads on home page
    if (currentUser) {
        setTimeout(() => {
            if (window.loadLibraryData) window.loadLibraryData().catch(() => {});
        }, 500);
    }

    // Intercept Fetch to add Header
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        const urlStr = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.toString());

        // Only add headers for internal API calls or current origin to avoid CORS issues
        const isInternal = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);

        if (!isInternal) {
            return originalFetch(url, options);
        }

        options = options || {};
        options.headers = options.headers || {};

        // Send JWT token if available, fallback to x-user-id
        const token = localStorage.getItem('auth_token');
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        if (currentUser) {
            options.headers['x-user-id'] = encodeURIComponent(currentUser);
        }

        // Add Interests Header
        const interests = localStorage.getItem('user_interests');
        if (interests) {
            options.headers['x-user-interests'] = encodeURIComponent(interests);
        }

        // Handle 401 responses (expired token)
        const response = await originalFetch(url, options);
        if (response.status === 401 && token) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('study_user');
            localStorage.removeItem('user_name');
            location.reload();
            return response;
        }
        return response;
    };


    // Translate text using Gemini API
    async function translateText(text, targetLang) {
        if (!text || targetLang === 'en') return text; // Skip if English or empty

        // Check cache
        const cacheKey = `${targetLang}:${text}`;
        if (translationCache[cacheKey]) {
            return translationCache[cacheKey];
        }

        try {
            const apiKey = localStorage.getItem('gemini_api_key') || '';
            const response = await fetch(apiUrl('/api/translate'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({ text, targetLang })
            });

            if (!response.ok) throw new Error('Translation failed');

            const data = await response.json();
            translationCache[cacheKey] = data.translation;
            return data.translation;

        } catch (err) {
            console.error('Translation error:', err);
            return text; // Fallback to original text
        }
    }

    // Translate a question object (question, options, explanation)
    async function translateQuestion(question, targetLang) {
        if (targetLang === 'en') return question;

        // 1. Try Cache
        let cacheKey = '';
        try {
            // Create a unique key based on language and question text (base64 encoded for safety)
            const safeKey = btoa(unescape(encodeURIComponent(question.question)));
            cacheKey = `trans_cache_${targetLang}_${safeKey}`;

            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                // console.log("Cache hit for translation");
                return JSON.parse(cached);
            }
        } catch (e) { console.warn("Cache read failed", e); }

        const translated = { ...question };
        // Save original English text for image generation fallback
        if (!translated.originalQuestion) {
            translated.originalQuestion = question.question;
        }

        try {
            // Translate question text
            translated.question = await translateText(question.question, targetLang);

            // Translate options (Parallel is safe now due to batching at the top level)
            if (question.options && Array.isArray(question.options)) {
                translated.options = await Promise.all(
                    question.options.map(opt => translateText(opt, targetLang))
                );
            }

            // Translate explanation
            if (question.explanation) {
                translated.explanation = await translateText(question.explanation, targetLang);
            }

            // 2. Save to Cache
            try {
                localStorage.setItem(cacheKey, JSON.stringify(translated));
            } catch (e) {
                // Handle QuotaExceededError
                console.warn("Translation Cache full, clearing old entries...");
                // Simple strategy: Clear all trans_cache items to start fresh
                Object.keys(localStorage)
                    .filter(k => k.startsWith('trans_cache_'))
                    .forEach(k => localStorage.removeItem(k));
                // Try saving one last time
                try { localStorage.setItem(cacheKey, JSON.stringify(translated)); } catch (ee) { }
            }

        } catch (err) {
            console.error('Question translation error:', err);
            return question; // Return original on error
        }

        return translated;
    }


    // State
    let currentFile = null;
    let currentQuestions = [];
    let currentQuestionIndex = 0;
    let currentView = 'upload'; // upload, quiz, library, reels
    let userAnswers = {};

    // Elements
    const body = document.body;
    const views = {
        upload: document.getElementById('upload-section'),
        quiz: document.getElementById('quiz-section'),
        library: document.getElementById('library-section'),
        profile: document.getElementById('profile-section'), // Added
        reels: document.getElementById('reels-section')
    };

    const navBtns = {
        upload: document.getElementById('nav-upload'),
        library: document.getElementById('nav-library'),
        profile: document.getElementById('nav-profile'), // Added
        endless: document.getElementById('nav-endless') // Added
    };

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = {
        file: document.getElementById('tab-file'),
        youtube: document.getElementById('tab-youtube'),
        creative: document.getElementById('tab-creative'),
        news: null
    };

    // Upload Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file');
    // API Key input removed


    // YouTube Elements
    const youtubeInput = document.getElementById('youtube-input');
    const generateYtBtn = document.getElementById('generate-yt-btn');

    // Creative Elements
    const creativeTitleInput = document.getElementById('creative-title-input');
    const creativeAuthorInput = document.getElementById('creative-author-input');
    const creativeTypeSelect = document.getElementById('creative-type-select');
    const generateCreativeBtn = document.getElementById('generate-creative-btn');

    // Quiz Elements
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const explanationBox = document.getElementById('explanation-box');
    const explanationText = document.getElementById('explanation-text');
    const prevBtn = document.getElementById('prev-question');
    const nextBtn = document.getElementById('next-question');
    const currentNum = document.getElementById('current-question-num');
    const totalNum = document.getElementById('total-questions-num');
    const backToLibraryBtn = document.getElementById('back-to-library');

    // Library Elements
    const libraryGrid = document.getElementById('library-grid');
    const endlessBtn = document.getElementById('endless-mode-btn');

    // --- Liked Questions Logic ---
    // --- Liked Questions Logic ---
    function renderLikedQuestions() {
        currentView = 'liked';
        libraryGrid.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:16px; padding:0 4px;';
        header.innerHTML = `
            <button onclick="window.renderLibrary()" style="background:var(--card-bg); border:2px solid var(--border-light); border-radius:12px; padding:8px 14px; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--primary-dark); font-family:var(--font-body); display:flex; align-items:center; gap:4px; transition:all 0.2s;">
                ← Back
            </button>
            <h2 style="font-family:var(--font-heading); font-size:1.3rem; font-weight:700; color:var(--text-main); margin:0;">Liked Questions ❤️</h2>
        `;
        libraryGrid.appendChild(header);

        // READ FILTERS
        const sortMode = document.getElementById('sort-select') ? document.getElementById('sort-select').value : 'date-desc';
        const typeFilter = document.getElementById('filter-select') ? document.getElementById('filter-select').value : 'all';
        const catFilter = document.getElementById('category-select') ? document.getElementById('category-select').value : 'all';

        const allFiles = window.allFiles || [];
        let likedQuestions = [];


        // 1. Gather all liked questions
        allFiles.forEach(file => {
            if (file.questions) {
                file.questions.forEach((q, idx) => {
                    if (q.isLiked) {
                        likedQuestions.push({
                            q,
                            file,
                            idx,
                            timestamp: new Date(file.uploadedAt).getTime()
                        });
                    }
                });
            }
        });

        // 2. Apply Filters
        // Type Filter
        if (typeFilter !== 'all') {
            likedQuestions = likedQuestions.filter(item => {
                if (typeFilter === 'youtube') return item.file.type === 'youtube';
                if (typeFilter === 'creative') return item.file.type === 'creative';
                if (typeFilter === 'pdf') return item.file.type !== 'youtube' && item.file.type !== 'creative';
                return true;
            });
        }

        // Category Filter
        if (catFilter !== 'all') {
            likedQuestions = likedQuestions.filter(item => {
                const cats = item.file.categories || [];
                const primaryCat = cats.length > 0 ? cats[0] : (item.file.type === 'youtube' ? 'Video' : 'Document');
                return cats.includes(catFilter) || primaryCat === catFilter;
            });
        }

        // 3. Sort
        if (sortMode === 'date-desc') {
            likedQuestions.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortMode === 'date-asc') {
            likedQuestions.sort((a, b) => a.timestamp - b.timestamp);
        } else if (sortMode === 'alpha') {
            likedQuestions.sort((a, b) => a.file.filename.localeCompare(b.file.filename));
        }

        // 4. Render
        if (likedQuestions.length === 0) {
            libraryGrid.innerHTML += `<div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
                <div style="font-size:2rem; margin-bottom:8px;">🤍</div>
                <p style="font-family:var(--font-body); font-size:0.9rem;">No liked questions yet. Tap ❤️ on questions to save them here.</p>
            </div>`;
        }

        likedQuestions.forEach(item => {
            const { q, file, idx } = item;

            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'cursor:pointer; position:relative; margin-bottom:12px;';

            card.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                window.showExpandedQuestion(q, file.filename, file.id, idx);
            };

            let categoryText = 'General';
            if (file.categories && file.categories.length > 0) {
                categoryText = file.categories[0];
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div style="flex:1; min-width:0;">
                        <span style="display:inline-block; font-size:0.65rem; font-weight:700; color:var(--primary-dark); background:rgba(107,140,66,0.12); padding:3px 8px; border-radius:6px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">
                            ${categoryText}
                        </span>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:8px;">
                            ${file.subjectEmoji || '📄'} ${file.filename}
                        </div>
                    </div>
                    <button style="background:none; border:none; font-size:1.4rem; cursor:pointer; padding:4px; transition:transform 0.2s;"
                        onclick="event.stopPropagation(); this.closest('.card').remove(); window._toggleLikeExternal('${file.id}', ${idx})">❤️</button>
                </div>
                <p style="font-family:var(--font-body); font-size:0.95rem; font-weight:600; color:var(--text-main); line-height:1.6; margin-bottom:12px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${q.question}</p>
                <div style="background:rgba(107,140,66,0.08); border-radius:10px; padding:10px 14px; border:1px solid var(--border-light); text-align:center;">
                    <span style="font-size:0.8rem; color:var(--primary); font-weight:600;">Tap to view answer →</span>
                </div>
            `;
            libraryGrid.appendChild(card);
        });
    }

    // Expose renderLikedQuestions to window so it can be called by filter handlers
    window.renderLikedQuestions = renderLikedQuestions;

    // Expose View Toggler properly
    window.toggleLikedView = function () {
        if (currentView === 'liked') {
            window.renderLibrary(); // This sets currentView = 'library' usually
        } else {
            renderLikedQuestions();
        }
    };

    // Modal Logic for Expanded Question
    window.showExpandedQuestion = function (q, filename, fileId, idx) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:10000;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        // MCQ options
        const isMCQ = q.options && q.options.length > 0;
        let answerHTML = '';

        if (isMCQ) {
            const options = q.options.map((opt, i) => {
                const isCorrect = i === q.correctAnswer;
                const bg = isCorrect ? 'rgba(107,140,66,0.12)' : 'rgba(0,0,0,0.02)';
                const border = isCorrect ? 'var(--primary)' : 'var(--border-light)';
                const badgeColor = isCorrect ? 'var(--primary); color:#fff' : 'var(--border-light); color:var(--text-muted)';
                const textColor = isCorrect ? 'var(--primary-dark)' : 'var(--text-main)';
                return `<div style="padding:12px 14px; border-radius:12px; border:1.5px solid ${border}; background:${bg}; display:flex; align-items:center; gap:10px;">
                    <span style="width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.7rem; font-weight:700; background:${badgeColor}; flex-shrink:0;">${['A','B','C','D'][i] || (i+1)}</span>
                    <span style="font-size:0.9rem; color:${textColor}; font-weight:${isCorrect ? '600' : '400'};">${opt}</span>
                </div>`;
            }).join('');
            answerHTML = `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">${options}</div>`;
        } else {
            // SAQ / Flashcard — show the answer text
            const answerText = q.correctAnswer || q.answer || q.sampleAnswer || '';
            if (answerText) {
                answerHTML = `<div style="background:rgba(107,140,66,0.08); border-radius:14px; padding:16px; border:1.5px solid var(--primary-light); margin-bottom:20px;">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--primary-dark); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">Answer</div>
                    <p style="font-size:0.92rem; color:var(--text-main); line-height:1.7;">${answerText}</p>
                </div>`;
            }
        }

        const modal = document.createElement('div');
        modal.style.cssText = 'background:var(--card-bg); border-radius:24px; padding:28px 24px; border:2px solid #fff; box-shadow:var(--shadow-hover); max-width:560px; width:calc(100% - 32px); position:relative; max-height:90vh; overflow-y:auto;';
        modal.innerHTML = `
            <button onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:1.2rem; color:var(--text-muted); cursor:pointer; padding:4px;">✕</button>

            <div style="margin-bottom:16px;">
                <span style="font-size:0.65rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.1em;">Liked Question</span>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">From: ${filename}</div>
            </div>

            <p style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; color:var(--text-main); line-height:1.6; margin-bottom:20px;">${q.question}</p>

            ${answerHTML}

            ${q.explanation ? `<div style="background:rgba(107,140,66,0.06); border-radius:14px; padding:16px; border:1px solid var(--border-light);">
                <div style="font-size:0.7rem; font-weight:700; color:var(--primary-dark); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Explanation</div>
                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.7; font-style:italic;">${q.explanation}</p>
            </div>` : ''}
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    };

    // Global helper for the toggle inside innerHTML
    window._toggleLikeExternal = async (fileId, idx) => {
        // Toggle off
        const file = window.allFiles.find(f => f.id === fileId);
        if (file && file.questions[idx]) {
            file.questions[idx].isLiked = false;
            // Call API
            try {
                await fetch(apiUrl('/api/toggle-like'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                    },
                    body: JSON.stringify({ fileId, questionIndex: idx })
                });
            } catch (e) { console.error(e); }
        }
    };

    // Inject "Liked Questions" Button into Library Header (if not exists)
    // We observe libraryGrid changes or just append to filter area?
    // Let's hook into loadLibrary to ensure it appears.
    const originalLoadLibrary = loadLibrary;
    // We can't overwrite loadLibrary easily inside scope without recursion if not careful.
    // Instead, let's add a button next to endlessBtn in existing HTML if possible, or inject.

    // Injecting into the 'library-filters' container would be best.
    // [DEPRECATED] Liked Auto-Injection Removed


    // Filter Elements
    const sortSelect = document.getElementById('sort-select');
    const filterSelect = document.getElementById('filter-select');
    const categorySelect = document.getElementById('category-select');
    let libraryFiles = [];

    // Reel Elements
    const reelsContainer = document.getElementById('reels-container');
    const exitReelsBtn = document.getElementById('exit-reels-btn');


    async function _deprecated_trackSolved(count, subjectEmoji) {
        console.error('Using deprecated tracker!'); return;
        try {
            await fetch(apiUrl('/api/track/solve'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                },
                body: JSON.stringify({ count, subject: subjectEmoji })
            });
        } catch (e) { console.error('Tracking failed', e); }
    }

    // --- Navigation ---

    window.switchView = function (viewName) {
        if (viewName === 'reels') {
            body.classList.add('reels-mode');
        } else {
            body.classList.remove('reels-mode');
        }

        Object.keys(views).forEach(key => {
            if (key === viewName) {
                views[key].classList.add('active-view');
            } else {
                views[key].classList.remove('active-view');
            }
        });

        // Reset all nav buttons
        Object.values(navBtns).forEach(btn => btn && btn.classList.remove('active'));

        // Set active button
        if (viewName === 'upload') {
            if (navBtns.upload) navBtns.upload.classList.add('active');
        } else if (viewName === 'library') {
            if (navBtns.library) navBtns.library.classList.add('active');
            loadLibrary();
        } else if (viewName === 'profile') {
            if (navBtns.profile) navBtns.profile.classList.add('active');
            renderProfile();
        } else if (viewName === 'reels') {
            if (navBtns.endless) navBtns.endless.classList.add('active');
        }

        currentView = viewName;
    }


    // --- Auto-Save Helper ---
    // Per-question tracking now happens in handleAnswer(), so no batch tracking needed here
    async function saveProgressAndExit() {
        switchView('library');
    }

    navBtns.upload.addEventListener('click', () => switchView('upload'));
    navBtns.library.addEventListener('click', async () => await saveProgressAndExit());

    if (navBtns.endless) {
        navBtns.endless.addEventListener('click', (e) => {
            e.preventDefault();
            // Trigger the main endless mode logic
            if (endlessBtn) endlessBtn.click();
        });
    }

    // Exit Reels Logic - Save Buffer!
    if (exitReelsBtn) {
        exitReelsBtn.addEventListener('click', () => {
            // Save back remaining solved questions to buffer
            if (window.currentReelQs && window.currentReelQs.length > 0) {
                const unsolved = window.currentReelQs.filter(q => !isQuestionSolved(q.question));

                // Prioritize these unsolved ones at the front
                window.endlessBuffer = [...unsolved, ...window.endlessBuffer];

                // Deduplicate by question text
                const uniqueBuffer = [];
                const seen = new Set();
                window.endlessBuffer.forEach(item => {
                    const txt = item.question ? item.question.question : item.question;
                    if (!seen.has(txt)) {
                        seen.add(txt);
                        uniqueBuffer.push(item);
                    }
                });
                window.endlessBuffer = uniqueBuffer;

                // Setup limit
                if (window.endlessBuffer.length > 20) { // Keep a bit more than target
                    window.endlessBuffer = window.endlessBuffer.slice(0, 20);
                }

                saveBufferToLocal();
                console.log(`Saved ${unsolved.length} unsolved items back to buffer.`);
            }
            // Hide session bar
            const _bar = document.getElementById('reels-session-bar');
            if (_bar) _bar.hidden = true;
            switchView('library');
        });
    }
    navBtns.profile.addEventListener('click', () => switchView('profile'));
    backToLibraryBtn.addEventListener('click', async () => await saveProgressAndExit());

    // Finish Review button
    const submitQuizBtn = document.getElementById('submit-quiz');
    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', async () => await saveProgressAndExit());
    }

    if (exitReelsBtn) {
        exitReelsBtn.addEventListener('click', () => {
            const _bar = document.getElementById('reels-session-bar');
            if (_bar) _bar.hidden = true;
            switchView('library');
        });
    }

    // --- Personal Interests Logic ---
    const personalBtn = document.getElementById('personal-btn');
    const personalModal = document.getElementById('personal-modal');
    const closePersonalModalBtn = document.getElementById('close-personal-modal-btn');
    const savePersonalBtn = document.getElementById('save-personal-btn');
    const interestOptionsContainer = document.getElementById('interest-options');
    const selectedInterestsPreview = document.getElementById('selected-interests-preview');

    const AVAILABLE_INTERESTS = [
        "Business", "Science", "World", "Technology",
        "Entertainment", "Sports", "Health", "U.S."
    ];

    let selectedInterests = [];

    function renderInterestOptions() {
        interestOptionsContainer.innerHTML = '';
        AVAILABLE_INTERESTS.forEach(interest => {
            const btn = document.createElement('button');
            btn.textContent = interest;
            btn.className = 'interest-btn';
            btn.style.padding = '8px 16px';
            btn.style.borderRadius = '20px';
            btn.style.border = '1px solid var(--border-light)';
            btn.style.background = 'var(--bg-body)';
            btn.style.color = 'var(--text-main)';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s';

            if (selectedInterests.includes(interest)) {
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
                btn.style.borderColor = 'var(--primary)';
            }

            btn.onclick = () => {
                if (selectedInterests.includes(interest)) {
                    selectedInterests = selectedInterests.filter(i => i !== interest);
                } else {
                    selectedInterests.push(interest);
                }
                renderInterestOptions();
            };

            interestOptionsContainer.appendChild(btn);
        });
    }

    function renderSelectedPreview() {
        if (!selectedInterestsPreview) return;
        selectedInterestsPreview.innerHTML = '';
        if (selectedInterests.length === 0) {
            selectedInterestsPreview.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">No interests selected</span>';
            return;
        }
        selectedInterests.forEach(interest => {
            const span = document.createElement('span');
            span.textContent = interest;
            span.style.fontSize = '0.75rem';
            span.style.padding = '4px 8px';
            span.style.borderRadius = '12px';
            span.style.background = 'rgba(100, 100, 100, 0.1)';
            span.style.color = 'var(--text-main)';
            selectedInterestsPreview.appendChild(span);
        });
    }

    // Load initial interests
    const storedInterests = localStorage.getItem('user_interests');
    if (storedInterests) {
        try {
            selectedInterests = JSON.parse(storedInterests);
            renderSelectedPreview();
        } catch (e) {
            console.error("Failed to parse user interests", e);
        }
    }

    if (personalBtn) {
        personalBtn.addEventListener('click', () => {
            // Re-read storage to be safe or just use current memory state? 
            // Using memory state `selectedInterests` is fine if we update it on save.
            renderInterestOptions();
            personalModal.hidden = false;
            personalModal.style.display = 'flex';
        });
    }

    if (closePersonalModalBtn) {
        closePersonalModalBtn.addEventListener('click', () => {
            personalModal.hidden = true;
            personalModal.style.display = 'none';
        });
    }

    if (savePersonalBtn) {
        savePersonalBtn.addEventListener('click', () => {
            localStorage.setItem('user_interests', JSON.stringify(selectedInterests));
            renderSelectedPreview();
            personalModal.hidden = true;
            personalModal.style.display = 'none';
            // Optional: You could trigger a reload or something if this affects the feed immediately
            alert('Interests saved!');
        });
    }

    // --- Creative Mode Logic ---
    if (generateCreativeBtn) {
        // Creative input clear/paste buttons
        function setupInputButtons(input, clearBtn, pasteBtn) {
            function update() {
                const hasText = input.value.trim().length > 0;
                if (clearBtn) clearBtn.hidden = !hasText;
                if (pasteBtn) pasteBtn.hidden = hasText;
            }
            input.addEventListener('input', update);
            if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
            if (pasteBtn) pasteBtn.addEventListener('click', async () => {
                try { const t = await navigator.clipboard.readText(); if (t) { input.value = t.trim(); update(); } } catch (e) { input.focus(); }
            });
            update();
        }

        document.querySelectorAll('.creative-clear-btn').forEach(btn => {
            const input = document.getElementById(btn.dataset.target);
            const pasteBtn = btn.parentElement.querySelector('.creative-paste-btn');
            if (input) setupInputButtons(input, btn, pasteBtn);
        });

        generateCreativeBtn.addEventListener('click', async () => {
            const title = creativeTitleInput.value.trim();
            const author = creativeAuthorInput.value.trim();
            const type = creativeTypeSelect.value;

            if (!title) {
                const titleWrapper = creativeTitleInput.closest('.url-input-wrapper');
                if (titleWrapper) {
                    titleWrapper.classList.add('input-error');
                    creativeTitleInput.placeholder = 'Please enter a title';
                    setTimeout(() => {
                        titleWrapper.classList.remove('input-error');
                        creativeTitleInput.placeholder = 'e.g. Inception, 1984, Friends...';
                    }, 2000);
                }
                creativeTitleInput.focus();
                return;
            }

            const loader = generateCreativeBtn.querySelector('.loader');
            const btnText = generateCreativeBtn.querySelector('.btn-text');

            generateCreativeBtn.disabled = true;
            btnText.hidden = true;
            loader.hidden = false;
            loader.style.display = 'block';

            const creativeStatus = startGenStatus('gen-status-creative', ['Looking up "' + title + '"...', 'Analyzing content...', 'Generating questions...', 'Loading images...']);

            try {
                // Call API
                const response = await fetch(apiUrl('/api/creative/generate'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title,
                        author: author,
                        type: type,
                        apiKey: localStorage.getItem('gemini_api_key') || ''
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Generation failed');
                }

                const data = await response.json();

                // Add to global state
                if (!window.allFiles) window.allFiles = [];
                window.allFiles.unshift(data);

                // Wait for ALL question images before starting quiz
                const cqWithImages = (data.questions || []).filter(q => q.imageUrl && !q.imageUrl.startsWith('blob:'));
                if (cqWithImages.length > 0) {
                    const statusEl = document.getElementById('gen-status-creative');
                    if (statusEl) statusEl.textContent = `Loading images (0/${cqWithImages.length})...`;
                    let cLoaded = 0;
                    await Promise.all(cqWithImages.map(q => new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => { cLoaded++; if (statusEl) statusEl.textContent = `Loading images (${cLoaded}/${cqWithImages.length})...`; resolve(); };
                        img.onerror = () => { cLoaded++; if (statusEl) statusEl.textContent = `Loading images (${cLoaded}/${cqWithImages.length})...`; resolve(); };
                        img.src = q.imageUrl;
                        setTimeout(resolve, 15000);
                    })));
                }

                // Start Quiz directly
                window.startQuiz(data.questions);

                // Auto-Clear Form
                creativeTitleInput.value = '';
                creativeAuthorInput.value = '';

            } catch (error) {
                console.error(error);
                alert("Failed to generate: " + error.message);
            } finally {
                creativeStatus.stop();
                generateCreativeBtn.disabled = false;
                btnText.hidden = false;
                loader.hidden = true;
                loader.style.display = 'none';
            }
        });
    }

    // --- Tab Logic ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            Object.values(tabContents).forEach(c => c && (c.style.display = 'none'));

            btn.classList.add('active');
            const tabName = btn.dataset.tab;
            if (tabContents[tabName]) {
                tabContents[tabName].style.display = 'block';
            }
        });
    });

    // --- File Upload Logic ---
    dropZone.addEventListener('click', (e) => {
        if (e.target !== removeFileBtn && e.target !== generateBtn) {
            fileInput.click();
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        const validTypes = ['.pdf', '.doc', '.docx'];
        const extension = '.' + file.name.split('.').pop().toLowerCase();

        if (!validTypes.includes(extension)) {
            alert('Invalid file type. Please upload PDF, DOC, or DOCX.');
            return;
        }

        currentFile = file;
        fileName.textContent = file.name;
        fileInfo.hidden = false;
        generateBtn.disabled = false;
    }

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentFile = null;
        fileInput.value = '';
        fileInfo.hidden = true;
        generateBtn.disabled = true;
    });

    generateBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentFile) return;

        const success = await handleGeneration('/api/files', (formData) => {
            formData.append('file', currentFile);
        }, generateBtn);

        if (success) {
            // Auto-Clear File
            currentFile = null;
            fileInput.value = '';
            fileName.textContent = '';
            fileInfo.hidden = true;
            generateBtn.disabled = true;
        }
    });

    // --- YouTube Logic ---

    const ytClearBtn = document.getElementById('yt-clear-btn');
    const ytPasteBtn = document.getElementById('yt-paste-btn');

    function updateYtButtons() {
        const val = youtubeInput.value.trim();
        const isValid = val.length > 0 && (val.includes('youtube.com') || val.includes('youtu.be'));
        generateYtBtn.disabled = !isValid;
        if (ytClearBtn) ytClearBtn.hidden = val.length === 0;
        if (ytPasteBtn) ytPasteBtn.hidden = val.length > 0;
    }

    youtubeInput.addEventListener('input', updateYtButtons);

    // Clear button
    if (ytClearBtn) {
        ytClearBtn.addEventListener('click', () => {
            youtubeInput.value = '';
            updateYtButtons();
            youtubeInput.focus();
        });
    }

    // Paste button — reads clipboard and fills input
    if (ytPasteBtn) {
        ytPasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    youtubeInput.value = text.trim();
                    updateYtButtons();
                }
            } catch (e) {
                // Clipboard API denied — fallback: focus input so user can Ctrl+V
                youtubeInput.focus();
            }
        });
    }

    generateYtBtn.addEventListener('click', async () => {
        const url = youtubeInput.value.trim();
        if (!url) {
            alert('Please enter a YouTube URL');
            return;
        }

        const success = await handleGeneration('/api/youtube/generate', null, generateYtBtn, { url });

        if (success) {
            youtubeInput.value = '';
            updateYtButtons();
        }
    });

    // --- Generation Progress Status ---
    function startGenStatus(statusId, steps) {
        const el = document.getElementById(statusId);
        if (!el) return { stop() {} };
        el.hidden = false;
        let stepIdx = 0;
        el.textContent = steps[0];
        const interval = setInterval(() => {
            stepIdx++;
            if (stepIdx < steps.length) {
                el.textContent = steps[stepIdx];
            }
        }, 3500);
        return {
            stop() {
                clearInterval(interval);
                el.hidden = true;
                el.textContent = '';
            }
        };
    }

    // --- Shared Generation Logic ---

    async function handleGeneration(endpoint, formDataCallback, btnElement, jsonBody = null) {
        const btnText = btnElement.querySelector('.btn-text');
        const loader = btnElement.querySelector('.loader');
        btnText.style.display = 'none';
        loader.hidden = false;
        btnElement.disabled = true;

        // Determine which status element to use
        const isYT = endpoint.includes('youtube');
        const statusId = isYT ? 'gen-status-yt' : 'gen-status-file';
        const steps = isYT
            ? ['Extracting transcript...', 'Analyzing content...', 'Generating questions...', 'Loading images...']
            : ['Reading document...', 'Analyzing content...', 'Generating questions...', 'Loading images...'];
        const status = startGenStatus(statusId, steps);

        try {
            let options = { method: 'POST' };

            // INJECT USER ID HEADER
            const headers = {
                'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
            };

            if (jsonBody) {
                headers['Content-Type'] = 'application/json';
                options.headers = headers;
                options.body = JSON.stringify({
                    // apiKey logic removed

                    ...jsonBody
                });
            } else {
                // For FormData, do NOT set Content-Type (browser sets it with boundary)
                // But we MUST attach our custom headers
                options.headers = headers;

                const formData = new FormData();
                if (formDataCallback) formDataCallback(formData);
                // apiKey logic removed

                options.body = formData;
            }

            const response = await fetch(endpoint, options);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Generation failed');
            }

            const data = await response.json();

            // --- ERROR LOGGING FOR USER DEBUG ---
            if (data.transcriptError) {
                console.group('%c ⚠️ YouTube Transcript Error ', 'background: #ff0000; color: #ffffff; font-size: 14px; padding: 4px;');
                console.error('SERVER MESSAGE:', data.transcriptError);
                console.warn('QUALITY SOURCE:', data.qualitySource || 'Unknown');
                console.log('Use "Paste Text" mode or configure a Proxy to fix this.');
                console.groupEnd();
            }
            // ------------------------------------

            currentFile = data;
            window.currentFile = data; // Sync global state for renderQuestion

            if (data.isMock) {
                alert('⚠️ No API Key Provided\n\nGenerated questions using generic MOCK DATA. To get real questions.');
            }

            // Wait for ALL question images to load before starting quiz
            const questionsWithImages = (data.questions || []).filter(q => q.imageUrl && !q.imageUrl.startsWith('blob:'));
            if (questionsWithImages.length > 0) {
                const statusEl = document.getElementById(statusId);
                if (statusEl) statusEl.textContent = `Loading images (0/${questionsWithImages.length})...`;
                let loaded = 0;
                await Promise.all(questionsWithImages.map(q => new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => { loaded++; if (statusEl) statusEl.textContent = `Loading images (${loaded}/${questionsWithImages.length})...`; resolve(); };
                    img.onerror = () => { loaded++; if (statusEl) statusEl.textContent = `Loading images (${loaded}/${questionsWithImages.length})...`; resolve(); };
                    img.src = q.imageUrl;
                    setTimeout(resolve, 15000);
                })));
            }

            startQuiz(data.questions);
            return true; // Success

        } catch (error) {
            alert('Error: ' + error.message);
            return false; // Failure
        } finally {
            status.stop();
            btnText.style.display = 'block';
            loader.hidden = true;
            btnElement.disabled = false;
        }
    }

    // --- Helper: Visual Prompt Generation ---
    function generateVisualPrompt(questionText, options, subject) {
        // Sanitize Subject: If non-ASCII, fallback to 'education'
        let safeSubject = subject || 'education';
        if (/[^\x00-\x7F]/.test(safeSubject)) safeSubject = 'education';

        let context = questionText || '';

        // NEW: Normalize smart quotes and dashes to ASCII
        context = context
            .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
            .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
            .replace(/[\u2013\u2014]/g, "-") // En/Em dashes
            .replace(/\u2026/g, "...");      // Ellipsis

        // Strict Sanitization: Remove special chars/punctuation that confuse the API
        // Only keep letters, numbers, spaces, basic punctuation, AND Unicode characters (for Korean, etc.)
        context = context.replace(/[^a-zA-Z0-9 .,'-\u00C0-\u00FF\uAC00-\uD7AF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/g, '');

        // Trim extra spaces
        context = context.replace(/\s+/g, ' ').trim();

        // Shorten to 100 chars max (approx 15 words) for stability
        if (context.length > 100) context = context.substring(0, 100);

        return `${safeSubject} topic, ${context}, digital art, minimal, clear`;
    }

    // --- Standard Quiz Logic ---

    window.startQuiz = async function (questions) {
        // Translate questions if language is not English
        const currentLang = localStorage.getItem('user_lang') || 'en';
        if (currentLang !== 'en' && questions && questions.length > 0) {
            // Show loading indicator
            const quizSection = document.getElementById('quiz-section');
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'translation-loading';
            loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); padding: 20px 40px; border-radius: 12px; color: white; z-index: 10000;';
            loadingMsg.textContent = t('translating_questions') || 'Translating questions...';
            document.body.appendChild(loadingMsg);

            // Translate all questions
            questions = await Promise.all(
                questions.map(q => translateQuestion(q, currentLang))
            );

            // Remove loading indicator
            document.body.removeChild(loadingMsg);
        }


        if (!questions || questions.length === 0) {
            alert('No questions available yet.\n\nUse "Create Question" to add some!');
            switchView('library');
            return;
        }
        currentQuestions = questions;
        currentQuestionIndex = 0;
        userAnswers = {};

        // Preload all question images in the background so they're cached
        questions.forEach(q => {
            if (q.imageUrl && !q.imageUrl.startsWith('blob:')) {
                const preload = new Image();
                preload.src = q.imageUrl;
            }
        });

        totalNum.textContent = questions.length;
        renderQuestion();
        switchView('quiz');
    }

    function renderQuestion() {
        if (!currentQuestions || currentQuestions.length === 0) return;

        const header = document.querySelector('.quiz-card');
        const activeFile = currentFile || window.currentFile;

        const q = currentQuestions[currentQuestionIndex];
        currentNum.textContent = currentQuestionIndex + 1;
        questionText.textContent = q.question;

        // Add Like Button
        // Ensure relative positioning for absolute button
        if (header && getComputedStyle(header).position === 'static') {
            header.style.position = 'relative';
        }

        // --- Image Generation Logic (Enabled for Standard Quiz) ---
        const questionContainer = document.querySelector('.question-container');
        // Clear ALL existing images (Fix for "piling up" issue)
        questionContainer.querySelectorAll('.reel-image').forEach(el => el.remove());
        questionContainer.querySelectorAll('.image-placeholder').forEach(el => el.remove());

        const activeApiKey = localStorage.getItem('gemini_api_key') || '';

        // Function to load image
        const loadImage = async () => {
            // 1. ALWAYS Generate Fresh "Nano Banana" Prompt
            // USER REQUEST: "Only use question... do not use title, category, summary"
            // STRICTLY use the question text only.
            const promptQuestion = q.question;

            // [Optimization] We skip client-side prompt generation.
            // We send the raw question directly to the server's /api/generate-image endpoint.
            // This ensures consistency with Endless Review logic.
            // 1. Create Wrapper & Image (Synchronous)
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';
            wrapper.id = 'current-image-wrapper';
            wrapper.style.position = 'relative'; // Anchor for Like Button
            wrapper.style.width = '100%';
            wrapper.style.display = 'block'; // RESTORED: Show images
            wrapper.style.marginBottom = '20px';
            wrapper.style.borderRadius = '12px';
            wrapper.style.overflow = 'hidden';

            const image = document.createElement('img');
            image.className = 'reel-image';
            image.id = 'current-question-image';
            image.alt = "Question illustration";
            image.style.marginBottom = '0';
            image.style.width = '100%';
            image.style.objectFit = 'cover';
            image.style.aspectRatio = '3/4';
            image.src = '/placeholder.png'; // Immediate placeholder

            wrapper.appendChild(image);

            // 2. Inject into DOM immediately (so Like Button can find it)
            // Use questionContainer (variable in scope for renderQuestion)
            questionContainer.querySelectorAll('.image-wrapper').forEach(el => el.remove());
            questionContainer.querySelectorAll('.reel-image').forEach(el => el.remove());
            questionContainer.querySelectorAll('.image-placeholder').forEach(el => el.remove());

            questionContainer.insertBefore(wrapper, questionContainer.firstChild);

            // Load pre-generated image from backend (if available)
            if (q.imageUrl) {
                // FAIL-SAFE: If the imageUrl is an ephemeral blob or was an error, replace it with a persistent proxy URL
                // Note: blob: URLs become invalid on refresh.
                if (q.imageUrl.startsWith('blob:') || q.imageUrl.includes('Pollinations Error') || !q.imageUrl) {
                    const basePrompt = q.question;
                    const encodedPrompt = encodeURIComponent(basePrompt);
                    // Use a consistent seed based on the question text for reliability
                    const seed = q.seed || Math.abs(q.question.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)) % 1000000;
                    const persistentUrl = `/api/proxy/image?prompt=${encodedPrompt}&seed=${seed}`;
                    q.imageUrl = persistentUrl;
                    image.src = persistentUrl;
                    console.log("[Standard Quiz] Replaced volatile URL with persistent proxy:", persistentUrl);
                } else {
                    image.src = q.imageUrl;
                    console.log("[Standard Quiz] Loaded Persistent Image:", q.imageUrl);
                }
                image.style.opacity = '1';

                // Retry on error (e.g. 404 if generated but not synced yet)
                image.onerror = function () {
                    console.warn("Image load failed, retrying with cache buster...");
                    this.onerror = null;
                    setTimeout(() => {
                        this.src = q.imageUrl + '?t=' + new Date().getTime();
                    }, 1000);
                };
            } else {
                // No image yet - show placeholder and poll
                console.log("[Standard Quiz] Image not ready yet, polling...");
                image.style.opacity = '0.5';

                // POLLING LOGIC (Optimized: Single Poller per File)
                const fileId = q.originId || (activeFile ? activeFile.id : null);

                // CHECK: Is this a "Generated" question? (ID starts with gen- or is 'spawned' or missing)
                const isGenerated = !fileId || fileId.startsWith('gen-') || fileId === 'spawned';

                if (isGenerated) {
                    // Poll Global Buffer for Generated Questions
                    if (!window.BufferPollerManager) setupBufferPoller(); // Ensure initiated

                    window.BufferPollerManager.subscribe(q.question, (bufferData) => {
                        // Find question in buffer
                        // Buffer structure: { question: {type, question, options...}, imageUrl, ... }
                        const updatedQ = bufferData.find(bq => {
                            const bufferQuestionText = typeof bq.question === 'string' ? bq.question : bq.question?.question;
                            return bufferQuestionText === q.question;
                        });

                        // Check for image
                        const newUrl = updatedQ ? (updatedQ.imageUrl || updatedQ.forcedImageUrl) : null;

                        if (newUrl) {
                            q.imageUrl = newUrl;
                            image.src = newUrl;
                            image.style.opacity = '1';
                            console.log("[BufferPoller] Image found and applied:", newUrl);
                            return true; // Done
                        }
                        return false;
                    });

                } else if (fileId) {
                    // Register callback with the global poller
                    window.FilePollerManager.subscribe(fileId, (fileData) => {
                        // Check if this specific question has an image now
                        const updatedQ = fileData.questions.find(fq => fq.question === q.question);
                        if (updatedQ && updatedQ.imageUrl) {
                            q.imageUrl = updatedQ.imageUrl;
                            image.src = updatedQ.imageUrl;
                            image.style.opacity = '1';
                            return true; // Unsubscribe/Done
                        }
                        return false; // Keep polling
                    });
                }
            }
        };

        // --- Poller Setup Functions ---
        function setupBufferPoller() {
            if (window.BufferPollerManager) return;
            window.BufferPollerManager = {
                callbacks: [], // Array of { questionText, callback }
                interval: null,

                subscribe(questionText, callback) {
                    if (!this.interval) this.startPolling();
                    this.callbacks.push({ questionText, callback });
                },

                startPolling() {
                    console.log("[BufferPoller] Starting poll for Generated Content...");
                    this.interval = setInterval(async () => {
                        try {
                            const res = await fetch(apiUrl('/api/reels/pregenerated'));
                            if (!res.ok) return;
                            const data = await res.json(); // Array of questions

                            // Run callbacks
                            this.callbacks = this.callbacks.filter(item => {
                                // callback returns true if done
                                return !item.callback(data);
                            });

                            if (this.callbacks.length === 0) this.stopPolling();

                        } catch (e) { console.warn("[BufferPoller] Error", e); }
                    }, 3000);
                },

                stopPolling() {
                    console.log("[BufferPoller] Stopping poll.");
                    clearInterval(this.interval);
                    this.interval = null;
                }
            };
        }

        // --- Poller Manager (Singleton) ---
        if (!window.FilePollerManager) {
            window.FilePollerManager = {
                pollers: {}, // { fileId: { interval, callbacks: [] } }

                subscribe(fileId, callback) {
                    if (!this.pollers[fileId]) {
                        this.startPolling(fileId);
                    }
                    this.pollers[fileId].callbacks.push(callback);
                },

                startPolling(fileId) {
                    console.log(`[Poller] Starting poll for file ${fileId}`);
                    const interval = setInterval(async () => {
                        try {
                            const res = await fetch(apiUrl(`/api/materials/${fileId}`));
                            if (!res.ok) return;
                            const fileData = await res.json();

                            const entry = this.pollers[fileId];
                            if (!entry) return;

                            // Run all callbacks
                            // Filter out callbacks that return true (meaning they are done)
                            entry.callbacks = entry.callbacks.filter(cb => !cb(fileData));

                            // If no callbacks left, stop polling
                            if (entry.callbacks.length === 0) {
                                this.stopPolling(fileId);
                            }

                        } catch (e) {
                            console.warn(`[Poller] Error fetching ${fileId}`, e);
                        }
                    }, 3000);

                    this.pollers[fileId] = {
                        interval,
                        callbacks: []
                    };

                    // Auto-stop after 2 minutes to prevent leaks
                    setTimeout(() => this.stopPolling(fileId), 120000);
                },

                stopPolling(fileId) {
                    if (this.pollers[fileId]) {
                        console.log(`[Poller] Stopping poll for file ${fileId}`);
                        clearInterval(this.pollers[fileId].interval);
                        delete this.pollers[fileId];
                    }
                }
            };
        }

        loadImage();


        /* 
           NOTE: activeFile logic above needs to be robust for standard quiz.
           Usually currentFile is set. If not, fallback to 'education'.
        */


        // Remove existing like btn if any
        const existingLike = header.querySelector('.like-btn');
        if (existingLike) existingLike.remove();

        const likeBtn = document.createElement('button');
        likeBtn.className = 'like-btn';
        likeBtn.innerHTML = q.isLiked ? '❤️' : '🤍';
        likeBtn.title = q.isLiked ? "Unlike" : "Like";

        // Fix for standard quiz overlap: Position absolute INSIDE container to avoid overflow clipping
        likeBtn.style.position = 'absolute';
        likeBtn.style.top = '10px'; // Positive offset
        likeBtn.style.right = '10px'; // Positive offset
        likeBtn.style.zIndex = '10'; // Ensure it's on top
        // Note: The header has relative position set above

        // Determine fileId and Index
        // In standard quiz, currentQuestions comes from currentFile
        // In Endless Review, we rely on q.originId
        const originFileId = q.originId || (activeFile ? activeFile.id : null);

        if (originFileId) {
            likeBtn.onclick = (e) => {
                e.stopPropagation();
                // Find original index in the file to be safe? 
                // For standard quiz, currentQuestions IS file.questions usually.
                toggleLike(q, likeBtn, originFileId, currentQuestionIndex);
            };
            // Append to Image Wrapper (Overlay) if exists, else Header
            // Use ID for specificity as we set it in loadImage
            const imgWrapper = document.getElementById('current-image-wrapper');
            if (imgWrapper) {
                console.log("Appended Like Button to Image Wrapper");
                imgWrapper.appendChild(likeBtn);

                // --- Summary Info Button (User Request) ---
                // Show below like button to allow quick context review
                const fileId = q.originId || (activeFile ? activeFile.id : null);
                if (fileId) {
                    // Check if already exists to prevent dupes
                    const existingSum = imgWrapper.querySelector('.summary-info-btn');
                    if (existingSum) existingSum.remove();

                    const summaryBtn = document.createElement('button');
                    summaryBtn.className = 'summary-info-btn';
                    summaryBtn.innerHTML = '📄'; // Document icon
                    summaryBtn.title = "View Study Material";

                    // Copy-paste styling from Like Btn conceptually + offset
                    summaryBtn.style.position = 'absolute';
                    summaryBtn.style.top = '50px'; // 10px + ~30px height + 10px gap
                    summaryBtn.style.right = '10px';
                    summaryBtn.style.zIndex = '10';
                    summaryBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                    summaryBtn.style.border = 'none';
                    summaryBtn.style.borderRadius = '50%';
                    summaryBtn.style.width = '32px'; /* Match emoji size approx */
                    summaryBtn.style.height = '32px';
                    summaryBtn.style.cursor = 'pointer';
                    summaryBtn.style.fontSize = '16px';
                    summaryBtn.style.display = 'flex';
                    summaryBtn.style.alignItems = 'center';
                    summaryBtn.style.justifyContent = 'center';
                    summaryBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

                    summaryBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (window.openOverview) window.openOverview(fileId);
                    };

                    imgWrapper.appendChild(summaryBtn);
                }

            } else {
                console.log("Appended Like Button to Header (Fallback)");
                header.appendChild(likeBtn);

                // --- Fallback Summary Button (Header) ---
                const fileId = q.originId || (activeFile ? activeFile.id : null);
                if (fileId) {
                    // Check existing
                    const existingSum = header.querySelector('.summary-info-btn');
                    if (existingSum) existingSum.remove();

                    const summaryBtn = document.createElement('button');
                    summaryBtn.className = 'summary-info-btn';
                    summaryBtn.innerHTML = '📄';
                    summaryBtn.title = "View Study Material";
                    summaryBtn.style.position = 'absolute';
                    summaryBtn.style.top = '50px'; // Offset from Like Btn (10px + 30px + 10px)
                    summaryBtn.style.right = '10px';
                    summaryBtn.style.zIndex = '10';
                    summaryBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                    summaryBtn.style.border = 'none';
                    summaryBtn.style.borderRadius = '50%';
                    summaryBtn.style.width = '32px';
                    summaryBtn.style.height = '32px';
                    summaryBtn.style.cursor = 'pointer';
                    summaryBtn.style.fontSize = '16px';
                    summaryBtn.style.display = 'flex';
                    summaryBtn.style.alignItems = 'center';
                    summaryBtn.style.justifyContent = 'center';
                    summaryBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

                    summaryBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (window.openOverview) window.openOverview(fileId);
                    };
                    header.appendChild(summaryBtn);
                }
            }
        }

        optionsContainer.innerHTML = '';
        explanationBox.hidden = true;
        const userAnswer = userAnswers[currentQuestionIndex];

        // Check if SAQ
        const isSAQ = !q.options || q.options.length === 0 || q.type === 'SAQ';

        if (isSAQ) {
            // SAQ Rendering
            // NEW: Flashcard UI (Ghibli Theme)
            const flashcard = document.createElement('div');
            flashcard.className = 'flashcard-interaction';
            flashcard.style.cssText = `
                width: 100%;
                min-height: 140px;
                background: rgba(255, 255, 255, 0.9);
                border: 2px dashed var(--primary, #6B8C42);
                border-radius: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 30px;
                text-align: center;
                transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                color: var(--text-muted, #7A7566);
                margin-bottom: 24px;
                position: relative;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(107, 140, 66, 0.1);
                font-family: var(--font-heading, 'Quicksand');
            `;

            const renderRevealedContent = () => {
                flashcard.style.background = '#fff';
                flashcard.style.border = '2px solid var(--primary, #6B8C42)';
                flashcard.style.cursor = 'default';
                flashcard.style.color = 'var(--text-main, #3D3B30)';
                flashcard.style.boxShadow = '0 8px 24px rgba(107, 140, 66, 0.15)';
                flashcard.innerHTML = `
                    <div style="font-size: 0.9em; text-transform: uppercase; letter-spacing: 1.5px; color: var(--primary, #6B8C42); margin-bottom: 12px; font-weight: 700;">
                        ${t('expert_insight')}
                    </div>
                    <div style="font-size: 1.15em; line-height: 1.7; font-family: var(--font-body, 'Nunito'); color: var(--text-main, #3D3B30);">
                        ${q.idealAnswer || q.explanation || 'No insight provided.'}
                    </div>
                `;
            };

            if (userAnswer !== undefined) {
                // Already Revealed State
                renderRevealedContent();
            } else {
                // Initial "Tap to Reveal" State
                flashcard.innerHTML = `
                    <div style="font-size: 2.5em; margin-bottom: 10px; opacity: 0.8;">🌱</div>
                    <div style="font-size: 1.2em; font-weight: 600; font-family: var(--font-hand, 'Patrick Hand'); color: var(--primary, #6B8C42);">${t('tap_reveal')}</div>
                `;

                flashcard.onclick = () => {
                    handleAnswer('revealed'); // Mark as answered + tracks SRS + server

                    // animate transition
                    flashcard.style.transform = 'scale(0.95) rotate(-1deg)';
                    setTimeout(() => {
                        flashcard.style.transform = 'scale(1) rotate(0deg)';
                        renderRevealedContent();

                        if (typeof confetti === 'function') {
                            confetti({
                                particleCount: 60,
                                spread: 70,
                                origin: { y: 0.6 },
                                colors: ['#6B8C42', '#F2A6A6', '#F9DA78'],
                                shapes: ['circle'],
                                scalar: 0.8
                            });
                        }
                    }, 150);
                };
            }

            optionsContainer.appendChild(flashcard);

        } else {
            // Standard MCQ
            q.options.forEach((opt, idx) => {
                const btn = document.createElement('div');
                btn.className = 'option';
                btn.textContent = opt;

                if (userAnswer !== undefined) {
                    btn.classList.add('disabled');
                    if (idx === q.correctAnswer) {
                        btn.classList.add('correct');
                    } else if (idx === userAnswer && idx !== q.correctAnswer) {
                        btn.classList.add('incorrect');
                    }
                } else {
                    btn.addEventListener('click', () => handleAnswer(idx));
                }

                optionsContainer.appendChild(btn);
            });
        }

        if (userAnswer !== undefined) {
            explanationText.textContent = q.explanation;
            explanationBox.hidden = false;
        }

        prevBtn.disabled = currentQuestionIndex === 0;

        if (currentQuestionIndex === currentQuestions.length - 1) {
            nextBtn.textContent = t('btn_finish');

            // --- INJECT MORE QUESTIONS BUTTON ---
            let moreBtn = document.getElementById('more-questions-btn');
            if (!moreBtn) {
                moreBtn = document.createElement('button');
                moreBtn.id = 'more-questions-btn';
                moreBtn.className = 'nav-btn';
                moreBtn.style.backgroundColor = '#6366f1';
                moreBtn.style.marginLeft = '10px';
                moreBtn.textContent = t('btn_more_questions');
                moreBtn.onclick = handleMoreQuestionsClick;
                nextBtn.parentNode.appendChild(moreBtn);
            }
            moreBtn.hidden = false;
            // ------------------------------------

        } else {
            nextBtn.textContent = t('btn_next');
            const moreBtn = document.getElementById('more-questions-btn');
            if (moreBtn) moreBtn.hidden = true;
        }

    }

    // --- NEW: Handle More Questions Selection ---
    async function handleMoreQuestionsClick() {
        // Custom Overlay Modal
        const overlay = document.createElement('div');
        overlay.id = 'more-qs-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(5px);';

        const card = document.createElement('div');
        card.style.cssText = 'background:#1e293b;padding:30px;border-radius:15px;text-align:center;border:1px solid #6366f1;max-width:90%;width:400px;box-shadow:0 0 30px rgba(99,102,241,0.3);';

        const title = document.createElement('h3');
        title.innerHTML = 'Generate More Questions <span style="font-size:1.5em">✨</span>';
        title.style.marginBottom = '20px';
        title.style.color = 'white';
        title.style.fontSize = '1.2rem';

        // Btn 1: Conceptual
        const btn1 = document.createElement('button');
        btn1.innerHTML = '<b>🧠 Conceptual</b><br><span style="font-size:0.8em;opacity:0.8">5x Type 2 (Deep Understanding)</span>';
        btn1.style.cssText = 'display:block;width:100%;margin:15px 0;padding:15px;background:linear-gradient(135deg, #3b82f6, #2563eb);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;transition:transform 0.2s;';
        btn1.onmouseover = () => btn1.style.transform = 'scale(1.02)';
        btn1.onmouseout = () => btn1.style.transform = 'scale(1)';
        btn1.onclick = () => { overlay.remove(); executeGenerateMore('conceptual'); };

        // Btn 2: Applicable
        const btn2 = document.createElement('button');
        btn2.innerHTML = '<b>🛠️ Applicable</b><br><span style="font-size:0.8em;opacity:0.8">3x MCQ, 1x Synthesis, 1x SAQ</span>';
        btn2.style.cssText = 'display:block;width:100%;margin:15px 0;padding:15px;background:linear-gradient(135deg, #10b981, #059669);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;transition:transform 0.2s;';
        btn2.onmouseover = () => btn2.style.transform = 'scale(1.02)';
        btn2.onmouseout = () => btn2.style.transform = 'scale(1)';
        btn2.onclick = () => { overlay.remove(); executeGenerateMore('applicable'); };

        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'margin-top:10px;background:transparent;color:#94a3b8;border:none;text-decoration:underline;cursor:pointer;font-size:14px;';
        cancel.onclick = () => overlay.remove();

        card.appendChild(title);
        card.appendChild(btn1);
        card.appendChild(btn2);
        card.appendChild(cancel);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    }

    async function executeGenerateMore(mode) {
        // Safety Check: Verify currentFile exists
        if (!currentFile || !currentFile.id) {
            console.error('executeGenerateMore: currentFile is missing', currentFile);
            alert('Error: No active quiz file found. Please try refreshing or restarting the quiz.');
            return;
        }

        const moreBtn = document.getElementById('more-questions-btn');
        if (moreBtn) {
            moreBtn.disabled = true;
            moreBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('btn_generating')}`;
        }

        try {
            console.log('Generating more questions for file:', currentFile.id, 'Mode:', mode);
            const res = await fetch(`/api/generate-more/${currentFile.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': localStorage.getItem('gemini_api_key') },
                body: JSON.stringify({ mode })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // Append new questions
            currentQuestions.push(...data.newQuestions);

            // Update global state
            // Update global state
            if (window.allFiles && Array.isArray(window.allFiles)) {
                const f = window.allFiles.find(x => x.id === currentFile.id);
                if (f) {
                    if (!f.questions) f.questions = [];
                    f.questions = currentQuestions;
                }
            } else {
                console.warn('window.allFiles not set, skipping local state update');
            }

            // Show feedback
            // alert(`${data.newQuestions.length} New Questions Added!`); // Optional, maybe too noisy?

            // Navigate to the first new question
            currentQuestionIndex++;
            renderQuestion();

        } catch (e) {
            alert('Error generating questions: ' + e.message);
            if (moreBtn) {
                moreBtn.disabled = false;
                moreBtn.textContent = t('btn_more_questions');
            }
        }
    }

    function handleAnswer(selectedIndex) {
        if (userAnswers[currentQuestionIndex] !== undefined) return;

        userAnswers[currentQuestionIndex] = selectedIndex;

        const q = currentQuestions[currentQuestionIndex];
        if (!q) { renderQuestion(); return; }

        // SAQ/flashcard: 'revealed' counts as correct
        const isSAQ = selectedIndex === 'revealed';
        const isCorrect = isSAQ || (q.correctAnswer === selectedIndex || q.correctAnswer == selectedIndex);

        // Update SRS + solved_questions
        recordSRSAnswer(q.question, !!isCorrect);
        if (isCorrect) {
            markQuestionasSolved(q.question);
        }

        // Track to server per-question (for profile stats, streak, chart)
        const materialName = currentFile ? (currentFile.filename || currentFile.name || 'Quiz') : 'Quiz';
        const subject = currentFile ? (currentFile.subjectEmoji || '📚') : '📚';
        fetch(apiUrl('/api/track/solve'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: 1,
                correct: isCorrect ? 1 : 0,
                wrong: isCorrect ? 0 : 1,
                materialName,
                subject
            })
        }).catch(e => console.error('Track failed', e));

        renderQuestion();
    }

    prevBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
        }
    });

    nextBtn.addEventListener('click', async () => {
        if (currentQuestionIndex < currentQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        } else {
            await saveProgressAndExit();
        }
    });

    // --- Library Logic ---
    const VALID_CATEGORIES = [
        "Business",
        "Finance / Investing",
        "Science",
        "Technology",
        "Health / Medicine",
        "Engineering",
        "Design",
        "Philosophy / Thinking",
        "Career / Education",
        "Politics / Society"
    ];

    async function loadLibrary() {
        try {
            const response = await fetch(apiUrl('/api/library'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const data = await response.json();
            window.allFiles = data; // Sync global
            libraryFiles = data;    // Sync local/legacy
            if (window.renderLibrary) window.renderLibrary();
            updateDueBadge();
        } catch (error) {
        }

        // Inject Liked Button if not present
        // Bind Toggle Logic to Liked Button
        const likedBtn = document.getElementById('liked-filter-btn');

        window.toggleLikedView = function () {
            const isViewingLiked = likedBtn && likedBtn.dataset.viewing === 'true';

            if (isViewingLiked) {
                // Go Back to Normal Library
                if (likedBtn) {
                    likedBtn.dataset.viewing = 'false';
                    likedBtn.innerHTML = '❤️ Liked';
                    likedBtn.style.backgroundColor = '';
                    likedBtn.style.color = 'var(--accent)';
                }
                window.renderLibrary();
            } else {
                // Show Liked Questions
                if (likedBtn) {
                    likedBtn.dataset.viewing = 'true';
                    likedBtn.innerHTML = '⬅️ Back';
                    likedBtn.style.backgroundColor = 'var(--accent)';
                    likedBtn.style.color = '#FFF';
                }
                renderLikedQuestions();
            }
        };

        if (likedBtn) {
            likedBtn.onclick = window.toggleLikedView;
        }
    }

    const keywordMap = {
        'engineering': '🏗️',
        'math': '📐',
        'history': '🏛️',
        'biology': '🧬',
        'chemistry': '🧪',
        'physics': '⚛️',
        'law': '⚖️',
        'art': '🎨',
        'music': '🎵',
        'computer': '💻',
        'code': '💻',
        'programming': '💻',
        'business': '💼',
        'economics': '📈',
        'literature': '📚',
        'language': '🗣️'
    };

    // [DEPRECATED]     function renderLibrary() {
    // [DEPRECATED]         const sortMode = sortSelect ? sortSelect.value : 'date_desc';
    // [DEPRECATED]         const filterType = filterSelect ? filterSelect.value : 'all';
    const filterCategory = categorySelect ? categorySelect.value : 'all';
    // [DEPRECATED] 
    // Filter
    // [DEPRECATED]         let filtered = libraryFiles.filter(file => {
    // [DEPRECATED]             if (filterType === 'all') return true;
    // [DEPRECATED]             if (filterType === 'youtube') return file.type === 'youtube';
    // [DEPRECATED]             if (filterType === 'pdf') return file.filename.toLowerCase().endsWith('.pdf');
    // [DEPRECATED]             if (filterType === 'doc') return /\.(doc|docx)$/i.test(file.filename);
    // [DEPRECATED]             return true;
    // [DEPRECATED]         });
    // [DEPRECATED] 
    // Sort
    // [DEPRECATED]         filtered.sort((a, b) => {
    // [DEPRECATED]             const dateA = new Date(a.uploadedAt);
    // [DEPRECATED]             const dateB = new Date(b.uploadedAt);
    // [DEPRECATED]             return sortMode === 'newest' ? dateB - dateA : dateA - dateB;
    // [DEPRECATED]         });
    // [DEPRECATED] 
    // [DEPRECATED]         libraryGrid.innerHTML = '';
    // [DEPRECATED]         
    // [DEPRECATED]         if (filtered.length === 0) {
    // [DEPRECATED]             libraryGrid.innerHTML = `<div class="empty-state"><p>${t('no_files_found')}</p></div>`;
    // [DEPRECATED]             return;
    // [DEPRECATED]         }
    // [DEPRECATED] 
    // [DEPRECATED]         filtered.forEach(file => {
    // Icon Logic
    // [DEPRECATED]             let icon = file.subjectEmoji;
    // [DEPRECATED]             
    // If no AI-generated emoji, try keyword matching
    // [DEPRECATED]             if (!icon) {
    // [DEPRECATED]                 const lowerName = file.filename.toLowerCase();
    // [DEPRECATED]                 for (const [key, emoji] of Object.entries(keywordMap)) {
    // [DEPRECATED]                     if (lowerName.includes(key)) {
    // [DEPRECATED]                         icon = emoji;
    // [DEPRECATED]                         break;
    // [DEPRECATED]                     }
    // [DEPRECATED]                 }
    // [DEPRECATED]             }
    // [DEPRECATED] 
    // Fallback to type icon
    // [DEPRECATED]             if (!icon) {
    // [DEPRECATED]                 if (file.type === 'youtube') icon = '<svg viewBox="0 0 24 24" style="width: 2.5em; height: 2.5em;"><rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0000"/><polygon points="10,8.5 10,15.5 16,12" fill="#FFFFFF"/></svg>';
    // [DEPRECATED]                 else if (file.filename.toLowerCase().endsWith('.pdf')) icon = '📕';
    // [DEPRECATED]                 else if (/\.(doc|docx)$/i.test(file.filename)) icon = '📝';
    // [DEPRECATED]                 else icon = '📄';
    // [DEPRECATED]             }
    // [DEPRECATED] 
    // [DEPRECATED]             const card = document.createElement('div');
    // [DEPRECATED]             card.className = 'library-card'; card.onclick = (e) => window.openOverview(file.id); card.style.cursor = 'pointer';
    // [REMOVED BAD INJECTION] (Inner Card Layout)
    // BAD_INJECTION:             card.innerHTML = `
    // BAD_INJECTION:                 <!-- Categories (Outside Inner Card) -->
    // BAD_INJECTION:                 ${catTags}
    // BAD_INJECTION: 
    // BAD_INJECTION:                 <!-- Inner Content Card -->
    // BAD_INJECTION:                 <div class="bg-gray-900/40 rounded-xl p-4 relative border border-gray-700/30 mt-3">
    // BAD_INJECTION:                     <!-- Trash Bin (Absolute to Inner Card) -->
    // BAD_INJECTION:                     <button class="delete-btn-abs" onclick="event.stopPropagation(); window.deleteFile('${file.id}')" title="Delete">🗑️</button>
    // BAD_INJECTION: 
    // BAD_INJECTION:                     <!-- Icon -->
    // BAD_INJECTION:                     <div class="flex items-center justify-center mb-3 mt-1 text-4xl">
    // BAD_INJECTION:                         ${icon}
    // BAD_INJECTION:                     </div>
    // BAD_INJECTION:                 
    // BAD_INJECTION:                     <h3 class="font-bold text-base mb-1 truncate pr-6" title="${file.filename}">${file.filename}</h3>
    // BAD_INJECTION:                     <p class="text-xs text-gray-400 mb-4">${file.type === 'youtube' ? 'Video' : 'Text'} • ${dateStr}</p>
    // BAD_INJECTION:                     
    // BAD_INJECTION:                     <!-- Divider (Subtle) -->
    // BAD_INJECTION:                     <div class="h-px bg-gray-700/30 w-full mb-3"></div>
    // BAD_INJECTION: 
    // BAD_INJECTION:                     <!-- Buttons -->
    // BAD_INJECTION:                     <div class="flex gap-2">
    // BAD_INJECTION:                         <button id="btn-review-${file.id}" onclick="event.stopPropagation(); window.startReview('${file.id}')" 
    // BAD_INJECTION:                             class="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105">
    // BAD_INJECTION:                             Review
    // BAD_INJECTION:                         </button>
    // BAD_INJECTION:                         <button id="btn-more-${file.id}" onclick="event.stopPropagation(); window.generateMore('${file.id}')" 
    // BAD_INJECTION:                             class="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-200 border border-gray-600 hover:border-gray-500 transition-all">
    // BAD_INJECTION:                             New Qs
    // BAD_INJECTION:                         </button>
    // BAD_INJECTION:                         <button id="btn-summary-${file.id}" onclick="event.stopPropagation(); window.openOverview('${file.id}')" 
    // BAD_INJECTION:                             class="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-200 border border-gray-600 hover:border-gray-500 transition-all">
    // BAD_INJECTION:                             Summary
    // BAD_INJECTION:                         </button>
    // BAD_INJECTION:                     </div>
    // BAD_INJECTION:                 </div>
    // BAD_INJECTION:             `;
    // [DEPRECATED]             libraryGrid.appendChild(card);
    // [DEPRECATED]         });
    // [DEPRECATED]     }

    const handleFilterChange = () => {
        if (currentView === 'liked') {
            window.renderLikedQuestions(); // Rerender liked list with new filters
        } else if (currentView === 'library' || currentView === 'upload') { // Default to library
            // Assuming renderLibrary sets currentView = 'library'
            if (window.renderLibrary) window.renderLibrary();
        }
    };

    if (sortSelect) sortSelect.addEventListener('change', handleFilterChange);
    if (filterSelect) filterSelect.addEventListener('change', handleFilterChange);
    if (categorySelect) categorySelect.addEventListener('change', handleFilterChange);

    // --- Endless / Reels Mode Logic ---
    // --- Endless / Reels Mode Logic ---

    // NEW: Global function to start endless review from anywhere
    window.startEndlessReview = async function (clickedBtn = null) {
        if (clickedBtn && clickedBtn.dataset.loading === 'true') return;

        // VISUAL FEEDBACK: Show full loading overlay because fetching takes time
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'endless-loading-overlay';
        loadingOverlay.style.position = 'fixed';
        loadingOverlay.style.top = '0';
        loadingOverlay.style.left = '0';
        loadingOverlay.style.width = '100%';
        loadingOverlay.style.height = '100%';
        loadingOverlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        loadingOverlay.style.zIndex = '9999';
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.flexDirection = 'column';
        loadingOverlay.style.justifyContent = 'center';
        loadingOverlay.style.alignItems = 'center';
        loadingOverlay.style.color = 'white';
        loadingOverlay.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 20px;">♾️</div>
            <div style="font-size: 1.5rem; font-weight: bold;">Initializing Endless Review...</div>
            <div style="margin-top: 10px; opacity: 0.8;">Fetching your library...</div>
        `;
        document.body.appendChild(loadingOverlay);

        let originalText = '';
        if (clickedBtn) {
            clickedBtn.dataset.loading = 'true';
            originalText = clickedBtn.innerHTML;
            clickedBtn.innerHTML = '<span class="btn-icon">⏳</span> Loading...';
            clickedBtn.style.opacity = '0.7';
        }

        try {
            // 1. Try fetching PRE-GENERATED Reels first (for instant start)
            console.log("[Endless] Fetching pre-generated reels...");
            const preRes = await fetch(apiUrl('/api/reels/pregenerated'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            let pregenerated = [];
            if (preRes.ok) {
                pregenerated = await preRes.json();
            }

            let pregeneratedQuestions = [];
            if (pregenerated.length > 0) {
                console.log(`[Endless] Found ${pregenerated.length} pre-generated reels.`);
                pregeneratedQuestions = pregenerated.map(b => ({
                    ...b.question,
                    forcedImageUrl: b.imageUrl,
                    _isPregenerated: true,
                    // Ensure Origin ID is carried over for Summary Button
                    originId: b.fileId || b.question.originId
                }));
            }

            // ALWAYS Fetch library to ensure full pool (User Request)
            console.log("[Endless] Fetching full library for random pool...");
            const response = await fetch(apiUrl('/api/library'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const files = await response.json();
            window.allFiles = files; // Make files available for date lookup in reels

            let libraryQuestions = [];
            // Create a lookup map to backfill missing IDs in pregenerated/stale buffer items
            const questionToOriginIdMap = new Map();

            if (files && files.length > 0) {
                files.forEach(file => {
                    if (file.questions && Array.isArray(file.questions)) {
                        libraryQuestions.push(...file.questions.map(q => {
                            // Populate lookup map
                            questionToOriginIdMap.set(q.question, file.id);

                            return {
                                ...q,
                                originFilename: file.filename || file.name,
                                originSubject: file.subjectEmoji,
                                originId: file.id,
                                originalIndex: file.questions.indexOf(q)
                            };
                        }));
                    }
                });
            }

            // BACKFILL FIX: Patch missing originIds AND images in pregenerated questions using the map
            // This fixes the "Summary Button Missing" issue for stale buffer items.
            // AND fixes "Missing Images" if buffer is stale but library has the image.
            if (pregeneratedQuestions.length > 0) {
                pregeneratedQuestions.forEach(pq => {
                    // 1. Backfill Origin ID
                    if (!pq.originId) {
                        const foundId = questionToOriginIdMap.get(pq.question);
                        if (foundId) {
                            pq.originId = foundId;
                            // console.log("[Endless] Backfilled missing originId");
                        }
                    }

                    // 2. Backfill Image URL (Crucial for Stale Buffer)
                    if (!pq.imageUrl && !pq.forcedImageUrl) {
                        // Find the fresh question in libraryQuestions
                        // (We can use the map to find file, then search file.. or just search libraryQuestions directly)
                        const freshQ = libraryQuestions.find(lq => lq.question === pq.question);
                        if (freshQ && freshQ.imageUrl) {
                            pq.imageUrl = freshQ.imageUrl;
                            console.log("[Endless] Backfilled missing Image URL from Library for:", pq.question.substring(0, 15));
                        }
                    }
                });
            }

            if (pregeneratedQuestions.length === 0 && libraryQuestions.length === 0) {
                alert(t('alert_no_questions'));
                return;
            }

            // Mix: Pregenerated first (fresh), then shuffled library? 
            // User asked for "random order". So we shuffle the library part.
            // We'll put pregenerated at the top so they don't get lost, but user can scroll back.
            // Actually, let's shuffle EVERYTHING if the user wants pure random.
            // But usually users want to see the "new" stuff (pregenerated).
            // I'll shuffle the library and put pregenerated at the front.
            // Wait, earlier logic had `allQuestions.sort`.

            // Combine: Mix everything together for true "Endless" randomness
            const finalPool = [...pregeneratedQuestions, ...libraryQuestions];

            // Deduplicate based on question text to avoid showing the same question twice
            const seen = new Set();
            const rawUnique = [];

            for (const q of finalPool) {
                if (!seen.has(q.question)) {
                    seen.add(q.question);
                    rawUnique.push(q); // No order yet, just unique
                }
            }

            // SMART SHUFFLE: Max diversity — avoid same material within last 2 questions
            // 1. Group by originId
            const groups = {};
            rawUnique.forEach(q => {
                const id = q.originId || 'unknown';
                if (!groups[id]) groups[id] = [];
                groups[id].push(q);
            });

            // 2. Shuffle each group internally
            Object.values(groups).forEach(g => g.sort(() => Math.random() - 0.5));

            // 3. Interleave with diversity window of 2
            const uniquePool = [];
            const recentOrigins = []; // track last 2 origins
            let groupKeys = Object.keys(groups);

            while (groupKeys.length > 0) {
                // Filter out origins seen in the last 2 picks
                let candidates = groupKeys.filter(k => !recentOrigins.includes(k));

                // If no alternatives, relax to just avoiding the immediate last
                if (candidates.length === 0) {
                    candidates = groupKeys.filter(k => k !== recentOrigins[recentOrigins.length - 1]);
                }

                // If still nothing (single material left), allow it
                if (candidates.length === 0) candidates = [...groupKeys];

                // Weighted random: prefer larger groups to drain evenly
                const totalSize = candidates.reduce((sum, k) => sum + groups[k].length, 0);
                let roll = Math.random() * totalSize;
                let chosenKey = candidates[0];
                for (const k of candidates) {
                    roll -= groups[k].length;
                    if (roll <= 0) { chosenKey = k; break; }
                }

                const chosenGroup = groups[chosenKey];
                uniquePool.push(chosenGroup.pop());

                // Update recent origins window (keep last 2)
                recentOrigins.push(chosenKey);
                if (recentOrigins.length > 2) recentOrigins.shift();

                // Cleanup empty groups
                if (chosenGroup.length === 0) {
                    delete groups[chosenKey];
                    groupKeys = Object.keys(groups);
                }
            }


            // Fallback: If EVERYTHING is solved, maybe show solved ones? 
            // Or just alert "You finished everything! Generating more..."
            if (uniquePool.length === 0 && finalPool.length > 0) {
                console.log("[Endless] All questions solved! Recycling pool but prioritizing random.");
                // Reset pool or maybe just alert?
                // Let's just recycle everything if pool is empty
                finalPool.forEach(q => {
                    if (!seen.has(q.question)) {
                        seen.add(q.question);
                        uniquePool.push(q);
                    }
                });
                // Shuffle again
                uniquePool.sort(() => Math.random() - 0.5);
            }

            console.log(`[Endless] Starting with ${uniquePool.length} questions.`);

            // Remove overlay before transitioning
            const overlay = document.getElementById('endless-loading-overlay');
            if (overlay) overlay.remove();

            await startReels(uniquePool);

        } catch (error) {
            console.error('ENDLESS ERROR:', error);
            alert('Error: ' + error.message);

            const overlay = document.getElementById('endless-loading-overlay');
            if (overlay) overlay.remove();
        } finally {
            if (clickedBtn) {
                clickedBtn.dataset.loading = 'false';
                clickedBtn.innerHTML = originalText;
                clickedBtn.style.opacity = '1';
            }
        }
    };

    // Attach to Header Button
    if (navBtns.endless) {
        navBtns.endless.addEventListener('click', (e) => {
            e.preventDefault();
            window.startEndlessReview(navBtns.endless);
        });
    }

    // Attach to Library Button (Legacy) if exists
    if (endlessBtn) {
        endlessBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.startEndlessReview(endlessBtn);
        });
    }

    // --- Library Filters & Sort Listeners ---
    if (sortSelect) sortSelect.addEventListener('change', () => window.renderLibrary());
    if (categorySelect) categorySelect.addEventListener('change', () => window.renderLibrary());
    if (filterSelect) filterSelect.addEventListener('change', () => window.renderLibrary());

    // Search bar — debounced
    const libSearchInput = document.getElementById('library-search-input');
    if (libSearchInput) {
        let searchTimer;
        libSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => window.renderLibrary(), 200);
        });
    }

    // Alias for deprecated function name if necessary


    // --- Create Material Logic ---
    const createMaterialBtn = document.getElementById('create-material-btn');
    const materialModal = document.getElementById('material-modal');
    const closeMaterialModalBtn = document.getElementById('close-material-modal-btn');
    const saveMaterialBtn = document.getElementById('save-material-btn');
    const materialNameInput = document.getElementById('material-name-input');
    const materialEmojiInput = document.getElementById('material-emoji-input');

    if (createMaterialBtn) {
        createMaterialBtn.addEventListener('click', () => {
            materialModal.hidden = false;
        });
    }

    if (closeMaterialModalBtn) {
        closeMaterialModalBtn.addEventListener('click', () => {
            materialModal.hidden = true;
        });
    }

    if (saveMaterialBtn) {
        saveMaterialBtn.addEventListener('click', async () => {
            const name = materialNameInput.value.trim();
            const emoji = materialEmojiInput.value.trim();

            if (!name) {
                alert(t('material_name_required'));
                return;
            }

            try {
                const response = await fetch(apiUrl('/api/materials/create'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                    },
                    body: JSON.stringify({ name, subjectEmoji: emoji })
                });

                if (!response.ok) throw new Error('Failed to create material');

                materialModal.hidden = true;
                materialNameInput.value = '';
                materialEmojiInput.value = '';
                await loadLibrary();
            } catch (err) {
                alert('Error: ' + err.message);
            }
        });
    }




    // Helper: Generate more questions for endless mode
    async function generateMoreForEndless(existingQuestions) {
        try {
            const response = await fetch(apiUrl('/api/library'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const files = await response.json();

            // Filter files that have transcripts or content
            const eligibleFiles = files.filter(f =>
                (f.type === 'youtube' && f.transcript) ||
                f.questions?.length > 0
            );

            if (eligibleFiles.length === 0) {
                console.log('No eligible files for generating more questions');
                return [];
            }

            // Pick a random file
            const randomFile = eligibleFiles[Math.floor(Math.random() * eligibleFiles.length)];
            console.log(`Generating 5 more questions from: ${randomFile.filename}`);

            // Call generate-more endpoint
            const genResponse = await fetch(`/api/generate-more/${randomFile.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                }
            });

            const result = await genResponse.json();

            if (result.newQuestions && result.newQuestions.length > 0) {
                // Tag with origin info
                return result.newQuestions.map(q => ({
                    ...q,
                    originFilename: randomFile.filename,
                    originSubject: randomFile.subjectEmoji,
                    originId: randomFile.id
                }));
            }

            return [];
        } catch (error) {
            console.error('Failed to generate more questions:', error);
            return [];
        }
    }



    // Helper: Manage solved questions to prevent repetition
    function getSolvedQuestions() {
        try {
            return JSON.parse(localStorage.getItem('solved_questions') || '[]');
        } catch (e) { return []; }
    }

    function markQuestionasSolved(questionText) {
        const solved = getSolvedQuestions();
        if (!solved.includes(questionText)) {
            solved.push(questionText);
            localStorage.setItem('solved_questions', JSON.stringify(solved));
        }
    }

    function isQuestionSolved(questionText) {
        const solved = getSolvedQuestions();
        return solved.includes(questionText);
    }

    // --- SRS (Spaced Repetition) System ---
    const SRS_INTERVALS = [0, 1, 3, 7, 14, 30]; // days per box level

    function getSRSData() {
        try {
            return JSON.parse(localStorage.getItem('srs_data') || '{}');
        } catch (e) { return {}; }
    }

    function saveSRSData(data) {
        localStorage.setItem('srs_data', JSON.stringify(data));
    }

    function getSRSEntry(questionText) {
        const data = getSRSData();
        return data[questionText] || null;
    }

    function recordSRSAnswer(questionText, isCorrect) {
        const data = getSRSData();
        const now = new Date().toISOString();

        if (!data[questionText]) {
            data[questionText] = {
                box: 0, correctCount: 0, wrongCount: 0,
                lastAnswered: now, nextReview: now
            };
        }

        const entry = data[questionText];
        entry.lastAnswered = now;

        if (isCorrect) {
            entry.correctCount++;
            entry.box = Math.min(entry.box + 1, 5);
        } else {
            entry.wrongCount++;
            entry.box = 0;
        }

        const intervalDays = SRS_INTERVALS[entry.box];
        const next = new Date();
        next.setDate(next.getDate() + intervalDays);
        entry.nextReview = next.toISOString();

        data[questionText] = entry;
        saveSRSData(data);
    }

    function isQuestionDue(questionText) {
        const entry = getSRSEntry(questionText);
        if (!entry) return false; // Never seen = "new", not "due for re-review"
        return new Date() >= new Date(entry.nextReview);
    }

    function migrateSolvedToSRS() {
        if (localStorage.getItem('srs_migrated')) return;
        const solved = getSolvedQuestions();
        if (solved.length > 0) {
            const data = getSRSData();
            const now = new Date().toISOString();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            solved.forEach(qText => {
                if (!data[qText]) {
                    data[qText] = {
                        box: 1, correctCount: 1, wrongCount: 0,
                        lastAnswered: now, nextReview: tomorrow.toISOString()
                    };
                }
            });
            saveSRSData(data);
        }
        localStorage.setItem('srs_migrated', 'true');
    }

    async function updateDueBadge() {
        try {
            const userId = localStorage.getItem('user_name') || 'guest';
            const lib = await clientDB.getLibrary(userId);
            const allQs = (lib.files || []).flatMap(f => f.questions || []);
            const dueCount = allQs.filter(q => isQuestionDue(q.question)).length;
            const badge = document.getElementById('due-badge');
            if (badge) {
                if (dueCount > 0) {
                    badge.textContent = dueCount > 99 ? '99+' : dueCount;
                    badge.hidden = false;
                } else {
                    badge.hidden = true;
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Run migration on load
    migrateSolvedToSRS();

    // --- Endless Review Buffer System ---
    window.endlessBuffer = [];
    const BUFFER_TARGET = 10;
    let isBuffering = false;

    // Helper: Preload an image URL so it's cached by the browser
    function preloadImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn('Failed to preload image:', url);
                resolve(null);
            };
        });
    }

    // --- Persistence Helpers ---
    function getBufferCacheKey() {
        // Use username if available, otherwise guest
        // This ensures 'user1' doesn't overwrite 'user2's buffer
        const username = localStorage.getItem('user_name') || 'guest';
        return `endless_buffer_cache_${username}`;
    }

    function saveBufferToLocal() {
        try {
            if (window.endlessBuffer.length > 0) {
                const data = JSON.stringify(window.endlessBuffer);
                const key = getBufferCacheKey();
                localStorage.setItem(key, data);
            }
        } catch (e) {
            console.warn("Retrying buffer save...", e);
        }
    }

    async function loadBufferFromLocal() {
        try {
            const key = getBufferCacheKey();
            const raw = localStorage.getItem(key);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // FIXED: Filter out stale items missing attribution to force a server refill
                const validItems = parsed.filter(item => {
                    const q = item.question;
                    // Check if question has the new attribution fields
                    // If not, discard it so we fetch a fresh one from server
                    const hasAttribution = q && (q.sourceTitle || q.materialName || q.originFilename);
                    if (!hasAttribution) console.log("[Buffer] Discarding stale item missing attribution:", q.question.substring(0, 20));
                    return hasAttribution;
                });

                if (validItems.length < parsed.length) {
                    console.log(`[Buffer] Pruned ${parsed.length - validItems.length} stale items from cache.`);
                    // Save back the pruned list immediately to clean up
                    localStorage.setItem(key, JSON.stringify(validItems));
                }

                console.log(`Restoring ${validItems.length} valid items from offline buffer [User: ${key}]...`);

                // Fix stale blob: URLs and preload valid images
                validItems.forEach(item => {
                    if (item.imageUrl && item.imageUrl.startsWith('blob:')) {
                        const prompt = item.imagePrompt || item.question || '';
                        const clean = prompt.replace(/\?|-\s*T\d+/g, '').substring(0, 150);
                        const encoded = encodeURIComponent(clean);
                        const seed = Math.abs((item.question || '').split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)) % 1000000;
                        item.imageUrl = `/api/proxy/image?prompt=${encoded}&seed=${seed}&model=flux`;
                    }
                    // Preload valid image URLs
                    if (item.imageUrl && !item.imageUrl.startsWith('blob:')) {
                        try { const img = new Image(); img.src = item.imageUrl; } catch (e) { }
                    }
                });

                // Save cleaned URLs back to localStorage
                localStorage.setItem(key, JSON.stringify(validItems));

                // Reset buffer to restored state
                window.endlessBuffer = validItems;
                console.log("Offline buffer restored & images warmed.");
            }
        } catch (e) {
            console.warn("Failed to load offline buffer", e);
            // localStorage.removeItem(key); // Optional: keep data in case it's just a parse error?
        }
    }

    // Main Buffering Function
    async function maintainEndlessBuffer(sourceFiles = null) {
        if (isBuffering || window.endlessBuffer.length >= BUFFER_TARGET) return;
        isBuffering = true;
        // console.log(`Buffering Endless Review... Current: ${window.endlessBuffer.length}/${BUFFER_TARGET}`);

        try {
            // ... (fetching logic remains same) ...
            // If no source provided, fetch library silently
            let allQ = [];
            if (sourceFiles) {
                // Use provided source
                sourceFiles.forEach(f => {
                    if (f.questions) allQ.push(...f.questions.map(q => ({
                        ...q,
                        originSubject: f.subjectEmoji,
                        originFilename: f.filename || f.name, // Ensure filename
                        originId: f.id
                    })));
                });
            } else {
                try {
                    const res = await fetch(apiUrl('/api/library'), {
                        headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
                    });
                    const files = await res.json();
                    files.forEach(f => {
                        if (f.questions) allQ.push(...f.questions.map(q => ({
                            ...q,
                            originSubject: f.subjectEmoji,
                            originFilename: f.filename || f.name, // Ensure filename
                            originFilename: f.filename || f.name, // Ensure filename
                            originId: f.id,
                            originalIndex: f.questions.indexOf(q) // Capture index
                        })));
                    });
                } catch (e) {
                    console.error('Buffer fetch error:', e);
                    return;
                }
            }

            // Filter
            const bufferIds = new Set(window.endlessBuffer.map(b => b.question.question));
            let candidates = allQ.filter(q =>
                !bufferIds.has(q.question)
            );

            // [Endless] If running low, generate MORE from server
            // Fix: Increase threshold to 8 to allow better interleaving
            if (candidates.length < 8 && !window._isRefilling) {
                window._isRefilling = true;
                console.log("[Endless] Running low... requesting generation...");
                try {
                    const refillRes = await fetch(apiUrl('/api/reels/generate-more'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ apiKey: localStorage.getItem('gemini_api_key') })
                    });
                    const refillData = await refillRes.json();
                    if (refillData.questions && refillData.questions.length > 0) {
                        console.log(`[Endless] Received ${refillData.questions.length} FRESH questions!`);

                        // Normalize and add to candidates
                        const newQs = refillData.questions.map(q => ({
                            originFilename: "Endless Generator",
                            originId: "gen-" + Date.now(),
                            ...q
                        }));

                        // Add to candidates so we can buffer them immediately
                        candidates.push(...newQs);

                        // Add to allFiles (in memory) so they don't get lost directly
                        // (Optional, but helps if we re-run this function quickly)
                        if (!window.allFiles) window.allFiles = [];
                        // Just append to first file or create dummy? 
                        // Simpler: Just rely on candidates for now.
                    }
                } catch (refillErr) {
                    console.error("[Endless] Refill failed:", refillErr);
                } finally {
                    window._isRefilling = false;
                }
            }

            // Shuffle candidates
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }

            // Fill buffer
            let addedCount = 0;
            while (window.endlessBuffer.length < BUFFER_TARGET && candidates.length > 0) {
                const q = candidates.pop();

                // GENERATE PROMPT (AI First)
                let promptText = '';
                // Build full context: questionContext + question
                let fullQuestion = '';
                if (q.questionContext) {
                    fullQuestion = `${q.questionContext} ${q.question}`;
                } else {
                    fullQuestion = q.originalQuestion || q.question;
                }

                const promptContext = fullQuestion;

                // FETCH FROM API - STRICT GEMINI
                try {
                    const res = await fetch(apiUrl('/api/generate-image-prompt'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            question: promptContext,
                            explanation: q.explanation || "",
                            model: 'flux', // Switch to flux to avoid turbo limits
                            apiKey: localStorage.getItem('gemini_api_key')
                        })
                    });
                    const data = await res.json();
                    if (data.prompt) {
                        q.imagePrompt = data.prompt; // Save for consistency
                        promptText = data.prompt;
                    } else {
                        throw new Error("No prompt returned");
                    }
                } catch (apiErr) {
                    console.warn("Buffer AI prompt failed, using safety default", apiErr);
                    promptText = "Cinematic high-quality educational scene, professional lighting";
                }

                // Use Server-Side Nano Banana Generation
                let imageUrl = null;
                try {
                    const genRes = await fetch(apiUrl('/api/generate-image'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                        },
                        body: JSON.stringify({
                            question: q.question,
                            context: q.questionContext || "",
                            apiKey: localStorage.getItem('gemini_api_key')
                        })
                    });
                    const genData = await genRes.json();
                    if (genData.imageUrl) {
                        imageUrl = genData.imageUrl;
                        // console.log(`[Buffer Gen] Server generated image`);
                    }
                } catch (genErr) {
                    console.error("Buffer server gen failed", genErr);
                }

                // Translate if needed
                const currentLang = localStorage.getItem('user_lang') || 'en';
                let bufferedQ = q;
                if (currentLang !== 'en') {
                    try {
                        const tQ = await translateQuestion(q, currentLang);
                        bufferedQ = tQ;
                        bufferedQ._translated = true;
                    } catch (e) {
                        console.warn('Buffer translation failed, using original', e);
                    }
                }

                // PRELOAD IMAGE
                let readyUrl = null;
                try {
                    const loadedImg = await preloadImage(imageUrl);
                    if (loadedImg) readyUrl = imageUrl;
                } catch (e) {
                    console.warn("Buffer preload warning, saved for lazy load:", imageUrl);
                }

                // Always buffer
                window.endlessBuffer.push({
                    question: bufferedQ,
                    imageUrl: readyUrl, // Could be null, falling back to live gen
                    ready: !!readyUrl
                });
                addedCount++;

                // Small delay to prevent rate limits
                await new Promise(r => setTimeout(r, 200));
            }

            // Save after filling
            if (addedCount > 0) {
                saveBufferToLocal();
            }

        } catch (err) {
            console.error('Buffering error:', err);
        } finally {
            isBuffering = false;
        }
    }

    // Start buffering on load (delayed) but LOAD from local FIRST
    // Force NEW buffer key to clear old "Robot" images
    // [Removed duplicate loadBufferFromLocal and saveBufferFromLocal]

    loadBufferFromLocal().then(() => {
        // After loading, check if we need more
        setTimeout(() => maintainEndlessBuffer(), 2000);
    });

    // --- Image Generation Queue (Concurrency Managment) ---
    const imageGenQueue = [];
    let activeGenRequests = 0;
    const MAX_CONCURRENT_GEN = 2; // Limit to 2 parallel requests to avoid 429/500 errors

    async function processQueue() {
        if (activeGenRequests >= MAX_CONCURRENT_GEN || imageGenQueue.length === 0) return;

        activeGenRequests++;
        const { params, resolve, reject } = imageGenQueue.shift();

        try {
            const res = await fetch(apiUrl('/api/generate-image'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                },
                body: JSON.stringify(params)
            });
            const data = await res.json();
            resolve(data);
        } catch (e) {
            reject(e);
        } finally {
            activeGenRequests--;
            setTimeout(processQueue, 300);
        }
    }

    function queueImageGeneration(params) {
        return new Promise((resolve, reject) => {
            imageGenQueue.push({ params, resolve, reject });
            processQueue();
        });
    }

    async function startReels(questions, isExclusive = false) {
        // SET GLOBAL FLAG
        window.isExclusiveReels = isExclusive;

        // Keep track of all questions (for infinite scroll)
        // User Request: Don't hide solved, just move to bottom.
        let allCurrentQuestions = [...questions];

        // Consume pre-generated questions on entrance to fresh session
        const pregeneratedTexts = allCurrentQuestions
            .filter(q => q._isPregenerated)
            .map(q => q.question);

        if (pregeneratedTexts.length > 0) {
            console.log(`[Endless] Consuming ${pregeneratedTexts.length} pre-generated questions...`);
            fetch(apiUrl('/api/reels/consume'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                },
                body: JSON.stringify({ questionTexts: pregeneratedTexts })
            }).catch(e => console.error("Failed to consume reels", e));
        }

        // --- INTEGRATE CLIENT BUFFER (Fallback) ---
        const bufferedItems = [];
        if (!isExclusive && window.endlessBuffer && window.endlessBuffer.length > 0) {
            console.log(`Using ${window.endlessBuffer.length} client-buffered questions.`);
            window.endlessBuffer.forEach((b) => {
                const qCopy = { ...b.question, forcedImageUrl: b.imageUrl };
                bufferedItems.push(qCopy);
            });
            window.endlessBuffer = [];
        }

        // Shuffle the non-pregenerated questions — SRS-aware ordering
        let mainPool = allCurrentQuestions.filter(q => !q._isPregenerated);
        const _srsCache = getSRSData();

        const _now = new Date();
        const getSRSPriority = (entry) => {
            if (!entry) return 1; // new (never answered)
            if (_now >= new Date(entry.nextReview)) return 0; // due for re-review
            return 2; // mastered, not yet due
        };

        mainPool.sort((a, b) => {
            const aEntry = _srsCache[a.question];
            const bEntry = _srsCache[b.question];
            const aPri = getSRSPriority(aEntry);
            const bPri = getSRSPriority(bEntry);
            if (aPri !== bPri) return aPri - bPri;

            // Among due questions, lower box first (harder/weaker ones)
            if (aPri === 0) {
                const aBox = aEntry ? aEntry.box : 0;
                const bBox = bEntry ? bEntry.box : 0;
                if (aBox !== bBox) return aBox - bBox;
            }

            return Math.random() - 0.5;
        });

        // Interleave new questions with due: 1 new per 3 due, cap new at 10 per session
        // This prevents new content from drowning out review of existing material
        const NEW_PER_SESSION = 10;
        const INTERLEAVE_RATIO = 3;
        const dueQs = mainPool.filter(q => getSRSPriority(_srsCache[q.question]) === 0);
        const newQs = mainPool.filter(q => getSRSPriority(_srsCache[q.question]) === 1);
        const masteredQs = mainPool.filter(q => getSRSPriority(_srsCache[q.question]) === 2);

        const newQsSession = newQs.slice(0, NEW_PER_SESSION);   // max 10 new per session
        const newQsDeferred = newQs.slice(NEW_PER_SESSION);     // rest deferred to after mastered

        const interleaved = [];
        let newQIdx = 0;
        dueQs.forEach((q, i) => {
            interleaved.push(q);
            if ((i + 1) % INTERLEAVE_RATIO === 0 && newQIdx < newQsSession.length) {
                interleaved.push(newQsSession[newQIdx++]);
            }
        });
        while (newQIdx < newQsSession.length) {
            interleaved.push(newQsSession[newQIdx++]);
        }
        mainPool = [...interleaved, ...newQsDeferred, ...masteredQs];

        // Final Combine: 
        if (isExclusive) {
            // In exclusive mode (News), ONLY show what was passed
            allCurrentQuestions = [...questions];
        } else {
            // Normal mode: [Pre-generated Server] + [Buffered Client] + [Sorted Main Pool]
            const pregeneratedItems = allCurrentQuestions.filter(q => q._isPregenerated);
            allCurrentQuestions = [...pregeneratedItems, ...bufferedItems, ...mainPool];
        }

        window.currentReelQs = allCurrentQuestions; // EXPOSE FOR SAVE ON EXIT

        if (allCurrentQuestions.length === 0 && questions.length > 0) {
            console.log("All questions solved! Generating fresh ones...");
        }

        let currentIndex = 0;
        const spawnedQuestions = new Set(); // Tracks which questions have spawned a follow-up this session
        const BATCH_SIZE = 10; // Render in batches
        let isGeneratingMore = false;

        // Blocking Translation REMOVED.
        // We will translate on demand in renderQuestionBatch
        const currentLang = localStorage.getItem('user_lang') || 'en';

        reelsContainer.innerHTML = '';
        reelsContainer.scrollTop = 0; // Ensure we start at the top

        // --- Session stats tracker ---
        let sessionSolved = 0, sessionCorrect = 0, sessionStreak = 0, sessionBestStreak = 0;
        const sessionBar = document.getElementById('reels-session-bar');
        const sessionSolvedEl = document.getElementById('session-solved-count');
        const sessionStreakEl = document.getElementById('session-streak-count');
        const sessionRateEl = document.getElementById('session-correct-rate');
        const streakStatEl = document.getElementById('session-streak-stat');
        if (sessionBar) sessionBar.hidden = false;

        function updateSessionStats(isCorrect) {
            sessionSolved++;
            if (isCorrect) { sessionCorrect++; sessionStreak++; }
            else { sessionStreak = 0; }
            if (sessionStreak > sessionBestStreak) sessionBestStreak = sessionStreak;

            if (sessionSolvedEl) sessionSolvedEl.textContent = sessionSolved;
            if (sessionStreakEl) sessionStreakEl.textContent = sessionStreak;
            if (sessionRateEl) sessionRateEl.textContent = sessionSolved > 0 ? Math.round((sessionCorrect / sessionSolved) * 100) : 0;
            if (streakStatEl) {
                streakStatEl.classList.toggle('hot', sessionStreak >= 5);
            }

            // Milestone toasts
            const milestones = [
                { count: 5, emoji: '🔥', text: '5 Streak!', sub: 'You\'re on fire!' },
                { count: 10, emoji: '⚡', text: '10 Streak!', sub: 'Unstoppable!' },
                { count: 20, emoji: '🏆', text: '20 Streak!', sub: 'Legendary!' },
                { count: 50, emoji: '👑', text: '50 Streak!', sub: 'You are the master!' },
            ];
            const milestone = milestones.find(m => m.count === sessionStreak);
            if (milestone) {
                const toast = document.createElement('div');
                toast.className = 'milestone-toast';
                toast.innerHTML = `<span class="milestone-emoji">${milestone.emoji}</span><div class="milestone-text">${milestone.text}</div><div class="milestone-sub">${milestone.sub}</div>`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2500);
                if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 100, origin: { y: 0.4 }, colors: ['#6B8C42', '#F9DA78', '#F2A6A6'] });
            }
        }

        // Function to render a batch of questions

        // Helper: Generate a good visual prompt using the WHOLE context



        function createReelCard(q, originalIndex) {
            // Filter invalid Qs
            if (!q.question || q.question.includes('DEBUG INFO') || q.question === 'What should you do next?' || q.question.includes('REASON: JSON')) {
                return null;
            }

            const card = document.createElement('div');
            card.className = 'reel-card';
            const content = document.createElement('div');
            content.className = 'reel-content';

            let promptText = q.imagePrompt || "Professional realistic cinematic scene";
            if (promptText.length > 300) promptText = promptText.substring(0, 300);

            // Standardize Image Generation (Queued)
            // WRAPPER FOR BUTTONS
            const imgWrapper = document.createElement('div');
            imgWrapper.style.position = 'relative';
            // imgWrapper.style.display = 'none'; // USER REQUEST: Hide image completely
            imgWrapper.style.width = '100%';
            imgWrapper.style.marginBottom = '6px';

            const image = document.createElement('img');
            image.className = 'reel-image';
            image.alt = "Topic visualization";
            // image.style.marginBottom = '20px'; // Moved to wrapper
            image.style.width = '100%';
            image.style.borderRadius = '12px';
            image.style.objectFit = 'cover';
            image.style.aspectRatio = '3/4';
            image.style.display = 'block'; // Remove bottom space


            let existingUrl = q.forcedImageUrl || q.imageUrl; // Check both sources

            // Replace stale blob: URLs with live proxy URLs
            if (existingUrl && existingUrl.startsWith('blob:')) {
                const prompt = q.imagePrompt || q.question || '';
                const clean = prompt.replace(/\?|-\s*T\d+/g, '').substring(0, 150);
                const encoded = encodeURIComponent(clean);
                const seed = Math.abs((q.question || '').split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)) % 1000000;
                existingUrl = `/api/proxy/image?prompt=${encoded}&seed=${seed}&model=flux`;
                q.imageUrl = existingUrl;
            }

            // Logic fix: News API returns explicit 'null' to trigger client generation
            // But if it's undefined, it might also need generation.
            // If it is non-empty string, use it.

            if (existingUrl && existingUrl.length > 5 && existingUrl !== "null") {
                image.src = existingUrl;
            } else {
                // On-Demand Generation (Queued)
                // console.log("Queuing image for:", q.question);
                image.src = '/placeholder.png'; // Show loading state

                // Force a unique ID for the queue if missing
                if (!q.id) q.id = 'gen-' + Date.now() + Math.random();

                // queueImageGeneration({
                //     question: q.question,
                //     context: q.questionContext || "", // Pass the news context
                //     model: 'flux', // Switch to flux
                //     apiKey: localStorage.getItem('gemini_api_key')
                // })
                //     .then(d => {
                //         if (d.imageUrl) {
                //             image.src = d.imageUrl;
                //             q.forcedImageUrl = d.imageUrl; // Cache it locally
                //         }
                //     })
                //     .catch(e => {
                //         // Silent Failure: Just log it, don't scare the user.
                //         // The image will stay as placeholder or whatever server returned.
                //         console.warn("Image gen failed (silent)", e);
                //     });
            }

            imgWrapper.appendChild(image);

            // SRS status badge (top-left of image)
            const srsEntry = getSRSEntry(q.question);
            const _badgeNow = new Date();
            let srsBadgeLabel = null;
            let srsBadgeStyle = '';
            if (!srsEntry) {
                srsBadgeLabel = 'New';
                srsBadgeStyle = 'background:rgba(72,180,130,0.88);color:#fff;';
            } else if (_badgeNow >= new Date(srsEntry.nextReview)) {
                srsBadgeLabel = 'Due';
                srsBadgeStyle = 'background:rgba(224,100,50,0.88);color:#fff;';
            }
            if (srsBadgeLabel) {
                const badge = document.createElement('div');
                badge.textContent = srsBadgeLabel;
                badge.style.cssText = `position:absolute;top:10px;left:10px;z-index:20;
                    padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;
                    letter-spacing:0.6px;text-transform:uppercase;
                    backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
                    pointer-events:none;${srsBadgeStyle}`;
                imgWrapper.appendChild(badge);
            }

            // Add Buttons to Wrapper
            // Note: activeFile might be undefined in Endless/Reels mode depending on scope.
            // But usually q.originId is sufficient.
            const fileIdForLike = q.originId || (window.activeFile ? window.activeFile.id : null);

            // Shared style for image overlay action buttons
            const _overlayBtnBase = 'position:absolute;right:10px;z-index:20;background:none;border:none;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45));transition:transform 0.15s;';

            if (fileIdForLike) {
                // Like Button
                const likeBtn = document.createElement('button');
                likeBtn.className = 'like-btn';
                likeBtn.style.cssText = _overlayBtnBase + 'top:10px;font-size:1.25rem;';
                likeBtn.innerHTML = q.isLiked ? '❤️' : '🤍';
                likeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = (q.originalIndex !== undefined) ? q.originalIndex : originalIndex;
                    toggleLike(q, likeBtn, fileIdForLike, idx);
                };
                imgWrapper.appendChild(likeBtn);

                // Summary Button
                const summaryBtn = document.createElement('button');
                summaryBtn.className = 'summary-info-btn';
                summaryBtn.innerHTML = '📄';
                summaryBtn.title = "View Study Material";
                summaryBtn.style.cssText = _overlayBtnBase + 'top:46px;font-size:1.15rem;';
                summaryBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.openOverview) window.openOverview(q.originId);
                };
                imgWrapper.appendChild(summaryBtn);
            }

            // Source Button (YouTube or News)
            const sourceUrl = q.videoUrl || q.relatedLink || (q.newsSource ? q.newsSource.link : null);

            if (sourceUrl) {
                const isYouTube = !!q.videoUrl;
                const srcBtn = document.createElement('button');
                srcBtn.className = isYouTube ? 'youtube-source-btn' : 'news-source-btn';
                srcBtn.innerHTML = isYouTube ? '▶️' : '📰';
                srcBtn.title = isYouTube ? "Watch on YouTube" : "Read Article";
                const topPos = fileIdForLike ? '82px' : '10px';
                srcBtn.style.cssText = _overlayBtnBase + `top:${topPos};font-size:1.15rem;`;
                srcBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.open(sourceUrl, '_blank');
                };
                imgWrapper.appendChild(srcBtn);
            }

            // Material source label with upload date
            const sourceLabel = document.createElement('div');
            sourceLabel.className = 'reel-source-label';
            const sourceName = q.sourceTitle || q.materialName || q.originFilename || '';
            if (sourceName) {
                let dateStr = '';
                // Find the origin file to get upload date — try by ID first, then by filename
                const _allFiles = window.allFiles || [];
                let originFile = q.originId ? _allFiles.find(f => f.id === q.originId) : null;
                if (!originFile) originFile = _allFiles.find(f => f.filename === sourceName);
                if (originFile) {
                    const rawDate = originFile.uploadedAt || originFile.createdAt || originFile.uploadDate || originFile.date;
                    if (rawDate) {
                        const d = new Date(rawDate);
                        if (!isNaN(d.getTime())) {
                            dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    }
                }
                const displayName = sourceName.length > 30 ? sourceName.substring(0, 30) + '...' : sourceName;
                sourceLabel.innerHTML = `<span class="source-dot"></span>${displayName}${dateStr ? ' · ' + dateStr : ''}`;
            }

            const title = document.createElement('div');
            title.className = 'reel-question quiz-question-text';
            title.textContent = q.question;

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'reel-options options-container';
            const explanation = document.createElement('div');
            explanation.className = 'explanation-box';
            explanation.style.marginTop = '20px';
            explanation.hidden = true;
            explanation.innerHTML = `<h4>Explanation</h4><p>${q.explanation}</p>`;

            let isAnswered = false;
            const isSAQ = !q.options || q.options.length === 0 || q.type === 'SAQ';

            if (isSAQ) {
                // NEW: Flashcard UI (Ghibli Theme) for Endless Review
                const flashcard = document.createElement('div');
                flashcard.className = 'flashcard-interaction';
                flashcard.style.cssText = `
                    width: 100%;
                    min-height: 140px;
                    background: rgba(255, 255, 255, 0.9);
                    border: 2px dashed var(--primary, #6B8C42);
                    border-radius: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 30px;
                    text-align: center;
                    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    color: var(--text-muted, #7A7566);
                    margin-bottom: 24px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(107, 140, 66, 0.1);
                    font-family: var(--font-heading, 'Quicksand');
                `;

                const renderRevealedContent = () => {
                    flashcard.style.background = '#fff';
                    flashcard.style.border = '2px solid var(--primary, #6B8C42)';
                    flashcard.style.cursor = 'default';
                    flashcard.style.color = 'var(--text-main, #3D3B30)';
                    flashcard.style.boxShadow = '0 8px 24px rgba(107, 140, 66, 0.15)';
                    flashcard.innerHTML = `
                        <div style="font-size: 0.9em; text-transform: uppercase; letter-spacing: 1.5px; color: var(--primary, #6B8C42); margin-bottom: 12px; font-weight: 700;">
                            ${t('expert_insight')}
                        </div>
                        <div style="font-size: 1.15em; line-height: 1.7; font-family: var(--font-body, 'Nunito'); color: var(--text-main, #3D3B30);">
                            ${q.idealAnswer || q.explanation || 'No insight provided.'}
                        </div>
                    `;
                };

                // No persisted state for endless review SAQ usually, but if we wanted to support it we could.
                // For now, assume it starts fresh.

                // Initial State
                flashcard.innerHTML = `
                    <div style="font-size: 2.5em; margin-bottom: 10px; opacity: 0.8;">🌱</div>
                    <div style="font-size: 1.2em; font-weight: 600; font-family: var(--font-hand, 'Patrick Hand'); color: var(--primary, #6B8C42);">${t('tap_reveal')}</div>
                `;

                flashcard.onclick = () => {
                    if (isAnswered) return;
                    isAnswered = true;

                    // 1. Visual Reveal
                    flashcard.style.transform = 'scale(0.95) rotate(-1deg)';
                    setTimeout(() => {
                        flashcard.style.transform = 'scale(1) rotate(0deg)';
                        renderRevealedContent();

                        // 2. Track Stats
                        fetch(apiUrl('/api/track/solve'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                count: 1,
                                correct: 1,
                                wrong: 0,
                                materialName: q.sourceTitle || q.materialName || q.originFilename || 'Endless Review',
                                subject: q.originSubject || '📚'
                            })
                        }).catch(e => console.error('Tracking failed', e));

                        recordSRSAnswer(q.question, true); // SAQ reveal = correct
                        markQuestionasSolved(q.question);
                        updateSessionStats(true);
                        if (actionRow) actionRow.hidden = true;
                        content.classList.add('correct-flash');
                        if (typeof confetti === 'function') {
                            confetti({
                                particleCount: 60,
                                spread: 70,
                                origin: { y: 0.6 },
                                colors: ['#6B8C42', '#F2A6A6', '#F9DA78'],
                                shapes: ['circle'],
                                scalar: 0.8
                            });
                        }

                        // 3. Spawn Next Question (first correct answer per question only)
                        if (spawnedQuestions.has(q.question)) return;
                        spawnedQuestions.add(q.question);
                        console.log('Flashcard Revealed! Spawning ONE similar question...');
                        const loadingToast = document.createElement('div');
                        loadingToast.className = 'spawn-toast';
                        loadingToast.textContent = t('toast_spawning');
                        document.body.appendChild(loadingToast);

                        const spawnPayload = {
                            question: q.question,
                            context: q.context || "",
                            type: 'SAQ',
                            originId: q.originId,
                            apiKey: localStorage.getItem('gemini_api_key')
                        };

                        fetch(apiUrl('/api/reels/spawn'), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                            },
                            body: JSON.stringify(spawnPayload)
                        }).then(r => r.json())
                            .then(async data => {
                                if (loadingToast) loadingToast.remove();
                                if (data.success && data.questions && data.questions.length > 0) {
                                    // STRICTLY LIMIT TO 1
                                    const singleQ = data.questions.slice(0, 1).map(item => ({
                                        ...item.question,
                                        originId: item.originId,
                                        sourceTitle: item.sourceTitle,
                                        originFilename: item.originFilename,
                                        materialName: item.materialName
                                    }));
                                    // FIX: Append to END of queue to preserve diversity (Flashcard)
                                    const insertIdx = allCurrentQuestions.length;

                                    allCurrentQuestions.push(...singleQ);
                                    const newCard = createReelCard(singleQ[0], insertIdx);
                                    if (newCard) {
                                        reelsContainer.appendChild(newCard); // Append to end

                                        const toast = document.createElement('div');
                                        toast.className = 'spawn-toast';
                                        toast.textContent = t('toast_spawned');
                                        document.body.appendChild(toast);
                                        setTimeout(() => toast.remove(), 2500);

                                        if (totalNum) totalNum.textContent = allCurrentQuestions.length;
                                    }

                                    // Save spawned question to library permanently
                                    const newQ = singleQ[0];
                                    if (newQ && newQ.originId) {
                                        try {
                                            const fileRes = await fetch(apiUrl(`/api/materials/${newQ.originId}`));
                                            if (fileRes.ok) {
                                                const file = await fileRes.json();
                                                if (file && file.questions) {
                                                    file.questions.push(newQ);
                                                    await fetch(apiUrl('/api/files/update'), {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ fileId: file.id, updates: { questions: file.questions } })
                                                    });
                                                }
                                            }
                                        } catch (e) { console.warn('[Spawn] Save to library failed:', e.message); }
                                    }
                                } else if (data.error) {
                                    console.warn('[Spawn] Error:', data.error);
                                }
                            })
                            .catch(err => {
                                if (loadingToast) loadingToast.remove();
                                console.error('[Spawn] Fetch failed:', err);
                            });

                    }, 150);
                };
                optionsDiv.appendChild(flashcard);
            } else {
                const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
                q.options.forEach((opt, optIdx) => {
                    const btn = document.createElement('div');
                    btn.className = 'option';
                    btn.style.display = 'flex';
                    btn.style.alignItems = 'center';
                    const letter = document.createElement('span');
                    letter.className = 'option-letter';
                    letter.textContent = optionLetters[optIdx] || '';
                    const optText = document.createElement('span');
                    optText.textContent = opt;
                    btn.appendChild(letter);
                    btn.appendChild(optText);
                    btn.onclick = () => {
                        if (isAnswered) return;
                        isAnswered = true;
                        if (actionRow) actionRow.hidden = true;
                        const isCorrect = optIdx === q.correctAnswer;
                        recordSRSAnswer(q.question, isCorrect);
                        updateSessionStats(isCorrect);

                        // Refill Buffer on interaction
                        if (window.maintainEndlessBuffer) window.maintainEndlessBuffer();

                        // Track Endless Progress
                        fetch(apiUrl('/api/track/solve'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                count: 1,
                                correct: isCorrect ? 1 : 0,
                                wrong: isCorrect ? 0 : 1,
                                materialName: q.sourceTitle || q.materialName || q.originFilename || 'Endless Review',
                                subject: q.originSubject || '📚'
                            })
                        }).catch(e => console.error('Tracking failed', e));

                        if (isCorrect) {
                            try {

                                markQuestionasSolved(q.question);
                                content.classList.add('correct-flash');
                                if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                            } catch (e) {
                                console.error("Visuals failed:", e);
                            }

                            // --- ENDLESS MODE SPAWNER (first correct answer per question only) ---
                            if (!spawnedQuestions.has(q.question)) {
                            spawnedQuestions.add(q.question);
                            console.log('Correct Answer! Spawning ONE similar question...');
                            const loadingToast = document.createElement('div');
                            loadingToast.className = 'spawn-toast';
                            loadingToast.textContent = t('toast_spawning');
                            document.body.appendChild(loadingToast);

                            // Determine Type
                            let spawnType = q.type;
                            if (q.question.includes('- T1')) spawnType = 1;
                            else if (q.question.includes('- T2')) spawnType = 2;
                            else if (q.type === 'SAQ') spawnType = 'SAQ';
                            else spawnType = 2;

                            const spawnPayload = {
                                question: q.question,
                                context: q.context || "",
                                type: spawnType,
                                originId: q.originId,
                                apiKey: localStorage.getItem('gemini_api_key')
                            };

                            fetch(apiUrl('/api/reels/spawn'), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                                },
                                body: JSON.stringify(spawnPayload)
                            }).then(r => r.json())
                                .then(async data => {
                                    if (loadingToast) loadingToast.remove();
                                    if (data.success && data.questions && data.questions.length > 0) {
                                        // STRICTLY LIMIT TO 1
                                        // CRITICAL FIX: Merge metadata (sourceTitle, originId) into the question object
                                        const singleQ = data.questions.slice(0, 1).map(item => ({
                                            ...item.question,
                                            originId: item.originId,
                                            sourceTitle: item.sourceTitle,
                                            originFilename: item.originFilename,
                                            materialName: item.materialName
                                        }));
                                        // FIX: Append to END of queue to preserve diversity (don't show immediately)
                                        const insertIdx = allCurrentQuestions.length;

                                        allCurrentQuestions.push(...singleQ);

                                        const newCard = createReelCard(singleQ[0], insertIdx);
                                        if (newCard) {
                                            reelsContainer.appendChild(newCard); // Append to end

                                            const toast = document.createElement('div');
                                            toast.className = 'spawn-toast';
                                            toast.textContent = t('toast_added_queue');
                                            document.body.appendChild(toast);
                                            setTimeout(() => toast.remove(), 2500);

                                            if (totalNum) totalNum.textContent = allCurrentQuestions.length;
                                        }

                                        // Save spawned question to library permanently
                                        const newQ = singleQ[0];
                                        if (newQ && newQ.originId) {
                                            try {
                                                const fileRes = await fetch(apiUrl(`/api/materials/${newQ.originId}`));
                                                if (fileRes.ok) {
                                                    const file = await fileRes.json();
                                                    if (file && file.questions) {
                                                        file.questions.push(newQ);
                                                        await fetch(apiUrl('/api/files/update'), {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ fileId: file.id, updates: { questions: file.questions } })
                                                        });
                                                    }
                                                }
                                            } catch (e) { console.warn('[Spawn] Save to library failed:', e.message); }
                                        }
                                    } else if (data.error) {
                                        console.warn('[Spawn] Error:', data.error);
                                    }
                                })
                                .catch(err => {
                                    if (loadingToast) loadingToast.remove();
                                    console.error('[Spawn] Fetch failed:', err);
                                });
                            } // end: one spawn per question

                        } else {
                            content.classList.add('shake-effect');
                            setTimeout(() => content.classList.remove('shake-effect'), 500);
                            if (navigator.vibrate) navigator.vibrate(200);

                            // Re-queue wrong answer: append to end so user sees it again this session
                            const retryCount = (q._retryCount || 0) + 1;
                            if (retryCount <= 2) {
                                const retryQ = { ...q, _retryCount: retryCount };
                                allCurrentQuestions.push(retryQ);
                                window.currentReelQs = allCurrentQuestions;
                                const retryCard = createReelCard(retryQ, allCurrentQuestions.length - 1);
                                if (retryCard) {
                                    reelsContainer.appendChild(retryCard);
                                    if (totalNum) totalNum.textContent = allCurrentQuestions.length;
                                }
                            }
                        }

                        // Disable all options and show feedback
                        optionsDiv.querySelectorAll('.option').forEach((b, i) => {
                            b.classList.add('disabled');
                            if (i === q.correctAnswer) b.classList.add('correct');
                            else if (i === optIdx) b.classList.add('incorrect');
                        });

                        explanation.hidden = false;
                        explanation.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    };

                    optionsDiv.appendChild(btn);
                });
            }

            // Report action row
            const actionRow = document.createElement('div');
            actionRow.className = 'reel-action-row';

            const reportBtn = document.createElement('button');
            reportBtn.className = 'reel-report-btn';
            reportBtn.innerHTML = '🚩 Report';
            reportBtn.onclick = (e) => {
                e.stopPropagation();
                const reason = prompt('What\'s wrong with this question?\n\n• Wrong answer\n• Bad question\n• Other');
                if (reason) {
                    try {
                        const reports = JSON.parse(localStorage.getItem('question_reports') || '[]');
                        reports.push({
                            question: q.question,
                            reason,
                            materialName: q.sourceTitle || q.originFilename || '',
                            timestamp: new Date().toISOString()
                        });
                        localStorage.setItem('question_reports', JSON.stringify(reports));
                    } catch (err) {}
                    reportBtn.innerHTML = '✅ Reported';
                    reportBtn.disabled = true;
                    reportBtn.style.color = 'var(--primary)';
                }
            };

            actionRow.appendChild(reportBtn);

            content.appendChild(imgWrapper);
            if (sourceName) content.appendChild(sourceLabel);
            content.appendChild(title);
            content.appendChild(optionsDiv);
            content.appendChild(actionRow);
            content.appendChild(explanation);
            card.appendChild(content);

            return card;
        }



        async function renderQuestionBatch(startIdx, endIdx) {
            let batch = allCurrentQuestions.slice(startIdx, endIdx);

            // On-Demand Batch Translation
            if (currentLang !== 'en') {
                try {
                    batch = await Promise.all(batch.map(async (q) => {
                        if (q._translated) return q;
                        const tQ = await translateQuestion(q, currentLang);
                        tQ._translated = true;
                        return tQ;
                    }));
                } catch (e) {
                    console.error("Batch translation warning:", e);
                }
            }

            // [Optimization] Skiping client-side prompt gen. Server handles it.
            // (Block removed)

            for (let i = 0; i < batch.length; i++) {
                const index = startIdx + i;
                const q = batch[i];

                if (!q.question || q.question.includes('DEBUG INFO') || q.question === 'What should you do next?' || q.question.includes('REASON: JSON')) {
                    continue;
                }

                try {
                    const card = createReelCard(q, index);
                    if (card) {
                        reelsContainer.appendChild(card);
                        if (!isGeneratingMore && !window.isExclusiveReels && index >= allCurrentQuestions.length - 3) {
                            isGeneratingMore = true;
                            console.log("Reached end of questions. Fetching more...");
                            maintainEndlessBuffer().then(moreQs => {
                                if (moreQs && moreQs.length > 0) {
                                    const newItems = moreQs.filter(mq => !isQuestionSolved(mq.question));
                                    allCurrentQuestions = [...allCurrentQuestions, ...newItems];
                                    window.currentReelQs = allCurrentQuestions;
                                }
                                isGeneratingMore = false;
                            });
                        }
                    }
                } catch (cardErr) {
                    console.error("Error rendering card:", cardErr);
                }
            }
        }


        // Initial render
        await renderQuestionBatch(0, Math.min(BATCH_SIZE, allCurrentQuestions.length));
        currentIndex = Math.min(BATCH_SIZE, allCurrentQuestions.length);

        // Set up intersection observer for infinite scroll
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(async (entry) => {
                if (entry.isIntersecting && currentIndex < allCurrentQuestions.length) {
                    const nextBatch = Math.min(currentIndex + BATCH_SIZE, allCurrentQuestions.length);
                    await renderQuestionBatch(currentIndex, nextBatch);
                    currentIndex = nextBatch;
                }
            });
        }, { threshold: 0.5 });

        // Observe the last card periodically
        setInterval(() => {
            const cards = reelsContainer.querySelectorAll('.reel-card');
            if (cards.length > 0) {
                observer.observe(cards[cards.length - 1]);
            }
        }, 1000);

        switchView('reels');
    }

    window.reviewQuiz = async (fileId) => {
        const response = await fetch(apiUrl('/api/library'), {
            headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
        });
        const files = await response.json();
        const file = files.find(f => f.id === fileId);
        if (file) {
            currentFile = file; // Fix: Set global file state for tracking
            await startQuiz(file.questions);
        }
    };

    window.deleteFile = async (fileId) => {
        if (!confirm('Are you sure you want to delete this file review?')) return;

        try {
            await fetch(`/api/library/${fileId}`, {
                method: 'DELETE',
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });

            // Remove from local endless buffer if present
            if (window.endlessBuffer && window.endlessBuffer.length > 0) {
                const originalLen = window.endlessBuffer.length;
                window.endlessBuffer = window.endlessBuffer.filter(q => {
                    // Check common ID fields
                    return q.fileId !== fileId && q.originId !== fileId;
                });

                if (window.endlessBuffer.length < originalLen) {
                    console.log(`[Delete] Removed ${originalLen - window.endlessBuffer.length} questions from local buffer.`);
                    if (window.saveBufferToLocal) window.saveBufferToLocal();
                }
            }

            loadLibrary();
        } catch (error) {
            alert('Failed to delete file');
        }
    };



    // --- Library Rendering ---
    window.renderLibrary = async function renderLibrary() {
        const categoryColors = {
            'Business': 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
            'Finance / Investing': 'linear-gradient(135deg, #14532d, #22c55e)',
            'Science': 'linear-gradient(135deg, #581c87, #a855f7)',
            'Technology': 'linear-gradient(135deg, #155e75, #06b6d4)',
            'Health / Medicine': 'linear-gradient(135deg, #881337, #f43f5e)',
            'Engineering': 'linear-gradient(135deg, #7c2d12, #ea580c)',
            'Design': 'linear-gradient(135deg, #831843, #ec4899)',
            'Philosophy / Thinking': 'linear-gradient(135deg, #713f12, #eab308)',
            'Career / Education': 'linear-gradient(135deg, #134e4a, #14b8a6)',
            'Politics / Society': 'linear-gradient(135deg, #1f2937, #6b7280)'
        };
        const defaultColor = 'linear-gradient(135deg, #6366f1, #8b5cf6)';

        const currentUser = localStorage.getItem('study_user');
        if (currentUser) {
            const headerEl = document.querySelector('[data-i18n="library_title_html"]');
            if (headerEl) {
                let html = headerEl.innerHTML;
                if (html.includes('Your')) {
                    html = html.replace('Your', `${currentUser}'s`);
                    headerEl.innerHTML = html;
                }
            }
        }

        const container = document.getElementById('library-grid');
        if (!container) return;

        if (!window.allFiles) {
            // Handle loading state or wait?
        }

        let files = (window.allFiles || []).filter(f => !f.isHidden);

        const sortSelect = document.getElementById('sort-select');
        const typeSelect = document.getElementById('filter-select');
        const categorySelect = document.getElementById('category-select');
        const searchInput = document.getElementById('library-search-input');

        const sortBy = sortSelect ? sortSelect.value : 'date-desc';
        const filterType = typeSelect ? typeSelect.value : 'all';
        const filterCategory = categorySelect ? categorySelect.value : 'all';
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

        if (searchQuery) {
            files = files.filter(f => {
                const name = (f.filename || '').toLowerCase();
                const cats = (f.categories || []).join(' ').toLowerCase();
                return name.includes(searchQuery) || cats.includes(searchQuery);
            });
        }

        if (filterType !== 'all') {
            files = files.filter(f => {
                if (filterType === 'youtube') return f.type === 'youtube';
                if (filterType === 'creative') return f.type === 'creative';
                if (filterType === 'pdf') return f.type !== 'youtube' && f.type !== 'creative';
                return true;
            });
        }

        if (filterCategory !== 'all') {
            files = files.filter(f => f.categories && f.categories.includes(filterCategory));
        }

        files.sort((a, b) => {
            const dateA = new Date(a.uploadedAt || a.createdAt || a.uploadDate || a.date || 0);
            const dateB = new Date(b.uploadedAt || b.createdAt || b.uploadDate || b.date || 0);

            if (sortBy === 'date_desc') return dateB - dateA;
            if (sortBy === 'date_asc') return dateA - dateB;
            if (sortBy === 'title-asc') return a.filename.localeCompare(b.filename);
            if (sortBy === 'title-desc') return b.filename.localeCompare(a.filename);

            // New Sort Cases
            const qA = a.questions ? a.questions.length : 0;
            const qB = b.questions ? b.questions.length : 0;

            if (sortBy === 'solved_desc' || sortBy === 'time_desc') return qB - qA;
            if (sortBy === 'solved_asc' || sortBy === 'time_asc') return qA - qB;

            return 0;
        });

        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">${t('no_materials_found')}</div>`;
            return;
        }

        // Pre-load SRS data once for all cards
        const srsData = getSRSData();
        const solvedSet = new Set(getSolvedQuestions());

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'glass-card p-5 hover-scale relative';
            card.style.cursor = 'pointer';
            card.onclick = () => { if (window.openOverview) window.openOverview(file.id); };

            const icon = file.subjectEmoji || (file.type === 'youtube' ? '📺' : '📄');

            // Fix Date Fallback
            let dateStr = 'Unknown Date';
            const rawDate = file.uploadedAt || file.createdAt || file.uploadDate || file.date;
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                }
            }

            // Categories
            let catTags = '';
            if (file.categories && file.categories.length > 0) {
                catTags = '<div class="w-full flex justify-center items-center flex-nowrap gap-1.5 mt-0 mb-1 px-8">';
                file.categories.forEach(cat => {
                    const bg = categoryColors[cat] || defaultColor;
                    catTags += `<span class="px-2 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap" style="background: ${bg};">${cat}</span>`;
                });
                catTags += '</div>';
            }

            // --- Progress ring calculation ---
            const totalQ = file.questions ? file.questions.length : 0;
            let solvedQ = 0;
            if (totalQ > 0) {
                file.questions.forEach(q => {
                    if (solvedSet.has(q.question)) solvedQ++;
                });
            }
            const progressPct = totalQ > 0 ? Math.round((solvedQ / totalQ) * 100) : 0;
            const circumference = 2 * Math.PI * 16;
            const dashOffset = circumference - (progressPct / 100) * circumference;
            const ringColor = progressPct >= 80 ? '#4A6741' : progressPct >= 40 ? '#6B8C42' : '#8FB365';

            // --- Mastery badge ---
            let masteryHTML = '';
            if (totalQ === 0) {
                masteryHTML = '<span class="mastery-badge mastery-new">🌰 New</span>';
            } else if (progressPct >= 80) {
                masteryHTML = '<span class="mastery-badge mastery-mastered">🌳 Mastered</span>';
            } else if (progressPct >= 40) {
                masteryHTML = '<span class="mastery-badge mastery-learning">🌿 Learning</span>';
            } else {
                masteryHTML = '<span class="mastery-badge mastery-beginner">🌱 Beginner</span>';
            }

            // --- Last reviewed ---
            let lastReviewedHTML = '';
            if (totalQ > 0) {
                let latestTime = 0;
                file.questions.forEach(q => {
                    const entry = srsData[q.question];
                    if (entry && entry.lastAnswered) {
                        const t = new Date(entry.lastAnswered).getTime();
                        if (t > latestTime) latestTime = t;
                    }
                });
                if (latestTime > 0) {
                    const diffMs = Date.now() - latestTime;
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHrs = Math.floor(diffMins / 60);
                    const diffDays = Math.floor(diffHrs / 24);
                    let agoStr;
                    if (diffMins < 1) agoStr = 'Just now';
                    else if (diffMins < 60) agoStr = `${diffMins}m ago`;
                    else if (diffHrs < 24) agoStr = `${diffHrs}h ago`;
                    else if (diffDays === 1) agoStr = 'Yesterday';
                    else agoStr = `${diffDays}d ago`;
                    lastReviewedHTML = `<span class="card-last-reviewed">📖 Reviewed ${agoStr}</span>`;
                } else {
                    lastReviewedHTML = '<span class="card-last-reviewed">Not yet reviewed</span>';
                }
            }

            card.innerHTML = `
                ${catTags}
                <button class="delete-btn-abs" onclick="event.stopPropagation(); window.deleteFile('${file.id}')" title="Delete">🗑️</button>

                <div class="flex items-center justify-center mb-2 mt-3 text-4xl">
                    ${icon}
                </div>

                <h3 class="font-bold text-base mb-1 truncate pr-6" title="${file.filename}">${file.filename}</h3>
                <p class="text-xs text-gray-400 mb-1">${file.type === 'youtube' ? t('lib_type_video') : t('lib_type_text')} • ${dateStr}</p>

                <div class="card-info-row">
                    <div class="card-meta-left">
                        ${masteryHTML}
                        ${lastReviewedHTML}
                    </div>
                    <div class="card-progress-ring">
                        <svg viewBox="0 0 36 36">
                            <circle class="ring-bg" cx="18" cy="18" r="16"></circle>
                            <circle class="ring-fill" cx="18" cy="18" r="16"
                                stroke="${ringColor}"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${dashOffset}"></circle>
                        </svg>
                        <div class="ring-text">${solvedQ}/${totalQ}</div>
                    </div>
                </div>

                <div class="h-px bg-gray-700/30 w-full mb-3" style="margin-top:8px;"></div>

                <div class="flex gap-2 card-actions">
                    <button id="btn-review-${file.id}" onclick="event.stopPropagation(); window.startReview('${file.id}')"
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-xs font-bold text-white transition-all">
                        ${t('lib_review')}
                    </button>
                    <button id="btn-more-${file.id}" onclick="event.stopPropagation(); window.generateMore('${file.id}')"
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-xs font-medium text-gray-200 border border-gray-600/50 transition-all">
                        ${t('lib_create_more')}
                    </button>
                    <button id="btn-summary-${file.id}" onclick="event.stopPropagation(); window.openOverview('${file.id}')"
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-xs font-medium text-gray-200 border border-gray-600/50 transition-all">
                        ${t('lib_summary')}
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    };

    window.viewSummary = async (fileId) => {
        // --- Elements ---
        const modal = document.getElementById('summary-modal');
        const titleEl = document.getElementById('overview-title');
        const emojiEl = document.getElementById('overview-emoji');
        const tagsContainer = document.getElementById('overview-tags');
        const qCountEl = document.getElementById('overview-question-count');
        const timeSavedEl = document.getElementById('overview-time-saved');
        const sourceLink = document.getElementById('overview-source-link');
        const sourceText = document.getElementById('overview-source-text');
        const summaryContent = document.getElementById('overview-summary-preview');
        const editBtn = document.getElementById('edit-summary-btn');
        const startReviewBtn = document.getElementById('overview-start-review-btn');

        // Reset UI
        modal.removeAttribute('hidden');
        titleEl.textContent = 'Loading...';
        emojiEl.textContent = '⏳';
        tagsContainer.innerHTML = '';
        qCountEl.textContent = '-';
        timeSavedEl.textContent = '-';
        summaryContent.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading summary...</p>';
        summaryContent.contentEditable = false;
        editBtn.textContent = '✎ Edit';

        // Find file info from global cache
        const file = window.allFiles ? window.allFiles.find(f => f.id === fileId) : null;

        if (file) {
            // Populate Header
            titleEl.textContent = file.filename;
            emojiEl.textContent = file.subjectEmoji || (file.type === 'youtube' ? '📺' : '📄');

            // Populate Tags
            if (file.categories && file.categories.length > 0) {
                const categoryColors = {
                    'Business': '#1e3a8a',
                    'Finance / Investing': '#14532d',
                    'Science': '#581c87',
                    'Technology': '#155e75',
                    'Health / Medicine': '#881337',
                    'Engineering': '#7c2d12',
                    'Design': '#831843',
                    'Philosophy / Thinking': '#713f12',
                    'Career / Education': '#134e4a',
                    'Politics / Society': '#1f2937'
                };

                file.categories.forEach(cat => {
                    const bg = categoryColors[cat] || '#4B5563';
                    const tag = document.createElement('span');
                    tag.textContent = cat;
                    tag.style.background = bg;
                    tag.style.color = 'white';
                    tag.style.padding = '4px 10px';
                    tag.style.borderRadius = '20px';
                    tag.style.fontSize = '0.75rem';
                    tag.style.fontWeight = 'bold';
                    tagsContainer.appendChild(tag);
                });
            }

            // Populate Stats (Mock logic for time saved if not present)
            qCountEl.textContent = file.questions ? file.questions.length : 0;
            // Estimated time saved: 2 mins per question?
            const timeSaved = file.timeSaved || ((file.questions ? file.questions.length : 0) * 2);
            timeSavedEl.textContent = timeSaved + 'm';

            // Populate Source
            const sourceTypeEl = document.getElementById('overview-source-type');
            const sourceTypeIcon = document.getElementById('overview-source-type-icon');
            const sourceTypeText = document.getElementById('overview-source-type-text');

            const ytUrl = file.youtubeUrl || file.originalUrl || file.url;
            if (file.type === 'youtube' && ytUrl) {
                sourceLink.href = ytUrl;
                sourceText.textContent = ytUrl;
                sourceLink.style.display = 'flex';
                if (sourceTypeEl) sourceTypeEl.style.display = 'none';
            } else {
                sourceLink.style.display = 'none';
                if (sourceTypeEl) {
                    sourceTypeEl.style.display = 'flex';
                    const typeMap = {
                        'Movie': { icon: '🎬', label: 'Movie' },
                        'Book': { icon: '📖', label: 'Book' },
                        'TV Show': { icon: '📺', label: 'TV Show' },
                        'creative': { icon: '🎨', label: 'Creative Work' },
                        'pdf': { icon: '📑', label: 'PDF Document' },
                        'doc': { icon: '📝', label: 'Document' },
                        'custom': { icon: '✏️', label: 'Custom Material' },
                    };
                    // Use specific creativeType if set, otherwise file.type
                    const key = file.creativeType || file.type || 'doc';
                    const info = typeMap[key] || { icon: '📄', label: key.charAt(0).toUpperCase() + key.slice(1) };
                    sourceTypeIcon.textContent = info.icon;
                    sourceTypeText.textContent = info.label;
                }
            }

            // Start Review Action
            startReviewBtn.onclick = () => {
                modal.hidden = true;
                if (window.startReview) window.startReview(fileId);
            };

            // Global for edit save logic
            window.currentOverviewId = fileId;
        }

        // Fetch Summary Content
        try {
            const res = await fetch(`/api/summary/${fileId}`, {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });

            if (!res.ok) {
                if (res.status === 404) {
                    summaryContent.innerHTML = '<p style="text-align:center; color:#64748b;">No summary available yet.</p>';
                } else {
                    throw new Error('Failed to load summary');
                }
            } else {
                const data = await res.json();
                let summaryText = data.summary;

                // Auto-regenerate template/placeholder summaries
                const isTemplate = /^(A study set about|Creative study set for)/i.test(summaryText);
                if (isTemplate && file && file.type === 'creative' && file.questions && file.questions.length > 0) {
                    summaryContent.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Generating summary...</p>';
                    try {
                        const questionContext = file.questions.slice(0, 8).map(q => {
                            let parts = [q.question];
                            if (q.explanation) parts.push(q.explanation);
                            if (q.idealAnswer) parts.push(q.idealAnswer);
                            return parts.join(' — ');
                        }).join('\n');
                        const contextText = `Title: ${file.filename}\n\nKey topics:\n${questionContext}`;
                        const geminiKey = localStorage.getItem('gemini_api_key');
                        if (geminiKey && typeof clientAI !== 'undefined' && clientAI.generateSummary) {
                            const regenSummary = await clientAI.generateSummary(contextText, geminiKey, file.filename);
                            if (regenSummary && !/^(A study set|Creative study set|Summary not available)/i.test(regenSummary)) {
                                summaryText = regenSummary;
                                // Save back to server
                                fetch(`/api/summary/${fileId}/update`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') },
                                    body: JSON.stringify({ summary: regenSummary })
                                }).catch(e => console.warn('Summary save failed:', e));
                            }
                        }
                    } catch (e) { console.warn('Client summary regen failed:', e); }
                }

                summaryContent.dataset.rawSummary = summaryText;
                summaryContent.innerHTML = formatSummaryHTML(summaryText);
            }
        } catch (err) {
            console.error(err);
            summaryContent.innerHTML = '<p style="color: #ef4444;">Failed to load summary.</p>';
        }

        // --- Edit Logic (Simplified for new UI) ---
        editBtn.onclick = () => {
            const isEditing = summaryContent.contentEditable === 'true';
            if (!isEditing) {
                // Determine height to prevent jump
                const h = summaryContent.offsetHeight;
                const raw = summaryContent.dataset.rawSummary || summaryContent.innerText;

                // Switch to textarea
                summaryContent.innerHTML = `<textarea id="summary-textarea" class="w-full text-input" style="width:100%; min-height:${Math.max(h, 150)}px; line-height:1.6;">${raw}</textarea>`;
                editBtn.innerHTML = '💾 Save';
            } else {
                // Save logic is handled by specific textarea check below or separate save button?
                // The previous logic used the same button toggle.
                // Let's rely on the separate event listener for 'edit-summary-btn' defined below, 
                // which handles the 'Save' state.
            }
        };
    };

    // Close Modal Logic
    document.getElementById('close-summary-modal-btn').addEventListener('click', () => {
        document.getElementById('summary-modal').hidden = true;
    });

    // Alias for deprecated function name




    // --- Profile Logic ---
    window.renderProfile = window.renderProfile = async function () {
        // Personalize Header with Nickname
        const currentUser = localStorage.getItem('study_user');
        if (currentUser) {
            const headerEl = document.querySelector('[data-i18n="profile_title_html"]');
            if (headerEl) {
                let html = headerEl.innerHTML;
                // English replacement
                if (html.includes('Your')) {
                    html = html.replace('Your', `${currentUser}'s`);
                }
                // Korean replacement
                else if (html.includes('당신의')) {
                    html = html.replace('당신의', `${currentUser}의`); // Possessive particle
                }
                // General fallback (prepend if neither found but user exists?)
                // skipping for safety to avoid messing up other languages

                headerEl.innerHTML = html;
            }
        }

        // --- Restored Stats Logic (Appended to window.renderProfile) ---
        await checkNotionStatus();
        try {
            // Stats Elements
            const totalSolvedEl = document.getElementById('stat-questions-solved');
            const timeSavedEl = document.getElementById('stat-time-saved');
            const streakEl = document.getElementById('stat-streak');
            const streakDescEl = document.getElementById('stat-streak-desc');

            const res = await fetch(apiUrl('/api/profile'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const data = await res.json();

            // Stats
            const totalMins = Math.round(data.totalTimeSavedMins);
            let timeText;
            if (totalMins >= 60) {
                const hours = Math.floor(totalMins / 60);
                const mins = totalMins % 60;
                timeText = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
            } else {
                timeText = `${totalMins}m`;
            }
            if (timeSavedEl) timeSavedEl.textContent = timeText;

            if (totalSolvedEl) totalSolvedEl.textContent = data.totalQuestionsSolved;

            // Set streak count
            const streak = data.currentStreak || 0;
            if (streakEl) streakEl.textContent = streak;
            if (streakDescEl) streakDescEl.textContent = streak === 1 ? `1 ${t('stat_day')}` : `${streak} ${t('stat_days')}`;

            // Chart
            const chartContainer = document.getElementById('activity-chart');
            if (chartContainer) {
                chartContainer.innerHTML = '';

                // Build last 7 days (fill missing days with 0)
                const last7 = [];
                const todayStr = new Date().toISOString().split('T')[0];
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const key = d.toISOString().split('T')[0];
                    last7.push({ day: key, solved: data.dailyStats[key]?.solved || 0, dayName: dayNames[d.getDay()] });
                }
                const maxSolved = Math.max(...last7.map(d => d.solved), 1);
                const totalWeek = last7.reduce((s, d) => s + d.solved, 0);

                // Update total badge
                const totalBadge = document.getElementById('chart-total-badge');
                if (totalBadge) totalBadge.textContent = `${totalWeek} solved`;

                const maxBarHeight = 105;
                const minBarHeight = 4;

                last7.forEach(({ day, solved, dayName }) => {
                    const isToday = day === todayStr;
                    const barH = solved > 0
                        ? Math.round((solved / maxSolved) * maxBarHeight * 0.82 + maxBarHeight * 0.18)
                        : minBarHeight;

                    const col = document.createElement('div');
                    col.style.cssText = 'flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:3px;';

                    // Count label above bar
                    const countLabel = document.createElement('div');
                    countLabel.textContent = solved > 0 ? solved : '';
                    countLabel.style.cssText = `font-size:0.72rem; font-weight:800; color:${isToday ? 'var(--primary)' : 'var(--primary-dark)'}; font-family:var(--font-heading); height:16px; line-height:16px;`;

                    // Bar
                    const bar = document.createElement('div');
                    bar.style.cssText = `width:65%; max-width:38px; height:${barH}px; border-radius:8px 8px 4px 4px; transition:all 0.4s ease; cursor:pointer;`;
                    if (solved > 0) {
                        bar.style.background = isToday
                            ? 'linear-gradient(180deg, #f9da78 0%, #e8a838 100%)'
                            : 'linear-gradient(180deg, #b8dc6f 0%, #6B8C42 100%)';
                        bar.style.boxShadow = isToday
                            ? '0 3px 10px rgba(232,168,56,0.3)'
                            : '0 2px 8px rgba(107,140,66,0.2)';
                    } else {
                        bar.style.background = 'rgba(107,140,66,0.08)';
                        bar.style.border = '1px dashed rgba(107,140,66,0.2)';
                    }
                    bar.title = `${day}: ${solved} solved`;

                    // Day name label
                    const label = document.createElement('div');
                    label.textContent = isToday ? 'Today' : dayName;
                    label.style.cssText = `font-size:0.62rem; font-weight:${isToday ? '800' : '600'}; color:${isToday ? 'var(--primary)' : 'var(--text-muted)'}; font-family:var(--font-heading); height:16px; line-height:16px;`;

                    col.appendChild(countLabel);
                    col.appendChild(bar);
                    col.appendChild(label);
                    chartContainer.appendChild(col);
                });
            }

            // Subject Mastery — per-material progress
            const subList = document.getElementById('subject-list');
            if (subList) {
                subList.innerHTML = '';
                if (!data.topSubjects || data.topSubjects.length === 0) {
                    subList.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px 0; font-size:0.9rem;">
                        ${t('stat_no_progress')}
                    </div>`;
                } else {
                    data.topSubjects
                    .filter(sub => {
                        const n = (sub.name || '').toLowerCase();
                        // Filter out non-material entries
                        if (n === 'endless review' || n === 'unknown') return false;
                        if (/^news quiz[:\s]/i.test(sub.name)) return false;
                        return true;
                    })
                    .slice(0, 10).forEach(sub => {
                        const accuracy = sub.accuracy || 0;
                        const barColor = accuracy >= 80 ? '#4ade80' : accuracy >= 50 ? '#facc15' : '#f87171';
                        const timeTxt = sub.timeSaved >= 60
                            ? `${Math.floor(sub.timeSaved / 60)}h ${sub.timeSaved % 60}m`
                            : `${sub.timeSaved}m`;

                        const row = document.createElement('div');
                        row.style.cssText = 'padding:10px 0; border-bottom:1px solid var(--border-light);';
                        row.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%; font-weight:500;">
                                    ${sub.emoji} ${sub.name}
                                </span>
                                <span style="color:var(--text-muted); font-size:0.8rem; white-space:nowrap;">
                                    ${accuracy}% · ${timeTxt} ${t('stat_saved_suffix')}
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="flex:1; height:6px; background:var(--border-light); border-radius:3px; overflow:hidden;">
                                    <div style="width:${accuracy}%; height:100%; background:${barColor}; border-radius:3px; transition:width 0.3s;"></div>
                                </div>
                                <span style="font-size:0.75rem; color:var(--text-muted); min-width:55px; text-align:right;">
                                    ${sub.correct}✓ ${sub.wrong}✗
                                </span>
                            </div>
                        `;
                        subList.appendChild(row);
                    });
                }
            }

            // Due for Review count
            const dueEl = document.getElementById('stat-due-review');
            let libFiles = [];
            if (dueEl) {
                try {
                    const userId = localStorage.getItem('user_name') || 'guest';
                    const lib = await clientDB.getLibrary(userId);
                    libFiles = lib.files || [];
                    const allQs = libFiles.flatMap(f => f.questions || []);
                    const dueCount = allQs.filter(q => isQuestionDue(q.question)).length;
                    dueEl.textContent = dueCount;
                } catch (e2) { /* ignore */ }
            }

            // === 1. RANK BADGE ===
            renderRankBadge(data.totalQuestionsSolved || 0);

            // === 3. CATEGORY DONUT ===
            renderCategoryDonut(libFiles);

            // === 4. ACHIEVEMENTS ===
            renderAchievements(data, libFiles);

        } catch (e) {
            console.error(e);
        }

        // Initialize reminder controls
        initReminders();
        updateDueBadge();
    };

    // === PROFILE FEATURE FUNCTIONS ===

    // 1. RANK BADGE
    function renderRankBadge(totalSolved) {
        const ranks = [
            { min: 0,    icon: '🌱', label: 'Seedling' },
            { min: 10,   icon: '🌿', label: 'Sprout' },
            { min: 50,   icon: '🌻', label: 'Bloomer' },
            { min: 100,  icon: '🌳', label: 'Scholar' },
            { min: 250,  icon: '⭐', label: 'Star' },
            { min: 500,  icon: '🏔️', label: 'Master' },
            { min: 1000, icon: '👑', label: 'Legend' },
        ];
        let rank = ranks[0];
        for (const r of ranks) {
            if (totalSolved >= r.min) rank = r;
        }
        const iconEl = document.getElementById('rank-icon');
        const labelEl = document.getElementById('rank-label');
        if (iconEl) iconEl.textContent = rank.icon;
        if (labelEl) labelEl.textContent = rank.label;

        // Update avatar emoji to match rank
        const avatarEl = document.getElementById('profile-avatar-emoji');
        if (avatarEl) avatarEl.textContent = rank.icon;
    }

    // 3. CATEGORY DONUT
    function renderCategoryDonut(files) {
        const categoryCounts = {};
        const categoryEmojiMap = {
            'business': '💼', 'finance': '📈', 'investing': '📈', 'technology': '💻', 'tech': '💻',
            'science': '🔬', 'health': '🏥', 'medical': '🏥', 'education': '📖', 'learning': '📖',
            'history': '🏛️', 'language': '🗣️', 'mathematics': '🔢', 'math': '🔢',
            'art': '🎨', 'creative': '🎨', 'music': '🎵', 'sports': '⚽', 'fitness': '💪',
            'politics': '⚖️', 'society': '🌍', 'philosophy': '🧠', 'thinking': '🧠', 'psychology': '🧠',
            'entertainment': '🎬', 'cooking': '🍳', 'food': '🍳', 'travel': '✈️',
            'programming': '👨‍💻', 'coding': '👨‍💻', 'design': '🎨', 'marketing': '📣',
            'economics': '📊', 'law': '⚖️', 'nature': '🌿', 'environment': '🌍',
            'self-help': '✨', 'productivity': '⚡', 'career': '💼', 'other': '📂'
        };
        function getCategoryEmoji(cat) {
            const lower = cat.toLowerCase();
            // Direct match
            if (categoryEmojiMap[lower]) return categoryEmojiMap[lower];
            // Partial match — check if any key is contained in the category name
            for (const [key, emoji] of Object.entries(categoryEmojiMap)) {
                if (lower.includes(key)) return emoji;
            }
            return '📂';
        }
        const donutColors = ['#6B8C42', '#8FB365', '#4A6741', '#F9DA78', '#E8A838', '#F2A6A6', '#74b9ff', '#a29bfe', '#fd79a8', '#00cec9'];

        files.forEach(f => {
            const cat = (f.categories && f.categories.length > 0) ? f.categories[0] : 'Other';
            const qCount = (f.questions || []).length;
            categoryCounts[cat] = (categoryCounts[cat] || 0) + qCount;
        });

        const entries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const total = entries.reduce((s, [, c]) => s + c, 0);

        const chart = document.getElementById('donut-chart');
        const legend = document.getElementById('donut-legend');
        if (!chart || !legend) return;

        // Clear previous
        chart.innerHTML = '<circle cx="80" cy="80" r="60" fill="none" stroke="rgba(107,140,66,0.08)" stroke-width="20" />';
        legend.innerHTML = '';

        if (total === 0) {
            legend.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:20px 0;">No data yet</div>';
            return;
        }

        let offset = 0;
        const circumference = 2 * Math.PI * 60;
        entries.forEach(([cat, count], i) => {
            const pct = count / total;
            const dashLen = circumference * pct;
            const dashGap = circumference - dashLen;
            const color = donutColors[i % donutColors.length];

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '80');
            circle.setAttribute('cy', '80');
            circle.setAttribute('r', '60');
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', color);
            circle.setAttribute('stroke-width', '20');
            circle.setAttribute('stroke-dasharray', `${dashLen} ${dashGap}`);
            circle.setAttribute('stroke-dashoffset', `${-offset}`);
            circle.style.transform = 'rotate(-90deg)';
            circle.style.transformOrigin = '80px 80px';
            chart.appendChild(circle);
            offset += dashLen;

            // Legend item
            const item = document.createElement('div');
            item.className = 'donut-legend-item';
            item.innerHTML = `
                <div class="donut-legend-dot" style="background:${color}"></div>
                <span>${getCategoryEmoji(cat)} ${cat}</span>
                <span class="donut-legend-pct">${Math.round(pct * 100)}%</span>
            `;
            legend.appendChild(item);
        });
    }

    // 4. ACHIEVEMENTS
    function renderAchievements(profileData, files) {
        const totalSolved = profileData.totalQuestionsSolved || 0;
        const streak = profileData.currentStreak || 0;
        const totalFiles = files.length;
        const dailyStats = profileData.dailyStats || {};

        // Check for night owl (solved after 10pm)
        const nowHour = new Date().getHours();

        const achievements = [
            { id: 'first_upload', emoji: '📤', name: 'First Upload', desc: 'Upload your first material', check: totalFiles >= 1 },
            { id: 'ten_solved', emoji: '🎯', name: 'Quick Ten', desc: 'Solve 10 questions', check: totalSolved >= 10 },
            { id: 'fifty_solved', emoji: '💪', name: 'Half Century', desc: 'Solve 50 questions', check: totalSolved >= 50 },
            { id: 'hundred_solved', emoji: '💯', name: 'Centurion', desc: 'Solve 100 questions', check: totalSolved >= 100 },
            { id: 'five_hundred', emoji: '🌟', name: 'Star Student', desc: 'Solve 500 questions', check: totalSolved >= 500 },
            { id: 'streak_3', emoji: '🔥', name: 'On Fire', desc: '3-day streak', check: streak >= 3 },
            { id: 'streak_7', emoji: '⚡', name: 'Week Warrior', desc: '7-day streak', check: streak >= 7 },
            { id: 'streak_30', emoji: '🏆', name: 'Monthly Master', desc: '30-day streak', check: streak >= 30 },
            { id: 'five_materials', emoji: '📚', name: 'Bookworm', desc: 'Upload 5 materials', check: totalFiles >= 5 },
            { id: 'ten_materials', emoji: '🗄️', name: 'Librarian', desc: 'Upload 10 materials', check: totalFiles >= 10 },
            { id: 'night_owl', emoji: '🦉', name: 'Night Owl', desc: 'Study after 10 PM', check: nowHour >= 22 || nowHour < 4 },
            { id: 'early_bird', emoji: '🐦', name: 'Early Bird', desc: 'Study before 7 AM', check: nowHour >= 5 && nowHour < 7 },
        ];

        const unlocked = achievements.filter(a => a.check).length;
        const countEl = document.getElementById('achievement-count');
        if (countEl) countEl.textContent = `${unlocked}/${achievements.length}`;

        const grid = document.getElementById('achievements-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Show unlocked first, then locked
        const sorted = [...achievements].sort((a, b) => (b.check ? 1 : 0) - (a.check ? 1 : 0));
        sorted.forEach(a => {
            const card = document.createElement('div');
            card.className = `achievement-card ${a.check ? 'unlocked' : 'locked'}`;
            card.innerHTML = `
                <span class="achievement-emoji">${a.emoji}</span>
                <div class="achievement-name">${a.name}</div>
                <div class="achievement-desc">${a.desc}</div>
            `;
            grid.appendChild(card);
        });
    }

    // --- Study Reminder Logic ---
    let mainThreadReminderTimer = null;

    function initReminders() {
        const toggle = document.getElementById('reminder-toggle');
        const timeInput = document.getElementById('reminder-time');
        const timeRow = document.getElementById('reminder-time-row');
        const statusEl = document.getElementById('reminder-status');
        if (!toggle) return;

        const savedEnabled = localStorage.getItem('reminder_enabled') === 'true';
        const savedTime = localStorage.getItem('reminder_time') || '20:00';
        toggle.checked = savedEnabled;
        timeInput.value = savedTime;
        timeRow.style.display = savedEnabled ? 'flex' : 'none';

        toggle.addEventListener('change', async () => {
            const enabled = toggle.checked;
            timeRow.style.display = enabled ? 'flex' : 'none';
            localStorage.setItem('reminder_enabled', String(enabled));

            if (enabled) {
                if ('Notification' in window && Notification.permission === 'default') {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        toggle.checked = false;
                        localStorage.setItem('reminder_enabled', 'false');
                        timeRow.style.display = 'none';
                        if (statusEl) { statusEl.textContent = t('reminder_denied') || 'Notification permission denied.'; statusEl.hidden = false; }
                        return;
                    }
                }
                scheduleReminder();
                if (statusEl) { statusEl.textContent = t('reminder_set') || 'Reminder set!'; statusEl.hidden = false; }
            } else {
                cancelReminder();
                if (statusEl) { statusEl.textContent = t('reminder_off') || 'Reminders disabled.'; statusEl.hidden = false; }
            }
        });

        timeInput.addEventListener('change', () => {
            localStorage.setItem('reminder_time', timeInput.value);
            if (toggle.checked) scheduleReminder();
        });

        if (savedEnabled) scheduleReminder();
    }

    async function scheduleReminder() {
        const time = localStorage.getItem('reminder_time') || '20:00';
        const [hour, minute] = time.split(':').map(Number);

        let dueCount = 0;
        let streak = 0;
        try {
            const userId = localStorage.getItem('user_name') || 'guest';
            const lib = await clientDB.getLibrary(userId);
            const allQs = (lib.files || []).flatMap(f => f.questions || []);
            dueCount = allQs.filter(q => isQuestionDue(q.question)).length;

            const log = await clientDB.getActivityLog(userId);
            const today = new Date();
            for (let i = 0; i < 365; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                if (log.dailyStats && log.dailyStats[key] && log.dailyStats[key].solved > 0) { streak++; }
                else if (i > 0) { break; }
            }
        } catch (e) { /* ignore */ }

        // Send to service worker
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_REMINDER',
                data: { enabled: true, hour, minute, dueCount, streak }
            });
        }

        // Main-thread fallback
        clearMainThreadReminder();
        const now = new Date();
        let target = new Date();
        target.setHours(hour, minute, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const delay = target - now;

        mainThreadReminderTimer = setTimeout(() => {
            if ('Notification' in window && Notification.permission === 'granted') {
                let body = dueCount > 0
                    ? `You have ${dueCount} questions due for review.`
                    : 'Keep your knowledge fresh!';
                if (streak > 0) body += ` ${streak}-day streak!`;
                new Notification('Time to study!', { body, icon: '/icon-192.png' });
            }
        }, delay);
    }

    function clearMainThreadReminder() {
        if (mainThreadReminderTimer) { clearTimeout(mainThreadReminderTimer); mainThreadReminderTimer = null; }
    }

    function cancelReminder() {
        clearMainThreadReminder();
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_REMINDER' });
        }
    }

    // --- Notion Logic ---
    const connectNotionBtn = document.getElementById('connect-notion-btn');
    const syncNotionBtn = document.getElementById('sync-notion-btn');
    const notionConnectContainer = document.getElementById('notion-connect-container');
    const notionConnectedContainer = document.getElementById('notion-connected-container');
    const notionWorkspaceName = document.getElementById('notion-workspace-name');
    const notionLastSynced = document.getElementById('notion-last-synced');
    const startDailyQuizBtn = document.getElementById('start-daily-quiz-btn');

    async function checkNotionStatus() {
        if (!notionConnectContainer) return;
        try {
            const res = await fetch(apiUrl('/api/notion/status'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const data = await res.json();

            if (data.connected) {
                notionConnectContainer.hidden = true;
                notionConnectedContainer.hidden = false;
                notionWorkspaceName.textContent = data.workspaceName || 'Notion';
                if (data.lastSyncedAt) {
                    const date = new Date(data.lastSyncedAt);
                    notionLastSynced.textContent = `Last synced: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                } else {
                    notionLastSynced.textContent = 'Last synced: Never';
                }
            } else {
                notionConnectContainer.hidden = false;
                notionConnectedContainer.hidden = true;
            }
        } catch (e) {
            console.error('Failed to check Notion status', e);
        }
    }

    if (connectNotionBtn) {
        connectNotionBtn.addEventListener('click', () => {
            const currentUser = localStorage.getItem('study_user') || 'guest';
            window.location.href = `/auth/notion/login?userId=${encodeURIComponent(currentUser)}`;
        });
    }

    if (syncNotionBtn) {
        syncNotionBtn.addEventListener('click', async () => {
            syncNotionBtn.disabled = true;
            syncNotionBtn.textContent = '🔄 Syncing...';
            try {
                const res = await fetch(apiUrl('/api/sync-notion'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') },
                    body: JSON.stringify({ apiKey: localStorage.getItem('gemini_api_key') || '' })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                alert(`Synced ${data.syncedCount} new pages from Notion!`);
                await checkNotionStatus();
                // Refresh data if needed
                if (window.loadLibraryData) await window.loadLibraryData();
            } catch (e) {
                alert('Sync failed: ' + e.message);
            } finally {
                syncNotionBtn.disabled = false;
                syncNotionBtn.textContent = '🔄 Sync Now';
            }
        });
    }

    const startNewsQuizBtn = document.getElementById('start-news-quiz-btn');
    if (startNewsQuizBtn) {
        startNewsQuizBtn.addEventListener('click', async () => {
            const originalText = startNewsQuizBtn.innerHTML;
            startNewsQuizBtn.disabled = true;
            startNewsQuizBtn.innerHTML = 'Fetching News...';

            try {
                const res = await fetch(apiUrl('/api/news/generate'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                    },
                    body: JSON.stringify({ apiKey: localStorage.getItem('gemini_api_key') })
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Failed to fetch news');
                }

                const data = await res.json();

                // Set global activeFile for Like button context
                activeFile = data;

                if (data.questions && data.questions.length > 0) {
                    // Pass the whole array
                    // Ensure images are set (backend sets forcedImageUrl, but purely to be safe)
                    const qs = data.questions;
                    if (data.imageUrl) {
                        qs.forEach(q => q.forcedImageUrl = data.imageUrl);
                    }

                    switchView('reels');
                    startReels(qs, true); // Exclusive mode
                } else if (data.question) {
                    // Fallback for single
                    const q = data.question;
                    if (data.imageUrl) q.forcedImageUrl = data.imageUrl;
                    switchView('reels');
                    startReels([q], true);
                } else {
                    alert('No news found!');
                }

            } catch (e) {
                console.error("News fetch failed", e);
                alert('News Error: ' + e.message);
            } finally {
                startNewsQuizBtn.disabled = false;
                startNewsQuizBtn.innerHTML = originalText;
            }
        });
    }


    window.generateMoreQuestions = async (fileId) => {
        const btn = document.getElementById('btn-more-' + fileId);
        const originalText = btn.textContent;
        btn.textContent = '⏳ ...';
        btn.disabled = true;

        try {
            const apiKey = localStorage.getItem('gemini_api_key') || '';
            const res = await fetch(`/api/generate-more/${fileId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                }
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed');

            // alert('3 New Questions Added!');
            // Start quiz with these new questions?
            // "then the system will create 3 new questions to review".
            // I'll start the quiz immediately with the NEW questions only.

            // Load file to have subjectEmoji etc
            // But we have the new questions in data.newQuestions

            // We need to set currentFile for tracking!
            // We can fetch library first to find the file or update logic.

            // Quick Fetch
            const libRes = await fetch(apiUrl('/api/library'), {
                headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
            });
            const files = await libRes.json();
            const file = files.find(f => f.id === fileId);
            if (file) {
                currentFile = file;
                // But valid questions are only the NEW ones?
                await startQuiz(data.newQuestions);
            }

        } catch (err) {
            console.error(err);
            alert('Error: ' + err.message);
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    // --- Edit Summary Listener (Overview Modal) ---
    const editSummaryBtn = document.getElementById('edit-summary-btn');
    if (editSummaryBtn) {
        editSummaryBtn.addEventListener('click', async () => {
            const summaryEl = document.getElementById('overview-summary-preview');
            const isEditing = editSummaryBtn.innerText.includes('Save');

            if (!isEditing) {
                // Enter Edit Mode
                const rawSummary = summaryEl.dataset.rawSummary || summaryEl.innerText;
                const height = summaryEl.offsetHeight;

                // Use a textarea with dark mode styling matching the modal
                summaryEl.innerHTML = `<textarea id="summary-textarea" class="w-full bg-gray-800 text-gray-200 p-3 rounded border border-gray-600 focus:outline-none focus:border-blue-500" style="width: 100%; min-height: ${Math.max(height, 300)}px; font-family: inherit; line-height: 1.6; font-size: 0.95rem; background: #1f2937; color: #e2e8f0; border: 1px solid #4b5563; padding: 12px; border-radius: 8px;">${rawSummary}</textarea>`;

                editSummaryBtn.innerHTML = '💾 Save';
            } else {
                // Save Changes
                const textarea = document.getElementById('summary-textarea');
                if (textarea) {
                    const newSummary = textarea.value;
                    const originalText = editSummaryBtn.innerHTML;
                    editSummaryBtn.innerHTML = '⏳ Saving...';
                    editSummaryBtn.disabled = true;

                    try {
                        const fileId = window.currentOverviewId; // Ensure this specific global is used
                        if (!fileId) throw new Error('No file ID found');

                        const res = await fetch(`/api/summary/${fileId}/update`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                            },
                            body: JSON.stringify({ summary: newSummary })
                        });

                        if (!res.ok) throw new Error('Failed to save');

                        // Update local state and UI
                        const file = window.allFiles.find(f => f.id === fileId);
                        if (file) file.summary = newSummary;

                        summaryEl.dataset.rawSummary = newSummary;

                        // Re-apply formatting
                        let formatted = newSummary
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>')
                            .replace(/- /g, '&bull; ');

                        summaryEl.innerHTML = formatted;
                        editSummaryBtn.innerHTML = '✎ Edit';
                    } catch (err) {
                        console.error(err);
                        alert('Failed to save summary: ' + err.message);
                        editSummaryBtn.innerHTML = '💾 Save'; // Revert to save to try again
                    } finally {
                        editSummaryBtn.disabled = false;
                    }
                }
            }
        });
    }

});
// --- Localization ---
const translations = {
    en: {
        nav_review: "Review",
        nav_upload: "Upload",
        nav_library: "Library",
        nav_profile: "Profile",
        hero_title_html: 'Capture <span class="gradient-text">Insights</span>',
        hero_desc: "Turn videos and notes into mastery.",
        tab_file: "📄 Document",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Creative",
        drop_title: "Upload Document",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Generate Quiz",
        btn_yt_quiz: "▶️ Start YouTube Quiz",
        btn_news_quiz: "📰 Start News Quiz",
        yt_title: "Enter YouTube URL",
        api_hint: "Leave blank to use server default",

        // Creative
        creative_title: "Creative Work",
        creative_label_title: "Title",
        creative_label_author: "Author / Director (Optional)",
        creative_label_type: "Type",
        creative_movie: "🎬 Movie",
        creative_book: "📖 Book",
        creative_tvshow: "📺 TV Show",
        creative_music: "🎵 Music Album",
        creative_art: "🎭 Art / Play",

        // Quiz
        back_library: "Before",
        explanation: "Explanation",
        btn_previous: "Prev",
        btn_next: "Next",
        btn_finish: "Finish",
        btn_more_questions: "+ More Questions",
        btn_generating: "⏳ Generating...",
        toast_spawning: "🔄 Generating Bonus Question...",
        toast_spawned: "✨ New Question Spawned!",
        toast_added_queue: "✨ New Question Added to Queue!",
        expert_insight: "✨ Expert Insight",
        tap_reveal: "Tap to Reveal Answer",

        // Library headers
        library_title_html: 'Your <span class="gradient-text">Study Library</span>',
        library_desc: "Review past uploaded notes and retake quizzes.",
        endless_review: "Endless Review",
        create_question: "Create Question",
        create_material: "Create Material",
        sort_by: "Sort By:",
        filter_type: "Type:",
        date_newest: "Date (Newest)",
        date_oldest: "Date (Oldest)",
        sort_solved_desc: "Most Questions Solved",
        sort_solved_asc: "Least Questions Solved",
        sort_time_desc: "Most Time Saved",
        sort_time_asc: "Least Time Saved",
        all_materials: "All Materials",

        // Library content
        type_video: "Video",
        type_doc: "Doc",
        no_files_found: "No matching files found.",
        loading_library: "Loading library...",
        library_empty: "Library is empty. Upload a file to get started!",
        alert_library_empty: "Library is empty! Upload some content first.",
        alert_no_questions: "No questions found in library.",
        translating_questions: "Translating questions...",

        // Profile
        profile_title_html: 'Your <span class="gradient-text">Learning Journey</span>',
        profile_desc: "Track your progress and stats across all materials.",
        stat_time: "Time Saved",
        stat_time_desc: "Smart Accuracy Scoring",
        stat_qs: "Questions Solved",
        stat_qs_desc: "Total across all subjects",
        stat_top: "Top Subject",
        stat_streak: "STREAKS",
        stat_no_data: "No data yet",
        stat_most_studied: "Most studied",
        chart_title: "Last 7 Days (Questions/Time)",
        subject_mastery: "Subject Mastery",

        // Library buttons
        lib_review: "Review",
        lib_start: "Start Quiz",
        lib_summary: "Summary",
        lib_delete: "Delete",
        lib_questions: "Questions",
        lib_min_saved: "min saved",
        lib_create_more: "New Qs",
        lib_generating: "⏳ ...",

        // Profile stats
        stat_solved_label: "Solved",
        stat_saved_label: "Saved",
        stat_streak_label: "Streak",
        stat_due_label: "Due",
        stat_days: "days",
        stat_day: "day",
        stat_saved_suffix: "saved",
        stat_no_progress: "Start solving questions to see your progress here!",
        knowledge_sources: "Knowledge Sources",
        reminder_title: "Study Reminders",
        reminder_daily: "Daily reminder",
        reminder_time: "Reminder time",
        reminder_set: "Reminder set!",
        reminder_off: "Reminders disabled.",
        reminder_denied: "Notification permission denied.",
        connect_notion: "📓 Connect Notion",
        personal_interests: "Personal Interests",
        setup_personal: "👤 Setup Personal",
        no_interests: "No interests selected",

        // Library card
        lib_type_video: "Video",
        lib_type_text: "Text",
        no_materials_found: "No matching materials found.",

        // Categories
        filter_category: "Category:",
        cat_business: "Business",
        cat_finance: "Finance",
        cat_science: "Science",
        cat_technology: "Technology",
        cat_health: "Health",
        cat_engineering: "Engineering",
        cat_design: "Design",
        cat_philosophy: "Philosophy",
        cat_education: "Education",
        cat_politics: "Society",

        // Modals & Alerts
        ready_to_process: "Ready to process",
        select_file: "Select a file...",
        question_added: "Question added successfully!",
        question_required: "Question text is required",
        fill_options: "Please fill in all options",
        select_correct: "Select the correct answer",
        select_material: "Please select a material file",
        material_name_required: "Material name is required"
    },
    zh: {
        nav_review: "复习",
        nav_upload: "上传",
        nav_library: "库",
        nav_profile: "个人资料",
        hero_title_html: '捕获<span class="gradient-text">洞见</span>',
        hero_desc: "将视频和笔记转化为精通。",
        tab_file: "📄 文档",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 创意",
        drop_title: "上传文档",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "生成测验",
        btn_yt_quiz: "▶️ 开始YouTube测验",
        btn_news_quiz: "📰 开始新闻测验",
        yt_title: "输入YouTube链接",
        api_hint: "留空以使用服务器默认值",
        creative_title: "创意作品",
        creative_label_title: "标题",
        creative_label_author: "作者/导演（可选）",
        creative_label_type: "类型",
        creative_movie: "🎬 电影",
        creative_book: "📖 书籍",
        creative_tvshow: "📺 电视剧",
        creative_music: "🎵 音乐专辑",
        creative_art: "🎭 艺术/戏剧",
        back_library: "返回",
        explanation: "解释",
        btn_previous: "上一个",
        btn_next: "下一个",
        btn_finish: "完成",
        btn_more_questions: "+ 更多问题",
        btn_generating: "⏳ 生成中...",
        toast_spawning: "🔄 正在生成额外问题...",
        toast_spawned: "✨ 新问题已生成！",
        toast_added_queue: "✨ 新问题已添加！",
        expert_insight: "✨ 专家洞见",
        tap_reveal: "点击查看答案",
        library_title_html: '您的<span class="gradient-text">学习库</span>',
        library_desc: "查看过去上传的笔记并重新进行测验。",
        endless_review: "无限复习",
        create_question: "创建问题",
        create_material: "创建材料",
        sort_by: "排序方式：",
        filter_type: "类型：",
        date_newest: "日期（最新）",
        date_oldest: "日期（最旧）",
        sort_solved_desc: "解题最多",
        sort_solved_asc: "解题最少",
        sort_time_desc: "节省时间最多",
        sort_time_asc: "节省时间最少",
        all_materials: "所有材料",
        type_video: "视频",
        type_doc: "文档",
        no_files_found: "未找到匹配的文件。",
        loading_library: "加载中...",
        library_empty: "库为空。上传文件以开始使用！",
        alert_library_empty: "库为空！请先上传内容。",
        alert_no_questions: "库中未找到问题。",
        translating_questions: "正在翻译问题...",
        profile_title_html: '您的<span class="gradient-text">学习之旅</span>',
        profile_desc: "跟踪所有资料的进度和统计数据。",
        stat_time: "节省时间",
        stat_time_desc: "智能准确率评分",
        stat_qs: "解决问题",
        stat_qs_desc: "所有科目总计",
        stat_top: "最佳科目",
        stat_no_data: "暂无数据",
        stat_most_studied: "学习最多",
        chart_title: "过去7天 (问题/时间)",
        subject_mastery: "科目掌握度",
        lib_review: "复习测验",
        lib_start: "开始测验",
        lib_summary: "摘要",
        lib_delete: "删除",
        lib_questions: "问题",
        lib_min_saved: "分钟已省",
        lib_create_more: "创建新问题",
        lib_generating: "⏳ ...",
        stat_solved_label: "已解",
        stat_saved_label: "已省",
        stat_streak_label: "连续",
        stat_due_label: "待复习",
        stat_days: "天",
        stat_day: "天",
        stat_saved_suffix: "已省",
        stat_no_progress: "开始做题查看进度！",
        knowledge_sources: "知识来源",
        reminder_title: "学习提醒",
        reminder_daily: "每日提醒",
        reminder_time: "提醒时间",
        connect_notion: "📓 连接 Notion",
        personal_interests: "个人兴趣",
        setup_personal: "👤 设置个人",
        no_interests: "未选择兴趣",
        lib_type_video: "视频",
        lib_type_text: "文本",
        no_materials_found: "未找到匹配的资料。",
        filter_category: "分类：",
        cat_business: "商业",
        cat_finance: "金融",
        cat_science: "科学",
        cat_technology: "科技",
        cat_health: "健康",
        cat_engineering: "工程",
        cat_design: "设计",
        cat_philosophy: "哲学",
        cat_education: "教育",
        cat_politics: "社会",
        ready_to_process: "准备处理",
        select_file: "选择文件...",
        question_added: "问题添加成功！",
        question_required: "请输入问题文本",
        fill_options: "请填写所有选项",
        select_correct: "请选择正确答案",
        select_material: "请选择资料文件",
        material_name_required: "资料名称为必填项"
    },
    ko: {
        nav_review: "복습",
        nav_upload: "업로드",
        nav_library: "라이브러리",
        nav_profile: "프로필",
        hero_title_html: '<span class="gradient-text">인사이트</span> 캡처',
        hero_desc: "영상과 노트를 마스터리로 변환하세요.",
        tab_file: "📄 문서",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 창작물",
        drop_title: "문서 업로드",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "퀴즈 생성",
        btn_yt_quiz: "▶️ YouTube 퀴즈 시작",
        btn_news_quiz: "📰 뉴스 퀴즈 시작",
        yt_title: "YouTube URL 입력",
        api_hint: "서버 기본값을 사용하려면 비워 두세요",
        creative_title: "창작물",
        creative_label_title: "제목",
        creative_label_author: "저자 / 감독 (선택)",
        creative_label_type: "유형",
        creative_movie: "🎬 영화",
        creative_book: "📖 책",
        creative_tvshow: "📺 TV 프로그램",
        creative_music: "🎵 음악 앨범",
        creative_art: "🎭 예술 / 연극",
        back_library: "뒤로",
        explanation: "설명",
        btn_previous: "이전",
        btn_next: "다음",
        btn_finish: "완료",
        btn_more_questions: "+ 추가 문제",
        btn_generating: "⏳ 생성 중...",
        toast_spawning: "🔄 보너스 문제 생성 중...",
        toast_spawned: "✨ 새 문제가 생성되었습니다!",
        toast_added_queue: "✨ 새 문제가 추가되었습니다!",
        expert_insight: "✨ 전문가 인사이트",
        tap_reveal: "탭하여 답 확인",
        library_title_html: '당신의 <span class="gradient-text">학습 라이브러리</span>',
        library_desc: "과거 업로드한 노트를 검토하고 퀴즈를 다시 풀어보세요.",
        endless_review: "무한 복습",
        create_question: "문제 생성",
        create_material: "자료 생성",
        sort_by: "정렬 기준:",
        filter_type: "유형:",
        date_newest: "날짜 (최신순)",
        date_oldest: "날짜 (오래된순)",
        sort_solved_desc: "많이 푼 순",
        sort_solved_asc: "적게 푼 순",
        sort_time_desc: "절약 시간 많은 순",
        sort_time_asc: "절약 시간 적은 순",
        all_materials: "모든 자료",
        type_video: "동영상",
        type_doc: "문서",
        no_files_found: "일치하는 파일을 찾을 수 없습니다.",
        loading_library: "로딩 중...",
        library_empty: "라이브러리가 비어 있습니다. 파일을 업로드하여 시작하세요!",
        alert_library_empty: "라이브러리가 비어 있습니다! 먼저 콘텐츠를 업로드하세요.",
        alert_no_questions: "라이브러리에서 문제를 찾을 수 없습니다.",
        translating_questions: "질문 번역 중...",
        profile_title_html: '당신의 <span class="gradient-text">학습 여정</span>',
        profile_desc: "학습 진행 상황과 통계를 추적하세요.",
        stat_time: "절약한 시간",
        stat_time_desc: "스마트 정확도 점수",
        stat_qs: "해결한 문제",
        stat_qs_desc: "전체 과목 합계",
        stat_top: "최고 과목",
        stat_no_data: "데이터 없음",
        stat_most_studied: "가장 많이 학습함",
        chart_title: "최근 7일 (문제/시간)",
        subject_mastery: "과목 숙련도",
        lib_review: "퀴즈 복습",
        lib_start: "퀴즈 시작",
        lib_summary: "요약",
        lib_delete: "삭제",
        lib_questions: "문제",
        lib_min_saved: "분 절약",
        lib_create_more: "새 문제 생성",
        lib_generating: "⏳ ...",
        stat_solved_label: "해결",
        stat_saved_label: "절약",
        stat_streak_label: "연속",
        stat_due_label: "복습",
        stat_days: "일",
        stat_day: "일",
        stat_saved_suffix: "절약",
        stat_no_progress: "문제를 풀고 진행 상황을 확인하세요!",
        knowledge_sources: "지식 소스",
        reminder_title: "학습 알림",
        reminder_daily: "매일 알림",
        reminder_time: "알림 시간",
        reminder_set: "알림이 설정되었습니다!",
        reminder_off: "알림이 해제되었습니다.",
        reminder_denied: "알림 권한이 거부되었습니다.",
        connect_notion: "📓 Notion 연결",
        personal_interests: "관심 분야",
        setup_personal: "👤 개인 설정",
        no_interests: "선택된 관심사 없음",
        lib_type_video: "동영상",
        lib_type_text: "텍스트",
        no_materials_found: "일치하는 자료가 없습니다.",
        filter_category: "카테고리:",
        cat_business: "비즈니스",
        cat_finance: "금융",
        cat_science: "과학",
        cat_technology: "기술",
        cat_health: "건강",
        cat_engineering: "공학",
        cat_design: "디자인",
        cat_philosophy: "철학",
        cat_education: "교육",
        cat_politics: "사회",
        ready_to_process: "처리 준비 완료",
        select_file: "파일 선택...",
        question_added: "문제가 추가되었습니다!",
        question_required: "문제 텍스트를 입력하세요",
        fill_options: "모든 옵션을 채워주세요",
        select_correct: "정답을 선택하세요",
        select_material: "자료 파일을 선택하세요",
        material_name_required: "자료 이름은 필수입니다"
    },
    ja: {
        nav_review: "復習",
        nav_upload: "アップロード",
        nav_library: "ライブラリ",
        nav_profile: "プロフィール",
        hero_title_html: '<span class="gradient-text">インサイト</span>を捉える',
        hero_desc: "動画やノートを習得に変える。",
        tab_file: "📄 文書",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 クリエイティブ",
        drop_title: "文書をアップロード",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "クイズ作成",
        btn_yt_quiz: "▶️ YouTubeクイズ開始",
        btn_news_quiz: "📰 ニュースクイズ開始",
        yt_title: "YouTube URLを入力",
        api_hint: "デフォルトを使用する場合は空白",
        creative_title: "クリエイティブ作品",
        creative_label_title: "タイトル",
        creative_label_author: "著者/監督（任意）",
        creative_label_type: "種類",
        creative_movie: "🎬 映画",
        creative_book: "📖 本",
        creative_tvshow: "📺 テレビ番組",
        creative_music: "🎵 音楽アルバム",
        creative_art: "🎭 芸術/演劇",
        back_library: "戻る",
        explanation: "説明",
        btn_previous: "前へ",
        btn_next: "次へ",
        btn_finish: "完了",
        btn_more_questions: "+ もっと問題",
        btn_generating: "⏳ 生成中...",
        toast_spawning: "🔄 ボーナス問題を生成中...",
        toast_spawned: "✨ 新しい問題が生成されました！",
        toast_added_queue: "✨ 新しい問題が追加されました！",
        expert_insight: "✨ エキスパートの洞察",
        tap_reveal: "タップして答えを表示",
        library_title_html: 'あなたの<span class="gradient-text">学習ライブラリ</span>',
        library_desc: "過去にアップロードしたノートを見直し、クイズを再受験。",
        endless_review: "無限復習",
        create_question: "問題を作成",
        create_material: "教材を作成",
        sort_by: "並び替え：",
        filter_type: "種類：",
        date_newest: "日付（新しい順）",
        date_oldest: "日付（古い順）",
        sort_solved_desc: "解答数（多い順）",
        sort_solved_asc: "解答数（少ない順）",
        sort_time_desc: "節約時間（多い順）",
        sort_time_asc: "節約時間（少ない順）",
        all_materials: "すべての教材",
        type_video: "動画",
        type_doc: "文書",
        no_files_found: "一致するファイルが見つかりません。",
        loading_library: "読み込み中...",
        library_empty: "ライブラリは空です。ファイルをアップロードして開始！",
        alert_library_empty: "ライブラリが空です！まずコンテンツをアップロード。",
        alert_no_questions: "ライブラリに問題が見つかりません。",
        translating_questions: "質問を翻訳中...",
        profile_title_html: 'あなたの<span class="gradient-text">学習の旅</span>',
        profile_desc: "進捗状況と統計を追跡。",
        stat_time: "節約時間",
        stat_time_desc: "スマート正解率スコア",
        stat_qs: "解決した問題",
        stat_qs_desc: "全科目の合計",
        stat_top: "トップ科目",
        stat_no_data: "データなし",
        stat_most_studied: "最も学習した",
        chart_title: "過去7日間 (問題/時間)",
        subject_mastery: "科目習得度",
        lib_review: "クイズ復習",
        lib_start: "クイズ開始",
        lib_summary: "要約",
        lib_delete: "削除",
        lib_questions: "問",
        lib_min_saved: "分節約",
        lib_create_more: "新しい問題を作成",
        lib_generating: "⏳ ...",
        stat_solved_label: "解答",
        stat_saved_label: "節約",
        stat_streak_label: "連続",
        stat_due_label: "復習",
        stat_days: "日間",
        stat_day: "日",
        stat_saved_suffix: "節約",
        stat_no_progress: "問題を解いて進捗を確認しましょう！",
        knowledge_sources: "知識ソース",
        reminder_title: "学習リマインダー",
        reminder_daily: "毎日のリマインダー",
        reminder_time: "リマインダー時間",
        connect_notion: "📓 Notion接続",
        personal_interests: "個人の関心",
        setup_personal: "👤 個人設定",
        no_interests: "関心なし",
        lib_type_video: "動画",
        lib_type_text: "テキスト",
        no_materials_found: "一致する教材が見つかりません。",
        filter_category: "カテゴリ：",
        cat_business: "ビジネス",
        cat_finance: "金融",
        cat_science: "科学",
        cat_technology: "テクノロジー",
        cat_health: "健康",
        cat_engineering: "工学",
        cat_design: "デザイン",
        cat_philosophy: "哲学",
        cat_education: "教育",
        cat_politics: "社会",
        ready_to_process: "処理の準備完了",
        select_file: "ファイルを選択...",
        question_added: "問題が追加されました！",
        question_required: "問題テキストを入力してください",
        fill_options: "すべての選択肢を入力してください",
        select_correct: "正解を選択してください",
        select_material: "教材ファイルを選択してください",
        material_name_required: "教材名は必須です"
    },
    fr: {
        nav_review: "Réviser",
        nav_upload: "Télécharger",
        nav_library: "Bibliothèque",
        nav_profile: "Profil",
        hero_title_html: 'Capturez des <span class="gradient-text">Insights</span>',
        hero_desc: "Transformez vidéos et notes en maîtrise.",
        tab_file: "📄 Document",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Créatif",
        drop_title: "Télécharger un document",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Générer",
        btn_yt_quiz: "▶️ Quiz YouTube",
        btn_news_quiz: "📰 Quiz Actualités",
        yt_title: "Entrer l'URL YouTube",
        api_hint: "Laisser vide pour la valeur par défaut",
        creative_title: "Œuvre créative",
        creative_label_title: "Titre",
        creative_label_author: "Auteur / Réalisateur (Optionnel)",
        creative_label_type: "Type",
        creative_movie: "🎬 Film",
        creative_book: "📖 Livre",
        creative_tvshow: "📺 Série TV",
        creative_music: "🎵 Album musical",
        creative_art: "🎭 Art / Théâtre",
        back_library: "Retour",
        explanation: "Explication",
        btn_previous: "Précédent",
        btn_next: "Suivant",
        btn_finish: "Terminer",
        btn_more_questions: "+ Plus de questions",
        btn_generating: "⏳ Génération...",
        toast_spawning: "🔄 Génération de question bonus...",
        toast_spawned: "✨ Nouvelle question générée !",
        toast_added_queue: "✨ Nouvelle question ajoutée !",
        expert_insight: "✨ Avis d'expert",
        tap_reveal: "Appuyez pour révéler",
        library_title_html: 'Votre <span class="gradient-text">Bibliothèque</span>',
        library_desc: "Révisez vos notes et refaites les quiz.",
        endless_review: "Mode infini",
        create_question: "Créer une question",
        create_material: "Créer du matériel",
        sort_by: "Trier par :",
        filter_type: "Type :",
        date_newest: "Date (Plus récent)",
        date_oldest: "Date (Plus ancien)",
        sort_solved_desc: "Plus résolu",
        sort_solved_asc: "Moins résolu",
        sort_time_desc: "Plus de temps gagné",
        sort_time_asc: "Moins de temps gagné",
        all_materials: "Tous",
        type_video: "Vidéo",
        type_doc: "Document",
        no_files_found: "Aucun fichier trouvé.",
        loading_library: "Chargement...",
        library_empty: "Bibliothèque vide. Téléchargez un fichier !",
        alert_library_empty: "Bibliothèque vide ! Téléchargez du contenu d'abord.",
        alert_no_questions: "Aucune question trouvée.",
        translating_questions: "Traduction des questions...",
        profile_title_html: 'Votre <span class="gradient-text">Parcours</span>',
        profile_desc: "Suivez vos progrès et statistiques.",
        stat_time: "Temps gagné",
        stat_time_desc: "Score de précision intelligent",
        stat_qs: "Questions résolues",
        stat_qs_desc: "Total tous sujets",
        stat_top: "Sujet principal",
        stat_no_data: "Pas de données",
        stat_most_studied: "Le plus étudié",
        chart_title: "7 derniers jours (Questions/Temps)",
        subject_mastery: "Maîtrise du sujet",
        lib_review: "Réviser",
        lib_start: "Commencer",
        lib_summary: "Résumé",
        lib_delete: "Supprimer",
        lib_questions: "Questions",
        lib_min_saved: "min gagnées",
        lib_create_more: "Créer des questions",
        lib_generating: "⏳ ...",
        stat_solved_label: "Résolu",
        stat_saved_label: "Gagné",
        stat_streak_label: "Série",
        stat_due_label: "À revoir",
        stat_days: "jours",
        stat_day: "jour",
        stat_saved_suffix: "gagné",
        stat_no_progress: "Commencez à résoudre des questions !",
        knowledge_sources: "Sources de connaissances",
        reminder_title: "Rappels d'étude",
        reminder_daily: "Rappel quotidien",
        reminder_time: "Heure du rappel",
        connect_notion: "📓 Connecter Notion",
        personal_interests: "Centres d'intérêt",
        setup_personal: "👤 Configurer",
        no_interests: "Aucun intérêt sélectionné",
        lib_type_video: "Vidéo",
        lib_type_text: "Texte",
        no_materials_found: "Aucun matériel trouvé.",
        filter_category: "Catégorie :",
        cat_business: "Affaires",
        cat_finance: "Finance",
        cat_science: "Science",
        cat_technology: "Technologie",
        cat_health: "Santé",
        cat_engineering: "Ingénierie",
        cat_design: "Design",
        cat_philosophy: "Philosophie",
        cat_education: "Éducation",
        cat_politics: "Société",
        ready_to_process: "Prêt à traiter",
        select_file: "Sélectionner un fichier...",
        question_added: "Question ajoutée !",
        question_required: "Le texte de la question est requis",
        fill_options: "Remplissez toutes les options",
        select_correct: "Sélectionnez la bonne réponse",
        select_material: "Sélectionnez un fichier",
        material_name_required: "Le nom du matériel est requis"
    },
    de: {
        nav_review: "Überprüfen",
        nav_upload: "Hochladen",
        nav_library: "Bibliothek",
        nav_profile: "Profil",
        hero_title_html: '<span class="gradient-text">Erkenntnisse</span> erfassen',
        hero_desc: "Videos und Notizen in Meisterschaft verwandeln.",
        tab_file: "📄 Dokument",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Kreativ",
        drop_title: "Dokument hochladen",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Quiz erstellen",
        btn_yt_quiz: "▶️ YouTube-Quiz starten",
        btn_news_quiz: "📰 Nachrichten-Quiz starten",
        yt_title: "YouTube-URL eingeben",
        api_hint: "Leer lassen für Standard",
        creative_title: "Kreatives Werk",
        creative_label_title: "Titel",
        creative_label_author: "Autor / Regisseur (Optional)",
        creative_label_type: "Typ",
        creative_movie: "🎬 Film",
        creative_book: "📖 Buch",
        creative_tvshow: "📺 TV-Serie",
        creative_music: "🎵 Musikalbum",
        creative_art: "🎭 Kunst / Theater",
        back_library: "Zurück",
        explanation: "Erklärung",
        btn_previous: "Zurück",
        btn_next: "Weiter",
        btn_finish: "Fertig",
        btn_more_questions: "+ Mehr Fragen",
        btn_generating: "⏳ Wird erstellt...",
        toast_spawning: "🔄 Bonusfrage wird erstellt...",
        toast_spawned: "✨ Neue Frage erstellt!",
        toast_added_queue: "✨ Neue Frage hinzugefügt!",
        expert_insight: "✨ Experteneinblick",
        tap_reveal: "Tippen zum Aufdecken",
        library_title_html: 'Ihre <span class="gradient-text">Bibliothek</span>',
        library_desc: "Notizen überprüfen und Quiz wiederholen.",
        endless_review: "Endlosmodus",
        create_question: "Frage erstellen",
        create_material: "Material erstellen",
        sort_by: "Sortieren:",
        filter_type: "Typ:",
        date_newest: "Datum (Neueste)",
        date_oldest: "Datum (Älteste)",
        sort_solved_desc: "Meiste Fragen gelöst",
        sort_solved_asc: "Wenigste Fragen gelöst",
        sort_time_desc: "Meiste Zeit gespart",
        sort_time_asc: "Wenigste Zeit gespart",
        all_materials: "Alle",
        type_video: "Video",
        type_doc: "Dokument",
        no_files_found: "Keine Dateien gefunden.",
        loading_library: "Laden...",
        library_empty: "Bibliothek ist leer. Laden Sie eine Datei hoch!",
        alert_library_empty: "Bibliothek ist leer! Laden Sie zuerst Inhalte hoch.",
        alert_no_questions: "Keine Fragen gefunden.",
        translating_questions: "Fragen werden übersetzt...",
        profile_title_html: 'Ihre <span class="gradient-text">Lernreise</span>',
        profile_desc: "Verfolgen Sie Ihren Fortschritt.",
        stat_time: "Zeit gespart",
        stat_time_desc: "Intelligente Genauigkeit",
        stat_qs: "Fragen gelöst",
        stat_qs_desc: "Insgesamt",
        stat_top: "Top-Thema",
        stat_no_data: "Keine Daten",
        stat_most_studied: "Meist gelernt",
        chart_title: "Letzte 7 Tage (Fragen/Zeit)",
        subject_mastery: "Fachbeherrschung",
        lib_review: "Überprüfen",
        lib_start: "Starten",
        lib_summary: "Zusammenfassung",
        lib_delete: "Löschen",
        lib_questions: "Fragen",
        lib_min_saved: "Min gespart",
        lib_create_more: "Neue Fragen erstellen",
        lib_generating: "⏳ ...",
        stat_solved_label: "Gelöst",
        stat_saved_label: "Gespart",
        stat_streak_label: "Serie",
        stat_due_label: "Fällig",
        stat_days: "Tage",
        stat_day: "Tag",
        stat_saved_suffix: "gespart",
        stat_no_progress: "Lösen Sie Fragen, um Ihren Fortschritt zu sehen!",
        knowledge_sources: "Wissensquellen",
        reminder_title: "Lern-Erinnerungen",
        reminder_daily: "Tägliche Erinnerung",
        reminder_time: "Erinnerungszeit",
        connect_notion: "📓 Notion verbinden",
        personal_interests: "Persönliche Interessen",
        setup_personal: "👤 Einrichten",
        no_interests: "Keine Interessen ausgewählt",
        lib_type_video: "Video",
        lib_type_text: "Text",
        no_materials_found: "Kein passendes Material gefunden.",
        filter_category: "Kategorie:",
        cat_business: "Wirtschaft",
        cat_finance: "Finanzen",
        cat_science: "Wissenschaft",
        cat_technology: "Technologie",
        cat_health: "Gesundheit",
        cat_engineering: "Ingenieurwesen",
        cat_design: "Design",
        cat_philosophy: "Philosophie",
        cat_education: "Bildung",
        cat_politics: "Gesellschaft",
        ready_to_process: "Bereit zur Verarbeitung",
        select_file: "Datei auswählen...",
        question_added: "Frage hinzugefügt!",
        question_required: "Fragetext ist erforderlich",
        fill_options: "Alle Optionen ausfüllen",
        select_correct: "Richtige Antwort auswählen",
        select_material: "Materialdatei auswählen",
        material_name_required: "Materialname ist erforderlich"
    },
    es: {
        nav_review: "Revisar",
        nav_upload: "Subir",
        nav_library: "Biblioteca",
        nav_profile: "Perfil",
        hero_title_html: 'Captura <span class="gradient-text">Ideas</span>',
        hero_desc: "Convierte videos y notas en dominio.",
        tab_file: "📄 Documento",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Creativo",
        drop_title: "Subir documento",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Generar Quiz",
        btn_yt_quiz: "▶️ Quiz de YouTube",
        btn_news_quiz: "📰 Quiz de Noticias",
        yt_title: "Ingresa URL de YouTube",
        api_hint: "Dejar en blanco para predeterminado",
        creative_title: "Obra creativa",
        creative_label_title: "Título",
        creative_label_author: "Autor / Director (Opcional)",
        creative_label_type: "Tipo",
        creative_movie: "🎬 Película",
        creative_book: "📖 Libro",
        creative_tvshow: "📺 Serie de TV",
        creative_music: "🎵 Álbum musical",
        creative_art: "🎭 Arte / Teatro",
        back_library: "Atrás",
        explanation: "Explicación",
        btn_previous: "Anterior",
        btn_next: "Siguiente",
        btn_finish: "Finalizar",
        btn_more_questions: "+ Más preguntas",
        btn_generating: "⏳ Generando...",
        toast_spawning: "🔄 Generando pregunta bonus...",
        toast_spawned: "✨ ¡Nueva pregunta generada!",
        toast_added_queue: "✨ ¡Nueva pregunta añadida!",
        expert_insight: "✨ Perspectiva experta",
        tap_reveal: "Toca para revelar",
        library_title_html: 'Tu <span class="gradient-text">Biblioteca</span>',
        library_desc: "Revisa tus notas y repite los cuestionarios.",
        endless_review: "Modo infinito",
        create_question: "Crear pregunta",
        create_material: "Crear material",
        sort_by: "Ordenar por:",
        filter_type: "Tipo:",
        date_newest: "Fecha (Más reciente)",
        date_oldest: "Fecha (Más antiguo)",
        sort_solved_desc: "Más resueltas",
        sort_solved_asc: "Menos resueltas",
        sort_time_desc: "Más tiempo ahorrado",
        sort_time_asc: "Menos tiempo ahorrado",
        all_materials: "Todos",
        type_video: "Video",
        type_doc: "Documento",
        no_files_found: "No se encontraron archivos.",
        loading_library: "Cargando...",
        library_empty: "Biblioteca vacía. ¡Sube un archivo!",
        alert_library_empty: "¡Biblioteca vacía! Sube contenido primero.",
        alert_no_questions: "No se encontraron preguntas.",
        translating_questions: "Traduciendo preguntas...",
        profile_title_html: 'Tu <span class="gradient-text">Viaje de Aprendizaje</span>',
        profile_desc: "Sigue tu progreso y estadísticas.",
        stat_time: "Tiempo ahorrado",
        stat_time_desc: "Puntuación inteligente",
        stat_qs: "Preguntas resueltas",
        stat_qs_desc: "Total en todos los temas",
        stat_top: "Mejor tema",
        stat_no_data: "Sin datos",
        stat_most_studied: "Más estudiado",
        chart_title: "Últimos 7 días (Preguntas/Tiempo)",
        subject_mastery: "Dominio del tema",
        lib_review: "Revisar",
        lib_start: "Empezar",
        lib_summary: "Resumen",
        lib_delete: "Borrar",
        lib_questions: "Preguntas",
        lib_min_saved: "min ahorrados",
        lib_create_more: "Crear nuevas preguntas",
        lib_generating: "⏳ ...",
        stat_solved_label: "Resueltas",
        stat_saved_label: "Ahorrado",
        stat_streak_label: "Racha",
        stat_due_label: "Pendiente",
        stat_days: "días",
        stat_day: "día",
        stat_saved_suffix: "ahorrado",
        stat_no_progress: "¡Resuelve preguntas para ver tu progreso!",
        knowledge_sources: "Fuentes de conocimiento",
        reminder_title: "Recordatorios de estudio",
        reminder_daily: "Recordatorio diario",
        reminder_time: "Hora del recordatorio",
        connect_notion: "📓 Conectar Notion",
        personal_interests: "Intereses personales",
        setup_personal: "👤 Configurar",
        no_interests: "Sin intereses seleccionados",
        lib_type_video: "Video",
        lib_type_text: "Texto",
        no_materials_found: "No se encontró material.",
        filter_category: "Categoría:",
        cat_business: "Negocios",
        cat_finance: "Finanzas",
        cat_science: "Ciencia",
        cat_technology: "Tecnología",
        cat_health: "Salud",
        cat_engineering: "Ingeniería",
        cat_design: "Diseño",
        cat_philosophy: "Filosofía",
        cat_education: "Educación",
        cat_politics: "Sociedad",
        ready_to_process: "Listo para procesar",
        select_file: "Seleccionar archivo...",
        question_added: "¡Pregunta añadida!",
        question_required: "El texto de la pregunta es obligatorio",
        fill_options: "Complete todas las opciones",
        select_correct: "Seleccione la respuesta correcta",
        select_material: "Seleccione un archivo de material",
        material_name_required: "El nombre del material es obligatorio"
    },
    pt: {
        nav_review: "Revisar",
        nav_upload: "Carregar",
        nav_library: "Biblioteca",
        nav_profile: "Perfil",
        hero_title_html: 'Capture <span class="gradient-text">Insights</span>',
        hero_desc: "Transforme vídeos e notas em domínio.",
        tab_file: "📄 Documento",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Criativo",
        drop_title: "Carregar documento",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Gerar Quiz",
        btn_yt_quiz: "▶️ Quiz do YouTube",
        btn_news_quiz: "📰 Quiz de Notícias",
        yt_title: "Insira a URL do YouTube",
        api_hint: "Deixe em branco para o padrão",
        creative_title: "Obra criativa",
        creative_label_title: "Título",
        creative_label_author: "Autor / Diretor (Opcional)",
        creative_label_type: "Tipo",
        creative_movie: "🎬 Filme",
        creative_book: "📖 Livro",
        creative_tvshow: "📺 Série de TV",
        creative_music: "🎵 Álbum musical",
        creative_art: "🎭 Arte / Teatro",
        back_library: "Voltar",
        explanation: "Explicação",
        btn_previous: "Anterior",
        btn_next: "Próximo",
        btn_finish: "Finalizar",
        btn_more_questions: "+ Mais questões",
        btn_generating: "⏳ Gerando...",
        toast_spawning: "🔄 Gerando questão bônus...",
        toast_spawned: "✨ Nova questão gerada!",
        toast_added_queue: "✨ Nova questão adicionada!",
        expert_insight: "✨ Visão especializada",
        tap_reveal: "Toque para revelar",
        library_title_html: 'Sua <span class="gradient-text">Biblioteca</span>',
        library_desc: "Revise suas notas e refaça os questionários.",
        endless_review: "Modo infinito",
        create_question: "Criar pergunta",
        create_material: "Criar material",
        sort_by: "Ordenar por:",
        filter_type: "Tipo:",
        date_newest: "Data (Mais recente)",
        date_oldest: "Data (Mais antiga)",
        sort_solved_desc: "Mais resolvidas",
        sort_solved_asc: "Menos resolvidas",
        sort_time_desc: "Mais tempo economizado",
        sort_time_asc: "Menos tempo economizado",
        all_materials: "Todos",
        type_video: "Vídeo",
        type_doc: "Documento",
        no_files_found: "Nenhum arquivo encontrado.",
        loading_library: "Carregando...",
        library_empty: "Biblioteca vazia. Carregue um arquivo!",
        alert_library_empty: "Biblioteca vazia! Carregue conteúdo primeiro.",
        alert_no_questions: "Nenhuma pergunta encontrada.",
        translating_questions: "Traduzindo perguntas...",
        profile_title_html: 'Sua <span class="gradient-text">Jornada</span>',
        profile_desc: "Acompanhe seu progresso.",
        stat_time: "Tempo economizado",
        stat_time_desc: "Pontuação inteligente",
        stat_qs: "Questões resolvidas",
        stat_qs_desc: "Total geral",
        stat_top: "Melhor assunto",
        stat_no_data: "Sem dados",
        stat_most_studied: "Mais estudado",
        chart_title: "Últimos 7 dias (Questões/Tempo)",
        subject_mastery: "Domínio do assunto",
        lib_review: "Revisar",
        lib_start: "Começar",
        lib_summary: "Resumo",
        lib_delete: "Excluir",
        lib_questions: "Questões",
        lib_min_saved: "min economizados",
        lib_create_more: "Criar novas perguntas",
        lib_generating: "⏳ ...",
        stat_solved_label: "Resolvidas",
        stat_saved_label: "Economizado",
        stat_streak_label: "Sequência",
        stat_due_label: "Pendente",
        stat_days: "dias",
        stat_day: "dia",
        stat_saved_suffix: "economizado",
        stat_no_progress: "Resolva questões para ver seu progresso!",
        knowledge_sources: "Fontes de conhecimento",
        reminder_title: "Lembretes de estudo",
        reminder_daily: "Lembrete diário",
        reminder_time: "Hora do lembrete",
        connect_notion: "📓 Conectar Notion",
        personal_interests: "Interesses pessoais",
        setup_personal: "👤 Configurar",
        no_interests: "Nenhum interesse selecionado",
        lib_type_video: "Vídeo",
        lib_type_text: "Texto",
        no_materials_found: "Nenhum material encontrado.",
        filter_category: "Categoria:",
        cat_business: "Negócios",
        cat_finance: "Finanças",
        cat_science: "Ciência",
        cat_technology: "Tecnologia",
        cat_health: "Saúde",
        cat_engineering: "Engenharia",
        cat_design: "Design",
        cat_philosophy: "Filosofia",
        cat_education: "Educação",
        cat_politics: "Sociedade",
        ready_to_process: "Pronto para processar",
        select_file: "Selecionar arquivo...",
        question_added: "Pergunta adicionada!",
        question_required: "O texto da pergunta é obrigatório",
        fill_options: "Preencha todas as opções",
        select_correct: "Selecione a resposta correta",
        select_material: "Selecione um arquivo de material",
        material_name_required: "O nome do material é obrigatório"
    },
    vi: {
        nav_review: "Ôn tập",
        nav_upload: "Tải lên",
        nav_library: "Thư viện",
        nav_profile: "Hồ sơ",
        hero_title_html: 'Nắm bắt <span class="gradient-text">Insights</span>',
        hero_desc: "Biến video và ghi chú thành kiến thức.",
        tab_file: "📄 Tài liệu",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 Sáng tạo",
        drop_title: "Tải lên tài liệu",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "Tạo Quiz",
        btn_yt_quiz: "▶️ Quiz YouTube",
        btn_news_quiz: "📰 Quiz Tin tức",
        yt_title: "Nhập URL YouTube",
        api_hint: "Để trống để dùng mặc định",
        creative_title: "Tác phẩm sáng tạo",
        creative_label_title: "Tiêu đề",
        creative_label_author: "Tác giả / Đạo diễn (Tùy chọn)",
        creative_label_type: "Loại",
        creative_movie: "🎬 Phim",
        creative_book: "📖 Sách",
        creative_tvshow: "📺 Chương trình TV",
        creative_music: "🎵 Album nhạc",
        creative_art: "🎭 Nghệ thuật / Kịch",
        back_library: "Quay lại",
        explanation: "Giải thích",
        btn_previous: "Trước",
        btn_next: "Tiếp",
        btn_finish: "Hoàn thành",
        btn_more_questions: "+ Thêm câu hỏi",
        btn_generating: "⏳ Đang tạo...",
        toast_spawning: "🔄 Đang tạo câu hỏi thưởng...",
        toast_spawned: "✨ Câu hỏi mới đã được tạo!",
        toast_added_queue: "✨ Câu hỏi mới đã thêm!",
        expert_insight: "✨ Góc nhìn chuyên gia",
        tap_reveal: "Chạm để xem đáp án",
        library_title_html: '<span class="gradient-text">Thư viện</span> của bạn',
        library_desc: "Xem lại ghi chú và làm lại bài kiểm tra.",
        endless_review: "Chế độ vô tận",
        create_question: "Tạo câu hỏi",
        create_material: "Tạo tài liệu",
        sort_by: "Sắp xếp theo:",
        filter_type: "Loại:",
        date_newest: "Ngày (Mới nhất)",
        date_oldest: "Ngày (Cũ nhất)",
        sort_solved_desc: "Giải nhiều nhất",
        sort_solved_asc: "Giải ít nhất",
        sort_time_desc: "Tiết kiệm nhiều nhất",
        sort_time_asc: "Tiết kiệm ít nhất",
        all_materials: "Tất cả",
        type_video: "Video",
        type_doc: "Tài liệu",
        no_files_found: "Không tìm thấy tệp nào.",
        loading_library: "Đang tải...",
        library_empty: "Thư viện trống. Tải lên tệp để bắt đầu!",
        alert_library_empty: "Thư viện trống! Hãy tải nội dung lên trước.",
        alert_no_questions: "Không tìm thấy câu hỏi nào.",
        translating_questions: "Đang dịch câu hỏi...",
        profile_title_html: '<span class="gradient-text">Hành trình học tập</span>',
        profile_desc: "Theo dõi tiến độ và thống kê.",
        stat_time: "Thời gian tiết kiệm",
        stat_time_desc: "Điểm chính xác thông minh",
        stat_qs: "Câu hỏi đã giải",
        stat_qs_desc: "Tổng số tất cả các môn",
        stat_top: "Môn tốt nhất",
        stat_no_data: "Chưa có dữ liệu",
        stat_most_studied: "Học nhiều nhất",
        chart_title: "7 ngày qua (Câu hỏi/Thời gian)",
        subject_mastery: "Làm chủ môn học",
        lib_review: "Ôn tập",
        lib_start: "Bắt đầu",
        lib_summary: "Tóm tắt",
        lib_delete: "Xóa",
        lib_questions: "Câu hỏi",
        lib_min_saved: "phút đã lưu",
        lib_create_more: "Tạo câu hỏi mới",
        lib_generating: "⏳ ...",
        stat_solved_label: "Đã giải",
        stat_saved_label: "Đã tiết kiệm",
        stat_streak_label: "Chuỗi",
        stat_due_label: "Cần ôn",
        stat_days: "ngày",
        stat_day: "ngày",
        stat_saved_suffix: "đã lưu",
        stat_no_progress: "Giải câu hỏi để xem tiến độ!",
        knowledge_sources: "Nguồn kiến thức",
        reminder_title: "Nhắc nhở học tập",
        reminder_daily: "Nhắc nhở hàng ngày",
        reminder_time: "Thời gian nhắc nhở",
        connect_notion: "📓 Kết nối Notion",
        personal_interests: "Sở thích cá nhân",
        setup_personal: "👤 Cài đặt",
        no_interests: "Chưa chọn sở thích",
        lib_type_video: "Video",
        lib_type_text: "Văn bản",
        no_materials_found: "Không tìm thấy tài liệu.",
        filter_category: "Danh mục:",
        cat_business: "Kinh doanh",
        cat_finance: "Tài chính",
        cat_science: "Khoa học",
        cat_technology: "Công nghệ",
        cat_health: "Sức khỏe",
        cat_engineering: "Kỹ thuật",
        cat_design: "Thiết kế",
        cat_philosophy: "Triết học",
        cat_education: "Giáo dục",
        cat_politics: "Xã hội",
        ready_to_process: "Sẵn sàng xử lý",
        select_file: "Chọn tệp...",
        question_added: "Đã thêm câu hỏi!",
        question_required: "Vui lòng nhập câu hỏi",
        fill_options: "Vui lòng điền tất cả các tùy chọn",
        select_correct: "Chọn đáp án đúng",
        select_material: "Chọn tệp tài liệu",
        material_name_required: "Tên tài liệu là bắt buộc"
    },
    hi: {
        nav_review: "समीक्षा",
        nav_upload: "अपलोड",
        nav_library: "लाइब्रेरी",
        nav_profile: "प्रोफाइल",
        hero_title_html: '<span class="gradient-text">अंतर्दृष्टि</span> कैप्चर करें',
        hero_desc: "वीडियो और नोट्स को महारत में बदलें।",
        tab_file: "📄 दस्तावेज़",
        tab_youtube: "▶ YouTube",
        tab_creative: "🎨 रचनात्मक",
        drop_title: "दस्तावेज़ अपलोड करें",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "क्विज़ बनाएं",
        btn_yt_quiz: "▶️ YouTube क्विज़ शुरू करें",
        btn_news_quiz: "📰 समाचार क्विज़ शुरू करें",
        yt_title: "YouTube URL दर्ज करें",
        api_hint: "सर्वर डिफ़ॉल्ट के लिए खाली छोड़ें",
        creative_title: "रचनात्मक कार्य",
        creative_label_title: "शीर्षक",
        creative_label_author: "लेखक / निर्देशक (वैकल्पिक)",
        creative_label_type: "प्रकार",
        creative_movie: "🎬 फ़िल्म",
        creative_book: "📖 किताब",
        creative_tvshow: "📺 टीवी शो",
        creative_music: "🎵 संगीत एल्बम",
        creative_art: "🎭 कला / नाटक",
        back_library: "वापस",
        explanation: "व्याख्या",
        btn_previous: "पिछला",
        btn_next: "अगला",
        btn_finish: "समाप्त",
        btn_more_questions: "+ अधिक प्रश्न",
        btn_generating: "⏳ बना रहे हैं...",
        toast_spawning: "🔄 बोनस प्रश्न बना रहे हैं...",
        toast_spawned: "✨ नया प्रश्न बनाया गया!",
        toast_added_queue: "✨ नया प्रश्न जोड़ा गया!",
        expert_insight: "✨ विशेषज्ञ अंतर्दृष्टि",
        tap_reveal: "उत्तर देखने के लिए टैप करें",
        library_title_html: 'आपकी <span class="gradient-text">अध्ययन लाइब्रेरी</span>',
        library_desc: "नोट्स की समीक्षा करें और क्विज़ दोबारा लें।",
        endless_review: "अनंत समीक्षा",
        create_question: "प्रश्न बनाएं",
        create_material: "सामग्री बनाएं",
        sort_by: "क्रमबद्ध करें:",
        filter_type: "प्रकार:",
        date_newest: "तिथि (नवीनतम)",
        date_oldest: "तिथि (सबसे पुराना)",
        sort_solved_desc: "सबसे अधिक हल किए गए",
        sort_solved_asc: "सबसे कम हल किए गए",
        sort_time_desc: "सबसे अधिक समय बचाया",
        sort_time_asc: "सबसे कम समय बचाया",
        all_materials: "सभी सामग्री",
        type_video: "वीडियो",
        type_doc: "दस्तावेज़",
        no_files_found: "कोई फ़ाइल नहीं मिली।",
        loading_library: "लोड हो रहा है...",
        library_empty: "लाइब्रेरी खाली है। फ़ाइल अपलोड करें!",
        alert_library_empty: "लाइब्रेरी खाली है! पहले सामग्री अपलोड करें।",
        alert_no_questions: "कोई प्रश्न नहीं मिला।",
        translating_questions: "प्रश्नों का अनुवाद हो रहा है...",
        profile_title_html: 'आपकी <span class="gradient-text">सीखने की यात्रा</span>',
        profile_desc: "अपनी प्रगति और आंकड़ों को ट्रैक करें।",
        stat_time: "बचाया गया समय",
        stat_time_desc: "स्मार्ट सटीकता स्कोरिंग",
        stat_qs: "हल किए गए प्रश्न",
        stat_qs_desc: "सभी विषयों में कुल",
        stat_top: "शीर्ष विषय",
        stat_no_data: "कोई डेटा नहीं",
        stat_most_studied: "सबसे अधिक अध्ययन किया",
        chart_title: "पिछले 7 दिन (प्रश्न/समय)",
        subject_mastery: "विषय में महारत",
        lib_review: "समीक्षा करें",
        lib_start: "शुरू करें",
        lib_summary: "सारांश",
        lib_delete: "हटाएं",
        lib_questions: "प्रश्न",
        lib_min_saved: "मिनट बचाए",
        lib_create_more: "नए प्रश्न बनाएं",
        lib_generating: "⏳ ...",
        stat_solved_label: "हल किए",
        stat_saved_label: "बचाया",
        stat_streak_label: "लगातार",
        stat_due_label: "बाकी",
        stat_days: "दिन",
        stat_day: "दिन",
        stat_saved_suffix: "बचाया",
        stat_no_progress: "प्रगति देखने के लिए प्रश्न हल करें!",
        knowledge_sources: "ज्ञान स्रोत",
        reminder_title: "अध्ययन अनुस्मारक",
        reminder_daily: "दैनिक अनुस्मारक",
        reminder_time: "अनुस्मारक समय",
        connect_notion: "📓 Notion जोड़ें",
        personal_interests: "व्यक्तिगत रुचियाँ",
        setup_personal: "👤 सेटअप",
        no_interests: "कोई रुचि नहीं चुनी",
        lib_type_video: "वीडियो",
        lib_type_text: "टेक्स्ट",
        no_materials_found: "कोई सामग्री नहीं मिली।",
        filter_category: "श्रेणी:",
        cat_business: "व्यवसाय",
        cat_finance: "वित्त",
        cat_science: "विज्ञान",
        cat_technology: "प्रौद्योगिकी",
        cat_health: "स्वास्थ्य",
        cat_engineering: "इंजीनियरिंग",
        cat_design: "डिज़ाइन",
        cat_philosophy: "दर्शन",
        cat_education: "शिक्षा",
        cat_politics: "समाज",
        ready_to_process: "प्रक्रिया के लिए तैयार",
        select_file: "फ़ाइल चुनें...",
        question_added: "प्रश्न जोड़ा गया!",
        question_required: "प्रश्न टेक्स्ट आवश्यक है",
        fill_options: "सभी विकल्प भरें",
        select_correct: "सही उत्तर चुनें",
        select_material: "सामग्री फ़ाइल चुनें",
        material_name_required: "सामग्री का नाम आवश्यक है"
    },
    ar: {
        nav_review: "مراجعة",
        nav_upload: "رفع",
        nav_library: "المكتبة",
        nav_profile: "الملف",
        hero_title_html: 'التقط <span class="gradient-text">الأفكار</span>',
        hero_desc: "حوّل الفيديوهات والملاحظات إلى إتقان.",
        tab_file: "📄 مستند",
        tab_youtube: "▶ يوتيوب",
        tab_creative: "🎨 إبداعي",
        drop_title: "رفع مستند",
        drop_desc: "PDF, DOC, DOCX",
        btn_generate: "إنشاء اختبار",
        btn_yt_quiz: "▶️ اختبار يوتيوب",
        btn_news_quiz: "📰 اختبار الأخبار",
        yt_title: "أدخل رابط يوتيوب",
        api_hint: "اتركه فارغًا للافتراضي",
        creative_title: "عمل إبداعي",
        creative_label_title: "العنوان",
        creative_label_author: "المؤلف / المخرج (اختياري)",
        creative_label_type: "النوع",
        creative_movie: "🎬 فيلم",
        creative_book: "📖 كتاب",
        creative_tvshow: "📺 مسلسل",
        creative_music: "🎵 ألبوم موسيقي",
        creative_art: "🎭 فن / مسرح",
        back_library: "رجوع",
        explanation: "شرح",
        btn_previous: "السابق",
        btn_next: "التالي",
        btn_finish: "إنهاء",
        btn_more_questions: "+ أسئلة إضافية",
        btn_generating: "⏳ جارٍ الإنشاء...",
        toast_spawning: "🔄 جارٍ إنشاء سؤال إضافي...",
        toast_spawned: "✨ تم إنشاء سؤال جديد!",
        toast_added_queue: "✨ تم إضافة سؤال جديد!",
        expert_insight: "✨ رؤية خبير",
        tap_reveal: "انقر لكشف الإجابة",
        library_title_html: '<span class="gradient-text">مكتبتك</span> الدراسية',
        library_desc: "راجع ملاحظاتك وأعد الاختبارات.",
        endless_review: "مراجعة لا نهائية",
        create_question: "إنشاء سؤال",
        create_material: "إنشاء مادة",
        sort_by: "ترتيب حسب:",
        filter_type: "النوع:",
        date_newest: "التاريخ (الأحدث)",
        date_oldest: "التاريخ (الأقدم)",
        sort_solved_desc: "الأكثر حلاً",
        sort_solved_asc: "الأقل حلاً",
        sort_time_desc: "أكثر وقت موفر",
        sort_time_asc: "أقل وقت موفر",
        all_materials: "جميع المواد",
        type_video: "فيديو",
        type_doc: "وثيقة",
        no_files_found: "لم يتم العثور على ملفات.",
        loading_library: "جارٍ التحميل...",
        library_empty: "المكتبة فارغة. قم بتحميل ملف!",
        alert_library_empty: "المكتبة فارغة! حمّل المحتوى أولاً.",
        alert_no_questions: "لم يتم العثور على أسئلة.",
        translating_questions: "جارٍ ترجمة الأسئلة...",
        profile_title_html: '<span class="gradient-text">رحلة التعلم</span> الخاصة بك',
        profile_desc: "تتبع تقدمك وإحصائياتك.",
        stat_time: "الوقت الموفر",
        stat_time_desc: "نظام الدقة الذكي",
        stat_qs: "الأسئلة المحلولة",
        stat_qs_desc: "الإجمالي عبر جميع المواد",
        stat_top: "أفضل مادة",
        stat_no_data: "لا توجد بيانات",
        stat_most_studied: "الأكثر دراسة",
        chart_title: "آخر 7 أيام (أسئلة/وقت)",
        subject_mastery: "إتقان الموضوع",
        lib_review: "مراجعة",
        lib_start: "يبدأ",
        lib_summary: "ملخص",
        lib_delete: "حذف",
        lib_questions: "أسئلة",
        lib_min_saved: "دقيقة وفرت",
        lib_create_more: "إنشاء أسئلة جديدة",
        lib_generating: "⏳ ...",
        stat_solved_label: "محلولة",
        stat_saved_label: "موفر",
        stat_streak_label: "سلسلة",
        stat_due_label: "مراجعة",
        stat_days: "أيام",
        stat_day: "يوم",
        stat_saved_suffix: "موفر",
        stat_no_progress: "ابدأ بحل الأسئلة لرؤية تقدمك!",
        knowledge_sources: "مصادر المعرفة",
        reminder_title: "تذكيرات الدراسة",
        reminder_daily: "تذكير يومي",
        reminder_time: "وقت التذكير",
        connect_notion: "📓 ربط Notion",
        personal_interests: "الاهتمامات الشخصية",
        setup_personal: "👤 إعداد",
        no_interests: "لم يتم اختيار اهتمامات",
        lib_type_video: "فيديو",
        lib_type_text: "نص",
        no_materials_found: "لم يتم العثور على مواد.",
        filter_category: "الفئة:",
        cat_business: "أعمال",
        cat_finance: "مالية",
        cat_science: "علوم",
        cat_technology: "تكنولوجيا",
        cat_health: "صحة",
        cat_engineering: "هندسة",
        cat_design: "تصميم",
        cat_philosophy: "فلسفة",
        cat_education: "تعليم",
        cat_politics: "مجتمع",
        ready_to_process: "جاهز للمعالجة",
        select_file: "اختر ملفًا...",
        question_added: "تم إضافة السؤال!",
        question_required: "نص السؤال مطلوب",
        fill_options: "يرجى ملء جميع الخيارات",
        select_correct: "اختر الإجابة الصحيحة",
        select_material: "اختر ملف المادة",
        material_name_required: "اسم المادة مطلوب"
    }
};

function updateLanguage(lang) {
    if (!translations[lang]) return;

    // Save preference
    localStorage.setItem('user_lang', lang);

    // Direction (for Arabic)
    if (lang === 'ar') {
        document.body.dir = 'rtl';
    } else {
        document.body.dir = 'ltr';
    }

    const tr = translations[lang];
    const elements = document.querySelectorAll('[data-i18n]');

    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (tr[key]) {
            if (key.endsWith('_html')) {
                el.innerHTML = tr[key];
            } else {
                el.textContent = tr[key];
            }
        }
    });

    // Re-render all active views to apply dynamic translations
    const librarySection = document.getElementById('library-section');
    const profileSection = document.getElementById('profile-section');

    if (librarySection && librarySection.classList.contains('active-view')) {
        if (window.renderLibrary) window.renderLibrary();
    }
    if (profileSection && profileSection.classList.contains('active-view')) {
        renderProfile();
    }
}


// Logic for picker - Wrapped in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.getElementById('lang-toggle-btn');
    const langMenu = document.getElementById('lang-menu');
    const langOptions = document.querySelectorAll('.lang-menu button');

    if (langBtn && langMenu) {
        console.log('Language Picker Initialized');

        // Explicitly hide on load to match state
        langMenu.setAttribute('hidden', '');
        langMenu.style.display = 'none';

        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = langMenu.hasAttribute('hidden') || langMenu.style.display === 'none';
            console.log('Toggle language menu. Currently hidden:', isHidden);

            if (isHidden) {
                langMenu.removeAttribute('hidden');
                langMenu.style.display = 'flex'; // Force Flex
                // Animation reset?
                langMenu.style.animation = 'none';
                langMenu.offsetHeight; /* trigger reflow */
                langMenu.style.animation = 'fadeIn 0.2s';
            } else {
                langMenu.setAttribute('hidden', '');
                langMenu.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (langMenu.style.display !== 'none' && !langMenu.contains(e.target) && e.target !== langBtn) {
                console.log('Closing menu via outside click');
                langMenu.setAttribute('hidden', '');
                langMenu.style.display = 'none';
            }
        });

        langOptions.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');
                console.log('Selected language:', lang);
                updateLanguage(lang);
                langMenu.setAttribute('hidden', '');
                langMenu.style.display = 'none';
            });
        });

        // Init
        const savedLang = localStorage.getItem('user_lang') || 'en';
        updateLanguage(savedLang);
    } else {
        console.error('Language Picker Elements NOT Found', { btn: !!langBtn, menu: !!langMenu });
    }
});

// === GLOBAL FUNCTIONS (Outside DOMContentLoaded) ===

// Helper: Load library data
window.loadLibraryData = async () => {
    const res = await fetch(apiUrl('/api/library'), {
        headers: { 'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest') }
    });
    const files = await res.json();
    window.allFiles = files;
    renderRecentUploads(files);
    return files;
};

function renderRecentUploads(files) {
    const container = document.getElementById('recent-uploads');
    if (!container || !files || files.length === 0) {
        if (container) container.hidden = true;
        return;
    }
    const recent = files.slice(0, 3);
    const typeIcons = { youtube: '🎬', creative: '🎨', pdf: '📄', doc: '📝', custom: '📋' };
    container.hidden = false;
    container.innerHTML = `
        <div class="recent-uploads-title">Recent Materials</div>
        <div class="recent-uploads-list">
            ${recent.map(f => {
                const icon = f.subjectEmoji || typeIcons[f.type] || '📄';
                const qCount = f.questions ? f.questions.length : 0;
                const name = f.filename || 'Untitled';
                const displayName = name.length > 22 ? name.substring(0, 22) + '...' : name;
                return `<div class="recent-upload-chip" onclick="window.openOverview && window.openOverview('${f.id}')">
                    <span class="recent-upload-emoji">${icon}</span>
                    <div class="recent-upload-info">
                        <div class="recent-upload-name">${displayName}</div>
                        <div class="recent-upload-meta">${qCount} questions</div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

// 1. Start Review
window.startReview = async (fileId) => {
    try {
        if (!window.allFiles) await window.loadLibraryData();
        const file = window.allFiles.find(f => f.id === fileId);
        if (!file) {
            alert('Material not found');
            return;
        }

        window.currentFile = file;
        currentFile = file; // Sync local variable

        if (file.questions && file.questions.length > 0) {
            await window.startQuiz(file.questions);
        } else {
            alert('No questions available to review.');
        }
    } catch (e) {
        console.error('Start Review Error:', e);
        alert('Failed to start review: ' + e.message);
    }
};

// 2. Generate More Questions
window.generateMore = async (fileId) => {
    const btn = document.getElementById('btn-more-' + fileId);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    }

    try {
        const apiKey = localStorage.getItem('gemini_api_key') || '';
        const res = await fetch(`/api/generate-more/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
            }
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to generate questions');

        // Reload library and navigate to quiz
        await window.loadLibraryData();
        const file = window.allFiles.find(f => f.id === fileId);
        if (file) {
            window.currentFile = file;
            if (data.newQuestions && data.newQuestions.length > 0) {
                await window.startQuiz(data.newQuestions);
            } else {
                await window.startQuiz(file.questions);
            }
        }

    } catch (err) {
        console.error('Generate More Error:', err);
        alert('Error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus mr-1"></i> New Qs';
        }
    }
};

// --- Helper: Category Picker ---
async function showCategoryPicker(file, container, renderPills) {
    const VALID_CATEGORIES = [
        "Business", "Finance / Investing", "Science", "Technology",
        "Health / Medicine", "Engineering", "Design",
        "Philosophy / Thinking", "Career / Education", "Politics / Society"
    ];
    const categoryTagColors = {
        'Business': '#3b82f6',
        'Finance / Investing': '#10b981',
        'Science': '#8b5cf6',
        'Technology': '#6366f1',
        'Health / Medicine': '#ef4444',
        'Engineering': '#f59e0b',
        'Design': '#ec4899',
        'Philosophy / Thinking': '#14b8a6',
        'Career / Education': '#8b5cf6',
        'Politics / Society': '#6b7280'
    };

    const originalCategories = [...(file.categories || [])];
    let currentCategories = [...originalCategories];

    const renderPicker = () => {
        container.innerHTML = '';
        container.style.justifyContent = 'center';

        VALID_CATEGORIES.forEach(cat => {
            const chip = document.createElement('div');
            chip.className = `category-chip ${currentCategories.includes(cat) ? 'active' : ''}`;
            chip.textContent = cat;

            const bg = categoryTagColors[cat] || '#4B5563';
            if (currentCategories.includes(cat)) {
                chip.style.background = bg;
            } else {
                chip.style.background = 'rgba(0,0,0,0.05)';
            }

            chip.onclick = (e) => {
                e.stopPropagation();
                if (currentCategories.includes(cat)) {
                    currentCategories = currentCategories.filter(c => c !== cat);
                } else {
                    currentCategories.push(cat);
                }
                renderPicker();
            };
            container.appendChild(chip);
        });

        // Add Actions container
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:10px; margin-top:15px; width:100%; justify-content:center;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Categories';
        saveBtn.className = 'primary-btn';
        saveBtn.style.cssText = 'padding:6px 16px; border-radius:12px; font-size:0.8rem; height:auto;';
        saveBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                const res = await fetch(`/api/materials/${file.id}/categories`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                    },
                    body: JSON.stringify({ categories: currentCategories })
                });
                if (res.ok) {
                    file.categories = currentCategories;
                    if (window.renderLibrary) window.renderLibrary();
                    closePicker();
                } else {
                    alert('Failed to save categories');
                }
            } catch (err) {
                console.error("Save Error:", err);
                alert('Error saving categories');
            }
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'secondary-btn';
        cancelBtn.style.cssText = 'padding:6px 16px; border-radius:12px; font-size:0.8rem; height:auto;';
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            closePicker();
        };

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        container.appendChild(actions);
    };

    function closePicker() {
        if (typeof renderPills === 'function') renderPills();
    }

    renderPicker();
}

// 3. Open Overview Modal
window.openOverview = async (fileId) => {
    try {
        const modal = document.getElementById('summary-modal');
        if (!modal) {
            console.error('Overview modal not found');
            return;
        }

        if (!window.allFiles) await window.loadLibraryData();
        const file = window.allFiles.find(f => f.id === fileId);
        if (!file) {
            alert('Material not found');
            return;
        }

        window.currentOverviewId = fileId;

        // Populate modal
        document.getElementById('overview-emoji').textContent = file.subjectEmoji || (file.type === 'youtube' ? '📺' : '📄');

        // Editable Title Logic
        const titleEl = document.getElementById('overview-title-text');
        titleEl.textContent = file.filename;

        // Inline title editing — double-click to edit
        titleEl.style.cursor = 'text';
        titleEl.title = 'Double-click to edit';
        titleEl.ondblclick = () => {
            const currentTitle = titleEl.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.style.cssText = 'font-size: inherit; font-weight: inherit; font-family: inherit; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; width: 200px; text-align: center;';
            titleEl.style.display = 'none';
            titleEl.parentNode.insertBefore(input, titleEl);
            input.focus();
            input.select();

            const save = async () => {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== currentTitle) {
                    try {
                        const res = await fetch(apiUrl('/api/files/update'), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-user-id': encodeURIComponent(localStorage.getItem('user_name') || 'guest')
                            },
                            body: JSON.stringify({ fileId: file.id, filename: newTitle })
                        });
                        const data = await res.json();
                        if (data.success) {
                            file.filename = newTitle;
                            titleEl.textContent = newTitle;
                            if (window.allFiles) {
                                const f = window.allFiles.find(x => x.id === file.id);
                                if (f) f.filename = newTitle;
                            }
                            if (window.renderLibrary) window.renderLibrary();
                        } else {
                            titleEl.textContent = currentTitle;
                        }
                    } catch (e) {
                        titleEl.textContent = currentTitle;
                    }
                } else {
                    titleEl.textContent = currentTitle;
                }
                input.remove();
                titleEl.style.display = '';
            };

            input.onblur = save;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') { titleEl.style.display = ''; input.remove(); }
            };
        };

        // Categories with colors
        const categoryColors = {
            'Business': '#3b82f6',
            'Finance / Investing': '#10b981',
            'Science': '#8b5cf6',
            'Technology': '#6366f1',
            'Health / Medicine': '#ef4444',
            'Engineering': '#f59e0b',
            'Design': '#ec4899',
            'Philosophy / Thinking': '#14b8a6',
            'Career / Education': '#8b5cf6',
            'Politics / Society': '#6b7280'
        };

        const catContainer = document.getElementById('overview-tags');
        catContainer.innerHTML = '';

        const renderCategoryPills = () => {
            catContainer.innerHTML = '';
            const cats = file.categories && file.categories.length > 0 ? file.categories : [];
            if (cats.length > 0) {
                cats.forEach(cat => {
                    const span = document.createElement('span');
                    span.className = 'cat-pill';
                    const bg = categoryColors[cat] || '#8b5cf6';
                    span.style.cssText = `background:${bg}; color:white; padding:4px 12px; border-radius:20px; font-size:0.85rem; font-weight:600; margin:3px; box-shadow:0 2px 4px rgba(0,0,0,0.2); cursor:pointer; transition: opacity 0.15s;`;
                    span.title = 'Click to edit categories';
                    span.textContent = cat;
                    span.onmouseenter = () => span.style.opacity = '0.8';
                    span.onmouseleave = () => span.style.opacity = '1';
                    span.onclick = (e) => { e.stopPropagation(); showCategoryPicker(file, catContainer, renderCategoryPills); };
                    catContainer.appendChild(span);
                });
            } else {
                // No categories yet — show a placeholder to click
                const placeholder = document.createElement('span');
                placeholder.style.cssText = 'font-size:0.8rem; color:var(--text-muted); cursor:pointer; border:1px dashed var(--border-light); padding:4px 12px; border-radius:20px;';
                placeholder.textContent = '＋ Add category';
                placeholder.onclick = (e) => { e.stopPropagation(); showCategoryPicker(file, catContainer, renderCategoryPills); };
                catContainer.appendChild(placeholder);
            }
        };
        renderCategoryPills();

        // Stats
        const qCount = file.questions ? file.questions.length : 0;
        document.getElementById('overview-question-count').textContent = qCount;
        document.getElementById('overview-time-saved').textContent = (qCount * 2) + 'm';

        // Source
        const linkEl = document.getElementById('overview-source-link');
        const linkText = document.getElementById('overview-source-text');
        const srcTypeEl = document.getElementById('overview-source-type');
        const srcTypeIcon = document.getElementById('overview-source-type-icon');
        const srcTypeText = document.getElementById('overview-source-type-text');

        const ytUrl2 = file.youtubeUrl || file.originalUrl || file.url;
        if (file.type === 'youtube' && ytUrl2) {
            linkEl.href = ytUrl2;
            linkEl.style.display = 'flex';
            linkText.textContent = ytUrl2.length > 40 ? ytUrl2.substring(0, 40) + '...' : ytUrl2;
            if (srcTypeEl) srcTypeEl.style.display = 'none';
        } else {
            linkEl.style.display = 'none';
            if (srcTypeEl) {
                srcTypeEl.style.display = 'flex';
                const typeMap = {
                    'Movie': { icon: '🎬', label: 'Movie' },
                    'Book': { icon: '📖', label: 'Book' },
                    'TV Show': { icon: '📺', label: 'TV Show' },
                    'creative': { icon: '🎨', label: 'Creative Work' },
                    'pdf': { icon: '📑', label: 'PDF Document' },
                    'doc': { icon: '📝', label: 'Document' },
                    'custom': { icon: '✏️', label: 'Custom Material' },
                };
                const key = file.creativeType || file.type || 'doc';
                const info = typeMap[key] || { icon: '📄', label: key.charAt(0).toUpperCase() + key.slice(1) };
                srcTypeIcon.textContent = info.icon;
                srcTypeText.textContent = info.label;
            }
        }

        // Summary
        const summaryEl = document.getElementById('overview-summary-preview');
        summaryEl.innerHTML = '';
        summaryEl.style.fontStyle = 'normal';

        if (file.summary) {
            summaryEl.dataset.rawSummary = file.summary; // Store raw for editing
            summaryEl.innerHTML = formatSummaryHTML(file.summary);

            // Show edit button
            const editBtn = document.getElementById('edit-summary-btn');
            if (editBtn) editBtn.style.display = 'inline-block';
        } else {
            // Hide edit button if no summary
            const editBtn = document.getElementById('edit-summary-btn');
            if (editBtn) editBtn.style.display = 'none';

            const btn = document.createElement('button');
            btn.id = 'btn-create-summary-modal';
            btn.className = 'glow-btn';
            btn.style.width = '100%';
            btn.style.marginTop = '10px';
            btn.style.background = 'linear-gradient(135deg, #3b82f6, #6366f1)';
            btn.innerHTML = '✨ Create Summary';
            btn.onclick = () => window.requestSummary(file.id);
            summaryEl.appendChild(btn);
        }

        // --- NEW: LIKED QUESTIONS SECTION ---
        const likedBtn = document.getElementById('overview-review-liked-btn');
        const startReviewBtn = document.getElementById('overview-start-review-btn');

        // Ensure footer is flex
        startReviewBtn.parentElement.style.display = 'flex';
        startReviewBtn.parentElement.style.gap = '10px';

        const likedQs = file.questions ? file.questions.filter(q => q.isLiked) : [];

        if (likedQs.length > 0) {
            likedBtn.hidden = false;
            likedBtn.innerHTML = `❤️ Review Liked (${likedQs.length})`;
            likedBtn.onclick = () => {
                // Start quiz with ONLY liked questions
                window.currentFile = file; // ensure context
                window.startQuiz(likedQs);
                // Close modal
                document.getElementById('summary-modal').hidden = true;
            };
        } else {
            likedBtn.hidden = true;
        }

        // Standard Review Button
        startReviewBtn.onclick = () => {
            window.currentFile = file;
            window.startQuiz(file.questions);
            document.getElementById('summary-modal').hidden = true;
        };

        if (modal) modal.hidden = false;

    } catch (e) {
        console.error('Open Overview Error:', e);
        alert('Failed to open overview: ' + e.message);
    }
};

// 4. Request Summary Generation
window.requestSummary = async (fileId) => {
    const btn = document.getElementById('btn-create-summary-modal');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const res = await fetch(apiUrl('/api/summary/' + fileId), { method: 'POST' });
        if (!res.ok) throw new Error('Summary generation failed');

        await window.loadLibraryData();
        window.openOverview(fileId);

    } catch (err) {
        console.error('Request Summary Error:', err);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '✨ Create Summary';
            }, 2000);
        }
    }
};
