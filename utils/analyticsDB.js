import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'analytics.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create events table
db.exec(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        event TEXT NOT NULL,
        detail TEXT DEFAULT '',
        timestamp TEXT NOT NULL
    )
`);

// Create index for faster queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_userId ON events(userId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`);

// Prepared statements
const insertEvent = db.prepare(
    `INSERT INTO events (userId, event, detail, timestamp) VALUES (?, ?, ?, ?)`
);

const countByEvent = db.prepare(
    `SELECT COUNT(*) as count FROM events WHERE event = ?`
);

const countDistinctUsers = db.prepare(
    `SELECT COUNT(DISTINCT userId) as count FROM events WHERE event = 'register'`
);

const todayEvents = db.prepare(
    `SELECT COUNT(*) as count FROM events WHERE event = ? AND timestamp >= ?`
);

const recentEvents = db.prepare(
    `SELECT * FROM events ORDER BY id DESC LIMIT ?`
);

// Track an event
export function trackEvent(userId, event, detail = '') {
    const timestamp = new Date().toISOString();
    insertEvent.run(userId, event, detail, timestamp);
}

// Overview stats
export function getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const totalUsers = countDistinctUsers.get().count;
    const totalUploads = countByEvent.get('upload').count;
    const totalSolves = countByEvent.get('solve').count;
    const totalLogins = countByEvent.get('login').count;

    const todaySolves = todayEvents.get('solve', todayStr).count;
    const todayUploads = todayEvents.get('upload', todayStr).count;
    const todayLogins = todayEvents.get('login', todayStr).count;

    const activeToday = db.prepare(
        `SELECT COUNT(DISTINCT userId) as count FROM events WHERE timestamp >= ?`
    ).get(todayStr).count;

    return {
        totalUsers, totalUploads, totalSolves, totalLogins,
        todaySolves, todayUploads, todayLogins, activeToday
    };
}

// Per-user breakdown
export function getUsers() {
    return db.prepare(`
        SELECT
            userId,
            MIN(CASE WHEN event = 'register' THEN timestamp END) as signupDate,
            MAX(timestamp) as lastActive,
            SUM(CASE WHEN event = 'upload' THEN 1 ELSE 0 END) as uploads,
            SUM(CASE WHEN event = 'solve' THEN 1 ELSE 0 END) as solveEvents,
            SUM(CASE WHEN event = 'login' THEN 1 ELSE 0 END) as logins,
            COUNT(*) as totalEvents
        FROM events
        GROUP BY userId
        ORDER BY lastActive DESC
    `).all();
}

// Recent events
export function getRecentEvents(limit = 50) {
    return recentEvents.all(limit);
}

// Today's activity timeline
export function getTodayTimeline() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return db.prepare(
        `SELECT * FROM events WHERE timestamp >= ? ORDER BY id DESC`
    ).all(todayStart.toISOString());
}

export default { trackEvent, getStats, getUsers, getRecentEvents, getTodayTimeline };
