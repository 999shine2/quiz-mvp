import { ActivityLog } from '../models/ActivityLog.js';
import { getDB } from '../utils/dbShim.js'; // Fallback if using shim for files, otherwise direct model usage
import { getUserID } from '../utils/user.js';
import { logActivity as logActivityUtil } from '../utils/logger.js'; // Use util to avoid re-implementation

import { fileActivityLog } from '../utils/fileStore.js'; // Fallback

export const getProfileStats = async (req, res) => {
    try {
        const userId = getUserID(req);
        const db = await getDB(req);

        let logs = [];
        try {
            logs = await ActivityLog.find({ userId });
        } catch (e) {
            logs = await fileActivityLog.find({ userId });
        }
        const files = db.files || [];

        // 1. Total Stats
        const totalQuestionsSolved = logs
            .filter(l => l.action === 'solve_question')
            .reduce((acc, curr) => acc + (curr.details?.count || 0), 0);

        // 3 mins per question
        const totalTimeSavedMins = logs
            .filter(l => l.action === 'solve_question')
            .reduce((acc, curr) => {
                const det = curr.details || {};
                if (det.correct !== undefined) {
                    return acc + (det.correct * 2) + ((det.wrong || 0) * 1);
                }
                return acc + ((det.count || 0) * 3);
            }, 0);

        // 2. Daily Stats (Last 7 Days)
        const dailyStats = {};
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyStats[key] = { solved: 0, uploads: 0, timeSaved: 0 };
        }

        logs.forEach(log => {
            if (!log.timestamp) return;
            const dateKey = new Date(log.timestamp).toISOString().split('T')[0];
            const det = log.details || {};

            if (dailyStats[dateKey]) {
                if (log.action === 'solve_question') {
                    dailyStats[dateKey].solved += (det.count || 0);

                    let time = 0;
                    if (det.correct !== undefined) {
                        time = (det.correct * 2) + ((det.wrong || 0) * 1);
                    } else {
                        time = (det.count || 0) * 3;
                    }
                    dailyStats[dateKey].timeSaved += time;
                } else if (log.action === 'upload') {
                    dailyStats[dateKey].uploads += 1;
                }
            }
        });

        files.forEach(f => {
            const val = f.uploadDate || f.uploadedAt;
            if (!val) return;
            const dateKey = new Date(val).toISOString().split('T')[0];
            if (dailyStats[dateKey]) dailyStats[dateKey].uploads += 1;
        });

        // 3. Top Subjects
        const materialCounts = {};
        logs.filter(l => l.action === 'solve_question').forEach(l => {
            const det = l.details || {};
            let name = det.materialName || (det.subject ? det.subject + ' Review' : 'General Review');
            name = name.trim();

            if (name === 'Endless Review' || name === 'General Review') return;

            const existingKey = Object.keys(materialCounts).find(k =>
                k.toLowerCase() === name.toLowerCase() ||
                (k.length > 10 && name.startsWith(k.substring(0, 15))) ||
                (name.length > 10 && k.startsWith(name.substring(0, 15)))
            );
            if (existingKey) name = existingKey;

            let emoji = det.subject || '📚';
            const file = files.find(f => f.filename === name || (f.filename && f.filename.startsWith(name.substring(0, 15))));
            if (file && file.subjectEmoji) emoji = file.subjectEmoji;

            if (!materialCounts[name]) materialCounts[name] = { count: 0, emoji, timeSaved: 0 };
            materialCounts[name].count += (det.count || 0);

            let time = 0;
            if (det.correct !== undefined) {
                time = (det.correct * 2) + ((det.wrong || 0) * 1);
            } else {
                time = (det.count || 0) * 3;
            }
            materialCounts[name].timeSaved += time;
        });

        const topSubjects = Object.entries(materialCounts)
            .map(([name, data]) => ({ name, emoji: data.emoji, count: data.count, timeSaved: data.timeSaved }))
            .sort((a, b) => b.count - a.count);

        // 4. Current Streak
        const sortedDates = Object.keys(dailyStats).sort().reverse();
        let currentStreak = 0;

        for (let i = 0; i < sortedDates.length; i++) {
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() - i);
            const expectedDateStr = expectedDate.toISOString().split('T')[0];

            if (sortedDates[i] === expectedDateStr && dailyStats[sortedDates[i]].solved > 0) {
                currentStreak++;
            } else {
                break;
            }
        }

        res.json({
            totalQuestionsSolved,
            totalTimeSavedMins,
            dailyStats,
            topSubjects,
            currentStreak
        });

    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

export const trackSolve = async (req, res) => {
    try {
        const { count, correct, wrong, materialName, subject } = req.body;
        const userId = getUserID(req);

        await logActivityUtil(userId, 'solve_question', { count, correct, wrong, materialName, subject });
        res.json({ success: true });
    } catch (err) {
        console.error('Tracking error:', err);
        res.status(500).json({ error: 'Failed to track activity' });
    }
};
