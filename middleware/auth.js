import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'insighter-mvp-secret-change-in-production';
const JWT_EXPIRY = '30d'; // 30 days for MVP

/**
 * Generate JWT token for a user
 */
export function generateToken(userId, nickname) {
    return jwt.sign({ userId, nickname }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Auth middleware - validates JWT token
 * Falls back to x-user-id header for backward compatibility during migration
 */
export function authMiddleware(req, res, next) {
    // 1. Try JWT from Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = { userId: decoded.userId, nickname: decoded.nickname };
            return next();
        } catch (err) {
            // Token invalid/expired — don't fail, try fallback
        }
    }

    // 2. Fallback: x-user-id header (backward compat)
    const userIdHeader = req.headers['x-user-id'];
    if (userIdHeader) {
        let userId = userIdHeader;
        try { userId = decodeURIComponent(userId); } catch (e) {}
        userId = userId.replace(/[\/\\\.]{2,}/g, '').replace(/[^\w가-힣@.\-]/g, '_');
        if (userId && userId.length <= 100 && userId !== 'guest') {
            req.user = { userId };
            return next();
        }
    }

    // 3. No auth — allow as anonymous (some endpoints work without auth)
    req.user = { userId: 'anonymous' };
    next();
}

/**
 * Require auth — blocks anonymous users
 */
export function requireAuth(req, res, next) {
    if (!req.user || req.user.userId === 'anonymous') {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    next();
}
