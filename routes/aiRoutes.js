import express from 'express';
import { generateImagePromptEndpoint, translateText } from '../controllers/aiController.js';

const router = express.Router();

router.post('/generate-image-prompt', generateImagePromptEndpoint);
router.post('/translate', translateText);

export default router;
