import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateQuestions, generateSummary, generateQuestionsForCreativeWork, generateSimilarQuestions } from '../aiService.js';
import fetch from 'node-fetch';
import { log } from '../utils/log.js';

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
        log.error('[Proxy] Questions Failed:', error);
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
        log.error('[Proxy] Summary Failed:', error);
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
        log.error('[Proxy] Creative Failed:', error);
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
        log.error('[Proxy] Similar Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const proxyImage = async (req, res) => {
    try {
        const { prompt, seed, width = 800, height = 600, model = 'flux' } = req.query;
        if (!prompt) return res.status(400).send('Prompt is required');

        const pollinationsKey = process.env.POLLINATIONS_API_KEY;
        log.info(`[Proxy Image] Incoming prompt: "${prompt.substring(0, 50)}"`);

        const optimizedPrompt = prompt;
        const encodedPrompt = encodeURIComponent(optimizedPrompt);

        const keyParam = pollinationsKey ? `&key=${pollinationsKey}` : '';
        const strategies = [
            {
                url: `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&seed=${seed || 123}&nologo=true&model=${model}${keyParam}`,
                headers: {
                    ...(pollinationsKey ? { 'Authorization': `Bearer ${pollinationsKey}` } : {}),
                    'User-Agent': 'Nodejs-Render-Client',
                    'Accept': 'image/*'
                }
            },
            {
                url: `https://gen.pollinations.ai/image/${encodedPrompt}?width=${width}&height=${height}&seed=${seed || 123}&nologo=true&model=flux`,
                headers: { 'User-Agent': 'Nodejs-Render-Client', 'Accept': 'image/*' }
            },
            {
                url: `https://loremflickr.com/${width}/${height}/${encodeURIComponent(optimizedPrompt.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').slice(0, 3).join(','))}`,
                headers: { 'User-Agent': 'Nodejs-Render-Client', 'Accept': 'image/*' }
            },
            {
                url: `https://picsum.photos/${width}/${height}?random=${seed || Date.now()}`,
                headers: { 'Accept': 'image/*' }
            }
        ];

        let lastError = null;
        for (const strategy of strategies) {
            try {
                log.info(`[Proxy Image] Attempting: ${strategy.url.substring(0, 80)}...`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000);

                const response = await fetch(strategy.url, {
                    headers: strategy.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.startsWith('image/')) {
                        log.warn(`[Proxy Image] Non-image content-type: ${contentType}. Skipping...`);
                        continue;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const byteLength = arrayBuffer.byteLength;

                    if (byteLength > 1000) {
                        if (byteLength === 16 && Buffer.from(arrayBuffer).toString().includes('error code: 1033')) {
                            log.warn(`[Proxy Image] Cloudflare 1033 detected. Skipping...`);
                            continue;
                        }
                        if (byteLength === 126099) {
                            log.warn(`[Proxy Image] Cat Statue fallback detected. Skipping...`);
                            continue;
                        }

                        const buffer = Buffer.from(arrayBuffer);
                        res.set('Content-Type', contentType);
                        res.set('Cache-Control', 'public, max-age=86400');
                        log.info(`[Proxy Image] Success (${byteLength} bytes, model=${model})`);
                        return res.send(buffer);
                    }
                }
                log.warn(`[Proxy Image] Strategy failed with status ${response.status}`);
            } catch (err) {
                log.error(`[Proxy Image] Strategy EXCEPTION: ${err.message}`);
                lastError = err;
            }
        }

        throw new Error(`All strategies failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
    } catch (error) {
        log.error('[Proxy Image] Final Error:', error.message);
        res.status(500).send(`Failed to proxy image: ${error.message}`);
    }
};

/**
 * Generate Image Prompt Endpoint - V10
 * Returns cleaned question text directly for Pollinations API
 */
export const generateImagePromptEndpoint = async (req, res) => {
    try {
        let { question, explanation, fullQuestion, context } = req.body;

        if (fullQuestion && typeof fullQuestion === 'object') {
            question = question || fullQuestion.question;
            explanation = explanation || fullQuestion.explanation;
        }

        if (!question) {
            return res.status(400).json({ error: 'Question required' });
        }

        let prompt = question
            .replace(/\?|-\s*T\d+/g, '')
            .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
            .trim();

        if (context) {
            prompt = `${context}: ${prompt}`;
        }

        prompt = prompt.substring(0, 200);

        log.info(`[V10 Prompt] Question -> "${prompt}"`);
        res.json({ prompt });
    } catch (error) {
        log.error('[V10 Prompt] Failed:', error);
        res.status(500).json({ error: 'Failed to generate prompt' });
    }
};

export const translateText = async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        let apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey === 'null' || apiKey === 'undefined' || apiKey === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }
        if (!apiKey) apiKey = process.env.GEMINI_API_KEY;

        if (!text || !targetLang) {
            return res.status(400).json({ error: 'Missing text or targetLang' });
        }

        const langMap = {
            'en': 'English', 'zh': 'Chinese', 'ko': 'Korean', 'ja': 'Japanese',
            'fr': 'French', 'de': 'German', 'es': 'Spanish', 'pt': 'Portuguese',
            'vi': 'Vietnamese', 'hi': 'Hindi', 'ar': 'Arabic'
        };

        const targetLanguage = langMap[targetLang] || targetLang;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const promptText = `Translate the following text to ${targetLanguage}. Only return the translation, nothing else.\n\nText: ${text}`;

        const result = await model.generateContent(promptText);
        const translation = result.response.text().trim();

        res.json({ translation });

    } catch (error) {
        log.error('Translation error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
};
