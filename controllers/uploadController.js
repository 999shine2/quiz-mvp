import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';

import { parseDocument } from '../services/documentParser.js';
import { generateQuestions, generateSummary } from '../services/questionGenerator.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';
import { logActivity } from '../utils/activityLogger.js';
import { log } from '../utils/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

export const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { apiKey } = req.body;

        log.info(`Parsing file: ${req.file.originalname}...`);
        const text = await parseDocument(req.file.path, req.file.mimetype);

        const db = await getDB(req);
        const existingFiles = db.files || [];
        let relatedContext = "";

        const contextFiles = existingFiles.slice(0, 3);
        if (contextFiles.length > 0) {
            relatedContext = contextFiles.map(f =>
                `Title: ${f.filename}\nSummary: ${f.summary || "No summary."}`
            ).join("\n\n---\n\n");
        }

        log.info('Generating questions with AI (Count: 5, with Context)...');

        const [aiResult, autoSummary] = await Promise.all([
            generateQuestions(text, apiKey, 5, req.file.originalname, relatedContext),
            generateSummary(text, apiKey, req.file.originalname)
        ]);

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

        for (let i = 0; i < newFileEntry.questions.length; i++) {
            const q = newFileEntry.questions[i];

            try {
                const hash = crypto.createHash('md5').update(q.question).digest('hex').substring(0, 8);
                const randomSeed = `${hash}-${Date.now()}`;
                const imageUrl = `https://picsum.photos/seed/${randomSeed}/1024/768`;

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

                const filename = `${hash}-${Date.now()}.jpg`;
                const imageDir = path.join(PROJECT_ROOT, 'public/images/questions');
                await fs.mkdir(imageDir, { recursive: true });
                const filepath = path.join(imageDir, filename);

                await fs.writeFile(filepath, Buffer.from(buffer));
                q.imageUrl = `/images/questions/${filename}`;
                log.info(`[Upload] Image saved Q${i + 1}: ${filename}`);

            } catch (err) {
                log.error(`[Upload] Image failed Q${i + 1}:`, err.message);
            }

            if (i < newFileEntry.questions.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        await saveDB(req, db);
        res.json({ ...newFileEntry, isMock: aiResult.isMock });
    } catch (error) {
        log.error('Error processing upload:', error);
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

        log.info(`Renamed file ${fileId}: "${oldName}" -> "${file.filename}"`);
        res.json({ success: true, file });

    } catch (error) {
        log.error('Update file error:', error);
        res.status(500).json({ error: 'Failed to update file' });
    }
};
