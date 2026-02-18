import express from 'express';
import {
    getPregeneratedReels, consumeReels,
    spawnQuestions, generateMoreReels
} from '../controllers/reelsController.js';

const router = express.Router();

router.get('/pregenerated', getPregeneratedReels);
router.post('/consume', consumeReels);
router.post('/spawn', spawnQuestions);
router.post('/generate-more', generateMoreReels);

export default router;
