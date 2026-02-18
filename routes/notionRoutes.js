import express from 'express';
import { loginNotion, notionCallback, syncNotion, getNotionStatus } from '../controllers/notionController.js';

const router = express.Router();

router.get('/login', loginNotion);
router.get('/callback', notionCallback);
router.post('/sync', syncNotion);     // mapped to /api/sync-notion if mounted correctly
router.get('/status', getNotionStatus); // mapped to /api/notion/status

export default router;
