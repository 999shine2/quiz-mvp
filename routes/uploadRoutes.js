import express from 'express';
import multer from 'multer';
import { uploadFile, updateFile } from '../controllers/uploadController.js';

const fileUpload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
        files: 1, // 1 file at a time
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
            'text/plain',
            'text/markdown',
            'image/png',
            'image/jpeg',
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`), false);
        }
    }
});

const router = express.Router();

// Handle multer errors gracefully
const handleUpload = (req, res, next) => {
    fileUpload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

router.post('/', handleUpload, uploadFile);
router.post('/update', updateFile);

export default router;
