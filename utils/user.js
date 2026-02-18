
// Helper: Get User ID from Request
export function getUserID(req) {
    let userId = req.headers['x-user-id'];
    if (!userId) {
        // Fallback: Check req.user (from auth middleware)
        if (req.user && req.user.userId) return req.user.userId;
        return 'anonymous';
    }

    try {
        userId = decodeURIComponent(userId);
    } catch (e) { }

    // Return as-is (Korean characters are safe for file paths on modern systems)
    return userId;
}
