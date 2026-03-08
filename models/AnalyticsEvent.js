import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    event: { type: String, required: true, index: true },
    detail: { type: String, default: '' },
    timestamp: { type: Date, required: true, default: Date.now, index: true }
});

// Compound index for common queries
analyticsEventSchema.index({ event: 1, timestamp: 1 });
analyticsEventSchema.index({ userId: 1, event: 1 });

export const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);
