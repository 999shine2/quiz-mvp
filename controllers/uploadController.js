import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';

import { parseDocument } from '../documentParser.js'; // Adjust path if moved, but it's in root
import { generateQuestions, generateSummary } from '../aiService.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';
import { logActivity } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export const uploadFile = async (req, res) => {
    console.log("!!! DEBUG: REAL SEQUENTIAL LOOP STARTING !!!");
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { apiKey } = req.body;

        const startParse = Date.now();
        console.log(`Parsing file: ${req.file.originalname}...`);

        // documentParser is in root, req.file.path is absolute or relative to run dir
        const text = await parseDocument(req.file.path, req.file.mimetype);
        console.log(`Parsed in ${Date.now() - startParse}ms`);

        const db = await getDB(req);
        const existingFiles = db.files || [];
        let relatedContext = "";

        const contextFiles = existingFiles.slice(0, 3);
        if (contextFiles.length > 0) {
            relatedContext = contextFiles.map(f =>
                `Title: ${f.filename}\nSummary: ${f.summary || "No summary."}`
            ).join("\n\n---\n\n");
            console.log(`Included context from ${contextFiles.length} files.`);
        }

        const startAI = Date.now();
        console.log('Generating questions with AI (Count: 5, with Context)...');

        const [aiResult, autoSummary] = await Promise.all([
            generateQuestions(text, apiKey, 5, req.file.originalname, relatedContext),
            generateSummary(text, apiKey, req.file.originalname)
        ]);

        console.log(`Generated in ${Date.now() - startAI}ms`);
        const newFileEntry = {
            id: Date.now().toString(),
            filename: req.file.originalname,
            path: req.file.path,
            type: 'document',
            uploadedAt: new Date().toISOString(),
            questions: aiResult.questions,
            subjectEmoji: aiResult.subjectEmoji,
            summary: autoSummary
        };

        db.files.unshift(newFileEntry);
        const userId = getUserID(req);
        await logActivity(userId, 'upload', { filename: newFileEntry.filename });

        // [[ V10 - PICSUM PRIMARY ]]
        console.log("=== [SEQ-V10] STARTING IMAGE GENERATION (Picsum) ===");

        for (let i = 0; i < newFileEntry.questions.length; i++) {
            const q = newFileEntry.questions[i];
            console.log(`[SEQ-V10] ▶️ Requesting Q${i + 1}/${newFileEntry.questions.length}...`);

            try {
                const hash = crypto.createHash('md5').update(q.question).digest('hex').substring(0, 8);
                const randomSeed = `${hash}-${Date.now()}`;
                const imageUrl = `https://picsum.photos/seed/${randomSeed}/1024/768`;

                console.log(`[SEQ-V10] 📡 Fetching Picsum: ${imageUrl.substring(0, 60)}...`);

                const response = await fetch(imageUrl, {
                    method: 'GET',
                    headers: { 'User-Agent': 'Nodejs-Render-App' },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(30000)
                });

                if (!response.ok) {
                    throw new Error(`Picsum Error: ${response.status}`);
                }

                const buffer = await response.arrayBuffer();
                console.log(`[SEQ-V10] Downloaded ${buffer.byteLength} bytes`);

                const filename = `${hash}-${Date.now()}.jpg`;
                const imageDir = path.join(PROJECT_ROOT, 'public/images/questions');
                await fs.mkdir(imageDir, { recursive: true }); // Ensure dir exists
                const filepath = path.join(imageDir, filename);

                await fs.writeFile(filepath, Buffer.from(buffer));

                q.imageUrl = `/images/questions/${filename}`;
                console.log(`[SEQ-V10] ✅ Saved Q${i + 1}: ${filename}`);

            } catch (err) {
                console.error(`[SEQ-V10] ❌ Failed Q${i + 1}:`, err.message);
            }

            if (i < newFileEntry.questions.length - 1) {
                console.log(`[SEQ-V10] 💤 Resting 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        console.log("=== [SEQ-V10] ALL DONE ===");

        await saveDB(req, db);
        res.json({ ...newFileEntry, isMock: aiResult.isMock });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: error.message || 'Failed to process file' });
    }
};

export const updateFile = async (req, res) => {
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

        const userId = getUserID(req);
        await logActivity(userId, 'rename_file', { fileId, oldName, newName: file.filename });
        await saveDB(req, db);

        console.log(`Renamed file ${fileId}: "${oldName}" -> "${file.filename}"`);
        res.json({ success: true, file });

    } catch (error) {
        console.error('Update file error:', error);
        res.status(500).json({ error: 'Failed to update file' });
    }
};
