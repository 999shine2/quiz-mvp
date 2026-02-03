
import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
    type: { type: String, required: false }, // MCQ, SAQ
    question: { type: String, required: true },
    options: [String],
    correctAnswer: Number,
    explanation: String,
    idealAnswer: String, // For SAQ
    imagePrompt: String,
    originFilename: String,
    originId: String,
    spawnedFrom: String,
    isSpawned: { type: Boolean, default: false }
}, { _id: false }); // Disable auto _id for subdocs if not needed, but keeping default is fine

const materialSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    id: { type: String, required: true }, // Keeping original ID string (timestamp) for compatibility
    type: { type: String, required: true }, // 'youtube', 'pdf', 'custom'
    filename: { type: String, required: true },

    // Content
    originalUrl: String, // for youtube
    path: String, // for file uploads (relative path)
    transcript: String, // Text content
    summary: String,

    // Metadata
    categories: [String],
    subjectEmoji: String,
    uploadedAt: { type: Date, default: Date.now },

    // Questions
    questions: [questionSchema]
});

export const Material = mongoose.model('Material', materialSchema);
