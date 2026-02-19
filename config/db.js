import mongoose from 'mongoose';
import { log } from '../utils/log.js';

const connectDB = async () => {
    if (process.env.SKIP_MONGO === 'true') {
        log.important('[Mongo] Skipped (SKIP_MONGO=true). Using File Store.');
        return;
    }

    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        log.error("MONGODB_URI is missing from Environment Variables!");
        return;
    }

    try {
        const conn = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        log.important(`[Mongo] Connected to ${conn.connection.host}`);
    } catch (err) {
        log.error(`MongoDB Connection FAILED: ${err.message}`);
        log.important('Using File Fallback for Library...');
    }
};

export default connectDB;
