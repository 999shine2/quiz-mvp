import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

    if (process.env.NODE_ENV === 'production' && process.env.SKIP_MONGO === 'true') {
        console.warn('[WARN] File-based storage on ephemeral filesystem. Server-side data will not persist across deploys.');
        console.warn('[WARN] For persistent data, set SKIP_MONGO=false and provide MONGODB_URI.');
    }
});
