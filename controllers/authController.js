import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { fileUser } from '../utils/fileStore.js';

export const register = async (req, res) => {
    try {
        const { userId, password, nickname } = req.body;

        if (!userId || !password || !nickname) {
            return res.status(400).json({ error: "Missing required fields (ID, Password, Nickname)." });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(userId)) {
            return res.status(400).json({ error: "User ID must be alphanumeric (letters, numbers, underscore)." });
        }

        try {
            // Check Mongo first
            const existing = await User.findOne({ userId });
            if (existing) {
                return res.status(409).json({ error: "User ID already exists." });
            }
        } catch (e) {
            // Fallback to File
            try {
                const existingFile = await fileUser.findOne({ userId });
                if (existingFile) {
                    return res.status(409).json({ error: "User ID already exists." });
                }
            } catch (fileErr) { }
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        try {
            // Try Mongo Create
            await User.create({
                userId,
                password: passwordHash,
                nickname,
                createdAt: new Date().toISOString()
            });
            console.log(`[Auth] Registered new user (DB): ${userId}`);
        } catch (createErr) {
            console.warn("[Auth] DB Register Failed, using File Fallback:", createErr.message);
            // Fallback to File Create
            try {
                await fileUser.create({
                    userId,
                    password: passwordHash,
                    nickname,
                    createdAt: new Date().toISOString()
                });
                console.log(`[Auth] Registered new user (File): ${userId}`);
            } catch (fileCreateErr) {
                console.error("Register Error (File):", fileCreateErr);
                return res.status(500).json({ error: "Failed to create user." });
            }
        }

        res.json({ success: true, message: "Account created!", userId, nickname });

    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: "Server error during registration." });
    }
};

export const login = async (req, res) => {
    try {
        const { userId, password } = req.body;

        if (!userId || !password) {
            return res.status(400).json({ error: "Missing ID or Password." });
        }

        let user = null;
        let isFileUser = false;

        // 1. Try Mongo
        try {
            user = await User.findOne({ userId });
        } catch (e) {
            console.warn("[Auth] DB Login Failed, trying File Fallback...");
        }

        // 2. Try File if Mongo failed or user not found (though if user not found on DB, check file just in case of sync issues? Maybe not for now, stick to DB failure fallback)
        if (!user) {
            try {
                // If DB query failed (e.g. connection refused), user is null/undefined here? No, user is null if not found OR if error caught.
                // Let's assume if user is null, we check file.
                user = await fileUser.findOne({ userId });
                if (user) isFileUser = true;
            } catch (e) { }
        }

        if (!user) {
            console.warn(`[Auth] Login Failed (User Not Found): ${userId}`);
            return res.status(404).json({ error: "User ID not found." });
        }

        let isMatch = false;

        // 1. Try bcrypt compare first
        const isHashed = user.password && user.password.startsWith('$2');
        if (isHashed) {
            isMatch = await bcrypt.compare(password, user.password);
        }

        // 2. Fallback: Plain Text (Migration)
        if (!isMatch && !isHashed) {
            if (user.password === password) {
                isMatch = true;
                // MIGRATION
                console.log(`[Auth] Migrating legacy password for user: ${userId}`);
                const salt = await bcrypt.genSalt(10);
                const newHash = await bcrypt.hash(password, salt);

                if (isFileUser) {
                    await fileUser.update(userId, { password: newHash });
                } else {
                    user.password = newHash;
                    await user.save();
                }
            }
        }

        if (isMatch) {
            console.log(`[Auth] Login Success: ${userId}`);
            res.json({ success: true, userId, nickname: user.nickname || userId });
        } else {
            console.warn(`[Auth] Login Failed (Wrong Password): ${userId}`);
            res.status(401).json({ error: "Incorrect password." });
        }

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server error during login." });
    }
};
