import mongoose from 'mongoose';

const connectDB = async () => {
    // 1. Check for Skip Flag
    if (process.env.SKIP_MONGO === 'true') {
        console.log('[Mongo] Skipped (SKIP_MONGO=true). Using File Store.');
        return;
    }

    // 2. Check for URI
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error("❌ CRITICAL: MONGODB_URI is missing from Environment Variables!");
        // We might want to throw or exit, but following original logic:
        return;
    }

    // 3. Attempt Connection
    try {
        const conn = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000 // Fast fail
        });
        console.log(`[Mongo] Connected to ${conn.connection.host}`);
    } catch (err) {
        console.error(`❌ MongoDB Connection FAILED: ${err.message}`);
        console.log('Using File Fallback for Library...');
        // Do not exit, allow fallback
    }
};

export default connectDB;
