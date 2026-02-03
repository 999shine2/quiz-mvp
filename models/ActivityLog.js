
import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true }, // 'solve', 'upload'
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
});

// Index for getting recent activity efficiently
activityLogSchema.index({ userId: 1, timestamp: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
