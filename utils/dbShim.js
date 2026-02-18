import { Material } from '../models/Material.js';
import { ReelsBuffer } from '../models/ReelsBuffer.js';
import { getUserID } from './user.js';
import { fileLibrary } from './fileStore.js'; // Fallback

// getDB: Returns Mongoose Documents OR Plain Objects from File
export async function getDB(req) {
    const userId = getUserID(req);

    // Try Mongo First (unless skipped)
    try {
        if (process.env.SKIP_MONGO === 'true') {
            throw new Error("SKIP_MONGO is enabled");
        }

        const files = await Material.find({ userId });
        const buf = await ReelsBuffer.findOne({ userId });

        // Return Mongo data if successful (even if empty list)
        // Check if we actually connected or if find threw error
        // If files is returned, we assume connection is OK.

        return {
            userId,
            files: files || [],
            reelsBuffer: (buf && buf.questions) ? buf.questions : [],
            isMongo: true
        };
    } catch (e) {
        console.error("DB Fetch Error (Mongo):", e.message);
        console.log("Using File Fallback for Library...");

        return await fileLibrary.get(userId);
    }
}

// saveDB: Iterates objects and persists changes to Mongo OR File
export async function saveDB(req, data) {
    const userId = data.userId || getUserID(req);

    // If data came from file (isMongo missing or false), save to file
    if (!data.isMongo) {
        await fileLibrary.save(userId, data);
        return;
    }

    // Otherwise try to save to Mongo
    try {
        // 1. Sync Files
        if (data.files && Array.isArray(data.files)) {
            for (const file of data.files) {
                if (file.save && typeof file.save === 'function') {
                    if (file.isModified()) {
                        await file.save();
                    }
                } else {
                    const exists = await Material.exists({ id: file.id, userId });
                    if (!exists) {
                        await Material.create({ ...file, userId });
                    }
                }
            }
        }

        // 2. Sync Buffer
        if (data.reelsBuffer) {
            await ReelsBuffer.findOneAndUpdate(
                { userId },
                { questions: data.reelsBuffer, updatedAt: new Date() },
                { upsert: true }
            );
        }
    } catch (err) {
        console.error("[SaveDB] Mongo Save Failed:", err.message);
        // Fallback: Save to File even if we thought we were using Mongo?
        // Yes, to prevent data loss.
        console.log("Saving to File Fallback...");
        await fileLibrary.save(userId, data);
    }
}
