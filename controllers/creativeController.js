import { generateQuestionsForCreativeWork } from '../aiService.js';
import { generateQuestionImage } from '../services/imageService.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';
import { logActivity } from '../utils/logger.js';

export const generateCreativeQuiz = async (req, res) => {
    try {
        const { title, author, type, apiKey } = req.body;

        if (!title || !type) {
            return res.status(400).json({ error: 'Title and Type are required' });
        }

        console.log(`Processing Creative Work: ${title} (${type}) [Author: ${author || 'N/A'}]...`);

        const startAI = Date.now();
        const aiResult = await generateQuestionsForCreativeWork(title, author, type, apiKey, 10);
        console.log(`Creative Gen time: ${Date.now() - startAI}ms`);

        const db = await getDB(req);
        const fileId = Date.now().toString();

        // Add originId to each question for proper polling
        const questionsWithOrigin = aiResult.questions.map(q => ({
            ...q,
            originId: fileId,
            originFilename: aiResult.suggestedTitle
        }));

        const newFileEntry = {
            id: fileId,
            filename: aiResult.suggestedTitle,
            type: 'creative',
            originalUrl: null,
            uploadedAt: new Date().toISOString(),
            questions: questionsWithOrigin,
            subjectEmoji: aiResult.subjectEmoji,
            categories: aiResult.categories || [],
            summary: `Creative study set for ${title}`,
            creativeType: type
        };

        db.files.unshift(newFileEntry);
        const userId = getUserID(req);
        await logActivity(userId, 'upload', { filename: newFileEntry.filename, type: 'creative' });
        await saveDB(req, db);

        res.json({ ...newFileEntry, isMock: aiResult.isMock });

        console.log(`[Creative] Generating images for ${newFileEntry.questions.length} questions with concurrency control...`);
        (async () => {
            try {
                const pLimit = (await import('p-limit')).default;
                const limit = pLimit(3); // Max 3 concurrent image generations

                const apiKeyParams = req.body.apiKey || process.env.GEMINI_API_KEY;

                const imageGenerationTasks = newFileEntry.questions.map((question, index) =>
                    limit(async () => {
                        if (!question.imageUrl) {
                            try {
                                console.log(`[Creative] Generating image ${index + 1}/${newFileEntry.questions.length}...`);
                                const imageUrl = await generateQuestionImage(question, userId, apiKeyParams);
                                if (imageUrl) {
                                    question.imageUrl = imageUrl;
                                    console.log(`[Creative] ✅ Image ${index + 1} generated`);
                                } else {
                                    console.warn(`[Creative] ⚠️ Image ${index + 1} generation returned null`);
                                }
                            } catch (imgErr) {
                                console.error(`[Creative] ❌ Image ${index + 1} generation failed:`, imgErr.message);
                                // Don't crash - continue with other images
                            }
                        }
                    })
                );

                await Promise.all(imageGenerationTasks);
                await saveDB(req, db);

                const successCount = newFileEntry.questions.filter(q => q.imageUrl).length;
                console.log(`[Creative] Images complete: ${successCount}/${newFileEntry.questions.length} successful`);
            } catch (err) {
                console.error('[Creative] Image generation error:', err);
            }
        })();

    } catch (error) {
        console.error('Error processing Creative Work:', error);
        res.status(500).json({ error: error.message || 'Failed to process creative work' });
    }
};
