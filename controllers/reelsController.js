import path from 'path';
import { ReelsBuffer } from '../models/ReelsBuffer.js';
import { generateQuestionImage } from '../services/imageService.js';
import { generateQuestions, generateSimilarQuestions } from '../services/questionGenerator.js';
import { parseDocument } from '../services/documentParser.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';
import { log } from '../utils/log.js';

// Helper: Process Background Images (Memory + Persistence)
async function processBackgroundImages(questions, userId, req) {
    if (!questions || questions.length === 0) return;

    (async () => {
        try {
            log.info(`[Reels] Starting background image gen for ${questions.length} items...`);
            const db = await getDB(req);
            let updatesMade = false;

            for (const q of questions) {
                if (q.question && !q.imageUrl) {
                    try {
                        const imageUrl = await generateQuestionImage(q, userId, process.env.GEMINI_API_KEY);
                        if (imageUrl) {
                            q.imageUrl = imageUrl;

                            if (db.reelsBuffer) {
                                const bufferItem = db.reelsBuffer.find(b => b.question === q.question || b.question.question === q.question.question);
                                if (bufferItem) {
                                    bufferItem.imageUrl = imageUrl;
                                    updatesMade = true;
                                }
                            }

                            if (q.originId && db.files) {
                                const file = db.files.find(f => f.id === q.originId);
                                if (file && file.questions) {
                                    const fileQ = file.questions.find(fq => fq.question === q.question || fq.question === q.question.question);
                                    if (fileQ) {
                                        fileQ.imageUrl = imageUrl;
                                        updatesMade = true;
                                    }
                                }
                            }

                            if (db.isMongo) {
                                await ReelsBuffer.findOneAndUpdate(
                                    { userId, 'questions.question.question': (q.question.question || q.question) },
                                    { $set: { 'questions.$.imageUrl': imageUrl } }
                                );
                            }
                        }
                    } catch (e) {
                        log.error(`[Reels] Image Gen Failed for question:`, e.message);
                    }
                }
            }

            if (updatesMade && !db.isMongo) {
                log.info("[Reels] Saving generated images to File Store...");
                await saveDB(req, db);
            }
        } catch (err) {
            log.error("[Reels] Background Process Error:", err);
        }
    })();
}

export const getPregeneratedReels = async (req, res) => {
    try {
        const db = await getDB(req);
        const buffer = db.reelsBuffer || [];

        res.json(buffer);

        if (buffer.length > 0) {
            const userId = getUserID(req);
            processBackgroundImages(buffer, userId, req);
        }
    } catch (err) {
        log.error('Failed to fetch pregenerated reels:', err);
        res.status(500).json({ error: 'Failed' });
    }
};

export const consumeReels = async (req, res) => {
    try {
        const { questionTexts } = req.body;
        if (!Array.isArray(questionTexts)) return res.status(400).json({ error: 'Array required' });

        const db = await getDB(req);
        if (!db.reelsBuffer) db.reelsBuffer = [];

        const originalCount = db.reelsBuffer.length;
        db.reelsBuffer = db.reelsBuffer.filter(b => !questionTexts.includes(b.question.question));

        if (db.reelsBuffer.length !== originalCount) {
            await saveDB(req, db);
        }

        res.json({ success: true, remaining: db.reelsBuffer.length });
    } catch (err) {
        log.error('Failed to consume reels:', err);
        res.status(500).json({ error: 'Failed' });
    }
};

export const spawnQuestions = async (req, res) => {
    try {
        const { question, context, type, originId } = req.body;
        if (!question) return res.status(400).json({ error: "Missing question" });

        const keyToUse = process.env.GEMINI_API_KEY || req.body.apiKey;

        let richContext = context || "";
        const db = await getDB(req);
        let sourceTitle = "Unknown Source";
        let existingQuestions = [];

        if (originId && db.files) {
            const file = db.files.find(f => f.id === originId);
            if (file) {
                sourceTitle = file.filename;
                if (file.questions) existingQuestions = file.questions.map(q => q.question);

                let fileText = "";
                if (file.transcript && file.transcript.length > 100) fileText = file.transcript;
                else if (file.summary) fileText = `Summary: ${file.summary}`;

                if (fileText.length > 20) richContext = fileText.substring(0, 20000);
            }
        }

        if (!richContext || richContext.length < 20) {
            richContext = `Topic: ${question}`;
        }

        let newQuestions = [];
        try {
            newQuestions = await generateSimilarQuestions(question, richContext, type, keyToUse, existingQuestions, sourceTitle);
        } catch (aiErr) {
            log.error("[Spawn] AI Error:", aiErr);
            return res.status(500).json({ error: "AI Generation Failed" });
        }

        if (newQuestions && newQuestions.length > 0) {
            const userId = getUserID(req);

            const processed = newQuestions.map(q => ({
                question: q,
                originId: originId || 'spawned',
                spawnedFrom: question,
                sourceTitle: sourceTitle,
                originFilename: sourceTitle,
                materialName: sourceTitle
            }));

            log.info(`[Spawn] Generating images for ${processed.length} questions...`);

            const pLimit = (await import('p-limit')).default;
            const limit = pLimit(2);

            const imageGenerationTasks = processed.map((q, index) =>
                limit(async () => {
                    try {
                        const imageUrl = await generateQuestionImage(q, userId, keyToUse);
                        if (imageUrl) {
                            q.imageUrl = imageUrl;
                        }
                    } catch (imgErr) {
                        log.error(`[Spawn] Image ${index + 1} generation failed:`, imgErr.message);
                    }
                })
            );

            await Promise.all(imageGenerationTasks);

            if (!db.reelsBuffer) db.reelsBuffer = [];
            db.reelsBuffer.unshift(...processed);

            if (originId && db.files) {
                const file = db.files.find(f => f.id === originId);
                if (file) {
                    if (!file.questions) file.questions = [];
                    file.questions.push(...newQuestions);
                }
            }

            await saveDB(req, db);
            res.json({ success: true, questions: processed });
        } else {
            res.json({ success: false, questions: [] });
        }

    } catch (err) {
        log.error('Failed to spawn:', err);
        res.status(500).json({ error: 'Failed' });
    }
};

export const generateMoreReels = async (req, res) => {
    try {
        const { apiKey } = req.body;
        const keyToUse = apiKey || process.env.GEMINI_API_KEY;
        const db = await getDB(req);

        const candidates = db.files.filter(f => f.path || (f.type === 'youtube' && f.originalUrl));
        if (candidates.length === 0) return res.json({ questions: [] });

        const userInterestsStr = req.headers['x-user-interests'];
        let targetInterests = [];
        try { targetInterests = JSON.parse(decodeURIComponent(userInterestsStr)); } catch (e) { }

        const shuffled = [...candidates].sort(() => 0.5 - Math.random());
        const selectedFiles = shuffled.slice(0, 3);

        const results = await Promise.all(selectedFiles.map(async (file) => {
            let text = "";
            if (file.path) {
                const p = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
                try { text = await parseDocument(p); } catch (e) { }
            } else if (file.transcript) {
                text = file.transcript;
            }

            if (text && text.length > 50) {
                try {
                    const aiRes = await generateQuestions(text, keyToUse, 2, file.filename);
                    if (aiRes.questions) {
                        const newQs = aiRes.questions.map(q => ({
                            ...q, originFilename: file.filename, originId: file.id
                        }));
                        if (!file.questions) file.questions = [];
                        file.questions.push(...newQs);
                        return newQs;
                    }
                } catch (e) { }
            }
            return [];
        }));

        const questionsAccumulator = results.flat();
        await saveDB(req, db);

        processBackgroundImages(questionsAccumulator, getUserID(req), req);

        res.json({ questions: questionsAccumulator });

    } catch (err) {
        log.error("Reels Refill Error:", err);
        res.status(500).json({ error: err.message });
    }
};
