import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';
import 'dotenv/config';
import { log } from '../utils/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const API_KEY = process.env.POLLINATIONS_API_KEY;

// Helper: Generate with POST and Fallback
async function generateImageWithPollinations(prompt) {
    if (!API_KEY) {
        log.warn('POLLINATIONS_API_KEY not found. Using free tier (slower/rate-limited).');
    }

    const rawPrompt = prompt || "educational image";
    const seed = Math.floor(Math.random() * 1000000);

    // Attempt 1: High Quality (Flux)
    try {
        log.info(`[ImageService] Calling API (Model: Flux)...`);
        return await makePollinationsRequest(rawPrompt, seed, 'flux');
    } catch (err) {
        log.warn(`[ImageService] Flux failed: ${err.message}. Retrying with Turbo...`);
    }

    // Attempt 2: Fast Fallback (Turbo)
    try {
        log.info(`[ImageService] Calling API (Fallback: Turbo)...`);
        return await makePollinationsRequest(rawPrompt, seed, 'turbo');
    } catch (err) {
        log.error(`[ImageService] All attempts failed:`, err.message);
        throw err;
    }
}

// Helper: Make Request (Updated to use GET on gen.pollinations.ai Gateway)
async function makePollinationsRequest(prompt, seed, model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
        const encodedPrompt = encodeURIComponent(prompt);
        const keyParam = API_KEY ? `&key=${API_KEY}` : '';
        const url = `https://gen.pollinations.ai/image/${encodedPrompt}?width=800&height=600&seed=${seed}&nologo=true&model=${model}${keyParam}`;

        const headers = {
            'User-Agent': 'Nodejs-Render-Client'
        };
        if (API_KEY) {
            headers['Authorization'] = `Bearer ${API_KEY}`;
        }

        log.info(`[ImageService] GET gen.pollinations.ai (Model: ${model})`);

        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image')) {
            const text = await response.text();
            throw new Error(`Invalid Content-Type: ${contentType}. Response: ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            throw new Error(`Pollinations Error: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();

        if (buffer.byteLength < 5000) {
            throw new Error(`Image too small (${buffer.byteLength} bytes). Likely an error placeholder.`);
        }

        log.info(`[ImageService] Received valid image (${buffer.byteLength} bytes, type: ${contentType})`);
        return Buffer.from(buffer);

    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Generate and Save Image for Question
 */
export async function generateQuestionImage(question, userId, apiKey) {
    try {
        const imageDir = path.join(PROJECT_ROOT, 'public', 'images', 'questions');
        await fs.mkdir(imageDir, { recursive: true });

        let questionText = "unknown_question";
        if (typeof question.question === 'string') {
            questionText = question.question;
        } else if (typeof question.question === 'object' && question.question.question) {
            questionText = question.question.question;
        } else if (typeof question === 'string') {
            questionText = question;
        } else {
            questionText = JSON.stringify(question).substring(0, 50);
        }

        const hash = crypto.createHash('md5').update(questionText).digest('hex').substring(0, 12);
        const filename = `poll_v10.1_${hash}.png`;
        const filePath = path.join(imageDir, filename);

        // Check if image already exists
        try {
            await fs.access(filePath);
            const stats = await fs.stat(filePath);
            if (stats.size > 1000) {
                log.info(`[ImageService] Cache HIT: ${filename}`);
                return `/images/questions/${filename}`;
            }
        } catch (e) { }

        const imagePrompt = question.imagePrompt || questionText;
        log.info(`[ImageService] Processing: "${imagePrompt.substring(0, 40)}..."`);

        const imageBuffer = await generateImageWithPollinations(imagePrompt);

        if (!imageBuffer || imageBuffer.length < 1000) {
            log.warn(`[ImageService] Generation failed (too small: ${imageBuffer?.length || 0} bytes)`);
            const fallbackSeed = Math.floor(Math.random() * 1000);
            return `https://picsum.photos/seed/${fallbackSeed}/800/600`;
        }

        await fs.writeFile(filePath, imageBuffer);
        log.info(`[ImageService] Saved ${filename} (${imageBuffer.length} bytes)`);

        return `/images/questions/${filename}`;
    } catch (error) {
        log.error('[ImageService] Generation error:', error.message);
        const fallbackSeed = Math.floor(Math.random() * 1000);
        return `https://picsum.photos/seed/${fallbackSeed}/800/600`;
    }
}

/**
 * Generate images for multiple questions sequentially
 */
export async function generateImagesForQuestions(questions) {
    log.info(`[ImageService] Starting batch generation for ${questions.length} questions`);

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        try {
            const encodedPrompt = encodeURIComponent(q.imagePrompt || q.question);
            const seed = Math.floor(Math.random() * 1000000);
            const keyParam = API_KEY ? `&key=${API_KEY}` : '';
            const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=800&height=600&seed=${seed}&nologo=true&model=flux${keyParam}`;

            log.info(`[ImageService] Batch Q${i + 1}: calling gen.pollinations.ai...`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(imageUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'User-Agent': 'Nodejs-Render-Client'
                },
                signal: controller.signal
            });

            clearTimeout(timeout);

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image')) {
                const text = await response.text();
                throw new Error(`Invalid Content-Type: ${contentType}. Response: ${text.substring(0, 100)}`);
            }

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const filename = `poll_${Date.now()}_${i}.png`;
            const imageDir = path.join(PROJECT_ROOT, 'public', 'images', 'questions');
            await fs.mkdir(imageDir, { recursive: true });
            const outputPath = path.join(imageDir, filename);

            await fs.writeFile(outputPath, Buffer.from(buffer));
            q.imageUrl = `/images/questions/${filename}`;

            log.info(`[ImageService] Batch Q${i + 1} success (${buffer.byteLength} bytes)`);

        } catch (err) {
            log.error(`[ImageService] Batch Q${i + 1} failed:`, err.message);
            q.imageUrl = `https://picsum.photos/seed/${Math.floor(Math.random() * 1000)}/800/600`;
        }

        if (i < questions.length - 1) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    log.info("[ImageService] Batch generation complete");
    return questions;
}
