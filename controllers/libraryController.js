import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { ActivityLog } from '../models/ActivityLog.js';
import { Material } from '../models/Material.js';
import { ReelsBuffer } from '../models/ReelsBuffer.js';
import { generateQuestionImage } from '../services/imageService.js';
import { generateSummary, generateQuestions } from '../aiService.js';
import { parseDocument } from '../documentParser.js';
import { extractVideoId, fetchYouTubeTranscript } from '../services/youtubeService.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';
import { logActivity } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

import { fileActivityLog } from '../utils/fileStore.js'; // Fallback

// Get Library with Stats
export const getLibrary = async (req, res) => {
    try {
        const userId = getUserID(req);
        const db = await getDB(req);

        // 1. Fetch Logs (Optimized: Skip Mongo if not connected)
        let logs = [];
        if (db.isMongo) {
            try {
                logs = await ActivityLog.find({ userId });
            } catch (e) {
                console.warn("[Library] Mongo ActivityLog fetch failed, ignoring.");
            }
        } else {
            // File Store Logic (if applicable)
            try {
                logs = await fileActivityLog.find({ userId });
            } catch (e) { }
        }

        const filesWithStats = db.files.map(file => {
            const fileLogs = logs.filter(l =>
                l.action === 'solve_question' &&
                l.details && l.details.materialName === file.filename
            );

            const solvedCount = fileLogs.reduce((acc, curr) => acc + (curr.details?.count || 0), 0);

            // Plain object conversion
            const fileObj = file.toObject ? file.toObject() : file;

            return {
                ...fileObj,
                questionsSolved: solvedCount,
                timeSaved: solvedCount * 3
            };
        });

        // Prevent browser caching of library data (to ensure fresh imageUrls)
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.json(filesWithStats);

        // Background Image Gen (Optimized for Persistence)
        // Only run if we actually have files
        if (filesWithStats.length > 0) {
            console.log(`[Library] Checking image generation for ${filesWithStats.length} files...`);

            // We use 'db' reference which contains the Source of Truth (Mongo Doc or File Object)
            // Iterate DB directly to ensure we update the source
            let updatesMade = false;

            for (const file of db.files) {
                if (file.questions && Array.isArray(file.questions)) {
                    for (const q of file.questions) {
                        if (!q.imageUrl) {
                            try {
                                const imageUrl = await generateQuestionImage(q, userId, process.env.GEMINI_API_KEY);
                                if (imageUrl) {
                                    q.imageUrl = imageUrl; // Update in memory

                                    // PERSISTENCE FIX
                                    if (db.isMongo) {
                                        await Material.findOneAndUpdate(
                                            { id: file.id, userId, 'questions.question': q.question },
                                            { $set: { 'questions.$.imageUrl': imageUrl } }
                                        );
                                    } else {
                                        // File Store: Mark for save
                                        // We can't save on every image (too slow), so we flag it
                                        updatesMade = true;
                                        // For File Store, updating 'file' object (reference) updates 'db.files'
                                    }
                                }
                            } catch (err) { }
                        }
                    }
                }
            }

            // Batch Save for File Store
            if (updatesMade && !db.isMongo) {
                console.log("[Library] Saving generated images to File Store...");
                await saveDB({ user: { id: userId } }, db); // Pass context or mock req
            }
        }

    } catch (error) {
        console.error("Library Error:", error);
        res.status(500).json({ error: 'Failed to fetch library' });
    }
};

export const getMaterial = async (req, res) => {
    try {
        const userId = getUserID(req);
        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);

        if (!file) return res.status(404).json({ error: 'File not found' });
        res.json(file);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch material' });
    }
};

export const deleteFile = async (req, res) => {
    const fileId = req.params.id;
    console.log(`[Delete] Request received for file ID: ${fileId}`);

    try {
        const userId = getUserID(req);
        // Use Abstraction Layer
        const db = await getDB(req);

        console.log(`[Delete] DB Mode: ${db.isMongo ? 'Mongo' : 'File Store'}`);

        let fileToDelete = null;

        if (!db.isMongo) {
            // --- FILE STORE DELETION ---
            const fileIndex = db.files.findIndex(f => f.id === fileId);

            if (fileIndex === -1) {
                console.warn(`[Delete] File ${fileId} not found in File Store.`);
                return res.status(404).json({ error: 'File not found' });
            }

            fileToDelete = db.files[fileIndex];

            // Remove from array
            db.files.splice(fileIndex, 1);

            // Cleanup Buffer
            if (db.reelsBuffer && Array.isArray(db.reelsBuffer)) {
                const initialLen = db.reelsBuffer.length;
                db.reelsBuffer = db.reelsBuffer.filter(q => q.originId !== fileId);
                console.log(`[Delete] Removed ${initialLen - db.reelsBuffer.length} items from Reels Buffer.`);
            }

            // Save Changes
            await saveDB(req, db);
            console.log(`[Delete] File Store updated successfully.`);

        } else {
            // --- MONGO DELETION ---
            const file = await Material.findOne({ id: fileId, userId });
            if (!file) return res.status(404).json({ error: 'File not found' });

            fileToDelete = file;

            await Material.deleteOne({ id: fileId, userId });

            try {
                await ReelsBuffer.findOneAndUpdate(
                    { userId },
                    { $pull: { questions: { originId: fileId } } }
                );
            } catch (e) { console.error("Buffer cleanup error", e); }
        }

        // --- PHYSICAL FILE CLEANUP (Common) ---
        if (fileToDelete && fileToDelete.path) {
            try {
                const p = path.isAbsolute(fileToDelete.path) ? fileToDelete.path : path.join(PROJECT_ROOT, fileToDelete.path);
                await fs.unlink(p);
                console.log(`[Delete] Physical file unlinked: ${p}`);
            } catch (e) {
                console.warn('Could not delete physical file:', e.message);
            }
        }

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error("[Delete] Critical Error:", error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
};

export const updateCategories = async (req, res) => {
    try {
        const { categories } = req.body;
        if (!Array.isArray(categories)) {
            return res.status(400).json({ error: 'Categories must be an array' });
        }

        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.categories = categories;
        await saveDB(req, db);

        res.json({ message: 'Categories updated successfully', categories });
    } catch (error) {
        console.error('Update categories error:', error);
        res.status(500).json({ error: 'Failed to update categories' });
    }
};

export const getSummary = async (req, res) => {
    try {
        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);

        if (!file) return res.status(404).json({ error: 'File not found' });
        if (file.summary) return res.json({ summary: file.summary });

        // Generate logic
        let textToSummarize = '';
        if (file.type === 'youtube' && file.originalUrl) {
            const videoId = extractVideoId(file.originalUrl);
            const tData = await fetchYouTubeTranscript(videoId);
            textToSummarize = tData.text;
        } else if (file.path) {
            // Need to resolve path
            const p = path.isAbsolute(file.path) ? file.path : path.join(PROJECT_ROOT, file.path);
            textToSummarize = await parseDocument(p, file.mimetype || 'application/pdf');
        } else if (file.type === 'custom') {
            return res.json({ summary: 'Custom materials do not have auto-generated summaries.' });
        }

        const summary = await generateSummary(textToSummarize, undefined, file.filename);
        file.summary = summary;
        await saveDB(req, db);

        res.json({ summary });
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
};

export const updateSummary = async (req, res) => {
    try {
        const { summary } = req.body;
        if (!summary) return res.status(400).json({ error: 'Summary content is required' });

        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);
        if (!file) return res.status(404).json({ error: 'File not found' });

        file.summary = summary;
        await saveDB(req, db);

        res.json({ message: 'Summary updated successfully', summary });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update summary' });
    }
};

export const addManualQuestion = async (req, res) => {
    try {
        const { fileId, question } = req.body;
        if (!fileId || !question) return res.status(400).json({ error: 'Missing data' });

        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (!file.questions) file.questions = [];
        file.questions.push(question);

        await saveDB(req, db);
        res.json({ message: 'Question added', file });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add question' });
    }
};

export const createCustomMaterial = async (req, res) => {
    try {
        const { name, subjectEmoji } = req.body;
        if (!name) return res.status(400).json({ error: 'Material name required' });

        const db = await getDB(req);
        const newMaterial = {
            id: Date.now().toString(),
            filename: name,
            type: 'custom',
            uploadedAt: new Date().toISOString(),
            questions: [],
            subjectEmoji: subjectEmoji || '📚'
        };

        db.files.unshift(newMaterial);
        await saveDB(req, db);
        res.json({ message: 'Material created', material: newMaterial });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create material' });
    }
};

export const generateMoreQuestions = async (req, res) => {
    try {
        const fileId = req.params.id;
        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);

        if (!file) return res.status(404).json({ error: 'File not found' });

        let textContext = '';
        if (file.path || file.filename) {
            const tryPath = file.path ? (path.isAbsolute(file.path) ? file.path : path.join(PROJECT_ROOT, file.path)) : path.join(PROJECT_ROOT, 'uploads', file.filename);
            try {
                await fs.access(tryPath);
                textContext = await parseDocument(tryPath);
            } catch (e) { }
        }

        if (!textContext && file.transcript) textContext = file.transcript;
        if (!textContext) {
            textContext = `Title: ${file.filename}\n\n`;
            if (file.summary) textContext += `Summary: ${file.summary}\n\n`;
            if (file.questions && file.questions.length > 0) {
                const existingQs = file.questions.slice(0, 5).map(q => q.question).join('\n- ');
                textContext += `Content Context (Existing Questions):\n- ${existingQs}`;
            }
        }

        if (!textContext || textContext.length < 50) return res.status(400).json({ error: 'Not enough content.' });

        let apiKey = req.headers['x-api-key'] || process.env.GEMINI_API_KEY;
        const { mode } = req.body;
        const avoidList = (file.questions || []).map(q => q.question);

        const result = await generateQuestions(textContext, apiKey, 5, file.filename, '', null, mode || 'standard', avoidList);

        if (!result.questions || result.questions.length === 0) throw new Error('AI failed to generate questions');

        if (!file.questions) file.questions = [];
        file.questions.push(...result.questions);
        await saveDB(req, db);

        res.json({ success: true, newQuestions: result.questions });

        // Background Img Gen
        (async () => {
            const userId = getUserID(req);
            for (const question of result.questions) {
                if (!question.imageUrl) {
                    const imageUrl = await generateQuestionImage(question, userId, apiKey);
                    if (imageUrl) question.imageUrl = imageUrl;
                }
            }
            await saveDB(req, db);
        })();

    } catch (err) {
        console.error('Generate More Error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const toggleLike = async (req, res) => {
    try {
        const { fileId, questionIndex } = req.body;
        const userData = await getDB(req);

        // Find file
        const file = userData.files.find(f => f.id === fileId);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Find question
        if (questionIndex < 0 || questionIndex >= file.questions.length) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Toggle Like
        const question = file.questions[questionIndex];
        question.isLiked = !question.isLiked;

        await saveDB(req, userData);

        res.json({ success: true, isLiked: question.isLiked });
    } catch (error) {
        console.error('Toggle Like Error:', error);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
};
