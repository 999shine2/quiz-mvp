# Insighter — AI-Powered Study Assistant

> **"quiz-mvp"** is the internal repo name. The product is called **Insighter**: upload any learning material and let AI instantly generate a personalized quiz from it.

---

## What It Does

Insighter lets users:

- **Upload** PDFs, DOCX, images, plain text, or Markdown
- **Paste a YouTube URL** to generate a quiz from the video transcript
- **Import news articles** or **creative works** (books, movies) as study sets
- **Sync from Notion** pages
- **Get AI-generated questions** (multiple choice + written) powered by Google Gemini 1.5 Flash
- **Swipe through a "Reels" feed** — TikTok-style flash card mode
- **Track progress** — profile stats, liked questions, solve counts
- **Install as a PWA or native iOS app** via Capacitor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Database | MongoDB (Mongoose) with JSON flat-file fallback |
| AI | Google Gemini 1.5 Flash (`@google/generative-ai`) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| File Uploads | Multer |
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| Mobile | Capacitor (iOS wrapper) |
| Hosting | Render.com (`render.yaml`) |

---

## Architecture

```
Browser (SPA in /public)
    ↕  REST API calls
Express.js Server (app.js / server.js)
    ↕                  ↕
MongoDB          JSON file fallback
(via dbShim)     (utils/fileStore.js)
    ↕
Google Gemini AI API  (aiService.js)
```

The backend follows a clean **MVC pattern**: Routes → Controllers → Models/Services.  
The frontend is a **Single Page Application**: one `index.html` with JS-toggled sections.

---

## Project Structure

```
quiz-mvp/
├── server.js            # Entry point — starts Express on port 3001
├── app.js               # App config — middleware, all routes, DB init
├── aiService.js         # Google Gemini integration (generateQuestions, generateSummary, …)
├── documentParser.js    # Parses PDFs (pdfreader), DOCX (mammoth), plain text
│
├── routes/              # Thin Express routers — map URLs to controller functions
│   ├── authRoutes.js    # POST /api/auth/register, /login
│   ├── uploadRoutes.js  # POST /api/files (file upload pipeline)
│   ├── libraryRoutes.js # GET/DELETE/PUT material library endpoints
│   ├── youtubeRoutes.js # POST /api/youtube/generate
│   ├── newsRoutes.js    # POST /api/news/generate
│   ├── creativeRoutes.js# POST /api/creative/generate
│   ├── aiRoutes.js      # AI proxy endpoints (translate, image prompt, etc.)
│   ├── reelsRoutes.js   # Swipeable quiz feed
│   ├── notionRoutes.js  # Notion import/sync
│   ├── imageRoutes.js   # External image proxy
│   ├── userRoutes.js    # Profile stats, solve tracking
│   └── adminRoutes.js   # Admin dashboard (own key auth)
│
├── controllers/         # Business logic
│   ├── authController.js     # Register/login with bcrypt + Mongo→File fallback
│   ├── uploadController.js   # Parse → AI generate → fetch images → save
│   ├── libraryController.js  # Library CRUD, summaries, "generate more", reels
│   ├── youtubeController.js  # Fetch transcript → AI generate
│   ├── newsController.js     # Fetch article → AI generate
│   ├── creativeController.js # Creative works quiz generation
│   ├── aiController.js       # Server-side AI proxy (uses server API key)
│   ├── notionController.js   # Notion page sync
│   ├── imageController.js    # Image generation/proxy
│   ├── reelsController.js    # Reels feed management
│   └── userController.js     # Profile aggregation, activity logging
│
├── models/              # MongoDB schemas
│   ├── Material.js      # Uploaded materials + embedded question schema
│   ├── User.js          # User accounts (userId, hashed password, nickname)
│   ├── ActivityLog.js   # Per-user action log (uploads, solves)
│   └── ReelsBuffer.js   # Swipeable question queue per user
│
├── services/            # External integrations
│   ├── youtubeService.js # Fetch YouTube transcripts
│   ├── notionService.js  # Fetch Notion page content
│   ├── newsService.js    # Fetch/parse news articles
│   └── imageService.js   # Question background image generation
│
├── middleware/
│   └── auth.js          # JWT auth middleware + generateToken helper
│
├── utils/
│   ├── dbShim.js        # getDB/saveDB — tries MongoDB, falls back to file store
│   ├── fileStore.js     # JSON flat-file persistence (no DB needed)
│   ├── logger.js        # Activity logging utility
│   ├── user.js          # getUserID helper (reads from req.user)
│   ├── log.js           # Console logging wrapper
│   └── analyticsDB.js   # Analytics helpers
│
├── config/
│   └── db.js            # MongoDB connection setup
│
└── public/              # Frontend SPA
    ├── index.html       # Single HTML file with all screen sections
    ├── client_app.js    # Main SPA logic (~316KB) — views, quiz gameplay, API calls
    ├── clientAI.js      # Client-side Gemini calls (user's own API key)
    ├── clientAuth.js    # Login/register form logic
    ├── clientDB.js      # IndexedDB wrapper for offline caching
    ├── clientBridge.js  # Capacitor bridge for iOS native features
    ├── clientParser.js  # Client-side PDF/DOCX parsing (pdf.js + mammoth.js)
    ├── style.css        # Studio Ghibli-inspired nature palette
    ├── sw.js            # Service worker (PWA offline support)
    ├── manifest.json    # PWA manifest
    └── admin.html       # Admin dashboard page
```

---

## Key Data Flows

### Upload → Quiz
```
User uploads file
  → POST /api/files  (uploadRoutes.js + Multer)
  → uploadController.js
      ├── documentParser.js  extracts raw text
      ├── aiService.js       generateQuestions() + generateSummary() in parallel
      └── Picsum Photos      fetches a background image per question
  → dbShim.js  saves Material to MongoDB (or flat-file fallback)
  → Response: material object with questions array
  → client_app.js  starts quiz session in browser
```

### YouTube → Quiz
```
User pastes YouTube URL
  → POST /api/youtube/generate
  → youtubeController.js
      ├── youtubeService.js  fetches transcript
      └── aiService.js       generateQuestions() from transcript
  → saved to Material model
```

### Auth Flow
```
Register/Login → POST /api/auth/*
  → authController.js
      ├── bcrypt hash/verify
      ├── MongoDB User.findOne/create
      └── flat-file fileUser fallback if DB unavailable
  → generateToken() → JWT returned to client
  → client stores token, sends as Authorization: Bearer <token>
  → authMiddleware extracts user on every /api/ request
```

---

## Dual-Storage Resilience

The `utils/dbShim.js` `getDB()` / `saveDB()` pattern is central to the app's design. Every controller calls these helpers instead of touching Mongoose directly. If MongoDB is unreachable (or `SKIP_MONGO=true`), the app silently falls back to reading/writing per-user JSON files — meaning **the app works with zero infrastructure**, just Node.js.

---

## Dual AI Key Strategy

- **Server key** (`GEMINI_API_KEY` env var): used by all server-side controllers, rate-limited to 5 requests/minute per IP
- **Client key**: power users can enter their own Gemini API key in the UI; `clientAI.js` calls the AI directly from the browser, bypassing the server limit
- **Server proxy** (`/api/proxy/generate-questions`, etc.): fallback path for client-side AI calls that still want to use the server key

---

## Running Locally

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Start dev server (with hot reload)
npm run dev
# → http://localhost:3001
```

### Environment Variables (`.env`)

```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/quiz-mvp   # Optional — app works without it
NODE_ENV=development
SKIP_MONGO=false
GEMINI_API_KEY=your_google_gemini_api_key
JWT_SECRET=your_jwt_secret
```

---

## Deployment

Configured for **Render.com** via `render.yaml`. The app is also packaged for **iOS** via Capacitor (see `ios/` and `capacitor.config.json`). The `Dockerfile` is provided for container-based deploys.
