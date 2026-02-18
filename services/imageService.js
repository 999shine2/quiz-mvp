import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';
import 'dotenv/config'; // Load env vars for standalone usage

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..'); // Up one level

console.log("=== [SEQ-V10.1] STARTING Pollinations Engine (With Validation) ===");

const API_KEY = process.env.POLLINATIONS_API_KEY;

// Helper: Generate with POST and Fallback
async function generateImageWithPollinations(prompt) {
    if (!API_KEY) {
        console.warn('POLLINATIONS_API_KEY not found. Using free tier (slower/rate-limited).');
    }

    const rawPrompt = prompt || "educational image";
    const seed = Math.floor(Math.random() * 1000000);

    // Attempt 1: High Quality (Flux)
    try {
        console.log(`[SEQ-V10.1] 📡 Calling API (Model: Flux)...`);
        return await makePollinationsRequest(rawPrompt, seed, 'flux');
    } catch (err) {
        console.warn(`[SEQ-V10.1] ⚠️ Flux failed: ${err.message}. Retrying with Turbo...`);
    }

    // Attempt 2: Fast Fallback (Turbo)
    try {
        console.log(`[SEQ-V10.1] 📡 Calling API (Fallback: Turbo)...`);
        return await makePollinationsRequest(rawPrompt, seed, 'turbo');
    } catch (err) {
        console.error(`[SEQ-V10.1] ❌ All attempts failed:`, err.message);
        throw err;
    }
}

// Helper: Make Request (Updated to use GET on gen.pollinations.ai Gateway)
async function makePollinationsRequest(prompt, seed, model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout

    try {
        // Use the authenticated API Gateway
        const baseUrl = 'https://gen.pollinations.ai/image';
        const encodedPrompt = encodeURIComponent(prompt);
        const url = `${baseUrl}/${encodedPrompt}?width=800&height=600&seed=${seed}&nologo=true&model=${model}`;

        const headers = {
            'User-Agent': 'Nodejs-Render-Client'
        };
        if (API_KEY) {
            headers['Authorization'] = `Bearer ${API_KEY}`;
        }

        console.log(`[SEQ-V10.1] 📡 Calling API: GET ${baseUrl}/... (Model: ${model})`);

        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });

        // Validate Content-Type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image')) {
            const text = await response.text();
            throw new Error(`Invalid Content-Type: ${contentType}. Response: ${text.substring(0, 200)}`);
        }

        if (!response.ok) {
            throw new Error(`Pollinations Error: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();

        // Validate Size
        if (buffer.byteLength < 5000) {
            throw new Error(`Image too small (${buffer.byteLength} bytes). Likely an error placeholder.`);
        }

        console.log(`[SEQ-V10.1] ✅ Received valid image (${buffer.byteLength} bytes, type: ${contentType})`);
        return Buffer.from(buffer);

    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Generate and Save Image for Question
 * V10.1 - With Content-Type Validation and Fallback
 */
export async function generateQuestionImage(question, userId, apiKey) {
    try {
        const imageDir = path.join(PROJECT_ROOT, 'public', 'images', 'questions');
        await fs.mkdir(imageDir, { recursive: true });

        // Safely extract question text (handle both String and Object cases)
        let questionText = "unknown_question";
        if (typeof question.question === 'string') {
            questionText = question.question;
        } else if (typeof question.question === 'object' && question.question.question) {
            questionText = question.question.question;
        } else if (typeof question === 'string') {
            questionText = question;
        } else {
            // Safe Fallback
            questionText = JSON.stringify(question).substring(0, 50);
        }

        // Create hash from question text for caching
        const hash = crypto.createHash('md5').update(questionText).digest('hex').substring(0, 12);
        const filename = `poll_v10.1_${hash}.png`;
        const filePath = path.join(imageDir, filename);

        // Check if image already exists
        try {
            await fs.access(filePath);
            const stats = await fs.stat(filePath);
            if (stats.size > 1000) {
                console.log(`[SEQ-V10.1] Cache HIT: ${filename}`);
                return `/images/questions/${filename}`;
            }
        } catch (e) { }

        // Use imagePrompt from question or fallback to question text
        const imagePrompt = question.imagePrompt || questionText;
        console.log(`[SEQ-V10.1] ▶️ Processing: "${imagePrompt.substring(0, 40)}..."`);

        // Generate image using Pollinations API with validation
        const imageBuffer = await generateImageWithPollinations(imagePrompt);

        if (!imageBuffer || imageBuffer.length < 1000) {
            console.warn(`[SEQ-V10.1] Generation failed (too small: ${imageBuffer?.length || 0} bytes)`);
            // Fallback to Picsum placeholder
            const fallbackSeed = Math.floor(Math.random() * 1000);
            return `https://picsum.photos/seed/${fallbackSeed}/800/600`;
        }

        await fs.writeFile(filePath, imageBuffer);
        console.log(`[SEQ-V10.1] ✅ COMPLETE: Saved ${filename} (${imageBuffer.length} bytes)`);

        return `/images/questions/${filename}`;
    } catch (error) {
        console.error('[SEQ-V10.1] Generation error:', error.message);
        // Fallback to Picsum placeholder on error
        const fallbackSeed = Math.floor(Math.random() * 1000);
        return `https://picsum.photos/seed/${fallbackSeed}/800/600`;
    }
}

/**
 * Generate images for multiple questions sequentially
 * V10.1 - CRITICAL FIX: Content-Type Validation + Fallback
 */
export async function generateImagesForQuestions(questions) {
    console.log(`[SEQ-V10.1] Starting batch generation for ${questions.length} questions`);

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`[SEQ-V10.1] ▶️ Q${i + 1}: requesting image...`);

        try {
            const prompt = encodeURIComponent(q.imagePrompt || q.question);
            const seed = Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=800&height=600&seed=${seed}&nologo=true&model=flux`;

            // 1. Fetch with Timeout
            console.log(`[SEQ-V10.1] 📡 Calling Pollinations API...`);
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

            // 2. CHECK CONTENT TYPE (Crucial Fix)
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image')) {
                const text = await response.text();
                throw new Error(`Invalid Content-Type: ${contentType}. Response: ${text.substring(0, 100)}`);
            }

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            // 3. Save Real Image
            const buffer = await response.arrayBuffer();
            const filename = `poll_${Date.now()}_${i}.png`;
            const imageDir = path.join(PROJECT_ROOT, 'public', 'images', 'questions');
            await fs.mkdir(imageDir, { recursive: true });
            const outputPath = path.join(imageDir, filename);

            await fs.writeFile(outputPath, Buffer.from(buffer));
            q.imageUrl = `/images/questions/${filename}`;

            console.log(`[SEQ-V10.1] ✅ Success Q${i + 1} (${buffer.byteLength} bytes)`);

        } catch (err) {
            console.error(`[SEQ-V10.1] ❌ Failed Q${i + 1}:`, err.message);
            // Fallback to Picsum if Pollinations fails
            q.imageUrl = `https://picsum.photos/seed/${Math.floor(Math.random() * 1000)}/800/600`;
        }

        // 4. Mandatory Pause
        if (i < questions.length - 1) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    console.log("=== [SEQ-V10.1] ALL DONE ===");
    return questions;
}
