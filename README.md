# Insighter — AI-Powered Study Assistant (Repository Deep Dive)

> **"quiz-mvp"** is the internal repo name. The product is called **Insighter**: upload any learning material and let AI instantly generate a personalized quiz from it.

This README serves as an exhaustive, standalone guide to the codebase's architecture, data models, APIs, and frontend internals as of the Vanilla JS MVP stage.

---

## 1. What It Does

Insighter lets users:
- **Upload** PDFs, DOCX, images, plain text, or Markdown
- **Paste a YouTube URL** to generate a quiz from the video transcript
- **Import news articles** or **creative works** (books, movies) as study sets
- **Get AI-generated questions** (multiple choice + written) powered by Google Gemini 1.5/2.0 Flash
- **Swipe through a "Reels" feed** — TikTok-style flash card mode
- **Track progress** — profile stats, liked questions, solve counts
- **Install as a PWA or native iOS app** via Capacitor

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Database | MongoDB (Mongoose) with IndexedDB/JSON flat-file active fallbacks |
| AI | Google Gemini API (`@google/generative-ai`) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| File Uploads | Multer |
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| Mobile | Capacitor (iOS wrapper) |

---

## 3. Architecture & Data Flow

```
Browser SPA (Vanilla JS)  ←→  Express.js Server  ←→  MongoDB / FileStore fallback
    ↓                              ↓
clientDB.js (IndexedDB)         aiService.js (Gemini API)
```

### The "Resilient API" Pattern
A unique feature of this architecture is its extreme resilience. 
1. **Server Resilience:** `utils/dbShim.js` wraps all database calls. If MongoDB is down or `SKIP_MONGO=true`, it transparently reads/writes to local JSON files (`utils/fileStore.js`).
2. **Client Resilience:** `public/clientBridge.js` monkey-patches `window.fetch`. It intercepts API calls. If it detects the user is offline, or if the server goes down, it can route requests to `clientDB.js` (an IndexedDB local database) and `clientAI.js` (direct-to-browser Gemini calls), allowing the app to function entirely without a backend if necessary.

---

## 4. Data Models (Schemas)

All data is modeled around the `Material` (a study set) and its embedded `Questions`.

### 1. `Material` (The Core Study Set)
Represents an uploaded document, a compiled YouTube video, or a creative work study set.
```javascript
{
  userId: String,
  id: String, // Unique timestamp ID
  type: String, // 'youtube', 'pdf', 'doc', 'custom', 'creative'
  filename: String, // e.g. "The Great Gatsby"
  originalUrl: String, // (Optional) YouTube URL
  transcript: String, // Extracted parsed text (up to 20,000 chars)
  summary: String, // AI-generated summary paragraph
  categories: [String], // Subject categories (e.g. "Philosophy / Thinking")
  subjectEmoji: String,
  uploadedAt: Date,
  questions: [QuestionSchema] // Embedded array
}
```

### 2. `Question` (Embedded in Material)
```javascript
{
  type: String, // "MCQ" or "SAQ" (Short Answer)
  question: String, // The generated question text
  options: [String], // Array of 4 options (for MCQ)
  correctAnswer: Number, // Index (0-3) of the correct option
  idealAnswer: String, // For SAQ type
  explanation: String, // Why the answer is correct
  imagePrompt: String, // Prompt used to generate the background image
  imageUrl: String, // Generated via /api/proxy/image
  isLiked: Boolean
}
```

### 3. `ActivityLog`
Tracks user interaction for the Profile dashboard.
```javascript
{
  userId: String,
  action: String, // 'solve_question', 'upload', 'rename_file'
  details: Mixed (Object), // e.g., { count: 5, correct: 3, materialName: "Biology 101" }
  timestamp: Date
}
```

### 4. `ReelsBuffer`
Stores the queue of upcoming "swipeable" flashcards for a specific user.
```javascript
{
  userId: String,
  questions: [Mixed], // Precalculated array of question objects mixed from different Materials
  updatedAt: Date
}
```

---

## 5. Core API Endpoints

All endpoints are prefixed with `/api` and (except Auth/Admin) require a `Bearer <token>` JWT in the `Authorization` header.

### Authentication
- `POST /api/auth/register` — Expects `{ userId, password, nickname }`.
- `POST /api/auth/login` — Expects `{ userId, password }`. Returns `{ success, token, userId, nickname }`.

### Content Ingestion
- `POST /api/files` — Upload a document via multipart/form-data (`file`). Parses via `documentParser.js` (pdfreader/mammoth), generates AI questions/summary, returns the created `Material`.
- `POST /api/youtube/generate` — Expects `{ url }`. Uses `youtube-transcript` to scrape captions, feeds to AI, returns `Material`.
- `POST /api/creative/generate` — Expects `{ title, author, type }`. Generates a trivia set purely from AI knowledge.

### Library Management
- `GET /api/library` — Returns an array of all `Material` objects for the logged-in user, augmented with `questionsSolved` stats.
- `GET /api/materials/:id` — Get a specific material.
- `POST /api/generate-more/:id` — Feeds the material's transcript back into the AI to generate 5 additional questions, avoiding duplicates.

### Activity & Profile
- `POST /api/track/solve` — Logs that a user answered a question (correctly or incorrectly). Updates `ActivityLog`.
- `GET /api/profile` — Aggregates `ActivityLog` to return `totalQuestionsSolved`, `streak`, and `topSubjects`.

---

## 6. Frontend Internals (Current Vanilla JS State)

The frontend lives entirely in `public/`. It is a complex Monolith designed to work primarily as a Capacitor mobile app wrapper.

### Key Files
1. **`index.html`**: The single HTML file. Contains structurally hidden `<section>` tags for every screen (`#login-screen`, `#library-section`, `#quiz-section`, `#upload-section`).
2. **`client_app.js`**: A massive (~316KB) controller file. It manages:
   - **Routing:** manually toggling `style.display = 'block' / 'none'` on sections.
   - **Quiz Engine:** The state machine containing `currentQuizData`, `currentQuestionIndex`, and `score`. 
   - **DOM Manipulation:** Manually injecting HTML for question cards, parsing Markdown via Regex, and attaching event listeners to options.
3. **`clientBridge.js`**: The network interceptor. It overrides `window.fetch`. It intercepts calls to `/api/*`, attaches the JWT automatically, and routes failing calls to local storage (`clientDB.js`) if offline.
4. **`clientDB.js`**: An IndexedDB wrapper. Databases: `users`, `library`, `activityLog`, `settings`, `imageCache`. This is the exact client-side mirror of the server's MongoDB models.
5. **`clientAI.js`**: Can talk directly to Google Gemini API from the browser if the user supplies their own API key in Settings, bypassing server rate limits.

---

## 7. AI Logic & Prompts (`aiService.js`)

All AI interactions use the **Gemini 1.5/2.0 Flash** models. 

### Question Generation Strategy
The AI is instructed with an extremely strict prompt (over 100 lines) to return exactly structured JSON. Key constraints forced on the AI:
- **Tone:** "Expert coach and curious study buddy."
- **Structure:** Targets specific question ratios:
  - **Type 2:** Conceptual Understanding (Focus: Core concepts, "Why" and "How").
  - **Type 1:** Scenario/Application (Focus: Real-world application).
  - **Type 4:** Short Answer Reflection (Focus: Open-ended thought experiment).
- **Format:** Strict JSON output without Markdown formatting (` ```json ... ``` ` is stripped out explicitly via regex). 
- **Resilience:** Has a custom `repairTruncatedJSON()` function that attempts to fix JSON strings that get cut off by AI token limits.

---

## 8. Development & Deployment

### Environment Setup (`.env`)
```bash
PORT=3001
MONGODB_URI=mongodb://localhost:27017/quiz-mvp
SKIP_MONGO=false
GEMINI_API_KEY=your_google_ai_key
JWT_SECRET=production_secret_here
```

### Running Locally
```bash
npm install
npm run dev
```

### Known Technical Debt / Bottlenecks
- **Frontend Monolith:** `client_app.js` is too large for easy feature addition. Modifying the quiz UI state requires heavily coupled DOM lookups.
- **`dbShim.js` Data Sync:** The local file-store fallback in production can cause data loss if multiple ephemeral containers are spinning up (e.g. on Render/Heroku).
- **Client Bridge Complexity:** The `window.fetch` overriding in `clientBridge.js` makes tracking actual network requests difficult in standard DevTools.
