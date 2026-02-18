import express from 'express';
import { generateYouTubeQuiz, getYouTubeTranscript } from '../controllers/youtubeController.js';

const router = express.Router();

router.post('/generate', generateYouTubeQuiz);
router.post('/transcript', getYouTubeTranscript);

export default router;
