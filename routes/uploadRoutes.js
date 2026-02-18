import express from 'express';
import multer from 'multer';
import { uploadFile, updateFile } from '../controllers/uploadController.js';

const fileUpload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/', fileUpload.single('file'), uploadFile);
// Note: Rename endpoint was /api/files/update in server.js
router.post('/update', updateFile);

export default router;
