import 'dotenv/config'; // Load environment variables - MOVED TO TOP
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDocument } from './documentParser.js';
import { generateQuestions, generateSummary, generateQuestionsForCreativeWork, generateImagePrompt, generateImageWithImagen, generateImageWithGeminiFlash, generateImageWithPollinations } from './aiService.js';
import * as aiService from './aiService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from '@notionhq/client';
import { parseStringPromise } from 'xml2js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Log Key Status
console.log("------------------------------------------------");
console.log(`Loaded GEMINI_KEY Length: ${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : "MISSING"}`);
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith("AIza")) {
    console.log("GEMINI_KEY Check: PROBABLY VALID FORMAT");
} else {
    console.log("GEMINI_KEY Check: INVALID OR MISSING");
}
console.log(`Loaded POLLINATIONS_KEY: ${process.env.POLLINATIONS_API_KEY ? "OK (Hidden)" : "MISSING"}`);
console.log(`Loaded POLLINATIONS_KEY: ${process.env.POLLINATIONS_API_KEY ? "OK (" + process.env.POLLINATIONS_API_KEY.substring(0, 5) + "...)" : "MISSING"}`);
console.log("------------------------------------------------");

// Re-applying robust API key check just in case
if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ WARNING: GEMINI_API_KEY is not set in environment variables.");
}

// Middleware
// DEBUG: Log ALL requests to trace the 500 error - MOVED TO TOP
app.use((req, res, next) => {
    if (req.method === 'POST' && req.url.includes('spawn')) {
        console.log(`[RAW REQUEST] ${req.method} ${req.url}`);
    }
    next();
});

app.use(cors());
app.get('/favicon.ico', (req, res) => res.status(204));
app.use(express.json()); // Enable JSON body parsing
app.use(express.static(path.join(__dirname, 'public')));


// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads/'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Database path
const USERS_DIR = path.join(__dirname, 'data/users/');
async function initDB() { try { await fs.mkdir(USERS_DIR, { recursive: true }); } catch (e) { console.error(e); } }
initDB();

// Load YouTube Playlists Data
let YOUTUBE_PLAYLISTS = {};
(async () => {
    try {
        const pPath = path.join(__dirname, 'data/youtube_playlists.json');
        const data = await fs.readFile(pPath, 'utf8');
        YOUTUBE_PLAYLISTS = JSON.parse(data);
        console.log("✅ Loaded YouTube Playlists Data");
    } catch (e) {
        console.warn("⚠️ Failed to load youtube_playlists.json:", e.message);
    }
})();



// Helper to read/write DB



// Helper: Get User ID from Request
function getUserID(req) {
    let userId = req.headers['x-user-id'];
    console.log('DEBUG: getUserID header:', userId);
    if (!userId) return 'anonymous';

    try {
        // Decode URI component because client sends %EC%84%9C...
        userId = decodeURIComponent(userId);
    } catch (e) {
        console.error('DEBUG: decodeURIComponent failed for userId:', userId);
    }

    return userId.replace(/[^a-zA-Z0-9_\-%.\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]/g, '-');
}

async function getDB(req) {
    const userId = getUserID(req);
    const userPath = path.join(USERS_DIR, `${userId}.json`);
    try {
        const data = await fs.readFile(userPath, 'utf8');
        const db = JSON.parse(data);
        if (!db.reelsBuffer) db.reelsBuffer = [];
        return db;
    } catch { return { files: [], activityLog: [], reelsBuffer: [] }; }
}

// Helper: Fetch News for Interest (Returns ARRAY of top 5)
async function fetchNewsForInterest(interest) {
    try {
        // TOPIC MAP
        const TOPICS = {
            "business": "BUSINESS",
            "technology": "TECHNOLOGY",
            "science": "SCIENCE",
            "health": "HEALTH",
            "world": "WORLD",
            "world news": "WORLD",
            "politics": "NATION", // Politics often maps to Nation in US edition
            "entertainment": "ENTERTAINMENT",
            "sports": "SPORTS"
        };

        const key = interest.toLowerCase();
        let rssUrl = "";

        if (TOPICS[key]) {
            rssUrl = `https://news.google.com/rss/headlines/section/topic/${TOPICS[key]}?hl=en-US&gl=US&ceid=US:en`;
            console.log(`[News Source] Using Topic Feed for ${interest}: ${TOPICS[key]}`);
        } else {
            const encoded = encodeURIComponent(interest);
            rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
            console.log(`[News Source] Using Search Feed for ${interest}`);
        }

        const res = await fetch(rssUrl);
        const xml = await res.text();
        const parsed = await parseStringPromise(xml);

        if (!parsed.rss || !parsed.rss.channel || !parsed.rss.channel[0].item) {
            return [];
        }

        const items = parsed.rss.channel[0].item;
        if (items.length === 0) return [];

        // TRUSTED SOURCES LIST
        const TRUSTED_SOURCES = [
            "BBC", "CNN", "Reuters", "The New York Times", "Bloomberg",
            "TechCrunch", "The Verge", "Wired", "Nature", "Science",
            "The Wall Street Journal", "Forbes", "The Guardian", "CNBC",
            "NPR", "National Geographic", "Scientific American", "The Economist",
            "Harvard Business Review", "MIT Technology Review"
        ];

        // Format items
        const formattedItems = items.map(item => ({
            title: item.title[0],
            link: item.link[0],
            pubDate: item.pubDate ? item.pubDate[0] : new Date().toISOString(),
            source: item.source ? item.source[0]._ : "Google News",
            sourceUrl: item.source ? item.source[0].$.url : ""
        }));

        // 1. Filter for Trusted
        const trusted = formattedItems.filter(i => TRUSTED_SOURCES.some(t => i.source.includes(t)));

        // 2. Filter for Others (Popular/Top)
        const others = formattedItems.filter(i => !TRUSTED_SOURCES.some(t => i.source.includes(t)));

        // 3. Combine: Prioritize Trusted, fill rest with Others
        // Take up to 10 candidates to return (caller will slice 5)
        let candidates = [...trusted, ...others];

        // Deduplicate by title (basic check)
        const seen = new Set();
        const unique = [];
        for (const c of candidates) {
            if (!seen.has(c.title)) {
                seen.add(c.title);
                unique.push(c);
            }
        }

        // Return top 5 unique
        return unique.slice(0, 5);

    } catch (e) {
        console.error('News fetch failed:', e);
        return [];
    }
}

// Helper: Fetch Article Text (Simple)
async function fetchArticleContent(url) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        // Very basic extraction: remove scripts/styles, get paragraphs
        // ideally use 'cheerio' or 'jsdom' but trying to minimize deps if possible,
        // actually 'mammoth' is for docx.
        // Let's use a regex approach for now or just rely on title if extraction fails.
        // Better: use 'read-url-content' tool equivalent logic? No, must be in code.
        // Let's regex strip.
        return html.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, "")
            .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, "")
            .replace(/<[^>]+>/g, "\n")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 5000); // Limit context
    } catch (e) {
        return "";
    }
}

async function refillUserReelsBuffer(req, db) {
    const userId = getUserID(req);
    const BUFFER_TARGET = 10; // Increased to show more variety

    if (db.reelsBuffer.length >= BUFFER_TARGET) return;

    console.log(`[Reels Refill] Starting LOCAL ONLY refill for user: ${userId}`);

    // Collect ALL Local Questions
    let allQuestions = [];
    if (db.files && db.files.length > 0) {
        allQuestions = db.files.flatMap(f => f.questions.map(q => ({
            ...q,
            originId: f.id,
            fileTitle: f.filename,
            sourceTitle: f.filename, // Aliased for client compatibility
            materialName: f.filename, // Aliased for client tracking
            originFilename: f.filename // Aliased for client tracking
        })));
    }

    if (allQuestions.length === 0) {
        console.log("[Reels] No local questions found to refill buffer.");
        return;
    }

    // Shuffle helper
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    };

    // Filter out questions already in buffer
    const bufferQuestionTexts = new Set(db.reelsBuffer.map(b => b.question.question));
    const availableQuestions = allQuestions.filter(q => !bufferQuestionTexts.has(q.question));

    if (availableQuestions.length === 0) {
        console.log("[Reels] All local questions are already in buffer.");
        return;
    }

    // Shuffle available questions to pick random ones
    shuffleArray(availableQuestions);

    // Fill buffer up to target
    while (db.reelsBuffer.length < BUFFER_TARGET && availableQuestions.length > 0) {
        const nextQ = availableQuestions.pop();

        db.reelsBuffer.push({
            question: nextQ,
            imageUrl: nextQ.forcedImageUrl || null,
            fileId: nextQ.originId,
            type: 'local',
            generatedAt: new Date().toISOString()
        });
        console.log(`[Reels] Added LOCAL question: "${nextQ.question.substring(0, 30)}..."`);
    }

    await saveDB(req, db);
}



async function saveDB(req, data) {
    const userId = getUserID(req);
    const userPath = path.join(USERS_DIR, `${userId}.json`);
    await fs.writeFile(userPath, JSON.stringify(data, null, 2));
}


// Helper: Extract video ID from URL
function extractVideoId(url) {
    try {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    } catch (e) {
        return null;
    }
}

// Helper: Fetch YouTube Title via NoEmbed (public API)
// Helper: Fetch YouTube Metadata (Title + Description)
async function fetchVideoMetadata(videoId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
            const snippet = data.items[0].snippet;
            return {
                title: snippet.title,
                description: snippet.description || ""
            };
        }
        return { title: null, description: "" };
    } catch (e) {
        console.error('Failed to fetch metadata:', e);
        return { title: null, description: "" };
    }
}

// Helper: Fetch YouTube transcript using Python
async function fetchYouTubeTranscript(videoId) {



    const pythonScript = path.join(__dirname, 'fetch_transcript.py');
    const command = `python3 "${pythonScript}" "${videoId}"`;

    try {
        const { stdout, stderr } = await execAsync(command);

        // Filter out SSL warnings
        const lines = stdout.split('\n').filter(line =>
            !line.includes('NotOpenSSLWarning') &&
            !line.includes('urllib3') &&
            !line.includes('warnings.warn') &&
            line.trim().length > 0
        );

        const jsonOutput = lines.join('\n').trim();
        const result = JSON.parse(jsonOutput);

        if (!result.success) {
            throw new Error(result.error);
        }

        return {
            text: result.text,
            segments: result.segments,
            language: result.language,
            isGenerated: result.is_generated
        };
    } catch (error) {
        console.error('Python script error:', error);
        throw new Error('Failed to fetch transcript: ' + error.message);
    }
}

// Helper: Fetch Video from Playlist
async function fetchYouTubeVideoAndTranscript(playlistId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    try {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.items || data.items.length === 0) return null;

        // --- FILTER BY DURATION START ---
        // 1. Collect all Video IDs
        const videoItemsMap = {}; // id -> item
        const videoIds = [];
        data.items.forEach(item => {
            const vid = item.contentDetails.videoId;
            videoIds.push(vid);
            videoItemsMap[vid] = item;
        });

        // 2. Fetch Duration for these IDs
        let filteredItems = [];
        try {
            const durationUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
            const durRes = await fetch(durationUrl);
            const durData = await durRes.json();

            if (durData.items) {
                // Helper to parse ISO 8601 duration (PT1H2M10S) to seconds
                const parseDuration = (duration) => {
                    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
                    if (!match) return 0;
                    const hours = (parseInt(match[1]) || 0);
                    const minutes = (parseInt(match[2]) || 0);
                    const seconds = (parseInt(match[3]) || 0);
                    return (hours * 3600) + (minutes * 60) + seconds;
                };

                durData.items.forEach(vidDetails => {
                    const seconds = parseDuration(vidDetails.contentDetails.duration);
                    // FILTER: > 5 minutes (300 seconds)
                    if (seconds > 300) {
                        const originalItem = videoItemsMap[vidDetails.id];
                        if (originalItem) filteredItems.push(originalItem);
                    }
                });
            }
        } catch (durErr) {
            console.warn("[YouTube] Failed to filter by duration, using all videos.", durErr);
            filteredItems = data.items; // Fallback
        }

        if (filteredItems.length === 0) {
            console.warn("[YouTube] No videos > 5 mins found in recent uploads. Relaxing filter.");
            filteredItems = data.items;
        }

        console.log(`[YouTube] Filtered Pool: ${filteredItems.length} videos (from 50) > 5 mins.`);

        // Pick Random Video from Filtered List
        const randomItem = filteredItems[Math.floor(Math.random() * filteredItems.length)];
        const videoId = randomItem.contentDetails.videoId;
        const title = randomItem.snippet.title;
        // Check for thumbnails
        const thumbnail = randomItem.snippet.thumbnails?.high?.url || randomItem.snippet.thumbnails?.medium?.url || randomItem.snippet.thumbnails?.default?.url;

        // Fetch Transcript
        let transcriptText = "";
        try {
            const transcriptData = await fetchYouTubeTranscript(videoId);
            if (transcriptData && transcriptData.text && transcriptData.text.length > 50) {
                transcriptText = transcriptData.text;
            }
        } catch (err) {
            console.warn(`[YouTube] Transcript fetch failed for ${videoId}, using fallback.`);
        }

        // Fallback if no transcript
        if (!transcriptText) {
            console.log(`[YouTube] Using Title Fallback for ${videoId}`);
            transcriptText = `(Transcript unavailable). The video is titled "${title}" by channel "${randomItem.snippet.channelTitle}". It likely discusses topics related to this title.`;
        }

        return {
            videoId,
            title,
            thumbnail,
            transcript: transcriptText
        };

    } catch (e) {
        console.error("Error fetching video from playlist:", e);
        return null;
    }
}

// Routes

// Toggle Like Status of a Question
app.post('/api/toggle-like', async (req, res) => {
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
});

// Generate AI Image Prompt
app.post('/api/generate-image-prompt', async (req, res) => {
    try {
        let { question, explanation, apiKey, fullQuestion, context } = req.body;

        // Robustness: If fullQuestion object is passed instead of flat fields
        if (fullQuestion && typeof fullQuestion === 'object') {
            question = question || fullQuestion.question;
            explanation = explanation || fullQuestion.explanation;
        }

        if (!question) {
            console.error('[Image Prompt API] Error: No question provided in body:', req.body);
            return res.status(400).json({ error: 'Question required' });
        }

        // Incorporate context if available
        const questionWithContext = context ? `[Context: ${context}] ${question}` : question;

        console.log(`[Image Prompt API] Generating for question: "${questionWithContext.substring(0, 50)}..."`);

        const prompt = await generateImagePrompt(questionWithContext, apiKey, explanation);
        console.log(`[Image Prompt API] Result: ${prompt}`);
        res.json({ prompt });
    } catch (error) {
        console.error('Prompt generation failed:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Generate AI Image
// Supports both GET (for direct img src) and POST (for fetching base64/blob)
// [Removed Duplicate Legacy /api/generate-image handler]
// The correct, robust handler with caching and translation is at the bottom of the file.


// Upload file and generate questions
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { apiKey } = req.body;

        const startParse = Date.now();
        console.log(`Parsing file: ${req.file.originalname}...`);
        const text = await parseDocument(req.file.path, req.file.mimetype);
        console.log(`Parsed in ${Date.now() - startParse}ms`);

        // --- CONTEXT RETRIEVAL ---
        const db = await getDB(req);
        const existingFiles = db.files || [];
        let relatedContext = "";

        // Pick recent 3 files for context
        const contextFiles = existingFiles.slice(0, 3);
        if (contextFiles.length > 0) {
            relatedContext = contextFiles.map(f =>
                `Title: ${f.filename}\nSummary: ${f.summary || "No summary."}`
            ).join("\n\n---\n\n");
            console.log(`Included context from ${contextFiles.length} files.`);
        }

        const startAI = Date.now();
        console.log('Generating questions with AI (Count: 5, with Context)...');

        // Request 5 questions to satisfy 2:2:1 ratio
        const [aiResult, autoSummary] = await Promise.all([
            generateQuestions(text, apiKey, 5, req.file.originalname, relatedContext),
            generateSummary(text, apiKey, req.file.originalname)
        ]);

        console.log(`Generated in ${Date.now() - startAI}ms`);
        const newFileEntry = {
            id: Date.now().toString(),
            filename: req.file.originalname,
            path: req.file.path,
            uploadedAt: new Date().toISOString(),
            questions: aiResult.questions,
            subjectEmoji: aiResult.subjectEmoji,
            summary: autoSummary
        };

        db.files.unshift(newFileEntry);
        await logActivity(db, 'upload', { filename: newFileEntry.filename });
        await saveDB(req, db);

        res.json({ ...newFileEntry, isMock: aiResult.isMock });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: error.message || 'Failed to process file' });
    }
});

// Update File Metadata (Rename)
app.post('/api/files/update', async (req, res) => {
    try {
        const { fileId, filename } = req.body;
        if (!fileId || !filename) {
            return res.status(400).json({ error: 'fileId and filename are required' });
        }

        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const oldName = file.filename;
        file.filename = filename.trim();

        await logActivity(db, 'rename_file', { fileId, oldName, newName: file.filename });
        await saveDB(req, db);

        console.log(`Renamed file ${fileId}: "${oldName}" -> "${file.filename}"`);
        res.json({ success: true, file });

    } catch (error) {
        console.error('Update file error:', error);
        res.status(500).json({ error: 'Failed to update file' });
    }
});

// Youtube route
app.post('/api/youtube', async (req, res) => {
    try {
        const { url } = req.body;
        // CRITICAL FIX: Ignore client-side apiKey (which might be stale/expired) and use the valid server env var.
        const apiKey = process.env.GEMINI_API_KEY;

        if (!url) {
            return res.status(400).json({ error: 'No YouTube URL provided' });
        }

        console.log(`Processing YouTube URL: ${url}...`);

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        console.log(`Extracted video ID: ${videoId}`);

        // Fetch Title & Transcript concurrently
        // Fetch Title & Transcript
        // Fetch Title & Transcript
        console.log('Fetching transcript and metadata...');
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

        try {
            transcriptData = await fetchYouTubeTranscript(videoId);
        } catch (e) {
            console.warn('[YouTube] Transcript fetch failed (IP Block probable):', e.message);
            transcriptData = { text: "" };
        }

        // FALLBACK: Use Description if Transcript is empty
        if (!transcriptData.text || transcriptData.text.length < 50) {
            console.log("[YouTube] Transcript missing. Using Description as fallback.");
            if (fetchedDescription && fetchedDescription.length > 50) {
                transcriptData.text = `(Transcript Unavailable. Using Video Description)\n\n${fetchedDescription}`;
            } else {
                transcriptData.text = `(Transcript Unavailable)\n\nTitle: ${fetchedTitle || 'Unknown'}`;
            }
        }

        /* 
           Combined Promise.all was brittle because if one failed, both failed. 
           Separated them to allow partial success.
        */

        console.log(`Title from API: ${fetchedTitle || 'None'}`);
        console.log(`Transcript length: ${transcriptData.text.length} characters`);

        // --- CONTEXT RETRIEVAL ---
        const db = await getDB(req);
        const existingFiles = db.files || [];
        let relatedContext = "";

        // Pick recent 3 files for context
        const contextFiles = existingFiles.slice(0, 3);
        if (contextFiles.length > 0) {
            relatedContext = contextFiles.map(f =>
                `Title: ${f.filename}\nSummary: ${f.summary || "No summary."}`
            ).join("\n\n---\n\n");
            console.log(`Included context from ${contextFiles.length} files.`);
        }

        // Generate questions
        const startAI = Date.now();
        console.log('Generating questions with AI (Count: 10, with Context)...');

        // Fallback text if transcript is empty
        const textToAnalyze = transcriptData.text && transcriptData.text.length > 50
            ? transcriptData.text
            : `(Transcript Missing). The video title is "${fetchedTitle}". Please generate questions based on this title and general knowledge about the topic.`;

        // Request 5 questions + Summary
        const [aiResult, autoSummary] = await Promise.all([
            generateQuestions(textToAnalyze, apiKey, 5, fetchedTitle, relatedContext),
            generateSummary(textToAnalyze, apiKey, fetchedTitle)
        ]);
        console.log(`Generated in ${Date.now() - startAI}ms`);

        // Determine Final Title
        let finalTitle = aiResult.suggestedTitle || fetchedTitle;
        if (!finalTitle) finalTitle = `YouTube Video (${videoId})`;

        // Save to DB
        const newFileEntry = {
            id: Date.now().toString(),
            filename: finalTitle,
            type: 'youtube',
            originalUrl: url,
            uploadedAt: new Date().toISOString(),
            questions: aiResult.questions,
            subjectEmoji: aiResult.subjectEmoji,
            categories: aiResult.categories || [],
            // Store transcript for reuse
            transcript: transcriptData.text,
            summary: autoSummary || aiResult.summary || '',
            transcriptLanguage: transcriptData.language || 'en',
            transcriptIsGenerated: transcriptData.isGenerated || false
        };

        // --- PRE-GENERATE IMAGES SKIPPED FOR SPEED ---
        console.log(`[YouTube] Skipping pre-generation to return questions immediately.`);


        db.files.unshift(newFileEntry);
        await logActivity(db, 'upload', { filename: newFileEntry.filename });
        await saveDB(req, db);

        res.json({ ...newFileEntry, isMock: aiResult.isMock });

    } catch (error) {
        console.error('Error processing YouTube:', error);
        res.status(500).json({ error: error.message || 'Failed to process video' });
    }
});

// Creative Work Route
app.post('/api/creative', async (req, res) => {
    try {
        const { title, author, type, apiKey } = req.body;

        if (!title || !type) {
            return res.status(400).json({ error: 'Title and Type are required' });
        }

        console.log(`Processing Creative Work: ${title} (${type}) [Author: ${author || 'N/A'}]...`);

        const startAI = Date.now();
        const aiResult = await generateQuestionsForCreativeWork(title, author, type, apiKey, 10);
        console.log(`Creative Gen time: ${Date.now() - startAI}ms`);

        // Save to DB
        const db = await getDB(req);
        const newFileEntry = {
            id: Date.now().toString(),
            filename: aiResult.suggestedTitle,
            type: 'creative', // distinct type
            originalUrl: null,
            uploadedAt: new Date().toISOString(),
            questions: aiResult.questions,
            subjectEmoji: aiResult.subjectEmoji,
            categories: aiResult.categories || [],
            summary: `Creative study set for ${title}`,
            creativeType: type
        };

        db.files.unshift(newFileEntry);
        await logActivity(db, 'upload', { filename: newFileEntry.filename, type: 'creative' });
        await saveDB(req, db);

        res.json({ ...newFileEntry, isMock: aiResult.isMock });

    } catch (error) {
        console.error('Error processing Creative Work:', error);
        res.status(500).json({ error: error.message || 'Failed to process creative work' });
    }
});

// Generate News Quiz
app.post('/api/news/generate', async (req, res) => {
    try {
        const userId = getUserID(req);
        console.log(`[News API] Request from user: ${userId}`);

        // 1. Get Interests
        let interests = [];
        try {
            const headerVal = req.headers['x-user-interests'];
            if (headerVal) {
                interests = JSON.parse(decodeURIComponent(headerVal));
            }
        } catch (e) { }
        if (!interests || interests.length === 0) {
            interests = ["Technology", "Science", "Business", "Health", "World News"];
        }

        const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;

        // 2. Multi-Interest Logic
        // Strategy:
        // - Fetch articles for ALL user interests (up to a limit, say top 8 interests?)
        // - Distribute selection: At least 1 from each interest.
        // - If count < 5, pad with more from the pool.

        let allArticlesPool = [];

        console.log(`[News API] User Interests: ${interests.join(', ')}`);

        // Fetch concurrently for all interests
        const interestPromises = interests.map(async (topic) => {
            try {
                const articles = await fetchNewsForInterest(topic);
                return articles.map(a => ({ ...a, interestCategory: topic }));
            } catch (e) {
                return [];
            }
        });

        const resultsPerInterest = await Promise.all(interestPromises);

        // Flatten into a pool
        resultsPerInterest.forEach(list => {
            if (list && list.length > 0) allArticlesPool.push(...list);
        });

        if (!allArticlesPool || allArticlesPool.length === 0) {
            return res.status(404).json({ error: 'No relevant news found.' });
        }

        // Deduplicate by URL or Title
        const seenUrls = new Set();
        const distinctPool = allArticlesPool.filter(a => {
            if (seenUrls.has(a.link)) return false;
            seenUrls.add(a.link);
            return true;
        });

        // 3. Selection Algorithm
        // Requirement: "if user is interested in all 8 of them you have to generate 8 questions one from each criteria"
        // Requirement: "if it is less than 5, you still have to generate 5 questions"

        const targetCount = Math.max(5, interests.length);
        let selectedArticles = [];

        // First pass: Pick 1 best article from each interest
        const articlesByInterest = {};
        distinctPool.forEach(a => {
            if (!articlesByInterest[a.interestCategory]) articlesByInterest[a.interestCategory] = [];
            articlesByInterest[a.interestCategory].push(a);
        });

        // Round Robin Selection
        // We want to iterate through interests and pick 1, then repeat if we still need more.

        let interestKeys = Object.keys(articlesByInterest);
        // Shuffle keys to randomize order of "extra" questions
        interestKeys.sort(() => Math.random() - 0.5);

        // Keep picking until we hit targetCount or run out of articles
        let attempts = 0;
        while (selectedArticles.length < targetCount && attempts < 50) { // Safety break
            attempts++;
            let addedSomething = false;

            for (const key of interestKeys) {
                if (selectedArticles.length >= targetCount) break;

                const candidates = articlesByInterest[key];
                if (candidates && candidates.length > 0) {
                    // Take the top one (since they are already sorted by relevance/trust in fetch function)
                    // Actually, fetch returns them roughly in RSS order.
                    const picked = candidates.shift(); // Remove from pool
                    selectedArticles.push(picked);
                    addedSomething = true;
                }
            }

            if (!addedSomething) break; // No more articles left in any category
        }

        console.log(`[News API] Selected ${selectedArticles.length} articles (Target: ${targetCount})`);

        // 5. Generate Questions in Parallel
        const results = await Promise.all(selectedArticles.map(async (article) => {
            try {
                // Fetch Content
                let text = await fetchArticleContent(article.link);
                if (!text || text.length < 200) text = article.title + "\n\n" + (article.description || "");

                // Generate 1 Question (Type 2 - Conceptual Hook)
                // Use 'news-hook' distribution to ensure curiosity-driven questions
                const aiResult = await generateQuestions(text, apiKey, 1, article.title, `Source: ${article.source}`, null, 'news-hook');
                if (!aiResult.questions || aiResult.questions.length === 0) return null;

                const q = aiResult.questions[0];
                q.questionContext = `News: ${article.source} (${new Date(article.pubDate).toLocaleDateString()})`;
                q.relatedLink = article.link;
                q.newsSource = { name: article.source, url: article.sourceUrl, link: article.link };
                q.forcedImageUrl = null;
                return q;
            } catch (e) {
                return null;
            }
        }));

        const validQuestions = results.filter(q => q !== null);

        if (validQuestions.length === 0) {
            return res.status(500).json({ error: 'Failed to generate any news questions.' });
        }

        // 6. Save as File to DB (for Like button & History)
        const db = await getDB(req);
        const newFileId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

        const newFileEntry = {
            id: newFileId,
            filename: `News Quiz: ${new Date().toLocaleDateString()}`,
            uploadDate: new Date().toISOString(),
            type: 'news_quiz',
            path: null,
            questions: validQuestions,
            summary: "A curated news quiz based on your interests.",
            processed: true,
            isHidden: true
        };

        db.files.unshift(newFileEntry);
        await saveDB(req, db);

        res.json(newFileEntry);

    } catch (error) {
        console.error('[News API] Error:', error);
        res.status(500).json({ error: 'Failed to generate news quiz' });
    }
});

// Generate YouTube Quiz (Multi-Interest)
app.post('/api/youtube/generate', async (req, res) => {
    console.log('[YouTube API] Request received');
    const userId = getUserID(req);
    const interestsHeader = req.headers['x-user-interests'];
    let interests = [];

    if (interestsHeader) {
        try {
            interests = JSON.parse(decodeURIComponent(interestsHeader));
        } catch (e) {
            console.warn('[YouTube API] Failed to parse interests header', e);
        }
    }

    if (!interests || interests.length === 0) {
        interests = ['Technology', 'Science', 'World', 'Entertainment', 'Health']; // Defaults
    }

    // CRITICAL FIX: Ignore client-side apiKey (which might be stale/expired) and use the valid server env var.
    const apiKey = process.env.GEMINI_API_KEY;

    try {
        const targetCount = Math.max(5, interests.length);
        const questions = [];

        // 1. Select Interests (Round Robin)
        // We need 'targetCount' items.
        // Shuffle interests to ensure variety if targetCount < interests.length (unlikely per logic)
        // or just round robin.

        let selectedInterests = [];
        let i = 0;
        while (selectedInterests.length < targetCount) {
            selectedInterests.push(interests[i % interests.length]);
            i++;
        }

        // 2. Fetch Videos & Generate parallel
        // For each selected interest, pick a channel, get video, gen question.

        // 2. Fetch Videos & Generate Sequentially (to avoid IP blocks)
        // For each selected interest, pick a channel, get video, gen question.

        for (const interest of selectedInterests) {
            console.log(`[DEBUG] Processing Interest: ${interest}`);

            // Mapping Logic
            const mapInterestToKey = (userInterest) => {
                const ui = userInterest.toLowerCase();
                if (ui.includes('tech') || ui.includes('code') || ui.includes('program') || ui.includes('ai')) return 'Technology';
                if (ui.includes('science') || ui.includes('physics') || ui.includes('bio')) return 'Science';
                if (ui.includes('world') || ui.includes('geo') || ui.includes('history')) return 'World'; // 'World' key in json
                if (ui.includes('entertain') || ui.includes('movie') || ui.includes('music')) return 'Entertainment';
                if (ui.includes('health') || ui.includes('fitness') || ui.includes('gym')) return 'Health';
                if (ui.includes('business') || ui.includes('money') || ui.includes('finance')) return 'Business';
                if (ui.includes('sport') || ui.includes('nba') || ui.includes('soccer')) return 'Sports';
                if (ui.includes('politic') || ui.includes('news') || ui.includes('us')) return 'U.S.'; // 'U.S.' key

                console.log(`[DEBUG] No direct map for '${userInterest}', using Random Fallback`);
                // Random fallback
                const keys = Object.keys(YOUTUBE_PLAYLISTS);
                return keys[Math.floor(Math.random() * keys.length)];
            };

            const categoryKey = mapInterestToKey(interest);
            console.log(`[DEBUG] Interest '${interest}' mapped to Category '${categoryKey}'`);

            const channels = YOUTUBE_PLAYLISTS[categoryKey] || [];
            if (channels.length === 0) {
                console.warn(`[DEBUG] No channels found for category '${categoryKey}'`);
                continue;
            }

            const randomChannel = channels[Math.floor(Math.random() * channels.length)];
            console.log(`[DEBUG] Selected Channel: ${randomChannel.handle} (Playlist: ${randomChannel.playlistId})`);

            // Fetch Video
            const videoData = await fetchYouTubeVideoAndTranscript(randomChannel.playlistId);
            if (!videoData) continue;

            // SANITIZE INPUT: Clean title and channel handle to prevent Gemini API pattern errors
            const sanitizeInput = (str) => {
                if (!str) return '';
                return str.replace(/[^\w\s가-힣一-龯ぁ-んァ-ン\-''.,!?&:()]/g, '').trim();
            };
            const cleanTitle = sanitizeInput(videoData.title);
            const cleanHandle = sanitizeInput(randomChannel.handle);

            const prompt = `
             The user is interested in ${interest}.
             I found a video titled "${cleanTitle}" from channel "${cleanHandle}".
             Video Transcript/Snippet: "${videoData.transcript.substring(0, 1000)}..."
             
             Generate a "Curiosity Hook" quiz question.
             Treat this as if the user has NOT watched the video yet.
             The question should make them want to find the answer (which is in the video).
             Format as a standard quiz question (Type 1: Multiple Choice).
             The "correct answer" should be the most intriguing fact or premise from the title/snippet.
             Options should be plausible.
             Explanation should reveal the "hook" and encourage watching.
             `;

            /*
               CRITICAL FIX: Pass arguments matching aiService.js definition:
               generateQuestions(text, apiKey, count, title, relatedContext, userProfile, distribution, avoidQuestions)
            */
            const aiResult = await generateQuestions(
                videoData.transcript,
                apiKey,           // Correct API Key passed from req.body or env
                1,                // count
                cleanTitle,       // title (SANITIZED)
                "",               // relatedContext
                null,             // userProfile
                'news-hook'       // distribution
            );

            if (aiResult && aiResult.questions && aiResult.questions.length > 0) {
                const question = aiResult.questions[0];
                question.videoUrl = `https://www.youtube.com/watch?v=${videoData.videoId}`;
                question.forcedImageUrl = videoData.thumbnail; // Use video thumbnail
                question.newsSource = randomChannel.handle; // Display Handle as source
                question.interestCategory = interest;
                questions.push(question);
            }

            // Wait a bit between requests to be nice to YouTube
            await new Promise(r => setTimeout(r, 1500));
        }

        const validQuestions = questions;

        console.log(`[DEBUG] Generated ${validQuestions.length} valid questions.`);

        // 3. Save as File to DB (for Like button & History)
        const db = await getDB(req);
        const newFileId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

        const newFileEntry = {
            id: newFileId,
            filename: `Discovery Quiz: ${new Date().toLocaleDateString()}`,
            uploadDate: new Date().toISOString(),
            type: 'youtube_discovery',
            path: null,
            questions: validQuestions,
            summary: `A discovery quiz based on: ${selectedInterests.join(', ')}`,
            processed: true,
            isHidden: true
        };

        db.files.unshift(newFileEntry);
        await saveDB(req, db);

        res.json(newFileEntry);

    } catch (e) {
        console.error('[YouTube API] Error:', e);
        res.status(500).json({ error: 'Failed to generate YouTube quiz' });
    }
});

// Get library
app.get('/api/library', async (req, res) => {
    try {
        const db = await getDB(req);
        const logs = db.activityLog || [];

        // Attach stats to each file
        const filesWithStats = db.files.map(file => {
            const fileLogs = logs.filter(l =>
                l.type === 'solve_question' &&
                l.materialName === file.filename
            );

            const solvedCount = fileLogs.reduce((acc, curr) => acc + (curr.count || 0), 0);

            return {
                ...file,
                questionsSolved: solvedCount,
                timeSaved: solvedCount * 3 // 3 mins per question
            };
        });

        res.json(filesWithStats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

// Delete file
app.delete('/api/library/:id', async (req, res) => {
    try {
        const db = await getDB(req);
        const fileIndex = db.files.findIndex(f => f.id === req.params.id);

        if (fileIndex === -1) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = db.files[fileIndex];
        if (file.path) {
            try {
                await fs.unlink(file.path);
            } catch (e) {
                console.warn('Could not delete physical file:', e.message);
            }
        }


        db.files.splice(fileIndex, 1);

        // Also remove questions from reelsBuffer that belong to this file
        if (db.reelsBuffer) {
            const originalLength = db.reelsBuffer.length;
            db.reelsBuffer = db.reelsBuffer.filter(item => item.originId !== req.params.id);
            const removedCount = originalLength - db.reelsBuffer.length;
            if (removedCount > 0) {
                console.log(`[Delete] Removed ${removedCount} questions from reelsBuffer for file ${req.params.id}`);
            }
        }

        await saveDB(req, db);

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete file' });
    }
});


// Add manual question
app.post('/api/questions/add', async (req, res) => {
    try {
        const { fileId, question } = req.body;

        if (!fileId || !question) {
            return res.status(400).json({ error: 'Missing data' });
        }

        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (!file.questions) file.questions = [];
        file.questions.push(question);

        await saveDB(req, db);
        res.json({ message: 'Question added', file });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add question' });
    }
});


// Create custom material
app.post('/api/materials/create', async (req, res) => {
    try {
        const { name, subjectEmoji } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Material name required' });
        }

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
});


// Get material summary
app.get('/api/summary/:id', async (req, res) => {
    try {
        console.log(`[Snippet] Requesting summary for ${req.params.id}`);
        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // If summary already exists, return it
        if (file.summary) {
            return res.json({ summary: file.summary });
        }

        // Generate summary based on type
        let textToSummarize = '';

        if (file.type === 'youtube' && file.originalUrl) {
            // Fetch transcript again
            const videoId = extractVideoId(file.originalUrl);
            const transcriptData = await fetchYouTubeTranscript(videoId);
            textToSummarize = transcriptData.text;
        } else if (file.path) {
            // Read document
            textToSummarize = await parseDocument(file.path, file.mimetype || 'application/pdf');
        } else if (file.type === 'custom') {
            return res.json({ summary: 'Custom materials do not have auto-generated summaries.' });
        }

        console.log(`[Snippet] Text length to summarize: ${textToSummarize ? textToSummarize.length : 0}`);
        if (!textToSummarize || textToSummarize.length < 50) {
            console.warn('[Snippet] Text too short to summarize');
        }
        const summary = await generateSummary(textToSummarize, undefined, file.filename);
        file.summary = summary;
        await saveDB(req, db);

        res.json({ summary });
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// --- NOTION INTEGRATION ---

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI || 'http://localhost:3001/auth/notion/callback';

// 1. Auth Login (Redirect)
app.get('/auth/notion/login', (req, res) => {
    if (!NOTION_CLIENT_ID) return res.status(500).send('Notion Client ID not configured.');

    const userId = req.query.userId || 'guest';
    const state = encodeURIComponent(userId); // Encode userId as state

    const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(NOTION_REDIRECT_URI)}&state=${state}`;
    res.redirect(authUrl);
});

// 2. Auth Callback
app.get('/auth/notion/callback', async (req, res) => {
    const { code, error, state } = req.query;

    if (error) return res.status(400).send(`Notion Auth Error: ${error}`);
    if (!code) return res.status(400).send('No code returned from Notion.');

    try {
        // Exchange code for token
        // We use Basic Auth (ClientID:ClientSecret) header
        const encoded = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');

        const response = await fetch('https://api.notion.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${encoded}`
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: NOTION_REDIRECT_URI
            })
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error_description || data.error);

        const { access_token, workspace_name } = data;

        // Restore User ID from state
        let userId = 'guest';
        if (state) {
            userId = decodeURIComponent(state);
        }

        // Sanitize userId to prevent directory traversal
        userId = userId.replace(/[^a-zA-Z0-9_\uAC00-\uD7A3]/g, '');
        if (!userId) userId = 'guest';

        const userPath = path.join(USERS_DIR, `${userId}.json`);
        let userData = { files: [], activityLog: [] };
        try {
            const existing = await fs.readFile(userPath, 'utf8');
            userData = JSON.parse(existing);
        } catch (e) {
            console.log(`Creating new user file for Notion sync: ${userId}`);
        }

        userData.notion = {
            accessToken: access_token,
            workspaceName: workspace_name,
            lastSyncedAt: null, // Not synced yet
            connectedAt: new Date().toISOString()
        };

        await fs.writeFile(userPath, JSON.stringify(userData, null, 2));

        // Redirect back to profile
        res.redirect('/?view=profile&notion_connected=true');

    } catch (err) {
        console.error('Notion Callback Error:', err);
        res.status(500).send(`Authentication Failed: ${err.message}`);
    }
});

// 3. Sync & Generate
app.post('/api/sync-notion', async (req, res) => {
    try {
        const db = await getDB(req);

        if (!db.notion || !db.notion.accessToken) {
            return res.status(401).json({ error: 'Notion not connected.' });
        }

        const notion = new Client({ auth: db.notion.accessToken });

        // Search for recent pages
        console.log('Searching Notion pages...');
        const searchResponse = await notion.search({
            filter: { property: 'object', value: 'page' },
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
            page_size: 20 // Increased limit to find more content
        });

        const pages = searchResponse.results;
        const newFiles = [];

        for (const page of pages) {
            try {
                const pageId = page.id;
                const titleProp = page.properties.title || page.properties.Name; // Title prop varies
                let title = 'Untitled Notion Page';

                if (titleProp && titleProp.title && titleProp.title.length > 0) {
                    title = titleProp.title[0].plain_text;
                }

                // Check if already synced recently? (Skip for now to allow refresh)
                console.log(`Processing Notion Page: ${title}`);

                // Fetch Blocks (Content)
                const blocks = await notion.blocks.children.list({ block_id: pageId });

                // Simple text extraction
                let pageText = `Title: ${title}\n\n`;
                for (const block of blocks.results) {
                    if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
                        pageText += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
                    } else if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
                        const type = block.type;
                        if (block[type].rich_text.length > 0) {
                            pageText += block[type].rich_text.map(t => t.plain_text).join('') + '\n';
                        }
                    }
                    else if (block.type === 'bulleted_list_item' && block.bulleted_list_item.rich_text.length > 0) {
                        pageText += '• ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
                    } else if (block.type === 'numbered_list_item' && block.numbered_list_item.rich_text.length > 0) {
                        pageText += '- ' + block.numbered_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
                    }
                }

                if (pageText.length < 50) {
                    console.log(`Skipping ${title}: Not enough text content.`);
                    continue;
                }

                // Generate Questions
                const { apiKey } = req.body; // User might provide key again or we use env
                // Use existing AI Service
                // We want a "Daily Quiz" feel, so maybe 3-5 questions per page
                const aiResult = await generateQuestions(pageText, apiKey, 3, title);

                // Create File Entry
                const newFileEntry = {
                    id: `notion-${pageId}`,
                    filename: `[Notion] ${title}`,
                    type: 'notion',
                    path: null,
                    uploadedAt: new Date().toISOString(),
                    questions: aiResult.questions,
                    subjectEmoji: '📓', // Notebook emoji
                    categories: ['Notion', ...(aiResult.categories || [])],
                    summary: `Synced from Notion workspace: ${db.notion.workspaceName}`,
                    originalUrl: page.url
                };

                // Avoid duplicates: remove old version with same ID
                const existingIdx = db.files.findIndex(f => f.id === newFileEntry.id);
                if (existingIdx !== -1) {
                    db.files.splice(existingIdx, 1);
                }

                db.files.unshift(newFileEntry);
                newFiles.push(newFileEntry);

                // Update Sync Time inside loop or after? After is fine.
            } catch (pageErr) {
                console.error(`Error processing page ${page.id}:`, pageErr);
                // Continue to next page
            }
        }

        // Update Sync Time
        db.notion.lastSyncedAt = new Date().toISOString();
        await saveDB(req, db);

        res.json({ success: true, syncedCount: newFiles.length, files: newFiles });

    } catch (err) {
        console.error('Notion Sync Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Notion Status
app.get('/api/notion/status', async (req, res) => {
    try {
        const db = await getDB(req);
        if (db.notion && db.notion.accessToken) {
            res.json({
                connected: true,
                workspaceName: db.notion.workspaceName,
                lastSyncedAt: db.notion.lastSyncedAt
            });
        } else {
            res.json({ connected: false });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Update summary
app.post('/api/summary/:id/update', async (req, res) => {
    try {
        const { summary } = req.body;
        if (!summary) {
            return res.status(400).json({ error: 'Summary content is required' });
        }

        const db = await getDB(req);
        const file = db.files.find(f => f.id === req.params.id);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.summary = summary;
        await saveDB(req, db);

        res.json({ message: 'Summary updated successfully', summary });
    } catch (error) {
        console.error('Update summary error:', error);
        res.status(500).json({ error: 'Failed to update summary' });
    }
});

// --- Reels Pre-generation API ---

app.get('/api/reels/pregenerated', async (req, res) => {
    try {
        const db = await getDB(req);
        const buffer = db.reelsBuffer || [];

        // Trigger refill in background if needed
        if (buffer.length < 5) {
            refillUserReelsBuffer(req, db).catch(e => console.error('Background refill failed', e));
        }

        res.json(buffer);
    } catch (err) {
        console.error('Failed to fetch pregenerated reels:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/reels/consume', async (req, res) => {
    try {
        const { questionTexts } = req.body;
        if (!Array.isArray(questionTexts)) return res.status(400).json({ error: 'Array required' });

        const db = await getDB(req);

        // Ensure buffer exists
        if (!db.reelsBuffer) db.reelsBuffer = [];

        const originalCount = db.reelsBuffer.length;

        // Filter out consumed questions
        db.reelsBuffer = db.reelsBuffer.filter(b => !questionTexts.includes(b.question.question));

        if (db.reelsBuffer.length !== originalCount) {
            await saveDB(req, db);
            // Trigger refill to replace consumed items
            refillUserReelsBuffer(req, db).catch(e => console.error('Background refill failed', e));
        }

        res.json({ success: true, remaining: db.reelsBuffer.length });
    } catch (err) {
        console.error('Failed to consume reels:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// New Endpoint: Spawn MORE questions of the SAME type on Correct Answer
app.post('/api/reels/spawn', async (req, res) => {
    console.log("[Spawn] =============== ENDPOINT HIT ===============");
    console.log("[Spawn] Request Body:", JSON.stringify(req.body, null, 2));
    try {
        const { question, context, type, originId } = req.body;

        if (!question) {
            console.error("[Spawn] Missing question in request body");
            return res.status(400).json({ error: "Missing question" });
        }

        const keyToUse = process.env.GEMINI_API_KEY || req.body.apiKey;
        console.log(`[Spawn] Request for: "${question.substring(0, 50)}..." | OriginID: ${originId || "MISSING"}`);

        // 1. Fetch Rich Context from DB if possible
        let richContext = context || "";
        try {
            const db = await getDB(req);
            if (originId && db && db.files) {
                const file = db.files.find(f => f.id === originId);
                if (file) {
                    // Determine best context source
                    let fileText = "";
                    if (file.transcript && file.transcript.length > 100) {
                        fileText = file.transcript;
                    } else if (file.description && file.description.length > 100) {
                        fileText = `Video Description: ${file.description}`;
                    } else if (file.summary && file.summary.length > 50) {
                        fileText = `Summary: ${file.summary}`;
                    }

                    // Fallback to metadata if all else fails
                    if (fileText.length < 50) {
                        fileText = `Title: ${file.filename}\nSubject: ${file.subject || "General Study"}\nContext: The user is studying this material.`;
                    }

                    // If found, overwrite/append to context
                    if (fileText.length > 20) {
                        console.log(`[Spawn] Found rich context from file "${file.filename}" (${fileText.length} chars)`);
                        richContext = fileText.substring(0, 20000);

                        // Detect overly promotional content
                        const promotionalKeywords = [
                            'merchandise', 'merch', 'buy', 'purchase', 'subscribe',
                            'social media', 'instagram', 'facebook', 'tiktok',
                            'sponsor', 'affiliate', 'discount code', 'branded'
                        ];
                        const lowerContext = richContext.toLowerCase();
                        const promotionalMatches = promotionalKeywords.filter(kw => lowerContext.includes(kw)).length;

                        if (promotionalMatches >= 3) {
                            console.warn(`[Spawn] WARNING: Material appears highly promotional (${promotionalMatches} marketing keywords detected)`);
                        }
                    }
                } else {
                    console.log(`[Spawn] File with originId ${originId} not found in DB.`);
                }
            }
        } catch (dbErr) {
            console.error("[Spawn] DB Context Fetch Error (Non-fatal):", dbErr);
        }

        // Final Safety Check - RELAXED
        // We want to allow generation even if context is thin (fallback logic below handles it)
        if (richContext && (richContext.includes('대본 누락') || richContext.includes('Transcript Missing'))) {
            console.warn(`[Spawn] Context indicates missing transcript. Will attempt to use Title/Question as context.`);
            // Do not return, let it fall through to fallback
            richContext = "";
        }
        if (!richContext || richContext.length < 20) {
            richContext = `Topic: ${question} (Derived from user question)`;
        }

        // Collect existing questions to avoid overlap
        let existingQuestions = [];
        let sourceTitle = "Unknown Source";

        try {
            const db = await getDB(req);
            if (originId && db && db.files) {
                const file = db.files.find(f => f.id === originId);
                if (file) {
                    sourceTitle = file.filename; // Capture title
                    if (file.questions) {
                        existingQuestions = file.questions.map(q => q.question);
                    }
                }
            }
        } catch (e) { }

        // 2. Generate new similar questions
        // We ask for 1 new question (as requested previously) but based on deep context
        console.log(`[Spawn] Calling AI Service for "${sourceTitle}" (with exclusion list)...`);
        let newQuestions = [];
        try {
            // PASS sourceTitle to AI Service
            newQuestions = await aiService.generateSimilarQuestions(question, richContext, type, keyToUse, existingQuestions, sourceTitle);
        } catch (aiErr) {
            console.error("[Spawn] AI Service Error:", aiErr);
            return res.status(500).json({ error: "AI Generation Failed" });
        }

        if (newQuestions && newQuestions.length > 0) {
            // 2. Add metadata
            const processed = newQuestions.map(q => ({
                question: q,
                originId: originId || 'spawned',
                spawnedFrom: question, // Track lineage
                sourceTitle: sourceTitle, // CRITICAL: Propagate title for progress tracking
                originFilename: sourceTitle, // CRITICAL: Compatibility for client
                materialName: sourceTitle // CRITICAL: Compatibility for tracking
            }));

            // 3. Inject into DB (Permanent & Buffer)
            try {
                const db = await getDB(req);

                // A. Add to Buffer (for immediate review)
                if (!db.reelsBuffer) db.reelsBuffer = [];
                db.reelsBuffer.unshift(...processed);

                // B. Add to Original File (Permanent Storage)
                if (originId && db.files) {
                    const file = db.files.find(f => f.id === originId);
                    if (file) {
                        if (!file.questions) file.questions = [];

                        // Add raw questions (stripped of buffer metadata)
                        const rawQuestions = newQuestions.map(q => q);
                        file.questions.push(...rawQuestions);
                        console.log(`[Spawn] Permanently added ${rawQuestions.length} questions to file "${file.filename}"`);
                    }
                }

                await saveDB(req, db);
            } catch (saveErr) {
                console.error("[Spawn] DB Save Error:", saveErr);
            }

            console.log(`[Spawn] Created ${newQuestions.length} new questions.`);
            res.json({ success: true, questions: processed });
        } else {
            console.warn("[Spawn] AI returned 0 questions.");
            res.json({ success: false, questions: [] });
        }
    } catch (err) {
        console.error('Failed to spawn questions (Fatal):', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Generate MORE questions for Endless Mode (from random existing material)
app.post('/api/reels/generate-more', async (req, res) => {
    try {
        const { apiKey } = req.body;
        const keyToUse = apiKey || process.env.GEMINI_API_KEY;

        const db = await getDB(req);

        // Find candidates (must have path or be youtube)
        const candidates = db.files.filter(f => f.path || (f.type === 'youtube' && f.originalUrl));

        if (candidates.length === 0) {
            return res.json({ questions: [] });
        }

        // Multi-Interest Logic
        const userInterestsStr = req.headers['x-user-interests'];
        let targetInterests = [];
        if (userInterestsStr) {
            try {
                targetInterests = JSON.parse(decodeURIComponent(userInterestsStr));
            } catch (e) {
                console.warn("Failed to parse user interests header", e);
            }
        }

        let questionsAccumulator = [];
        let filesUpdated = new Set(); // Track files to save

        if (targetInterests.length > 0) {
            console.log(`[Reels Refill] Target Interests: ${targetInterests.join(', ')}`);

            // Group files by interest
            const filesByInterest = {};
            targetInterests.forEach(int => filesByInterest[int] = []);

            candidates.forEach(f => {
                if (f.categories && Array.isArray(f.categories)) {
                    f.categories.forEach(c => {
                        if (filesByInterest[c]) filesByInterest[c].push(f);
                    });
                }
                // Also check creativeType or other metadata if needed?
            });

            // Target Count: At least 1 per interest. Total 5 minimum.
            const totalTarget = Math.max(5, targetInterests.length);

            // Plan the generation batch
            // Round robin selection of FILES to generate FROM
            let generationPlan = []; // Array of { interest, file }

            let attempts = 0;
            // Shuffle interests to vary order if < 5
            const shuffledInterests = [...targetInterests].sort(() => Math.random() - 0.5);

            while (generationPlan.length < totalTarget && attempts < 20) {
                attempts++;
                let added = false;
                for (const interest of shuffledInterests) {
                    if (generationPlan.length >= totalTarget) break;

                    const pool = filesByInterest[interest];
                    if (pool && pool.length > 0) {
                        // Pick random file from this interest pool
                        const file = pool[Math.floor(Math.random() * pool.length)];
                        generationPlan.push({ interest, file });
                        added = true;
                    }
                }
                if (!added) {
                    // If we ran out of interest-specific files, fill with random from ALL candidates
                    const randomFile = candidates[Math.floor(Math.random() * candidates.length)];
                    generationPlan.push({ interest: 'Random', file: randomFile });
                    added = true; // To avoid infinite loop if candidates exist
                }
            }

            // SHUFFLE the plan to ensure interleaving (User Request: avoid same material sequentially)
            generationPlan.sort(() => Math.random() - 0.5);

            console.log(`[Reels Refill] Plan: ${generationPlan.map(p => p.interest + ':' + p.file.filename).join(', ')}`);

            // Execute Generation in Parallel (Limit concurrency if needed, but 5-8 is okay for Flash)
            const results = await Promise.all(generationPlan.map(async (item) => {
                const { file } = item;

                // Get Text (Reuse logic)
                let text = "";
                if (file.path) {
                    try {
                        const mime = file.filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
                        text = await parseDocument(file.path, mime);
                    } catch (e) { console.warn("Read error", e); return null; }
                } else if (file.type === 'youtube') {
                    // FIX: Use stored transcript first!
                    if (file.transcript && file.transcript.length > 50) {
                        text = file.transcript;
                    } else {
                        try {
                            const videoId = extractVideoId(file.originalUrl);
                            const tData = await fetchYouTubeTranscript(videoId);
                            text = tData.text;
                        } catch (e) { console.warn("YT error", e); return null; }
                    }
                }

                if (!text || text.length < 50) return null;

                // Generate ONE question per slot
                try {
                    const aiRes = await generateQuestions(text, keyToUse, 1, file.filename);
                    if (aiRes.questions && aiRes.questions.length > 0) {
                        const q = aiRes.questions[0];
                        // Attach metadata
                        q.originFilename = file.filename;
                        q.originId = file.id;

                        // Push to file storage
                        if (!file.questions) file.questions = [];
                        file.questions.push(q);
                        filesUpdated.add(file.id);

                        return q;
                    }
                } catch (e) {
                    console.error("Gen error", e);
                }
                return null;
            }));

            questionsAccumulator = results.filter(q => q !== null);

        } else {
            // Default Single File Logic (No interests)
            const file = candidates[Math.floor(Math.random() * candidates.length)];
            console.log(`[Reels Refill] Selected Random file: ${file.filename}`);

            let text = "";
            if (file.path) {
                try {
                    const mime = file.filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
                    text = await parseDocument(file.path, mime);
                } catch (e) { }
            } else if (file.type === 'youtube') {
                try {
                    const videoId = extractVideoId(file.originalUrl);
                    const tData = await fetchYouTubeTranscript(videoId);
                    text = tData.text;
                } catch (e) { }
            }

            if (text && text.length >= 50) {
                const aiResult = await generateQuestions(text, keyToUse, 5, file.filename);
                if (!file.questions) file.questions = [];
                file.questions.push(...aiResult.questions);
                filesUpdated.add(file.id);
                questionsAccumulator = aiResult.questions;
            }
        }

        if (filesUpdated.size > 0) {
            await saveDB(req, db);
        }

        console.log(`[Reels Refill] Total Generated: ${questionsAccumulator.length}`);
        res.json({ questions: questionsAccumulator });

    } catch (err) {
        console.error("Reels Refill Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update categories
app.post('/api/materials/:id/categories', async (req, res) => {
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
});


// --- Profile & Tracking ---

// Helper: Log activity
async function logActivity(db, type, data) {
    if (!db.activityLog) db.activityLog = [];

    db.activityLog.push({
        type, // 'upload', 'solve_question'
        timestamp: new Date().toISOString(),
        ...data
    });
    // Keep log size manageable? Maybe later.
}

// Track Question Solved
app.post('/api/track/solve', async (req, res) => {
    try {
        const { count, correct, wrong, materialName, subject } = req.body;
        const db = await getDB(req);

        await logActivity(db, 'solve_question', { count, correct, wrong, materialName, subject });
        await saveDB(req, db);

        res.json({ success: true });
    } catch (err) {
        console.error('Tracking error:', err);
        res.status(500).json({ error: 'Failed to track activity' });
    }
});

// Get Profile Stats
app.get('/api/profile', async (req, res) => {
    try {
        const db = await getDB(req);
        const logs = db.activityLog || [];
        const files = db.files || [];

        // 1. Total Stats
        const totalQuestionsSolved = logs
            .filter(l => l.type === 'solve_question')
            .reduce((acc, curr) => acc + (curr.count || 0), 0);

        // 3 mins per question
        const totalTimeSavedMins = logs
            .filter(l => l.type === 'solve_question')
            .reduce((acc, curr) => {
                if (curr.correct !== undefined) {
                    return acc + (curr.correct * 2) + ((curr.wrong || 0) * 1);
                }
                return acc + ((curr.count || 0) * 3);
            }, 0);

        // 2. Daily Stats (Last 7 Days)
        const dailyStats = {};
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyStats[key] = { solved: 0, uploads: 0, timeSaved: 0 };
        }

        logs.forEach(log => {
            const dateKey = log.timestamp.split('T')[0];
            if (dailyStats[dateKey]) {
                if (log.type === 'solve_question') {
                    dailyStats[dateKey].solved += (log.count || 0);
                    let time = 0;
                    if (log.correct !== undefined) {
                        time = (log.correct * 2) + ((log.wrong || 0) * 1);
                    } else {
                        time = (log.count || 0) * 3;
                    }
                    dailyStats[dateKey].timeSaved += time;
                } else if (log.type === 'upload') {
                    dailyStats[dateKey].uploads += 1;
                }
            }
        });

        // Add file uploads from files array if not double counting (files array is source of truth for uploads)
        // Actually, let's look at files array for uploads to be accurate for past uploads too
        files.forEach(f => {
            const dateStr = f.uploadDate || f.uploadedAt;
            if (!dateStr) return;

            const dateKey = dateStr.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].uploads += 1;
            }
        });



        // 3. Top Subjects (Material Counts)
        const materialCounts = {};
        logs.filter(l => l.type === 'solve_question').forEach(l => {
            let name = l.materialName || (l.subject ? l.subject + ' Review' : 'General Review');

            // NORMALIZATION: Merge similar titles (case-insensitive, trim) and handle "..." truncations
            name = name.trim();

            // Skip "Endless Review" and "General Review" from this specific list (User Request)
            if (name === 'Endless Review' || name === 'General Review') return;

            // Merge "Jaguar... " and "Jaguar" if reasonably close (Simple heuristic: first 15 chars match)
            // Actually, best to iterate existing keys and check for overlap
            const existingKey = Object.keys(materialCounts).find(k =>
                k.toLowerCase() === name.toLowerCase() ||
                (k.length > 10 && name.startsWith(k.substring(0, 15))) ||
                (name.length > 10 && k.startsWith(name.substring(0, 15)))
            );
            if (existingKey) name = existingKey;

            if (existingKey) name = existingKey;

            // FIX: lookup canonical emoji from file if possible
            let emoji = l.subject || '📚';
            const file = files.find(f => f.filename === name || (f.filename && f.filename.startsWith(name.substring(0, 15))));
            if (file && file.subjectEmoji) {
                emoji = file.subjectEmoji;
            }

            if (!materialCounts[name]) {
                materialCounts[name] = { count: 0, emoji, timeSaved: 0 };
            }
            materialCounts[name].count += (l.count || 0);

            let time = 0;
            if (l.correct !== undefined) {
                time = (l.correct * 2) + ((l.wrong || 0) * 1);
            } else {
                time = (l.count || 0) * 3;
            }
            materialCounts[name].timeSaved += time;
        });

        const topSubjects = Object.entries(materialCounts)
            .map(([name, data]) => ({ name, emoji: data.emoji, count: data.count, timeSaved: data.timeSaved }))
            .sort((a, b) => b.count - a.count);

        // 4. Calculate Current Streak (consecutive days of activity)
        const sortedDates = Object.keys(dailyStats).sort().reverse(); // Most recent first
        let currentStreak = 0;

        for (let i = 0; i < sortedDates.length; i++) {
            // Calculate expected date (today - i days)
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() - i);
            const expectedDateStr = expectedDate.toISOString().split('T')[0];

            // Check if this date matches and has activity
            if (sortedDates[i] === expectedDateStr && dailyStats[sortedDates[i]].solved > 0) {
                currentStreak++;
            } else {
                // Streak broken
                break;
            }
        }

        res.json({
            totalQuestionsSolved,
            totalTimeSavedMins,
            dailyStats,
            topSubjects,
            currentStreak
        });

    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});



// Generate Summary
app.post('/api/summary/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        console.log(`Generating summary for file: ${fileId}`);

        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if summary already exists? User might want to regenerate.
        // Assuming we proceed.

        // Get text content
        let textContext = '';
        if (file.transcript) {
            textContext = file.transcript;
        } else if (file.path || file.filename) {
            const tryPath = file.path || path.join(__dirname, 'uploads', file.filename);
            try {
                textContext = await parseDocument(tryPath);
            } catch (e) {
                console.log("File read error for summary:", e.message);
            }
        }

        if (!textContext || textContext.length < 50) {
            return res.status(400).json({ error: 'Not enough content to summarize' });
        }

        const summary = await generateSummary(textContext, undefined, file.filename);
        file.summary = summary;

        await saveDB(req, db);

        res.json({ success: true, summary: summary });

    } catch (err) {
        console.error('Summary API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Generate More Questions
app.post('/api/generate-more/:id', async (req, res) => {
    try {

        const fileId = req.params.id;
        const db = await getDB(req);
        const file = db.files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        let textContext = '';

        // Try to read original file first
        if (file.path || file.filename) {
            // Logic to find path. 
            // Note: in previous code, I used path.join(__dirname, 'uploads', file.filename)
            // But valid "file.path" might be absolute if set?
            // Let's try standard upload path first.
            const tryPath = file.path || path.join(__dirname, 'uploads', file.filename);
            try {
                await fs.access(tryPath);
                textContext = await parseDocument(tryPath);
            } catch (e) {
                console.log("File access failed, falling back to metadata:", e.message);
            }
        }

        // If no text context from file, check for stored transcript (YouTube videos)
        if (!textContext && file.transcript) {
            console.log("Using stored transcript from database...");
            textContext = file.transcript;
        }

        // If still no text context, build from metadata
        if (!textContext) {
            console.log("Constructing context from metadata...");
            textContext = `Title: ${file.filename}

`;

            if (file.summary) {
                textContext += `Summary: ${file.summary}

`;
            }

            if (file.questions && file.questions.length > 0) {
                // Add a few existing questions as context
                const existingQs = file.questions.slice(0, 5).map(q => q.question).join('\n- ');
                textContext += `Content Context (Existing Questions):
- ${existingQs}`;
            }

            if (textContext.length < 50) {
                return res.status(400).json({ error: 'Not enough content (summary or questions) to generate more.' });
            }
        }

        // Robust API Key Extraction
        let apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey === 'null' || apiKey === 'undefined' || apiKey === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }
        // Final fallback
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY;

        const { mode } = req.body; // 'conceptual' or 'applicable'

        // Generate 5 questions based on mode (default standard if undefined)
        // Avoid duplicates
        const avoidList = (file.questions || []).map(q => q.question);

        const result = await generateQuestions(textContext, apiKey, 5, file.filename, '', null, mode || 'standard', avoidList);

        if (!result.questions || result.questions.length === 0) {
            throw new Error('AI failed to generate questions');
        }

        // Append
        if (!file.questions) file.questions = [];
        file.questions.push(...result.questions);

        await saveDB(req, db);

        res.json({ success: true, newQuestions: result.questions });

    } catch (err) {
        console.error('Generate More Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// Translation endpoint using Gemini
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        // Robust API Key Extraction
        let apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey === 'null' || apiKey === 'undefined' || apiKey === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }
        // Final fallback
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY;

        if (!text || !targetLang) {
            return res.status(400).json({ error: 'Missing text or targetLang' });
        }

        // Map language codes to full names for better Gemini comprehension
        const langMap = {
            'en': 'English',
            'zh': 'Chinese',
            'ko': 'Korean',
            'ja': 'Japanese',
            'fr': 'French',
            'de': 'German',
            'es': 'Spanish',
            'pt': 'Portuguese',
            'vi': 'Vietnamese',
            'hi': 'Hindi',
            'ar': 'Arabic'
        };

        const targetLanguage = langMap[targetLang] || targetLang;


        const genAI = new GoogleGenerativeAI(apiKey);
        // Use flash-latest which is more stable
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const prompt = `Translate the following text to ${targetLanguage}. Only return the translation, nothing else.\n\nText: ${text}`;

        const result = await model.generateContent(prompt);
        const translation = result.response.text().trim();

        res.json({ translation });

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
});

// --- Image Generation API (Nano Banana) ---
// --- Image Generation API (Nano Banana) ---
app.post('/api/generate-image', async (req, res) => {
    try {
        const { question, context, apiKey } = req.body;
        const keyToUse = apiKey || process.env.GEMINI_API_KEY;

        if (!keyToUse) {
            return res.status(500).json({ error: "Missing API Key" });
        }

        // 1. Check Cache First (Efficiency)
        let userId = req.headers['x-user-id'] || 'guest';
        userId = userId.replace(/[^a-zA-Z0-9_-]/g, '').trim();
        if (!userId) userId = 'guest';

        const cacheDir = path.join(__dirname, 'public/cache/reels', userId);
        console.log(`[API Gen] Target Cache Dir: ${cacheDir}`);
        await fs.mkdir(cacheDir, { recursive: true });

        const hash = Buffer.from(question.trim()).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);

        try {
            const existingFiles = await fs.readdir(cacheDir);
            const cachedFile = existingFiles.find(f => f.startsWith(hash));
            if (cachedFile) {
                const cachedPath = path.join(cacheDir, cachedFile);
                const stats = await fs.stat(cachedPath);

                // CRITICAL FIX: Check if cached file is a valid image (size > 1KB)
                if (stats.size > 1000) {
                    console.log(`[API Gen] CACHE HIT for: "${question.substring(0, 20)}..." (${stats.size} bytes)`);
                    return res.json({
                        imageUrl: `/cache/reels/${userId}/${cachedFile}`,
                        prompt: "Restored from cache"
                    });
                } else {
                    console.warn(`[API Gen] Found broken/small cached image (${stats.size} bytes). Deleting and regenerating.`);
                    await fs.unlink(cachedPath);
                }
            }
        } catch (e) { /* ignore read error */ }

        // 2. Generate Prompt (Only on Cache Miss)

        const fullPromptContext = context ? `[Context: ${context}] ${question}` : question;
        // Prompt Engineering (Gemini Text) - KEPT AS REQUESTED
        const generatedPrompt = await generateImagePrompt(fullPromptContext, keyToUse, "");

        // User Request: Use the raw prompt returned (which is now the direct question).
        const finalPrompt = generatedPrompt;

        console.log(`[API Gen] Pollinations Flux for: "${finalPrompt.substring(0, 50)}..."`);

        // Use Pollinations (Flux) as requested by user
        console.log(`[API Gen] Generating with Pollinations Flux (Authenticated)...`);

        // CRITICAL: Use the specific Pollinations Key from env, NOT the Gemini key
        const imageBase64 = await generateImageWithPollinations(finalPrompt, process.env.POLLINATIONS_API_KEY);

        const imageBuffer = Buffer.from(imageBase64, 'base64');

        // CRITICAL FIX: Validate generated image size before caching
        if (imageBuffer.length < 1000) {
            console.warn(`[API Gen] Generation Failed (Result too small: ${imageBuffer.length} bytes). Returning Placeholder.`);
            return res.json({
                imageUrl: '/placeholder.png', // Fallback to safe placeholder
                prompt: "Generation Failed - Fallback"
            });
        }

        const filename = `${hash}.png`; // Fixed name for persistence
        const filePath = path.join(cacheDir, filename);

        await fs.writeFile(filePath, imageBuffer);
        const imageUrl = `/cache/reels/${userId}/${filename}?t=${Date.now()}`;

        console.log(`[API Gen] Success! Saved to: ${imageUrl}`);
        res.json({ imageUrl, prompt: finalPrompt });

    } catch (err) {
        console.error("Image Gen API Failed:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});
