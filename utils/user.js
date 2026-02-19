
// Helper: Get User ID from Request
export function getUserID(req) {
    let userId = req.headers['x-user-id'];
    if (!userId) {
        if (req.user && req.user.userId) return req.user.userId;
        return 'anonymous';
    }

    try {
        userId = decodeURIComponent(userId);
    } catch (e) { }

    // Sanitize: prevent path traversal and limit to safe characters
    userId = userId.replace(/[\/\\\.]{2,}/g, '').replace(/[^\w가-힣@.\-]/g, '_');
    if (!userId || userId.length > 100) return 'anonymous';

    return userId;
}
