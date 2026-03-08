// Image generation functions
// Extracted from the monolithic aiService.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { defaultApiKey, extractVisualConcepts } from './aiUtils.js';

/**
 * Generates a visual description for image generation based on question content.
 * Pollinations requires English visual descriptions, not raw questions.
 */
async function generateImagePrompt(questionText, apiKey, explanationText = "") {
    const key = apiKey || defaultApiKey;
    if (!key || key === 'YOUR_API_KEY_HERE') {
        // Fallback: extract visual concepts from question
        return extractVisualConcepts(questionText);
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Convert this question into a SHORT, VISUAL description for image generation (max 10 words).
Focus on the main subject/concept, not the question structure.
Output ONLY the visual description in English, nothing else.

Question: ${questionText}

Example:
Question: "What impact do food trends have on society?"
Output: "diverse food trends influencing modern society"

Question: "How does AI affect daily life?"
Output: "artificial intelligence transforming everyday activities"

Output:`;

        const result = await model.generateContent(prompt);
        const description = result.response.text().trim()
            .replace(/^["']|["']$/g, '') // Remove quotes
            .substring(0, 200); // Limit length

        console.log(`[Image Prompt] "${questionText.substring(0, 30)}..." → "${description}"`);
        return description;

    } catch (error) {
        console.error('Image prompt generation error:', error.message);
        return extractVisualConcepts(questionText);
    }
}

// Gemini 2.5 Flash Image Generation (delegates to Pollinations)
async function generateImageWithGeminiFlash(prompt, apiKey) {
    // DIRECT POLLINATIONS.AI INTEGRATION
    try {
        const pKey = process.env.POLLINATIONS_API_KEY || "";
        return await generateImageWithSiliconFlow(prompt, pKey);

    } catch (error) {
        console.error("Pollinations (via Flash) Generation Failed:", error.message);
        return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    }
}

/**
 * Native Google Imagen 3 Integration
 * Calls the Imagen 3 API using the user's Gemini API Key.
 */
async function generateImageWithImagen(prompt, apiKey) {
    const key = apiKey || defaultApiKey;
    if (!key || key.length < 10) throw new Error("Missing Gemini API Key");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;

    const body = {
        instances: [
            { prompt: prompt }
        ],
        parameters: {
            sampleCount: 1,
            aspectRatio: "3:4" // Preferred for mobile-style quiz cards
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Imagen API Error ${response.status}:`, errorText);
            throw new Error(`Imagen API failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data.predictions && data.predictions.length > 0) {
            return data.predictions[0].bytesBase64Encoded;
        } else {
            throw new Error("No image data in Imagen response");
        }
    } catch (error) {
        console.error("Imagen Request Failed:", error);
        throw error;
    }
}

async function generateImageWithSiliconFlow(prompt, apiKey) {
    // USE POLLINATIONS API WITH AUTHENTICATION
    console.log(`[Pollinations] 🎨 Starting generation with API key...`);
    console.log(`[Pollinations] 📝 Prompt: "${prompt.substring(0, 60)}..."`);

    // Get API key from environment
    const pollinationsKey = process.env.POLLINATIONS_API_KEY || apiKey;

    if (!pollinationsKey) {
        console.error(`[Pollinations] ❌ No API key found!`);
        throw new Error('POLLINATIONS_API_KEY not set');
    }

    const maskedKey = `${pollinationsKey.substring(0, 5)}...${pollinationsKey.substring(pollinationsKey.length - 4)}`;
    console.log(`[Pollinations] 🔑 Using Key: ${maskedKey}`);

    try {
        // Pollinations pollen-tier endpoint (gen.pollinations.ai for sk_ keys)
        const encodedPrompt = encodeURIComponent(prompt);
        const randomSeed = Math.floor(Math.random() * 1000000);
        const fullUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&nologo=true&model=flux&key=${pollinationsKey}`;

        console.log(`[Pollinations] 🌐 API URL: ${fullUrl.substring(0, 100)}...`);

        // 30-second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.error(`[Pollinations] ⏱️ Request timeout after 30 seconds`);
            controller.abort();
        }, 30000);

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${pollinationsKey}`,
                'Accept': 'image/*'
            },
            signal: controller.signal,
            redirect: 'follow'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Pollinations API returned status ${response.status}`);
        }

        const imageBuffer = await response.arrayBuffer();
        console.log(`[Pollinations] Downloaded ${imageBuffer.byteLength} bytes`);

        const base64 = Buffer.from(imageBuffer).toString('base64');
        console.log(`[Pollinations] ✅ Success! (${base64.length} chars base64)`);
        return base64;

    } catch (error) {
        console.error(`[Pollinations] ❌ API generation failed: ${error.message}`);

        // FALLBACK 1: Try Picsum (random image service)
        try {
            const hash = Math.random().toString(36).substring(7);
            const picsumUrl = `https://picsum.photos/seed/${hash}/800/600`;
            console.log(`[Picsum] 🔄 Attempting fallback: ${picsumUrl}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(picsumUrl, {
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                throw new Error(`Picsum returned status ${res.status}`);
            }

            const buf = await res.arrayBuffer();
            console.log(`[Picsum] Downloaded ${buf.byteLength} bytes`);

            const base64 = Buffer.from(buf).toString('base64');
            console.log(`[Picsum] ✅ Fallback success`);
            return base64;

        } catch (e) {
            console.error(`[Picsum] ❌ Fallback failed: ${e.message}`);

            // SAFETY NET: Return 1x1 red pixel
            console.warn("[Safety Net] 🟥 Returning red pixel fallback");
            return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKwAEAAAAABJRU5ErkJggg==";
        }
    }
}

export {
    generateImagePrompt,
    generateImageWithGeminiFlash,
    generateImageWithImagen,
    generateImageWithSiliconFlow
};
