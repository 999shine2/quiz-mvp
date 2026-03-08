import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 login/register attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

export const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 AI generation requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI generation rate limit reached. Please wait a moment before trying again.' },
});

export const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5, // 5 uploads per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload rate limit reached. Please wait a moment.' },
});
