import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Generate Image Endpoint - V10 Pollinations Only
 * NO Gemini, NO SiliconFlow
 * Uses only Pollinations API with Bearer Token
 */
export const generateImageEndpoint = async (req, res) => {
    try {
        const { question, context } = req.body;
        const API_KEY = process.env.POLLINATIONS_API_KEY;

        if (!API_KEY) {
            return res.status(500).json({ error: "Missing POLLINATIONS_API_KEY in environment" });
        }

        if (!question) {
            return res.status(400).json({ error: "Question text is required" });
        }

        // 1. Check Cache
        let userId = req.headers['x-user-id'] || 'guest';
        userId = userId.replace(/[^a-zA-Z0-9_-]/g, '').trim();
        if (!userId) userId = 'guest';

        const cacheDir = path.join(PROJECT_ROOT, 'public/cache/reels', userId);
        await fs.mkdir(cacheDir, { recursive: true });

        const hash = Buffer.from(question.trim()).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);

        try {
            const existingFiles = await fs.readdir(cacheDir);
            const cachedFile = existingFiles.find(f => f.startsWith(hash));
            if (cachedFile) {
                const cachedPath = path.join(cacheDir, cachedFile);
                const stats = await fs.stat(cachedPath);
                if (stats.size > 1000) {
                    console.log(`[V10 Cache] HIT: ${cachedFile}`);
                    return res.json({
                        imageUrl: `/cache/reels/${userId}/${cachedFile}`,
                        prompt: "Restored from cache"
                    });
                }
            }
        } catch (e) { }

        // 2. Generate with gen.pollinations.ai pollen-tier endpoint
        const rawPrompt = context ? `${context}: ${question}` : question;
        const encodedPrompt = encodeURIComponent(rawPrompt);
        const seed = Math.floor(Math.random() * 1000000);
        const keyParam = API_KEY ? `&key=${API_KEY}` : '';

        const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=800&height=600&seed=${seed}&nologo=true&model=flux${keyParam}`;

        console.log(`[V10] 📡 Calling gen.pollinations.ai for: "${rawPrompt.substring(0, 40)}..."`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const response = await fetch(imageUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'User-Agent': 'Nodejs-Render-Client'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`Pollinations Error: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);

        if (imageBuffer.length < 1000) {
            console.warn(`[V10] Generation failed (too small: ${imageBuffer.length} bytes)`);
            return res.json({ imageUrl: '/placeholder.png', prompt: "Generation Failed - Fallback" });
        }

        // 3. Save to Cache
        const filename = `${hash}.png`;
        const filePath = path.join(cacheDir, filename);

        await fs.writeFile(filePath, imageBuffer);
        const savedImageUrl = `/cache/reels/${userId}/${filename}?t=${Date.now()}`;

        console.log(`[V10] ✅ Success: ${filename} (${imageBuffer.length} bytes)`);

        res.json({ imageUrl: savedImageUrl, prompt: rawPrompt });

    } catch (err) {
        console.error("[V10] Image Gen API Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
};
