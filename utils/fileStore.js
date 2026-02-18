import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// Ensure data directory exists
const initDataDir = async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'users'), { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'library'), { recursive: true });
    } catch (e) { }
};

// Generic File Operations
const readJSON = async (filePath, defaultValue = null) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return defaultValue;
    }
};

const writeJSON = async (filePath, data) => {
    await initDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// USER Operations
export const fileUser = {
    async findOne({ userId }) {
        const users = await readJSON(path.join(DATA_DIR, 'users.json'), []);
        return users.find(u => u.userId === userId);
    },

    async create(userData) {
        const users = await readJSON(path.join(DATA_DIR, 'users.json'), []);
        if (users.find(u => u.userId === userData.userId)) {
            throw new Error('User already exists');
        }
        users.push(userData);
        await writeJSON(path.join(DATA_DIR, 'users.json'), users);
        return userData;
    },

    // For migration/password update
    async update(userId, updateData) {
        const users = await readJSON(path.join(DATA_DIR, 'users.json'), []);
        const index = users.findIndex(u => u.userId === userId);
        if (index !== -1) {
            users[index] = { ...users[index], ...updateData };
            await writeJSON(path.join(DATA_DIR, 'users.json'), users);
            return users[index];
        }
        return null;
    }
};

// LIBRARY Operations (per user) with In-Memory Cache
const libraryCache = {}; // { userId: { data: object, timestamp: number } }

export const fileLibrary = {
    async get(userId) {
        // Serve from cache if available (TTL 5 seconds? Or infinite since we are the only writer?)
        // Let's use simple consistent cache: If we wrote it, we have it.
        // We only read from disk if cache is empty.
        if (libraryCache[userId]) {
            return JSON.parse(JSON.stringify(libraryCache[userId].data)); // Return copy
        }

        const data = await readJSON(path.join(DATA_DIR, 'library', `${userId}.json`), {
            userId,
            files: [],
            reelsBuffer: [],
            activityLog: []
        });

        libraryCache[userId] = { data, timestamp: Date.now() };
        return data;
    },

    async save(userId, data) {
        // Update Cache First
        libraryCache[userId] = { data, timestamp: Date.now() };

        // Write to Disk
        await writeJSON(path.join(DATA_DIR, 'library', `${userId}.json`), data);
    }
};

// Activity Log Fallback
export const fileActivityLog = {
    async find({ userId }) {
        const lib = await fileLibrary.get(userId);
        return lib.activityLog || [];
    },

    async create(logData) {
        const lib = await fileLibrary.get(logData.userId);
        if (!lib.activityLog) lib.activityLog = [];
        lib.activityLog.push(logData);
        // Throttle log saves? For now, just save. Cache helps reading.
        await fileLibrary.save(logData.userId, lib);
        return logData;
    }
};
