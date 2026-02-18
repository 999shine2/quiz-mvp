import { GoogleGenerativeAI } from '@google/generative-ai';

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
