import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateQuestions, generateSummary, generateQuestionsForCreativeWork, generateSimilarQuestions } from '../aiService.js';
import fetch from 'node-fetch';

/**
 * AI Proxy Endpoints
 * These allow the client to use the server's GEMINI_API_KEY
 * when the user hasn't provided their own.
 */

export const generateQuestionsProxy = async (req, res) => {
    try {
        const { text, title, count, context, distribution, avoidQuestions } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!text) return res.status(400).json({ error: 'Text is required' });

        const result = await generateQuestions(text, apiKey, count, title, context, null, distribution, avoidQuestions);
        res.json(result);
    } catch (error) {
        console.error('[Proxy] Questions Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const generateSummaryProxy = async (req, res) => {
    try {
        const { text, title } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!text) return res.status(400).json({ error: 'Text is required' });

        const summary = await generateSummary(text, apiKey, title);
        res.json({ summary });
    } catch (error) {
        console.error('[Proxy] Summary Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const generateCreativeProxy = async (req, res) => {
    try {
        const { title, author, type, count } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!title) return res.status(400).json({ error: 'Title is required' });

        const result = await generateQuestionsForCreativeWork(title, author, type, apiKey, count);
        res.json(result);
    } catch (error) {
        console.error('[Proxy] Creative Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const generateSimilarQuestionsProxy = async (req, res) => {
    try {
        const { seedQuestion, context, type, existingQuestions, sourceTitle } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!seedQuestion) return res.status(400).json({ error: 'Seed question is required' });

        const result = await generateSimilarQuestions(seedQuestion, context, type, apiKey, existingQuestions, sourceTitle);
        res.json(result);
    } catch (error) {
        console.error('[Proxy] Similar Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const proxyImage = async (req, res) => {
    try {
        const { prompt, seed, width = 800, height = 600 } = req.query;
        if (!prompt) return res.status(400).send('Prompt is required');

        const encodedPrompt = encodeURIComponent(prompt);
        // Using flux from server as it's often more stable for server-side fetches
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed || 123}&nologo=true&model=flux`;

        console.log(`[Proxy Image] Fetching for client: ${prompt.substring(0, 40)}...`);

        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            timeout: 30000 // 30s timeout
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No error body');
            throw new Error(`Pollinations status ${response.status}: ${errorBody.substring(0, 100)}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Received empty image from Pollinations');
        }

        const buffer = Buffer.from(arrayBuffer);

        res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.send(buffer);
    } catch (error) {
        console.error('[Proxy Image] Error:', error.message);
        res.status(500).send(`Failed to proxy image: ${error.message}`);
    }
};

/**
 * Generate Image Prompt Endpoint - V10
 * NO GEMINI - Returns cleaned question text directly for Pollinations API
 */
export const generateImagePromptEndpoint = async (req, res) => {
    try {
        let { question, explanation, fullQuestion, context } = req.body;

        // Robustness: If fullQuestion object is passed instead of flat fields
        if (fullQuestion && typeof fullQuestion === 'object') {
            question = question || fullQuestion.question;
            explanation = explanation || fullQuestion.explanation;
        }

        if (!question) {
            return res.status(400).json({ error: 'Question required' });
        }

        // V10: No Gemini - Use question text directly as visual prompt
        // Clean the question text for image generation
        let prompt = question
            .replace(/\?|-\s*T\d+/g, '') // Remove ? and T1/T2 markers
            .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
            .trim();

        // Add context if available
        if (context) {
            prompt = `${context}: ${prompt}`;
        }

        // Limit length
        prompt = prompt.substring(0, 200);

        console.log(`[V10 Prompt] Question → "${prompt}"`);

        res.json({ prompt });
    } catch (error) {
        console.error('[V10 Prompt] Failed:', error);
        res.status(500).json({ error: 'Failed to generate prompt' });
    }
};

export const translateText = async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        // Robust API Key Extraction
        let apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey === 'null' || apiKey === 'undefined' || apiKey === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY;

        if (!text || !targetLang) {
            return res.status(400).json({ error: 'Missing text or targetLang' });
        }

        // Map language codes
        const langMap = {
            'en': 'English', 'zh': 'Chinese', 'ko': 'Korean', 'ja': 'Japanese',
            'fr': 'French', 'de': 'German', 'es': 'Spanish', 'pt': 'Portuguese',
            'vi': 'Vietnamese', 'hi': 'Hindi', 'ar': 'Arabic'
        };

        const targetLanguage = langMap[targetLang] || targetLang;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const prompt = `Translate the following text to ${targetLanguage}. Only return the translation, nothing else.\n\nText: ${text}`;

        const result = await model.generateContent(prompt);
        const translation = result.response.text().trim();

        res.json({ translation });

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
};
