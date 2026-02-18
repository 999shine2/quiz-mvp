import { extractVideoId, fetchVideoMetadata, fetchYouTubeTranscript } from '../services/youtubeService.js';
import { generateQuestions, generateSummary } from '../aiService.js';
import { generateQuestionImage } from '../services/imageService.js';
import { getDB, saveDB } from '../utils/dbShim.js'; // Will create this utility
import { getUserID } from '../utils/user.js';
import { logActivity } from '../utils/logger.js'; // Will create this util

export const generateYouTubeQuiz = async (req, res) => {
    try {
        const { url } = req.body;
        // Server API Key
        const apiKey = process.env.GEMINI_API_KEY;

        if (!url) {
            return res.status(400).json({ error: 'No YouTube URL provided' });
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        console.log(`Processing YouTube URL: ${url}, ID: ${videoId}`);

        let fetchedTitle = null;
        let fetchedDescription = "";
        let transcriptData = { text: "" };

        try {
            const metadata = await fetchVideoMetadata(videoId);
            fetchedTitle = metadata.title;
            fetchedDescription = metadata.description;
        } catch (e) {
            console.warn('[YouTube] Metadata fetch failed:', e);
        }

        let transcriptError = null;
        try {
            transcriptData = await fetchYouTubeTranscript(videoId);
        } catch (e) {
            console.warn('[YouTube] Transcript fetch failed:', e.message);
            transcriptError = e.message;
            transcriptData = { text: "" };
        }

        if (!transcriptData.text || transcriptData.text.length < 50) {
            if (fetchedDescription && fetchedDescription.length > 50) {
                transcriptData.text = `(Transcript Unavailable. Using Video Description)\n\n${fetchedDescription}`;
            } else {
                transcriptData.text = `(Transcript Unavailable)\n\nTitle: ${fetchedTitle || 'Unknown'}`;
            }
        }

        const db = await getDB(req);
        const existingFiles = db.files || [];
        let relatedContext = "";

        const contextFiles = existingFiles.slice(0, 3);
        if (contextFiles.length > 0) {
            relatedContext = contextFiles.map(f =>
                `Title: ${f.filename}\nSummary: ${f.summary || "No summary."}`
            ).join("\n\n---\n\n");
        }

        const startAI = Date.now();
        console.log('Generating questions with AI...');

        let textToAnalyze = "";
        let qualitySource = "UNKNOWN";

        if (transcriptData.text && transcriptData.text.length > 50) {
            textToAnalyze = transcriptData.text;
            qualitySource = "TRANSCRIPT";
        } else {
            textToAnalyze = `(Transcript Missing). Title: "${fetchedTitle}".`;
            qualitySource = "METADATA_FALLBACK";
        }

        const aiResult = await generateQuestions(textToAnalyze, apiKey, 5, fetchedTitle, relatedContext);
        const autoSummary = await generateSummary(textToAnalyze, apiKey, fetchedTitle);
        console.log(`Generated in ${Date.now() - startAI}ms`);

        let finalTitle = aiResult.suggestedTitle || fetchedTitle;
        if (!finalTitle) finalTitle = `YouTube Video (${videoId})`;

        const newFileEntry = {
            id: Date.now().toString(),
            filename: finalTitle,
            type: 'youtube',
            originalUrl: url,
            uploadedAt: new Date().toISOString(),
            questions: aiResult.questions,
            subjectEmoji: aiResult.subjectEmoji,
            categories: aiResult.categories || [],
            transcript: transcriptData.text,
            summary: autoSummary || aiResult.summary || '',
            transcriptLanguage: transcriptData.language || 'en',
            transcriptIsGenerated: transcriptData.isGenerated || false
        };

        db.files.unshift(newFileEntry);
        const userId = getUserID(req);
        await logActivity(userId, 'upload', { filename: newFileEntry.filename });
        await saveDB(req, db);

        res.json({
            ...newFileEntry,
            isMock: aiResult.isMock,
            transcriptError: transcriptError,
            qualitySource: qualitySource
        });

        // Background Image Generation
        (async () => {
            try {
                let lastSave = Date.now();

                for (const question of newFileEntry.questions) {
                    if (!question.imageUrl) {
                        const imageUrl = await generateQuestionImage(question, userId, apiKey);
                        if (imageUrl) {
                            question.imageUrl = imageUrl;

                            // Throttle Saves: Only save every 2 seconds or if it's the last one
                            if (Date.now() - lastSave > 2000) {
                                await saveDB(req, db);
                                lastSave = Date.now();
                                console.log('[YouTube] Incremental Save triggered');
                            }
                        }
                    }
                }
                // Final Save
                await saveDB(req, db);
                console.log(`[YouTube] All images generated and saved`);
            } catch (err) {
                console.error('[YouTube] Image generation error:', err);
            }
        })();

    } catch (error) {
        console.error('Error processing YouTube:', error);
        res.status(500).json({ error: error.message || 'Failed to process video' });
    }
};

export const getYouTubeTranscript = async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided' });

        const videoId = extractVideoId(url);
        if (!videoId) return res.status(400).json({ error: 'Invalid URL' });

        const metadata = await fetchVideoMetadata(videoId);
        const transcriptData = await fetchYouTubeTranscript(videoId);

        res.json({
            title: metadata.title || 'YouTube Video',
            transcript: transcriptData.text,
            language: transcriptData.language
        });
    } catch (error) {
        console.error('Error fetching transcript:', error);
        res.status(500).json({ error: error.message });
    }
};

