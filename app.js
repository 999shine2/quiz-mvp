import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { authMiddleware, requireAuth } from './middleware/auth.js';
import { globalLimiter, authLimiter, aiLimiter, uploadLimiter } from './middleware/rateLimiters.js';

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
import adminRoutes from './routes/adminRoutes.js';

import connectDB from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Connect DB
connectDB();

// 2. Security Headers (helmet)
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now (inline scripts in index.html)
    crossOriginEmbedderPolicy: false, // Allow loading external images (Pollinations)
}));

// 3. CORS
const corsOptions = process.env.NODE_ENV === 'production'
    ? { origin: [/\.onrender\.com$/, /^capacitor:\/\//, /^http:\/\/localhost/], credentials: true }
    : {};
app.use(cors(corsOptions));

// 4. Body Parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Rate Limiters
app.use('/api/', globalLimiter);

// 6. Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Admin & Analytics (no auth — uses its own key check)
app.use('/', adminRoutes);

// 7. Auth middleware (runs on all /api/* routes, extracts user from JWT or x-user-id)
app.use('/api/', authMiddleware);

// 8. Routes
// Auth (no requireAuth — these are public)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/auth/notion', notionRoutes);

// AI-heavy routes (strict rate limit + auth required)
app.use('/api/files', uploadLimiter, requireAuth, uploadRoutes);
app.use('/api/youtube', aiLimiter, requireAuth, youtubeRoutes);
app.use('/api/news', aiLimiter, requireAuth, newsRoutes);
app.use('/api/creative', aiLimiter, requireAuth, creativeRoutes);

// Image proxy (no auth — used in <img> src attributes)
app.use('/api', imageRoutes);
app.use('/api', aiRoutes);

// Library & user routes (auth required)
app.use('/api', requireAuth, libraryRoutes);
app.use('/api', requireAuth, userRoutes);
app.use('/api/reels', requireAuth, reelsRoutes);
app.use('/api/notion', requireAuth, notionRoutes);

// Share Target — receives YouTube URLs from OS share sheet
app.get('/share', (req, res) => {
    const sharedUrl = req.query.url || req.query.text || '';
    res.redirect(`/?shared_url=${encodeURIComponent(sharedUrl)}`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

export default app;
