// Analytics tracking using MongoDB
// Migrated from better-sqlite3 to Mongoose for production persistence

import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

// Track an event
export function trackEvent(userId, event, detail = '') {
    // Fire-and-forget: don't await to avoid blocking the request
    AnalyticsEvent.create({
        userId,
        event,
        detail,
        timestamp: new Date()
    }).catch(err => {
        console.error('[Analytics] Failed to track event:', err.message);
    });
}

// Overview stats
export async function getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
        totalUsers,
        totalUploads,
        totalSolves,
        totalLogins,
        todaySolves,
        todayUploads,
        todayLogins,
        activeToday,
        newUsersToday,
        activeWeek,
        weekSolves,
        returningUsers
    ] = await Promise.all([
        AnalyticsEvent.distinct('userId', { event: 'register' }).then(ids => ids.length),
        AnalyticsEvent.countDocuments({ event: 'upload' }),
        AnalyticsEvent.countDocuments({ event: 'solve' }),
        AnalyticsEvent.countDocuments({ event: 'login' }),
        AnalyticsEvent.countDocuments({ event: 'solve', timestamp: { $gte: todayStart } }),
        AnalyticsEvent.countDocuments({ event: 'upload', timestamp: { $gte: todayStart } }),
        AnalyticsEvent.countDocuments({ event: 'login', timestamp: { $gte: todayStart } }),
        AnalyticsEvent.distinct('userId', { timestamp: { $gte: todayStart } }).then(ids => ids.length),
        AnalyticsEvent.countDocuments({ event: 'register', timestamp: { $gte: todayStart } }),
        AnalyticsEvent.distinct('userId', { timestamp: { $gte: weekAgo } }).then(ids => ids.length),
        AnalyticsEvent.countDocuments({ event: 'solve', timestamp: { $gte: weekAgo } }),
        AnalyticsEvent.aggregate([
            { $match: { event: 'login' } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $count: 'total' }
        ]).then(result => result[0]?.total || 0)
    ]);

    const avgSolvesPerUser = activeWeek > 0 ? Math.round((weekSolves / activeWeek) * 10) / 10 : 0;

    return {
        totalUsers, totalUploads, totalSolves, totalLogins,
        todaySolves, todayUploads, todayLogins, activeToday,
        newUsersToday, activeWeek, avgSolvesPerUser, returningUsers
    };
}

// Per-user breakdown
export async function getUsers() {
    return AnalyticsEvent.aggregate([
        {
            $group: {
                _id: '$userId',
                signupDate: { $min: { $cond: [{ $eq: ['$event', 'register'] }, '$timestamp', null] } },
                lastActive: { $max: '$timestamp' },
                uploads: { $sum: { $cond: [{ $eq: ['$event', 'upload'] }, 1, 0] } },
                solveEvents: { $sum: { $cond: [{ $eq: ['$event', 'solve'] }, 1, 0] } },
                logins: { $sum: { $cond: [{ $eq: ['$event', 'login'] }, 1, 0] } },
                totalEvents: { $sum: 1 }
            }
        },
        { $sort: { lastActive: -1 } },
        {
            $project: {
                userId: '$_id',
                _id: 0,
                signupDate: 1,
                lastActive: 1,
                uploads: 1,
                solveEvents: 1,
                logins: 1,
                totalEvents: 1
            }
        }
    ]);
}

// Recent events
export async function getRecentEvents(limit = 50) {
    return AnalyticsEvent.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
}

// Today's activity timeline
export async function getTodayTimeline() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return AnalyticsEvent.find({ timestamp: { $gte: todayStart } })
        .sort({ timestamp: -1 })
        .lean();
}

export default { trackEvent, getStats, getUsers, getRecentEvents, getTodayTimeline };
