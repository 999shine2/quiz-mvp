import express from 'express';
import { generateCreativeQuiz } from '../controllers/creativeController.js';

const router = express.Router();

router.post('/generate', generateCreativeQuiz);

export default router;
