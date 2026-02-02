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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                loginNickname.hidden = false;
                loginBtn.style.display = 'none';
                registerBtn.style.display = 'block';
                authToggleLink.textContent = "Already have an account? Log In";
            } else {
                authTitle.textContent = "Welcome Back";
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

            // Reload buffer for the new user immediately
            window.endlessBuffer = [];
            await loadBufferFromLocal();

            checkAuth();
            alert(data.message || "Logged in successfully!");
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
            const nickname = loginNickname.value.trim();
            if (!userId || !password || !nickname) return alert("Please fill all fields.");
            await performAuth('/api/auth/register', { userId, password, nickname });
        });
    }


    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Log out?')) {
                localStorage.removeItem('study_user');
                localStorage.removeItem('user_name'); // Clear sync
                location.reload();
            }
        });
    }

    checkAuth();

    // Intercept Fetch to add Header
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        options = options || {};
        options.headers = options.headers || {};
        if (currentUser) {
            options.headers['x-user-id'] = encodeURIComponent(currentUser);
        }

        // Add Interests Header
        const interests = localStorage.getItem('user_interests');
        if (interests) {
            options.headers['x-user-interests'] = encodeURIComponent(interests);
        }

        return originalFetch(url, options);
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
        creative: document.getElementById('tab-creative')
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
        currentView = 'liked'; // Set view state
        libraryGrid.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'liked-view-header';
        header.innerHTML = `
            <button onclick="window.renderLibrary()" style="background:none;border:none;font-size:1.5em;cursor:pointer;">⬅️</button>
            <h2 style="display:inline-block; margin-left:10px;">Liked Questions ❤️</h2>
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
                if (typeFilter === 'pdf') return item.file.type !== 'youtube';
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
            libraryGrid.innerHTML += `<div class="empty-state"><p>No liked questions match filters.</p></div>`;
            // Ensure we check return only if truly empty, but here we just continue to show nothing
        }

        likedQuestions.forEach(item => {
            const { q, file, idx } = item;

            // Render simple card
            const card = document.createElement('div');
            card.className = 'bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-pink-500 transition-colors flex flex-col cursor-pointer h-full relative group';

            card.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') return;
                window.showExpandedQuestion(q, file.filename, file.id, idx);
            };

            let categoryText = 'General';
            if (file.categories && file.categories.length > 0) {
                categoryText = file.categories[0];
            } else if (file.subjectEmoji) {
                categoryText = 'Topic';
            }

            card.innerHTML = `
                 <div class="flex justify-between items-start mb-4">
                     <div class="flex-1 min-w-0">
                         <div class="flex items-center gap-2 mb-2">
                             <span class="text-[10px] font-bold text-blue-300 bg-blue-900/50 px-2 py-1 rounded border border-blue-700/50 uppercase tracking-widest">
                                 ${categoryText}
                             </span>
                         </div>
                         <span class="text-sm font-bold text-white uppercase tracking-wider block truncate pr-2">
                             ${file.subjectEmoji || '📄'} ${file.filename}
                         </span>
                     </div>
                     <button class="text-2xl hover:scale-125 transition-transform active:scale-95 z-20" onclick="event.stopPropagation(); this.parentElement.parentElement.remove(); window._toggleLikeExternal('${file.id}', ${idx})">❤️</button>
                 </div>
                 <div class="flex-1">
                     <p class="font-bold text-base mb-4 line-clamp-4 text-gray-200 leading-relaxed">${q.question}</p>
                     <div class="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                         <p class="text-xs text-gray-500 font-mono">Click to view answer</p>
                     </div>
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
        // Create Modal Elements
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const modal = document.createElement('div');
        modal.className = 'bg-gray-900 rounded-2xl p-6 border border-gray-700 shadow-2xl max-w-2xl w-full mx-4 relative';
        modal.innerHTML = `
            <button onclick="this.parentElement.parentElement.remove()" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">✕</button>
            
            <div class="mb-4">
                <span class="text-xs font-bold text-pink-500 uppercase tracking-widest">Liked Question</span>
                <h3 class="text-gray-400 text-sm mt-1">From: ${filename}</h3>
            </div>

            <div class="mb-6 relative">
                <p class="text-xl font-bold text-white leading-relaxed">${q.question}</p>
                <button class="absolute text-2xl hover:scale-110 transition-transform" 
                     style="top: -100px; right: -100px;"
                     title="Toggle Like"
                     onclick="this.innerText = this.innerText === '❤️' ? '🤍' : '❤️'; window._toggleLikeExternal('${fileId}', ${idx})">
                     ${q.isLiked ? '❤️' : '🤍'}
                </button>
            </div>

            <div class="space-y-3 mb-6">
                ${q.options.map((opt, i) => `
                    <div class="p-3 rounded-lg border ${i === q.correctAnswer ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800/50'}">
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs ${i === q.correctAnswer ? 'bg-green-500 text-black font-bold' : 'bg-gray-700 text-gray-300'}">${['A', 'B', 'C', 'D'][i] || (i + 1)}</span>
                            <span class="${i === q.correctAnswer ? 'text-green-300' : 'text-gray-300'}">${opt}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Explanation</h4>
                <p class="text-sm text-gray-300 italic leading-relaxed">${q.explanation}</p>
            </div>
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
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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
    async function saveProgressAndExit() {
        if (currentView === 'quiz' && currentQuestions.length > 0) {
            const answers = Object.entries(userAnswers);
            const solvedCount = answers.length;

            if (solvedCount > 0) {
                let correct = 0;
                let wrong = 0;

                answers.forEach(([index, ansIdx]) => {
                    const qIdx = parseInt(index);
                    if (currentQuestions[qIdx] && currentQuestions[qIdx].correctAnswer === ansIdx) {
                        correct++;
                    } else {
                        wrong++;
                    }
                });

                console.log(`Auto-saving: ${correct} correct, ${wrong} wrong`);

                // Get metadata safely
                let subject = '📚';
                let materialName = 'Quick Quiz';

                if (currentFile) {
                    if (currentFile.subjectEmoji) subject = currentFile.subjectEmoji;
                    if (currentFile.filename) materialName = currentFile.filename;
                    else if (currentFile.name) materialName = currentFile.name; // file object has name property
                }

                // Track with expanded data
                try {
                    await fetch(apiUrl('/api/track/solve'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            count: solvedCount,
                            correct,
                            wrong,
                            materialName,
                            subject
                        })
                    });
                } catch (e) { console.error(e); }
            }
        }
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
        exitReelsBtn.addEventListener('click', () => switchView('library'));
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
        generateCreativeBtn.addEventListener('click', async () => {
            const title = creativeTitleInput.value.trim();
            const author = creativeAuthorInput.value.trim();
            const type = creativeTypeSelect.value;

            if (!title) {
                alert("Please enter a title.");
                return;
            }

            const loader = generateCreativeBtn.querySelector('.loader');
            const btnText = generateCreativeBtn.querySelector('.btn-text');

            generateCreativeBtn.disabled = true;
            btnText.hidden = true;
            loader.hidden = false;
            loader.style.display = 'block';

            try {
                // Call API
                const response = await fetch(apiUrl('/api/creative'), {
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

                // Start Quiz directly
                window.startQuiz(data.questions);

                // Auto-Clear Form
                creativeTitleInput.value = '';
                creativeAuthorInput.value = '';

            } catch (error) {
                console.error(error);
                alert("Failed to generate: " + error.message);
            } finally {
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
            Object.values(tabContents).forEach(c => c.style.display = 'none');

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

        const success = await handleGeneration('/api/upload', (formData) => {
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

    // Enable button when input has text
    youtubeInput.addEventListener('input', () => {
        const val = youtubeInput.value.trim();
        // Basic loose validation to ensure it looks like a youtube link
        const isValid = val.length > 0 && (val.includes('youtube.com') || val.includes('youtu.be'));
        generateYtBtn.disabled = !isValid;
    });

    generateYtBtn.addEventListener('click', async () => {
        const url = youtubeInput.value.trim();
        if (!url) {
            alert('Please enter a YouTube URL');
            return;
        }

        const success = await handleGeneration('/api/youtube', null, generateYtBtn, { url });

        if (success) {
            // Auto-Clear URL
            youtubeInput.value = '';
            generateYtBtn.disabled = true;
        }
    });

    // --- Shared Generation Logic ---

    async function handleGeneration(endpoint, formDataCallback, btnElement, jsonBody = null) {
        const btnText = btnElement.querySelector('.btn-text');
        const loader = btnElement.querySelector('.loader');
        btnText.style.display = 'none';
        loader.hidden = false;
        btnElement.disabled = true;

        try {
            let options = { method: 'POST' };

            // INJECT USER ID HEADER
            const headers = {
                'x-user-id': localStorage.getItem('user_name') || 'guest'
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
            currentFile = data;
            window.currentFile = data; // Sync global state for renderQuestion

            if (data.isMock) {
                alert('⚠️ No API Key Provided\n\nGenerated questions using generic MOCK DATA. To get real questions.');
            }

            startQuiz(data.questions);
            return true; // Success

        } catch (error) {
            alert('Error: ' + error.message);
            return false; // Failure
        } finally {
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
            wrapper.style.display = 'none'; // USER REQUEST: Hide image completely
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

            // 3. Async Fetch (DISABLED BY USER REQUEST)
            /*
            try {
                const genRes = await fetch(apiUrl('/api/generate-image'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
                    },
                    body: JSON.stringify({
                        question: promptQuestion,
                        apiKey: activeApiKey,
                        context: ""
                    })
                });
    
                if (!genRes.ok) throw new Error("Image gen failed");
    
                const genData = await genRes.json();
                if (genData.imageUrl) {
                    image.src = genData.imageUrl;
                    console.log("[Standard Quiz] Loaded Image:", genData.imageUrl);
                } else {
                    throw new Error("No URL in response");
                }
            } catch (e) {
                console.error("Standard Image Gen Failed:", e);
                image.style.opacity = '0.5';
            }
            */
        };

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
                        ✨ Expert Insight
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
                    <div style="font-size: 1.2em; font-weight: 600; font-family: var(--font-hand, 'Patrick Hand'); color: var(--primary, #6B8C42);">Click to Reveal</div>
                `;

                flashcard.onclick = () => {
                    handleAnswer('revealed'); // Mark as answered

                    // animate transition
                    flashcard.style.transform = 'scale(0.95) rotate(-1deg)';
                    setTimeout(() => {
                        flashcard.style.transform = 'scale(1) rotate(0deg)';
                        renderRevealedContent();

                        // Show confetti (Soft/Pastel colors)
                        if (typeof confetti === 'function') {
                            confetti({
                                particleCount: 60,
                                spread: 70,
                                origin: { y: 0.6 },
                                colors: ['#6B8C42', '#F2A6A6', '#F9DA78'], // Green, Coral, Yellow
                                shapes: ['circle'],
                                scalar: 0.8
                            });
                        }

                        // Track completion (Silent)
                        fetch(apiUrl('/api/track/solve'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                count: 1,
                                correct: 1,
                                wrong: 0,
                                materialName: activeFile ? (activeFile.filename || activeFile.name) : 'Quiz',
                                subject: activeFile ? activeFile.subjectEmoji : '📚'
                            })
                        }).catch(e => console.error('Tracking failed', e));

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
            nextBtn.textContent = 'Finish';

            // --- INJECT MORE QUESTIONS BUTTON ---
            let moreBtn = document.getElementById('more-questions-btn');
            if (!moreBtn) {
                moreBtn = document.createElement('button');
                moreBtn.id = 'more-questions-btn';
                moreBtn.className = 'nav-btn';
                moreBtn.style.backgroundColor = '#6366f1';
                moreBtn.style.marginLeft = '10px';
                moreBtn.textContent = '+ More Questions';
                moreBtn.onclick = handleMoreQuestionsClick;
                nextBtn.parentNode.appendChild(moreBtn);
            }
            moreBtn.hidden = false;
            // ------------------------------------

        } else {
            nextBtn.textContent = 'Next';
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
            moreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
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
                moreBtn.textContent = '+ More Questions';
            }
        }
    }

    function handleAnswer(selectedIndex) {
        if (userAnswers[currentQuestionIndex] !== undefined) return;

        userAnswers[currentQuestionIndex] = selectedIndex;

        // CHECK CORRECTNESS to save progress for filtering "New Question"
        const q = currentQuestions[currentQuestionIndex];
        // Ensure q exists and compare safely
        if (q && (q.correctAnswer === selectedIndex || q.correctAnswer == selectedIndex)) { // Loose equality for safety
            try {
                const solvedRaw = localStorage.getItem('solved_questions');
                const solvedSet = new Set(solvedRaw ? JSON.parse(solvedRaw) : []);
                solvedSet.add(q.question);
                localStorage.setItem('solved_questions', JSON.stringify(Array.from(solvedSet)));
            } catch (e) { console.error("Storage error", e); }
        }

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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
            });
            const data = await response.json();
            window.allFiles = data; // Sync global
            libraryFiles = data;    // Sync local/legacy
            if (window.renderLibrary) window.renderLibrary();
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
            });
            const files = await response.json();

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

            // BACKFILL FIX: Patch missing originIds in pregenerated questions using the map
            // This fixes the "Summary Button Missing" issue for stale buffer items.
            if (pregeneratedQuestions.length > 0) {
                pregeneratedQuestions.forEach(pq => {
                    if (!pq.originId) {
                        const foundId = questionToOriginIdMap.get(pq.question);
                        if (foundId) {
                            pq.originId = foundId;
                            console.log("[Endless] Backfilled missing originId for question:", pq.question.substring(0, 20));
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

            // SMART SHUFFLE: Ensure neighbors are from different materials
            // 1. Group by originId
            const groups = {};
            rawUnique.forEach(q => {
                const id = q.originId || 'unknown';
                if (!groups[id]) groups[id] = [];
                groups[id].push(q);
            });

            // 2. Shuffle each group internally
            Object.values(groups).forEach(g => g.sort(() => Math.random() - 0.5));

            // 3. Interleave
            const uniquePool = [];
            let lastOriginId = null;
            let groupKeys = Object.keys(groups);

            while (groupKeys.length > 0) {
                // Try to pick a different origin than the last one
                let candidates = groupKeys.filter(k => k !== lastOriginId);

                // If only one origin left (or no others), forced to pick it
                if (candidates.length === 0) candidates = groupKeys;

                // HEURISTIC: Sort by remaining size DESCENDING
                // This ensures we burn down the big piles while we have alternative interleaves
                candidates.sort((a, b) => groups[b].length - groups[a].length);

                // Pick the largest group
                const chosenKey = candidates[0];
                const chosenGroup = groups[chosenKey];

                if (chosenGroup && chosenGroup.length > 0) {
                    uniquePool.push(chosenGroup.pop());
                    lastOriginId = chosenKey;

                    // Cleanup empty groups
                    if (chosenGroup.length === 0) {
                        delete groups[chosenKey];
                        groupKeys = Object.keys(groups); // Refresh keys
                    }
                } else {
                    // Should not happen if logic is correct, but safety
                    groupKeys = groupKeys.filter(k => k !== chosenKey);
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
            await startReels(uniquePool);

        } catch (error) {
            console.error('ENDLESS ERROR:', error);
            alert('Error: ' + error.message);
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
                alert('Material name is required');
                return;
            }

            try {
                const response = await fetch(apiUrl('/api/materials/create'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
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


    // --- Create Question Logic ---
    const createQuestionBtn = document.getElementById('create-question-btn');
    const questionModal = document.getElementById('question-modal');
    const closeQuestionModalBtn = document.getElementById('close-modal-btn');
    const saveQuestionBtn = document.getElementById('save-question-btn');
    const modalFileSelect = document.getElementById('modal-file-select');
    const modalQuestion = document.getElementById('modal-question');
    const modalExplanation = document.getElementById('modal-explanation');

    if (createQuestionBtn) {
        createQuestionBtn.addEventListener('click', () => {
            // Populate file select
            modalFileSelect.innerHTML = '<option value="" disabled selected>Select a file...</option>';
            if (window.allFiles) {
                window.allFiles.forEach(file => {
                    const opt = document.createElement('option');
                    opt.value = file.id;
                    opt.textContent = file.filename;
                    modalFileSelect.appendChild(opt);
                });
            }
            questionModal.hidden = false;
        });
    }

    if (closeQuestionModalBtn) {
        closeQuestionModalBtn.addEventListener('click', () => {
            questionModal.hidden = true;
        });
    }

    if (saveQuestionBtn) {
        saveQuestionBtn.addEventListener('click', async () => {
            const fileId = modalFileSelect.value;
            const questionText = modalQuestion.value.trim();
            const explanation = modalExplanation.value.trim();

            // Get options
            const optInputs = document.querySelectorAll('.modal-opt');
            const options = Array.from(optInputs).map(input => input.value.trim()); // Filter empty? code expects 4

            // Validate options
            if (options.some(o => !o)) {
                alert('Please fill in all options');
                return;
            }

            // Get correct answer
            const correctRadio = document.querySelector('input[name="correct-opt"]:checked');
            if (!correctRadio) {
                alert('Select the correct answer');
                return;
            }
            const correctAnswer = parseInt(correctRadio.value);

            if (!fileId) {
                alert('Please select a material file');
                return;
            }

            if (!questionText) {
                alert('Question text is required');
                return;
            }

            const newQuestion = {
                question: questionText,
                options: options,
                correctAnswer: correctAnswer,
                explanation: explanation || 'No explanation provided.'
            };

            try {
                const response = await fetch(apiUrl('/api/questions/add'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
                    },
                    body: JSON.stringify({ fileId, question: newQuestion })
                });

                if (!response.ok) throw new Error('Failed to add question');

                questionModal.hidden = true;
                // Clear inputs
                modalQuestion.value = '';
                modalExplanation.value = '';
                optInputs.forEach(input => input.value = '');
                modalFileSelect.value = '';

                await loadLibrary(); // Refresh
                alert('Question added successfully!');

            } catch (err) {
                alert('Error: ' + err.message);
            }
        });
    }


    // Helper: Generate more questions for endless mode
    async function generateMoreForEndless(existingQuestions) {
        try {
            const response = await fetch(apiUrl('/api/library'), {
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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

                // Re-validate and Re-Preload images
                const restorePromises = validItems.map(async (item) => {
                    if (item.imageUrl) {
                        try {
                            const img = new Image();
                            img.src = item.imageUrl;
                            // We don't await onload here to be faster, but we trigger the request
                        } catch (e) { }
                    }
                    return item;
                });

                const restored = await Promise.all(restorePromises);

                // Reset buffer to restored state (wipe any guest data)
                window.endlessBuffer = restored;
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
                        headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                            'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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

        // Shuffle the non-pregenerated questions BUT prioritize Unsolved
        let mainPool = allCurrentQuestions.filter(q => !q._isPregenerated);

        mainPool.sort((a, b) => {
            const aSolved = isQuestionSolved(a.question) ? 1 : 0;
            const bSolved = isQuestionSolved(b.question) ? 1 : 0;

            // Unsolved (0) before Solved (1)
            if (aSolved !== bSolved) return aSolved - bSolved;

            // Otherwise random shuffle
            return Math.random() - 0.5;
        });

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
        const BATCH_SIZE = 10; // Render in batches
        let isGeneratingMore = false;

        // Blocking Translation REMOVED.
        // We will translate on demand in renderQuestionBatch
        const currentLang = localStorage.getItem('user_lang') || 'en';

        reelsContainer.innerHTML = '';
        reelsContainer.scrollTop = 0; // Ensure we start at the top

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
            imgWrapper.style.display = 'none'; // USER REQUEST: Hide image completely
            imgWrapper.style.width = '100%';
            imgWrapper.style.marginBottom = '20px'; // Move margin from image to wrapper

            const image = document.createElement('img');
            image.className = 'reel-image';
            image.alt = "Topic visualization";
            // image.style.marginBottom = '20px'; // Moved to wrapper
            image.style.width = '100%';
            image.style.borderRadius = '12px';
            image.style.objectFit = 'cover';
            image.style.aspectRatio = '3/4';
            image.style.display = 'block'; // Remove bottom space


            let existingUrl = q.forcedImageUrl;

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

            // Add Buttons to Wrapper
            // Note: activeFile might be undefined in Endless/Reels mode depending on scope.
            // But usually q.originId is sufficient.
            const fileIdForLike = q.originId || (window.activeFile ? window.activeFile.id : null);

            if (fileIdForLike) {
                // Like Button
                const likeBtn = document.createElement('button');
                likeBtn.className = 'like-btn';
                likeBtn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:20;font-size:1.5rem;background:none;border:none;cursor:pointer;filter:drop-shadow(0 0 2px rgba(0,0,0,0.5));';
                likeBtn.innerHTML = q.isLiked ? '❤️' : '🤍';
                likeBtn.onclick = (e) => {
                    e.stopPropagation();
                    // If originalIndex is missing (fresh gen), use passed index
                    const idx = (q.originalIndex !== undefined) ? q.originalIndex : originalIndex;
                    toggleLike(q, likeBtn, fileIdForLike, idx);
                };
                imgWrapper.appendChild(likeBtn);

                // Summary Button
                const summaryBtn = document.createElement('button');
                summaryBtn.className = 'summary-info-btn';
                summaryBtn.innerHTML = '📄';
                summaryBtn.title = "View Study Material";
                summaryBtn.style.cssText = 'position:absolute;top:50px;right:10px;z-index:20;background:none;border:none;cursor:pointer;font-size:24px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));';

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

                // Icon: YouTube Logo (Red Play) or News Paper
                srcBtn.innerHTML = isYouTube
                    ? '<span style="color: #FF0000; font-size: 28px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">▶️</span>'
                    : '📰';

                srcBtn.title = isYouTube ? "Watch on YouTube" : "Read Article";
                srcBtn.style.cssText = 'position:absolute;top:90px;right:10px;z-index:20;background:none;border:none;cursor:pointer;font-size:24px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));';

                srcBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.open(sourceUrl, '_blank');
                };
                imgWrapper.appendChild(srcBtn);
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
                            ✨ Expert Insight
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
                    <div style="font-size: 1.2em; font-weight: 600; font-family: var(--font-hand, 'Patrick Hand'); color: var(--primary, #6B8C42);">Click to Reveal</div>
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

                        markQuestionasSolved(q.question);
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

                        // 3. Spawn Next Question (Inlined Logic)
                        console.log('Flashcard Revealed! Spawning ONE similar question...');
                        const loadingToast = document.createElement('div');
                        loadingToast.className = 'spawn-toast';
                        loadingToast.textContent = '🔄 Generating Bonus Question...';
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
                                'x-user-id': localStorage.getItem('user_name') || 'guest'
                            },
                            body: JSON.stringify(spawnPayload)
                        }).then(r => r.json())
                            .then(data => {
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
                                    const currentQIdx = allCurrentQuestions.indexOf(q);
                                    const insertIdx = (currentQIdx !== -1) ? currentQIdx + 1 : allCurrentQuestions.length;

                                    allCurrentQuestions.splice(insertIdx, 0, ...singleQ);
                                    const newCard = createReelCard(singleQ[0], insertIdx);
                                    if (newCard) {
                                        if (card.nextSibling) reelsContainer.insertBefore(newCard, card.nextSibling);
                                        else reelsContainer.appendChild(newCard);

                                        const toast = document.createElement('div');
                                        toast.className = 'spawn-toast';
                                        toast.textContent = '✨ New Question Spawned!';
                                        document.body.appendChild(toast);
                                        setTimeout(() => toast.remove(), 2500);

                                        if (totalNum) totalNum.textContent = allCurrentQuestions.length;
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
                q.options.forEach((opt, optIdx) => {
                    const btn = document.createElement('div');
                    btn.className = 'option';
                    btn.textContent = opt;
                    btn.onclick = () => {
                        if (isAnswered) return;
                        isAnswered = true;
                        const isCorrect = optIdx === q.correctAnswer;

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

                            // --- ENDLESS MODE SPAWNER (Single Follow-up) ---
                            console.log('Correct Answer! Spawning ONE similar question...');
                            const loadingToast = document.createElement('div');
                            loadingToast.className = 'spawn-toast';
                            loadingToast.textContent = '🔄 Generating Bonus Question...';
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
                                    'x-user-id': localStorage.getItem('user_name') || 'guest'
                                },
                                body: JSON.stringify(spawnPayload)
                            }).then(r => r.json())
                                .then(data => {
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
                                            toast.textContent = '✨ New Question Added to Queue!';
                                            document.body.appendChild(toast);
                                            setTimeout(() => toast.remove(), 2500);

                                            if (totalNum) totalNum.textContent = allCurrentQuestions.length;
                                        }
                                    } else if (data.error) {
                                        console.warn('[Spawn] Error:', data.error);
                                    }
                                })
                                .catch(err => {
                                    if (loadingToast) loadingToast.remove();
                                    console.error('[Spawn] Fetch failed:', err);
                                });

                        } else {
                            content.classList.add('shake-effect');
                            setTimeout(() => content.classList.remove('shake-effect'), 500);
                            if (navigator.vibrate) navigator.vibrate(200);
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

            content.appendChild(imgWrapper);
            content.appendChild(title);
            content.appendChild(optionsDiv);
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
            headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
        const typeSelect = document.getElementById('type-select');
        const categorySelect = document.getElementById('category-select');

        const sortBy = sortSelect ? sortSelect.value : 'date-desc';
        const filterType = typeSelect ? typeSelect.value : 'all';
        const filterCategory = categorySelect ? categorySelect.value : 'all';

        if (filterType !== 'all') {
            files = files.filter(f => f.type === filterType);
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
            container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No matching materials found.</div>';
            return;
        }

        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'glass-card p-5 hover-scale relative';
            card.style.cursor = 'pointer';
            card.onclick = () => { if (window.openOverview) window.openOverview(file.id); };

            const icon = file.subjectEmoji || (file.type === 'youtube' ? '📺' : '📄');

            // Fix Date Fallback
            let dateStr = 'Unknown Date';
            // Robust Date Parsing
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
                catTags = '<div class="w-full flex justify-center items-center flex-nowrap gap-1.5 mt- 0 mb-1 px-8">';
                file.categories.forEach(cat => {
                    const bg = categoryColors[cat] || defaultColor;
                    catTags += `<span class="px-2 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap" style="background: ${bg};">${cat}</span>`;
                });
                catTags += '</div>';
            }

            // RESTORED CARD HTML (Simplified Single Card)
            card.innerHTML = `
                <!-- Categories -->
                ${catTags}

                <!-- Trash Bin -->
                <button class="delete-btn-abs" onclick="event.stopPropagation(); window.deleteFile('${file.id}')" title="Delete">🗑️</button>

                <!-- Icon -->
                <div class="flex items-center justify-center mb-2 mt-3 text-4xl">
                    ${icon}
                </div>
            
                <h3 class="font-bold text-base mb-1 truncate pr-6" title="${file.filename}">${file.filename}</h3>
                <p class="text-xs text-gray-400 mb-3">${file.type === 'youtube' ? 'Video' : 'Text'} • ${dateStr}</p>
                
                <!-- Divider -->
                <div class="h-px bg-gray-700/30 w-full mb-3"></div>

                <!-- Buttons (Concise) -->
                <div class="flex gap-2 card-actions">
                    <button id="btn-review-${file.id}" onclick="event.stopPropagation(); window.startReview('${file.id}')" 
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-xs font-bold text-white transition-all">
                        Review
                    </button>
                    <button id="btn-more-${file.id}" onclick="event.stopPropagation(); window.generateMore('${file.id}')" 
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-xs font-medium text-gray-200 border border-gray-600/50 transition-all">
                        New Qs
                    </button>
                    <button id="btn-summary-${file.id}" onclick="event.stopPropagation(); window.openOverview('${file.id}')" 
                        class="action-btn flex-1 px-2.5 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-xs font-medium text-gray-200 border border-gray-600/50 transition-all">
                        Summary
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
            if (file.youtubeUrl) {
                sourceLink.href = file.youtubeUrl;
                sourceText.textContent = file.youtubeUrl;
                sourceLink.style.display = 'flex';
            } else {
                sourceLink.style.display = 'none';
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
            });

            if (!res.ok) {
                if (res.status === 404) {
                    summaryContent.innerHTML = '<p style="text-align:center; color:#64748b;">No summary available yet.</p>';
                } else {
                    throw new Error('Failed to load summary');
                }
            } else {
                const data = await res.json();
                summaryContent.dataset.rawSummary = data.summary;

                // Format text
                let formatted = data.summary
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--primary-dark);">$1</strong>')
                    .replace(/\n/g, '<br>')
                    .replace(/^- (.*)/gm, '• $1');

                summaryContent.innerHTML = formatted;
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
            if (streakDescEl) streakDescEl.textContent = streak === 1 ? '1 day' : `${streak} days`;

            // Chart
            const chartContainer = document.getElementById('activity-chart');
            if (chartContainer) {
                chartContainer.innerHTML = '';
                const days = Object.keys(data.dailyStats).sort();

                days.forEach(day => {
                    const stat = data.dailyStats[day];
                    const height = Math.min(stat.solved * 5 + 5, 100);
                    const bar = document.createElement('div');
                    bar.style.width = '12%';
                    bar.style.height = height + '%';
                    bar.style.background = stat.solved > 0 ? '#6366f1' : 'rgba(255,255,255,0.1)';
                    bar.style.borderRadius = '4px 4px 0 0';
                    bar.style.position = 'relative';
                    bar.title = `${day}: ${stat.solved} solved`;

                    if (stat.solved > 0) {
                        const countLabel = document.createElement('div');
                        countLabel.textContent = `${stat.solved}Qs`; // simplified
                        countLabel.style.position = 'absolute';
                        countLabel.style.top = '-20px';
                        countLabel.style.width = '100%';
                        countLabel.style.textAlign = 'center';
                        countLabel.style.fontSize = '10px';
                        countLabel.style.color = '#a5b4fc';
                        bar.appendChild(countLabel);
                    }

                    const label = document.createElement('div');
                    label.textContent = day.slice(5);
                    label.style.position = 'absolute';
                    label.style.bottom = '-20px';
                    label.style.fontSize = '10px';
                    label.style.width = '100%';
                    label.style.textAlign = 'center';
                    label.style.color = '#888';

                    bar.appendChild(label);
                    chartContainer.appendChild(bar);
                });
            }

            // Subjects
            const subList = document.getElementById('subject-list');
            if (subList && data.topSubjects) {
                subList.innerHTML = '';
                data.topSubjects.slice(0, 5).forEach(sub => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.padding = '8px 0';
                    row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    row.innerHTML = `<span style='white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;'>${sub.emoji} ${sub.name}</span> <span style='color: #94a3b8; font-size: 0.85rem; font-family: inherit;'>${sub.count}Qs/${sub.timeSaved}m</span>`;
                    subList.appendChild(row);
                });
            }

        } catch (e) {
            console.error(e);
        }
    };


    // Add Notification Controls (New Feature)
    // Reminder button removed as per user request

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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                    headers: { 'Content-Type': 'application/json', 'x-user-id': localStorage.getItem('user_name') || 'guest' },
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

    const startYouTubeQuizBtn = document.getElementById('start-youtube-quiz-btn');

    if (startYouTubeQuizBtn) {
        startYouTubeQuizBtn.addEventListener('click', async () => {
            const originalText = startYouTubeQuizBtn.innerText;
            startYouTubeQuizBtn.innerText = '⏳ Generating...';
            startYouTubeQuizBtn.disabled = true;

            try {
                // Call API
                const res = await fetch(apiUrl('/api/youtube/generate'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: localStorage.getItem('gemini_api_key') })
                });

                if (!res.ok) throw new Error('Generation failed');
                const data = await res.json();

                if (data.questions && data.questions.length > 0) {
                    activeFile = data; // Set global activeFile for Like button context
                    startReels(data.questions, true);
                } else {
                    alert('Could not find enough relevant videos. Try updating your interests!');
                }

            } catch (e) {
                console.error("YouTube Quiz Error:", e);
                alert("Failed to generate YouTube Quiz. Please try again.");
            } finally {
                startYouTubeQuizBtn.innerText = originalText;
                startYouTubeQuizBtn.disabled = false;
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
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                    'x-user-id': localStorage.getItem('user_name') || 'guest'
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
                headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
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
                                'x-user-id': localStorage.getItem('user_name') || 'guest'
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
        nav_upload: "Upload",
        nav_library: "Library",
        nav_profile: "Profile",
        hero_title_html: 'Turn Study Material into <br><span class="gradient-text">Mastery Quizzes</span>',
        hero_desc: "Generate high-quality practice questions from your lecture notes or videos.",
        tab_file: "📄 File Upload",
        tab_youtube: "YouTube Video",
        drop_title: "Drag & Drop your file here",
        drop_desc: "or click to browse (.pdf, .doc, .docx)",
        btn_generate: "Generate Quiz",
        yt_title: "Paste YouTube Video Link",
        api_hint: "Leave blank to use server default",
        // Quiz
        back_library: "Back to Library",
        explanation: "Explanation",
        btn_previous: "Previous",
        btn_next: "Next",
        btn_finish: "Finish Review",

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

        // Library
        lib_review: "Review",
        lib_start: "Start Quiz",
        lib_summary: "Summary",
        lib_delete: "Delete",
        lib_questions: "Questions",
        lib_min_saved: "min saved",
        lib_create_more: "New Qs",
        lib_generating: "⏳ ..."
    },
    zh: {
        nav_upload: "上传",
        nav_library: "库",
        nav_profile: "个人资料",
        hero_title_html: '将学习资料转化为<br><span class="gradient-text">精通测验</span>',
        hero_desc: "从讲义或视频生成高质量的练习题。",
        tab_file: "📄 上传文件",
        tab_youtube: "YouTube 视频",
        drop_title: "将文件拖放到此处",
        drop_desc: "或点击浏览 (.pdf, .doc, .docx)",
        btn_generate: "生成测验",
        yt_title: "粘贴 YouTube 视频链接",
        yt_desc: "自动提取字幕（CC 或自动生成）",
        api_hint: "留空以使用服务器默认值",
        back_library: "返回库",
        explanation: "解释",
        btn_previous: "上一个",
        btn_next: "下一个",
        btn_finish: "完成复习",
        library_title_html: '您的<span class="gradient-text">学习库</span>',
        library_desc: "查看过去上传的笔记并重新进行测验。",
        endless_review: "无限复习",
        create_question: "创建问题",
        create_material: "创建材料",
        sort_by: "排序方式：",
        filter_type: "类型：",
        date_newest: "日期（最新）",
        date_oldest: "日期（最旧）",
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
        lib_generating: "⏳ ..."
    },
    ko: {
        nav_upload: "업로드",
        nav_library: "라이브러리",
        nav_profile: "프로필",
        hero_title_html: '학습 자료를 <br><span class="gradient-text">마스터 퀴즈</span>로 변환',
        hero_desc: "강의 노트나 동영상에서 고품질 연습 문제를 생성하세요.",
        tab_file: "📄 파일 업로드",
        tab_youtube: "YouTube 동영상",
        drop_title: "파일을 여기로 드래그하세요",
        drop_desc: "또는 클릭하여 찾아보기 (.pdf, .doc, .docx)",
        btn_generate: "퀴즈 생성",
        yt_title: "YouTube 동영상 링크 붙여넣기",
        yt_desc: "자막 자동 추출 (CC 또는 자동 생성)",
        api_hint: "서버 기본값을 사용하려면 비워 두세요",
        back_library: "라이브러리로 돌아가기",
        explanation: "설명",
        btn_previous: "이전",
        btn_next: "다음",
        btn_finish: "복습 완료",
        library_title_html: '당신의 <span class="gradient-text">학습 라이브러리</span>',
        library_desc: "과거 업로드한 노트를 검토하고 퀴즈를 다시 풀어보세요.",
        endless_review: "무한 복습",
        create_question: "문제 생성",
        create_material: "자료 생성",
        sort_by: "정렬 기준:",
        filter_type: "유형:",
        date_newest: "날짜 (최신순)",
        date_oldest: "날짜 (오래된순)",
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
        chart_title: "最近7日 (問題/時間)",
        subject_mastery: "과목 숙련도",

        lib_review: "퀴즈 복습",
        lib_start: "퀴즈 시작",
        lib_summary: "요약",
        lib_delete: "삭제",
        lib_questions: "문제",
        lib_min_saved: "분 절약",
        lib_create_more: "새 문제 생성",
        lib_generating: "⏳ ..."
    },
    ja: {
        nav_upload: "アップロード",
        nav_library: "ライブラリ",
        nav_profile: "プロフィール",
        hero_title_html: '教材を<br><span class="gradient-text">習得クイズ</span>に変える',
        hero_desc: "講義ノートや動画から高品質な練習問題を作成します。",
        tab_file: "📄 ファイル",
        tab_youtube: "YouTube",
        drop_title: "ここにファイルをドラッグ",
        drop_desc: "またはクリックして選択 (.pdf, .doc, .docx)",
        btn_generate: "クイズ作成",
        yt_title: "YouTubeリンクを貼り付け",
        yt_desc: "字幕を自動抽出 (CCまたは自動生成)",
        api_hint: "デフォルトを使用する場合は空白のままにしてください",
        back_library: "ライブラリに戻る",
        explanation: "説明",
        btn_previous: "前へ",
        btn_next: "次へ",
        btn_finish: "復習を完了",
        library_title_html: 'あなたの<span class="gradient-text">学習ライブラリ</span>',
        library_desc: "過去にアップロードしたノートを見直し、クイズを再受験します。",
        endless_review: "無限復習",
        create_question: "問題を作成",
        create_material: "教材を作成",
        sort_by: "並び替え：",
        filter_type: "種類：",
        date_newest: "日付（新しい順）",
        date_oldest: "日付（古い順）",
        all_materials: "すべての教材",
        type_video: "動画",
        type_doc: "文書",
        no_files_found: "一致するファイルが見つかりません。",
        loading_library: "読み込み中...",
        library_empty: "ライブラリは空です。ファイルをアップロードして開始してください！",
        alert_library_empty: "ライブラリが空です！まずコンテンツをアップロードしてください。",
        alert_no_questions: "ライブラリに問題が見つかりません。",
        translating_questions: "質問を翻訳中...",

        profile_title_html: 'あなたの<span class="gradient-text">学習の旅</span>',
        profile_desc: "進捗状況と統計を追跡します。",
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
        lib_generating: "⏳ ..."
    },
    fr: {
        nav_upload: "Télécharger",
        nav_library: "Bibliothèque",
        nav_profile: "Profil",
        hero_title_html: 'Transformez vos notes en <br><span class="gradient-text">Quiz de Maîtrise</span>',
        hero_desc: "Générez des questions de haute qualité à partir de vos cours.",
        tab_file: "📄 Fichier",
        tab_youtube: "YouTube",
        drop_title: "Déposez votre fichier ici",
        drop_desc: "ou cliquez pour parcourir",
        btn_generate: "Générer",
        yt_title: "Coller le lien YouTube",
        yt_desc: "Extraction automatique des sous-titres",
        api_hint: "Laisser vide pour la valeur par défaut",
        back_library: "Retour à la bibliothèque",
        explanation: "Explication",
        btn_previous: "Précédent",
        btn_next: "Suivant",
        btn_finish: "Terminer",
        library_title_html: 'Votre <span class="gradient-text">Bibliothèque</span>',
        library_desc: "Révisez vos notes et refaites les quiz.",
        endless_review: "Mode infini",
        create_question: "Créer une question",
        create_material: "Créer du matériel",
        sort_by: "Trier par :",
        filter_type: "Type :",
        date_newest: "Date (Plus récent)",
        date_oldest: "Date (Plus ancien)",
        all_materials: "Tous",
        type_video: "Vidéo",
        type_doc: "Document",
        no_files_found: "Aucun fichier trouvé.",
        loading_library: "Chargement...",
        library_empty: "La bibliothèque est vide. Téléchargez un fichier pour commencer!",
        alert_library_empty: "La bibliothèque est vide! Téléchargez du contenu d'abord.",
        alert_no_questions: "Aucune question trouvée dans la bibliothèque.",
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
        lib_generating: "⏳ ..."
    },
    de: {
        nav_upload: "Hochladen",
        nav_library: "Bibliothek",
        nav_profile: "Profil",
        hero_title_html: 'Verwandeln Sie Material in <br><span class="gradient-text">Meisterschaftsquiz</span>',
        hero_desc: "Erstellen Sie hochwertige Übungsfragen aus Ihren Notizen.",
        tab_file: "📄 Datei",
        tab_youtube: "YouTube",
        drop_title: "Datei hier ablegen",
        drop_desc: "oder klicken zum Durchsuchen",
        btn_generate: "Quiz erstellen",
        yt_title: "YouTube-Link einfügen",
        yt_desc: "Automatische Untertitel-Extraktion",
        api_hint: "Leer lassen für Standard",
        back_library: "Zurück zur Bibliothek",
        explanation: "Erklärung",
        btn_previous: "Zurück",
        btn_next: "Weiter",
        btn_finish: "Fertig",
        library_title_html: 'Ihre <span class="gradient-text">Bibliothek</span>',
        library_desc: "Überprüfen Sie Ihre Notizen und wiederholen Sie Quiz.",
        endless_review: "Endlosmodus",
        create_question: "Frage erstellen",
        create_material: "Material erstellen",
        sort_by: "Sortieren:",
        filter_type: "Typ:",
        date_newest: "Datum (Neueste)",
        date_oldest: "Datum (Älteste)",
        all_materials: "Alle",
        type_video: "Video",
        type_doc: "Dokument",
        no_files_found: "Keine Dateien gefunden.",
        loading_library: "Laden...",
        library_empty: "Bibliothek ist leer. Laden Sie eine Datei hoch!",
        alert_library_empty: "Bibliothek ist leer! Laden Sie zuerst Inhalte hoch.",
        alert_no_questions: "Keine Fragen in der Bibliothek gefunden.",
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
        lib_generating: "⏳ ..."
    },
    es: {
        nav_upload: "Subir",
        nav_library: "Biblioteca",
        nav_profile: "Perfil",
        hero_title_html: 'Convierte notas en <br><span class="gradient-text">Cuestionarios</span>',
        hero_desc: "Genera preguntas de práctica de alta calidad.",
        tab_file: "📄 Archivo",
        tab_youtube: "YouTube",
        drop_title: "Arrastra tu archivo aquí",
        drop_desc: "o haz clic para buscar",
        btn_generate: "Generar Quiz",
        yt_title: "Pegar enlace de YouTube",
        yt_desc: "Extracción automática de subtítulos",
        api_hint: "Dejar en blanco para valor predeterminado",
        back_library: "Volver a la biblioteca",
        explanation: "Explicación",
        btn_previous: "Anterior",
        btn_next: "Siguiente",
        btn_finish: "Finalizar",
        library_title_html: 'Tu <span class="gradient-text">Biblioteca</span>',
        library_desc: "Revisa tus notas y repite los cuestionarios.",
        endless_review: "Modo infinito",
        create_question: "Crear pregunta",
        create_material: "Crear material",
        sort_by: "Ordenar por:",
        filter_type: "Tipo:",
        date_newest: "Fecha (Más reciente)",
        date_oldest: "Fecha (Más antiguo)",
        all_materials: "Todos",
        type_video: "Video",
        type_doc: "Documento",
        no_files_found: "No se encontraron archivos.",
        loading_library: "Cargando...",
        library_empty: "La biblioteca está vacía. ¡Sube un archivo para comenzar!",
        alert_library_empty: "¡La biblioteca está vacía! Sube contenido primero.",
        alert_no_questions: "No se encontraron preguntas en la biblioteca.",
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
        lib_generating: "⏳ ..."
    },
    pt: {
        nav_upload: "Carregar",
        nav_library: "Biblioteca",
        nav_profile: "Perfil",
        hero_title_html: 'Transforme estudos em <br><span class="gradient-text">Quizzes</span>',
        hero_desc: "Gere perguntas de prática de alta qualidade.",
        tab_file: "📄 Arquivo",
        tab_youtube: "YouTube",
        drop_title: "Arraste seu arquivo aqui",
        drop_desc: "ou clique para navegar",
        btn_generate: "Gerar Quiz",
        yt_title: "Colar link do YouTube",
        yt_desc: "Extração automática de legendas",
        api_hint: "Deixe em branco para o padrão",
        back_library: "Voltar à biblioteca",
        explanation: "Explicação",
        btn_previous: "Anterior",
        btn_next: "Próximo",
        btn_finish: "Finalizar",
        library_title_html: 'Sua <span class="gradient-text">Biblioteca</span>',
        library_desc: "Revise suas notas e refaça os questionários.",
        endless_review: "Modo infinito",
        create_question: "Criar pergunta",
        create_material: "Criar material",
        sort_by: "Ordenar por:",
        filter_type: "Tipo:",
        date_newest: "Data (Mais recente)",
        date_oldest: "Data (Mais antiga)",
        all_materials: "Todos",
        type_video: "Vídeo",
        type_doc: "Documento",
        no_files_found: "Nenhum arquivo encontrado.",
        loading_library: "Carregando...",
        library_empty: "A biblioteca está vazia. Carregue um arquivo para começar!",
        alert_library_empty: "A biblioteca está vazia! Carregue conteúdo primeiro.",
        alert_no_questions: "Nenhuma pergunta encontrada na biblioteca.",
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
        lib_generating: "⏳ ..."
    },
    vi: {
        nav_upload: "Tải lên",
        nav_library: "Thư viện",
        nav_profile: "Hồ sơ",
        hero_title_html: 'Biến tài liệu thành <br><span class="gradient-text">Bài kiểm tra</span>',
        hero_desc: "Tạo câu hỏi thực hành chất lượng cao từ ghi chú.",
        tab_file: "📄 Tải tệp",
        tab_youtube: "YouTube",
        drop_title: "Kéo và thả tệp vào đây",
        drop_desc: "hoặc nhấp để duyệt",
        btn_generate: "Tạo Quiz",
        yt_title: "Dán liên kết YouTube",
        yt_desc: "Tự động trích xuất phụ đề",
        api_hint: "Để trống để dùng mặc định",
        back_library: "Quay lại thư viện",
        explanation: "Giải thích",
        btn_previous: "Trước",
        btn_next: "Tiếp",
        btn_finish: "Hoàn thành",
        library_title_html: '<span class="gradient-text">Thư viện</span> của bạn',
        library_desc: "Xem lại ghi chú và làm lại bài kiểm tra.",
        endless_review: "Chế độ vô tận",
        create_question: "Tạo câu hỏi",
        create_material: "Tạo tài liệu",
        sort_by: "Sắp xếp theo:",
        filter_type: "Loại:",
        date_newest: "Ngày (Mới nhất)",
        date_oldest: "Ngày (Cũ nhất)",
        all_materials: "Tất cả",
        type_video: "Video",
        type_doc: "Tài liệu",
        no_files_found: "Không tìm thấy tệp nào.",
        loading_library: "Đang tải...",
        library_empty: "Thư viện trống. Tải lên tệp để bắt đầu!",
        alert_library_empty: "Thư viện trống! Hãy tải nội dung lên trước.",
        alert_no_questions: "Không tìm thấy câu hỏi nào trong thư viện.",
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
        lib_generating: "⏳ ..."
    },
    hi: {
        nav_upload: "अपलोड",
        nav_library: "लाइब्रेरी",
        nav_profile: "प्रोफाइल",
        hero_title_html: 'अध्ययन सामग्री को <br><span class="gradient-text">क्विज़</span> में बदलें',
        hero_desc: "अपने नोट्स या वीडियो से उच्च गुणवत्ता वाले प्रश्न बनाएं।",
        tab_file: "📄 फ़ाइल अपलोड",
        tab_youtube: "यूट्यूब वीडियो",
        drop_title: "अपनी फ़ाइल यहाँ खींचें",
        drop_desc: "या ब्राउज़ करने के लिए क्लिक करें",
        btn_generate: "क्विज़ बनाएं",
        yt_title: "यूट्यूब लिंक पेस्ट करें",
        yt_desc: "स्वचालित रूप से कैप्शन निकालता है",
        api_hint: "सर्वर डिफ़ॉल्ट का उपयोग करने के लिए खाली छोड़ें",
        back_library: "लाइब्रेरी पर वापस जाएं",
        explanation: "व्याख्या",
        btn_previous: "पिछला",
        btn_next: "अगला",
        btn_finish: "समीक्षा समाप्त करें",
        library_title_html: 'आपकी <span class="gradient-text">अध्ययन लाइब्रेरी</span>',
        library_desc: "पिछले अपलोड किए गए नोट्स की समीक्षा करें और क्विज़ दोबारा लें।",
        endless_review: "अनंत समीक्षा",
        create_question: "प्रश्न बनाएं",
        create_material: "सामग्री बनाएं",
        sort_by: "क्रमबद्ध करें:",
        filter_type: "प्रकार:",
        date_newest: "तिथि (नवीनतम)",
        date_oldest: "तिथि (सबसे पुराना)",
        all_materials: "सभी सामग्री",
        type_video: "वीडियो",
        type_doc: "दस्तावेज़",
        no_files_found: "कोई फ़ाइल नहीं मिली।",
        loading_library: "लोड हो रहा है...",
        library_empty: "लाइब्रेरी खाली है। शुरू करने के लिए फ़ाइल अपलोड करें!",
        alert_library_empty: "लाइब्रेरी खाली है! पहले सामग्री अपलोड करें।",
        alert_no_questions: "लाइब्रेरी में कोई प्रश्न नहीं मिला।",
        translating_questions: "प्रश्नों का अनुवाद किया जा रहा है...",

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
        lib_generating: "⏳ ..."
    },
    ar: {
        nav_upload: "رفع",
        nav_library: "المكتبة",
        nav_profile: "الملف",
        hero_title_html: 'حول المواد الدراسية إلى <br><span class="gradient-text">اختبارات إتقان</span>',
        hero_desc: "أنشئ أسئلة تدريب عالية الجودة من ملاحظاتك أو مقاطع الفيديو.",
        tab_file: "📄 رفع ملف",
        tab_youtube: "يوتيوب",
        drop_title: "سحب وإسقاط الملف هنا",
        drop_desc: "أو انقر للتصفح",
        btn_generate: "إنشاء اختبار",
        yt_title: "لصق رابط يوتيوب",
        yt_desc: "استخراج تلقائي للتسميات التوضيحية",
        api_hint: "اتركه فارغًا لاستخدام الافتراضي",
        back_library: "العودة إلى المكتبة",
        explanation: "شرح",
        btn_previous: "السابق",
        btn_next: "التالي",
        btn_finish: "إنهاء المراجعة",
        library_title_html: '<span class="gradient-text">مكتبتك</span> الدراسية',
        library_desc: "راجع ملاحظاتك السابقة وأعد الاختبارات.",
        endless_review: "مراجعة لا نهائية",
        create_question: "إنشاء سؤال",
        create_material: "إنشاء مادة",
        sort_by: "ترتيب حسب:",
        filter_type: "النوع:",
        date_newest: "التاريخ (الأحدث)",
        date_oldest: "التاريخ (الأقدم)",
        all_materials: "جميع المواد",
        type_video: "فيديو",
        type_doc: "وثيقة",
        no_files_found: "لم يتم العثور على ملفات.",
        loading_library: "جارٍ التحميل...",
        library_empty: "المكتبة فارغة. قم بتحميل ملف للبدء!",
        alert_library_empty: "المكتبة فارغة! قم بتحميل المحتوى أولاً.",
        alert_no_questions: "لم يتم العثور على أسئلة في المكتبة.",
        translating_questions: "جارٍ ترجمة الأسئلة...",

        profile_title_html: '<span class="gradient-text">رحلة التعلم</span> الخاصة بك',
        profile_desc: "تتبع تقدمك وإحصائياتك عبر جميع المواد.",
        stat_time: "الوقت الموفر",
        stat_time_desc: "نظام تسجيل الدقة الذكي",
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
        lib_generating: "⏳ ..."
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

    const t = translations[lang];
    const elements = document.querySelectorAll('[data-i18n]');

    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            if (key.endsWith('_html')) {
                el.innerHTML = t[key];
            } else {
                el.textContent = t[key];
            }
        }
    });

    // Update placeholders if needed (manually map)

    // ... placeholders ...
    const ytInput = document.getElementById('youtube-input');

    // Re-render active view to apply dynamic translations
    const librarySection = document.getElementById('library-section');
    const profileSection = document.getElementById('profile-section');

    if (librarySection && !librarySection.classList.contains('hidden')) {
        if (window.renderLibrary) window.renderLibrary();
    }
    if (profileSection && !profileSection.classList.contains('hidden')) {
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
        headers: { 'x-user-id': localStorage.getItem('user_name') || 'guest' }
    });
    const files = await res.json();
    window.allFiles = files;
    return files;
};

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
                'x-user-id': localStorage.getItem('user_name') || 'guest'
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
async function showCategoryPicker(file, container, editBtn) {
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
                        'x-user-id': localStorage.getItem('user_name') || 'guest'
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
        editBtn.style.display = 'inline-block';
        container.innerHTML = '';
        file.categories.forEach(cat => {
            const span = document.createElement('span');
            span.className = 'cat-pill';
            const bg = categoryTagColors[cat] || '#8b5cf6';
            span.style.cssText = `background:${bg}; color:white; padding:4px 12px; border-radius:20px; font-size:0.85rem; font-weight:600; margin:3px; box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
            span.textContent = cat;
            container.appendChild(span);
        });
    }

    editBtn.style.display = 'none';
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
        const titleEl = document.getElementById('overview-title');
        titleEl.textContent = file.filename;

        // Create Edit Wrapper if not exists
        let editWrapper = document.getElementById('title-edit-wrapper');
        if (!editWrapper) {
            editWrapper = document.createElement('div');
            editWrapper.id = 'title-edit-wrapper';
            editWrapper.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; vertical-align: middle;';
            titleEl.parentNode.insertBefore(editWrapper, titleEl.nextSibling);

            // Move title inside? No, keep layout simple. Just add button next to it.
            // Actually, inserting next to title is cleaner.
        }

        // Edit Button
        let editTitleBtn = document.getElementById('edit-title-btn');
        if (!editTitleBtn) {
            editTitleBtn = document.createElement('span'); // Span to be inline
            editTitleBtn.id = 'edit-title-btn';
            editTitleBtn.innerHTML = '✏️';
            editTitleBtn.title = 'Edit Title';
            editTitleBtn.style.cssText = 'cursor: pointer; font-size: 0.9em; opacity: 0.5; transition: opacity 0.2s; margin-left:8px;';
            editTitleBtn.onmouseover = () => editTitleBtn.style.opacity = '1';
            editTitleBtn.onmouseout = () => editTitleBtn.style.opacity = '0.5';
            titleEl.parentNode.insertBefore(editTitleBtn, titleEl.nextSibling);

            // Inline Edit Logic
            editTitleBtn.onclick = () => {
                const currentTitle = titleEl.textContent;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = currentTitle;
                input.style.cssText = 'font-size: inherit; font-weight: inherit; font-family: inherit; border: 1px solid #ccc; border-radius: 4px; padding: 2px 4px; width: 100%; max-width: 300px;';

                // Replace title with input
                titleEl.style.display = 'none';
                editTitleBtn.style.display = 'none';
                titleEl.parentNode.insertBefore(input, titleEl);
                input.focus();

                const save = async () => {
                    const newTitle = input.value.trim();
                    if (newTitle && newTitle !== currentTitle) {
                        try {
                            const res = await fetch(apiUrl('/api/files/update'), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-user-id': localStorage.getItem('user_name') || 'guest'
                                },
                                body: JSON.stringify({ fileId: file.id, filename: newTitle })
                            });
                            const data = await res.json();
                            if (data.success) {
                                file.filename = newTitle; // Update local reference
                                titleEl.textContent = newTitle;
                                // Update global list if exists
                                if (window.allFiles) {
                                    const f = window.allFiles.find(x => x.id === file.id);
                                    if (f) f.filename = newTitle;
                                }
                                if (window.renderLibrary) window.renderLibrary(); // Refresh grid
                            } else {
                                alert('Failed to update title: ' + data.error);
                                titleEl.textContent = currentTitle;
                            }
                        } catch (e) {
                            console.error(e);
                            titleEl.textContent = currentTitle;
                        }
                    } else {
                        titleEl.textContent = currentTitle;
                    }
                    input.remove();
                    titleEl.style.display = '';
                    editTitleBtn.style.display = '';
                };

                input.onblur = save;
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        input.blur(); // Triggers save
                    }
                    if (e.key === 'Escape') {
                        titleEl.style.display = '';
                        editTitleBtn.style.display = '';
                        input.remove();
                    }
                };
            };
        }

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

        // Edit Button for Categories
        let editCatsBtn = document.getElementById('edit-categories-btn');
        if (!editCatsBtn) {
            editCatsBtn = document.createElement('button');
            editCatsBtn.id = 'edit-categories-btn';
            editCatsBtn.innerHTML = '⚙️';
            editCatsBtn.title = 'Edit Categories';
            editCatsBtn.style.cssText = 'background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--text-muted); padding: 2px 5px; opacity: 0.6; transition: all 0.2s; display: flex; align-items: center;';
            editCatsBtn.onmouseover = () => editCatsBtn.style.opacity = '1';
            editCatsBtn.onmouseout = () => editCatsBtn.style.opacity = '0.6';
            catContainer.appendChild(editCatsBtn);
        }
        editCatsBtn.style.display = 'inline-block';
        editCatsBtn.onclick = (e) => {
            e.stopPropagation();
            showCategoryPicker(file, catContainer, editCatsBtn);
        };

        if (file.categories && file.categories.length > 0) {
            file.categories.forEach(cat => {
                const span = document.createElement('span');
                span.className = 'cat-pill';
                const bg = categoryColors[cat] || '#8b5cf6';
                span.style.background = bg;
                span.style.color = 'white';
                span.style.padding = '4px 12px';
                span.style.borderRadius = '20px';
                span.style.fontSize = '0.85rem';
                span.style.fontWeight = '600';
                span.style.marginRight = '6px';
                span.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                span.textContent = cat;
                catContainer.appendChild(span);
            });
        }

        // Stats
        const qCount = file.questions ? file.questions.length : 0;
        document.getElementById('overview-question-count').textContent = qCount;
        document.getElementById('overview-time-saved').textContent = (qCount * 2) + 'm';

        // Link
        const linkEl = document.getElementById('overview-source-link');
        const linkText = document.getElementById('overview-source-text');
        if (file.type === 'youtube' && file.originalUrl) {
            linkEl.href = file.originalUrl;
            linkEl.hidden = false;
            linkText.textContent = file.originalUrl.length > 40 ? file.originalUrl.substring(0, 40) + '...' : file.originalUrl;
        } else {
            linkEl.hidden = true;
        }

        // Summary
        const summaryEl = document.getElementById('overview-summary-preview');
        summaryEl.innerHTML = '';
        summaryEl.style.fontStyle = 'normal';

        if (file.summary) {
            summaryEl.dataset.rawSummary = file.summary; // Store raw for editing
            let formatted = file.summary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>')
                .replace(/- /g, '&bull; ');
            summaryEl.innerHTML = formatted;

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
