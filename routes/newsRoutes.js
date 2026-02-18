import express from 'express';
import { generateNewsQuiz } from '../controllers/newsController.js';

const router = express.Router();

router.post('/generate', generateNewsQuiz);

export default router;
