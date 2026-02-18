import express from 'express';
import { getProfileStats, trackSolve } from '../controllers/userController.js';

const router = express.Router();

router.get('/profile', getProfileStats); // mapped to /api/profile
router.post('/track/solve', trackSolve); // mapped to /api/track/solve

export default router;
