/**
 * clientDB.js — IndexedDB Storage Layer
 * Replaces all server-side file storage (fileStore.js, dbShim.js)
 * All data lives on the user's device.
 */
const clientDB = (() => {
    const DB_NAME = 'QuizMVP';
    const DB_VERSION = 1;
    let db = null;

    // ── Init / Open Database ──────────────────────────────────
    async function init() {
        if (db) return db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Users store
                if (!database.objectStoreNames.contains('users')) {
                    database.createObjectStore('users', { keyPath: 'userId' });
                }

                // Library store (per-user data: files, questions, reelsBuffer)
                if (!database.objectStoreNames.contains('library')) {
                    database.createObjectStore('library', { keyPath: 'userId' });
                }

                // Activity log
                if (!database.objectStoreNames.contains('activityLog')) {
                    const logStore = database.createObjectStore('activityLog', { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('userId', 'userId', { unique: false });
                }

                // Settings (API keys, preferences)
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', { keyPath: 'key' });
                }

                // Image cache
                if (!database.objectStoreNames.contains('imageCache')) {
                    database.createObjectStore('imageCache', { keyPath: 'hash' });
                }

                console.log('[ClientDB] Database schema created/upgraded');
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('[ClientDB] Database opened successfully');
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('[ClientDB] Failed to open database:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // ── Generic Helpers ───────────────────────────────────────
    function _tx(storeName, mode = 'readonly') {
        const transaction = db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    }

    function _promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ── User Operations ───────────────────────────────────────
    async function getUser(userId) {
        await init();
        return _promisify(_tx('users').get(userId));
    }

    async function saveUser(userData) {
        await init();
        return _promisify(_tx('users', 'readwrite').put(userData));
    }

    async function getAllUsers() {
        await init();
        return _promisify(_tx('users').getAll());
    }

    // ── Library Operations ────────────────────────────────────
    async function getLibrary(userId) {
        await init();
        const data = await _promisify(_tx('library').get(userId));
        return data || {
            userId,
            files: [],
            reelsBuffer: []
        };
    }

    async function saveLibrary(userId, data) {
        await init();
        const record = { ...data, userId };
        return _promisify(_tx('library', 'readwrite').put(record));
    }

    async function getAllLibrary(userId) {
        const lib = await getLibrary(userId);
        return lib.files || [];
    }

    async function saveLibraryItem(userId, item) {
        const lib = await getLibrary(userId);
        if (!lib.files) lib.files = [];
        const index = lib.files.findIndex(f => f.id === item.id);
        if (index > -1) {
            lib.files[index] = item;
        } else {
            lib.files.unshift(item);
        }
        await saveLibrary(userId, lib);
    }

    async function deleteLibraryItem(userId, fileId) {
        const lib = await getLibrary(userId);
        if (lib.files) {
            lib.files = lib.files.filter(f => f.id !== fileId);
            await saveLibrary(userId, lib);
        }
    }

    // ── Activity Log (Summary Object) ─────────────────────────
    // We'll store one summary object per user in the activityLog store
    // using a special ID format: "summary_{userId}"
    async function getActivityLog(userId) {
        await init();
        const summaryId = `summary_${userId}`;
        const summary = await _promisify(_tx('activityLog').get(summaryId));
        return summary || {
            id: summaryId,
            userId,
            dailyStats: {},
            totalQuestionsSolved: 0,
            totalTimeSavedMins: 0,
            subjects: {}
        };
    }

    async function saveActivityLog(userId, log) {
        await init();
        const record = { ...log, id: `summary_${userId}`, userId };
        return _promisify(_tx('activityLog', 'readwrite').put(record));
    }

    // Legacy method if used elsewhere
    async function logActivity(userId, action, details = {}) {
        await init();
        const entry = {
            userId,
            action,
            details,
            timestamp: new Date().toISOString()
        };
        return _promisify(_tx('activityLog', 'readwrite').add(entry));
    }

    // ── Settings (API Keys, Preferences) ──────────────────────
    async function getSetting(key) {
        await init();
        const result = await _promisify(_tx('settings').get(key));
        return result ? result.value : null;
    }

    async function saveSetting(key, value) {
        await init();
        return _promisify(_tx('settings', 'readwrite').put({ key, value }));
    }

    async function getSettings() {
        await init();
        const all = await _promisify(_tx('settings').getAll());
        const settings = {};
        all.forEach(item => { settings[item.key] = item.value; });
        return settings;
    }

    // ── Image Cache ───────────────────────────────────────────
    async function getCachedImage(hash) {
        await init();
        return _promisify(_tx('imageCache').get(hash));
    }

    async function saveCachedImage(hash, blob, prompt = '') {
        await init();
        return _promisify(_tx('imageCache', 'readwrite').put({
            hash,
            blob,
            prompt,
            timestamp: Date.now()
        }));
    }

    // ── Export Helpers (for data backup) ──────────────────────
    async function exportAllData(userId) {
        const lib = await getLibrary(userId);
        const user = await getUser(userId);
        const settings = await getSettings();
        const logs = await getActivityLog(userId);
        return { user, library: lib.files, settings, activityLog: logs };
    }

    async function importLibraryData(userId, data) {
        const lib = await getLibrary(userId);
        if (Array.isArray(data)) {
            lib.files = data;
        } else if (data.files && Array.isArray(data.files)) {
            lib.files = data.files;
            if (data.reelsBuffer) lib.reelsBuffer = data.reelsBuffer;
        }
        await saveLibrary(userId, lib);
    }

    // ── Public API ────────────────────────────────────────────
    return {
        init,
        // Users
        getUser,
        saveUser,
        getAllUsers,
        // Library
        getLibrary,
        saveLibrary,
        getAllLibrary,
        saveLibraryItem,
        deleteLibraryItem,
        // Activity
        getActivityLog,
        saveActivityLog,
        logActivity,
        // Settings
        getSetting,
        saveSetting,
        getSettings,
        // Image Cache
        getCachedImage,
        saveCachedImage,
        // Data management
        exportAllData,
        importLibraryData
    };
})();
