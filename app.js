import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/authRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import youtubeRoutes from './routes/youtubeRoutes.js';
import newsRoutes from './routes/newsRoutes.js';
import creativeRoutes from './routes/creativeRoutes.js';
import libraryRoutes from './routes/libraryRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reelsRoutes from './routes/reelsRoutes.js';
import notionRoutes from './routes/notionRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

import connectDB from './config/db.js';
import { syncNotion } from './controllers/notionController.js'; // Compat import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Connect DB
connectDB();

// 2. Middleware
const corsOptions = process.env.NODE_ENV === 'production'
    ? { origin: [/\.onrender\.com$/, /^capacitor:\/\//, /^http:\/\/localhost/], credentials: true }
    : {};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. Routes
app.use('/api/auth', authRoutes); // Fixed: client expects /api/auth/login
app.use('/auth/notion', notionRoutes);

app.use('/api/files', uploadRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/creative', creativeRoutes);
app.use('/api', libraryRoutes);
app.use('/api', userRoutes);
app.use('/api/reels', reelsRoutes);
app.use('/api/notion', notionRoutes);
app.use('/api', imageRoutes); // Maps /api/generate-image
app.use('/api', aiRoutes);

// Compatibility Route
const compatRouter = express.Router();
compatRouter.post('/sync-notion', syncNotion);
app.use('/api', compatRouter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;
