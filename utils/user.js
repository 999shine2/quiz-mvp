
// Helper: Get User ID from Request
// Prefers JWT-extracted user (set by authMiddleware), falls back to x-user-id header
export function getUserID(req) {
    // 1. From auth middleware (JWT or parsed x-user-id)
    if (req.user && req.user.userId && req.user.userId !== 'anonymous') {
        return req.user.userId;
    }

    // 2. Fallback: raw header (shouldn't normally reach here if authMiddleware runs)
    let userId = req.headers['x-user-id'];
    if (!userId) return 'anonymous';

    try {
        userId = decodeURIComponent(userId);
    } catch (e) { }

    // Sanitize: prevent path traversal and limit to safe characters
    userId = userId.replace(/[\/\\\.]{2,}/g, '').replace(/[^\w가-힣@.\-]/g, '_');
    if (!userId || userId.length > 100) return 'anonymous';

    return userId;
}
