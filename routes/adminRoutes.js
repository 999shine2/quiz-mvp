import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { trackEvent, getStats, getUsers, getRecentEvents, getTodayTimeline } from '../utils/analyticsDB.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'insighter-beta-2026';

// Check admin key
function requireAdmin(req, res, next) {
    const key = req.query.key || req.headers['x-admin-key'];
    if (key !== ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Serve admin page
router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Admin stats API
router.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
        const stats = getStats();
        const users = getUsers();
        const recent = getRecentEvents(50);
        const today = getTodayTimeline();
        res.json({ stats, users, recent, today });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Analytics tracking endpoint (called by client)
router.post('/api/analytics/track', (req, res) => {
    try {
        const { userId, event, detail } = req.body;
        if (!userId || !event) {
            return res.status(400).json({ error: 'Missing userId or event' });
        }
        trackEvent(userId, event, detail || '');
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
