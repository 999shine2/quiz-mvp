import { ActivityLog } from '../models/ActivityLog.js';
import { fileActivityLog } from './fileStore.js'; // Fallback

export async function logActivity(userId, action, details) {
    try {
        await ActivityLog.create({
            userId,
            action,
            details,
            timestamp: new Date()
        });
        console.log(`[Activity] Logged: ${action}`);
    } catch (e) {
        // Fallback to File
        try {
            await fileActivityLog.create({
                userId,
                action,
                details,
                timestamp: new Date()
            });
            console.log(`[Activity] Logged (File): ${action}`);
        } catch (fileErr) {
            console.error(`[Activity] Failed to log ${action}:`, fileErr);
        }
    }
}
