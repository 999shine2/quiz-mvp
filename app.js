import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { authMiddleware, requireAuth } from './middleware/auth.js';

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
import { syncNotion } from './controllers/notionController.js';

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
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 login/register attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 AI generation requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI generation rate limit reached. Please wait a moment before trying again.' },
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5, // 5 uploads per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload rate limit reached. Please wait a moment.' },
});

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

// Compatibility Route
const compatRouter = express.Router();
compatRouter.post('/sync-notion', requireAuth, syncNotion);
app.use('/api', compatRouter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;
