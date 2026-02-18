import express from 'express';
import { generateImageEndpoint } from '../controllers/imageController.js';

const router = express.Router();

router.post('/generate-image', generateImageEndpoint);

export default router;
