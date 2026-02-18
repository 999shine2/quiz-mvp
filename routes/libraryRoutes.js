import express from 'express';
import {
    getLibrary, getMaterial, deleteFile, updateCategories,
    getSummary, updateSummary, addManualQuestion,
    createCustomMaterial, generateMoreQuestions, toggleLike
} from '../controllers/libraryController.js';

const router = express.Router();

// Library Management
router.get('/library', getLibrary);
router.get('/materials/:id', getMaterial);
router.delete('/library/:id', deleteFile);
// Note: Frontend calls /api/materials/:id/categories... let's support both or map carefully.
// The old server.js had /api/materials/:id/categories
router.post('/materials/:id/categories', updateCategories); // mapped to /api/materials...

// Summaries
router.get('/summary/:id', getSummary);
router.post('/summary/:id/update', updateSummary);

// Questions & Materials
router.post('/questions/add', addManualQuestion);
router.post('/materials/create', createCustomMaterial);
router.post('/generate-more/:id', generateMoreQuestions);
router.post('/toggle-like', toggleLike);

export default router;
