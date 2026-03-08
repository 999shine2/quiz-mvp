# Insighter — AI-Powered Study Assistant

> Upload any learning material and let AI instantly generate a personalized quiz from it.

---

## What It Does

- **Upload** PDFs, DOCX, images, plain text, or Markdown
- **Paste a YouTube URL** to generate a quiz from the video transcript
- **Import news articles** or **creative works** (books, movies) as study sets
- **Get AI-generated questions** (MCQ + written) powered by Google Gemini 2.0 Flash
- **Swipe through a "Reels" feed** — TikTok-style flash card mode with AI image backgrounds
- **Track progress** — profile stats, liked questions, solve counts, achievements
- **Install as a PWA or native iOS app** via Capacitor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express.js |
| Database | MongoDB (Mongoose) with JSON flat-file fallback |
| AI | Google Gemini API (`@google/generative-ai`) |
| Images | Pollinations API (Flux model) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| File Parsing | pdf-parse, mammoth (DOCX) |
| YouTube | youtubei.js (Innertube) |
| Mobile | Capacitor (iOS) |
| Frontend | React 19 + Vite (migrating from vanilla JS) |
| Styling | CSS Modules + global CSS (Studio Ghibli palette) |
| Mobile | Capacitor (iOS) |

---

## Project Structure

```
quiz-mvp/
├── server.js                    # Entry point — loads .env, starts Express
├── app.js                       # Express app config, middleware, route mounting
├── package.json                 # Backend dependencies
│
├── client/                      # ⚛️ React + Vite frontend
│   ├── vite.config.js           # Dev proxy → Express :3001
│   ├── package.json             # Frontend dependencies
│   └── src/
│       ├── main.jsx             # Entry point
│       ├── App.jsx              # Router (react-router-dom)
│       ├── api/client.js        # JWT fetch wrapper
│       ├── contexts/
│       │   └── AuthContext.jsx   # Auth state (login/register/logout)
│       ├── hooks/
│       │   └── useApi.js        # Data fetching hook
│       ├── components/
│       │   └── Layout/
│       │       └── BottomNav.jsx # Floating island navigation
│       ├── pages/
│       │   ├── Login/           # ✅ Migrated
│       │   ├── Profile/         # 🔄 In progress
│       │   ├── Library/         # ⏳ Pending
│       │   ├── Upload/          # ⏳ Pending
│       │   ├── Quiz/            # ⏳ Pending
│       │   └── Reels/           # ⏳ Pending
│       └── styles/
│           └── global.css       # Existing style.css (Studio Ghibli palette)
│
├── config/
│   └── db.js                    # MongoDB connection (Mongoose)
│
├── middleware/
│   ├── auth.js                  # JWT extraction + requireAuth guard
│   └── rateLimiters.js          # Rate limit configs (global, auth, AI, upload)
│
├── models/
│   ├── User.js                  # User account
│   ├── Material.js              # Uploaded study material + questions
│   ├── ReelsBuffer.js           # Pre-generated reels queue
│   ├── ActivityLog.js           # User activity log entries
│   └── AnalyticsEvent.js        # Admin analytics (MongoDB)
│
├── routes/                      # Express routers (thin — delegate to controllers)
│   ├── authRoutes.js            # POST register, login
│   ├── uploadRoutes.js          # POST file upload
│   ├── youtubeRoutes.js         # POST YouTube URL → quiz
│   ├── newsRoutes.js            # POST news interest → quiz
│   ├── creativeRoutes.js        # POST book/movie → quiz
│   ├── libraryRoutes.js         # GET/PATCH/DELETE materials
│   ├── userRoutes.js            # GET profile, POST solve/export/import
│   ├── reelsRoutes.js           # GET/POST reels
│   ├── notionRoutes.js          # Notion OAuth + sync
│   ├── imageRoutes.js           # Image proxy
│   ├── aiRoutes.js              # Direct AI endpoints
│   └── adminRoutes.js           # Analytics dashboard
│
├── controllers/                 # Request handlers (business logic)
│   ├── authController.js
│   ├── uploadController.js
│   ├── youtubeController.js
│   ├── newsController.js
│   ├── creativeController.js
│   ├── libraryController.js
│   ├── userController.js
│   ├── reelsController.js
│   ├── notionController.js
│   ├── imageController.js
│   └── aiController.js
│
├── services/                    # Core logic (no HTTP awareness)
│   ├── questionGenerator.js     # AI question generation (4 functions)
│   ├── imageGenerator.js        # Image generation (Pollinations, Imagen)
│   ├── imageService.js          # Image caching, per-question gen
│   ├── aiUtils.js               # Shared AI utilities
│   ├── documentParser.js        # PDF + DOCX text extraction
│   ├── youtubeService.js        # Transcript fetching (4-strategy cascade)
│   ├── newsService.js           # News API integration
│   └── notionService.js         # Notion API client
│
├── utils/                       # Helpers & infrastructure
│   ├── dbShim.js                # DB abstraction (MongoDB ↔ JSON fallback)
│   ├── fileStore.js             # JSON flat-file storage (fallback)
│   ├── analyticsDB.js           # Admin analytics tracking (MongoDB)
│   ├── activityLogger.js        # User activity logging
│   ├── log.js                   # Dev-mode console logger
│   └── user.js                  # getUserID helper
│
└── public/                      # Legacy frontend (being replaced by client/)

```

---

## Architecture

```
Client (Browser)  ──HTTP──▸  Express.js API  ──Mongoose──▸  MongoDB Atlas
                                  │
                                  ├── services/questionGenerator.js ──▸ Gemini API
                                  ├── services/youtubeService.js ───▸ YouTube (Innertube)
                                  ├── services/newsService.js ──────▸ News APIs
                                  └── services/imageGenerator.js ──▸ Pollinations API
```

### Database Fallback

`utils/dbShim.js` wraps all data access. If MongoDB is unavailable (`SKIP_MONGO=true`), it transparently falls back to `utils/fileStore.js` (JSON flat-files in `data/`). This allows the server to run locally without MongoDB.

### Rate Limiting

Four tiers configured in `middleware/rateLimiters.js`:

| Limiter | Scope | Limit |
|---|---|---|
| `globalLimiter` | All `/api/` | 300 req / 15 min |
| `authLimiter` | `/api/auth` | 20 req / 15 min |
| `aiLimiter` | YouTube, News, Creative | 5 req / 1 min |
| `uploadLimiter` | File uploads | 5 req / 1 min |

---

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login, returns JWT |

### Content Ingestion
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/files/upload` | ✅ | Upload file → parse → quiz |
| POST | `/api/youtube/generate` | ✅ | YouTube URL → transcript → quiz |
| POST | `/api/news/generate` | ✅ | News interest → articles → quiz |
| POST | `/api/creative/generate` | ✅ | Book/movie title → quiz |

### Library
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/library` | ✅ | List all materials |
| PATCH | `/api/library/:id` | ✅ | Update material metadata |
| DELETE | `/api/library/:id` | ✅ | Delete a material |
| POST | `/api/library/:id/generate-more` | ✅ | Generate additional questions |

### Quiz & Reels
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/generate-questions` | — | Generate questions from text |
| GET | `/api/reels/pregenerated` | ✅ | Get pre-built reels queue |
| POST | `/api/reels/spawn` | ✅ | Spawn similar questions |
| POST | `/api/reels/generate-more` | ✅ | Refill reels buffer |

### User & Profile
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/profile` | ✅ | Profile stats & achievements |
| POST | `/api/profile/solve` | ✅ | Record a quiz solve |
| POST | `/api/export-data` | ✅ | Export all user data |
| POST | `/api/import-data` | ✅ | Import user data |

### Notion Integration
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/notion/login` | — | Start Notion OAuth |
| GET | `/auth/notion/callback` | — | OAuth callback |
| POST | `/api/notion/sync` | ✅ | Sync Notion pages → quizzes |

---

## Data Models

### User
```javascript
{ email, passwordHash, name, createdAt }
```

### Material
```javascript
{ userId, filename, type, path, originalUrl, transcript, summary,
  questions[], subjectEmoji, categories[], solveCount, likeCount,
  createdAt, lastSolvedAt }
```

### AnalyticsEvent
```javascript
{ userId, event, detail, timestamp }
// Events: "register", "login", "upload", "solve"
```

---

## Environment Variables

```env
MONGODB_URI=              # MongoDB Atlas connection string
GEMINI_API_KEY=           # Google Gemini API key
JWT_SECRET=               # JWT signing secret
POLLINATIONS_API_KEY=     # Pollinations image generation key
NOTION_CLIENT_ID=         # Notion OAuth client ID (optional)
NOTION_CLIENT_SECRET=     # Notion OAuth secret (optional)
YOUTUBE_PROXY_URL=        # YouTube proxy for transcript fetching (optional)
SKIP_MONGO=               # Set to "true" to use JSON flat-file fallback
PORT=                     # Server port (default: 3001)
```

---

## Getting Started

```bash
# 1. Clone & install
git clone <repo-url> && cd quiz-mvp
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys

# 3. Run (development — two terminals)
npm run dev                    # Terminal 1: Express backend on :3001
cd client && npm run dev       # Terminal 2: Vite React frontend on :5173

# 4. Run (production)
npm start                      # Serves built React app from Express
```

---

## Migration Progress

| Screen | Status |
|---|---|
| Login | ✅ Complete |
| Profile | ✅ Complete |
| Library | ✅ Complete |
| Upload | ✅ Complete |
| Quiz | ✅ Complete |
| Reels | ✅ Complete |

