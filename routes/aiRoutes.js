import express from 'express';
import { generateImagePromptEndpoint, translateText, generateQuestionsProxy, generateSummaryProxy, generateCreativeProxy, generateSimilarQuestionsProxy, proxyImage } from '../controllers/aiController.js';

const router = express.Router();

router.post('/generate-image-prompt', generateImagePromptEndpoint);
router.post('/translate', translateText);

// Proxy Endpoints (Client Fallback)
router.post('/proxy/generate-questions', generateQuestionsProxy);
router.post('/proxy/generate-summary', generateSummaryProxy);
router.post('/proxy/generate-creative', generateCreativeProxy);
router.post('/proxy/generate-similar', generateSimilarQuestionsProxy);
router.get('/ping', (req, res) => res.send('AI Router Operational'));
router.get('/ai/image-proxy', proxyImage);

export default router;
