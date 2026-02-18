/**
 * clientAuth.js — Client-Side Authentication
 * Uses Web Crypto API for password hashing + IndexedDB for storage.
 * No server roundtrip needed.
 */
const clientAuth = (() => {

    // ── Hash password using SHA-256 ───────────────────────────
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ── Register ──────────────────────────────────────────────
    async function register(userId, password, nickname) {
        if (!userId || !password || !nickname) {
            throw new Error('Missing required fields (ID, Password, Nickname).');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(userId)) {
            throw new Error('User ID must be alphanumeric (letters, numbers, underscore).');
        }

        // Check if user exists
        const existing = await clientDB.getUser(userId);
        if (existing) {
            throw new Error('User ID already exists.');
        }

        const passwordHash = await hashPassword(password);
        const userData = {
            userId,
            password: passwordHash,
            nickname,
            createdAt: new Date().toISOString()
        };

        await clientDB.saveUser(userData);
        console.log(`[ClientAuth] Registered new user: ${userId}`);

        return { success: true, message: 'Account created!', userId, nickname };
    }

    // ── Login ─────────────────────────────────────────────────
    async function login(userId, password) {
        if (!userId || !password) {
            throw new Error('Missing ID or Password.');
        }

        const user = await clientDB.getUser(userId);
        if (!user) {
            throw new Error('User ID not found.');
        }

        const passwordHash = await hashPassword(password);

        // Check hashed password
        if (user.password === passwordHash) {
            console.log(`[ClientAuth] Login success: ${userId}`);
            return { success: true, userId, nickname: user.nickname || userId };
        }

        // Legacy: check plain text password (old users) and migrate
        if (user.password === password) {
            console.log(`[ClientAuth] Migrating legacy password for: ${userId}`);
            user.password = passwordHash;
            await clientDB.saveUser(user);
            return { success: true, userId, nickname: user.nickname || userId };
        }

        throw new Error('Incorrect password.');
    }

    // ── Get current user ──────────────────────────────────────
    function getCurrentUser() {
        return localStorage.getItem('study_user');
    }

    function getCurrentNickname() {
        return localStorage.getItem('user_nickname') || localStorage.getItem('study_user');
    }

    function setCurrentUser(userId, nickname) {
        localStorage.setItem('study_user', userId);
        localStorage.setItem('user_nickname', nickname || userId);
    }

    function logout() {
        localStorage.removeItem('study_user');
        localStorage.removeItem('user_nickname');
    }

    // ── Public API ────────────────────────────────────────────
    return {
        register,
        login,
        getCurrentUser,
        getCurrentNickname,
        setCurrentUser,
        logout,
        hashPassword
    };
})();
