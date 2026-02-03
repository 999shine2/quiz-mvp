
import mongoose from 'mongoose';

const reelsBufferSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    questions: [{ type: mongoose.Schema.Types.Mixed }], // Array of question objects
    updatedAt: { type: Date, default: Date.now }
});

export const ReelsBuffer = mongoose.model('ReelsBuffer', reelsBufferSchema);
