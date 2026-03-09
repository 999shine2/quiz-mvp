# Quiz MVP - Features & Codebase Breakdown

This document provides a comprehensive explanation of every active file in the `quiz-mvp` codebase, broken down by architectural layers, explaining what each feature does. 

---

## 1. Core Server & Configuration

**`server.js`**
*   **Feature/Purpose**: The main entry point for the Node.js application. 
*   **What it does**: Loads environment variables, imports the Express app from `app.js`, and starts the HTTP server listening on a defined port. Also handles fallback warnings if MongoDB isn't connected.

**`app.js`**
*   **Feature/Purpose**: Express Application Setup.
*   **What it does**: Initializes the Express app, sets up security headers via `helmet`, configures CORS, handles JSON/URL payload parsing (up to 10MB), configures IP-based rate limiters (protecting AI, Auth, and global endpoints), mounts all routes, enables static file serving for the UI (`public/`), and serves a base `index.html`. Also routes to `adminRoutes` and manages Share Target redirects.

**`config/db.js`**
*   **Feature/Purpose**: Database Connection Logic.
*   **What it does**: Connects the backend to MongoDB using Mongoose. If the `SKIP_MONGO` flag is true, or if connection fails, it elegantly skips and falls back to a dummy File Store mode.

**`middleware/auth.js`**
*   **Feature/Purpose**: API Authentication & Authorization.
*   **What it does**: Validates JSON Web Tokens (JWT) for secure endpoints. As a fallback (for backwards compatibility), it scans for legacy `x-user-id` headers. Defines `generateToken(userId)` for auth sessions and `requireAuth` middleware to reject unauthenticated requests.

---

## 2. Artificial Intelligence & Document Services

**`aiService.js`**
*   **Feature/Purpose**: The core "Brain" of the application interacting with LLMs.
*   **What it does**: Exports several critical AI capabilities:
    *   `generateQuestions`: Extracts key information and creates dynamic MCQs/SAQs based on standard text or YouTube transcripts.
    *   `generateSimilarQuestions`: The "Endless" Reels engine to spawn infinite variants of a specific seed question.
    *   `generateSummary`: Creates a concise study summary using Google Gemini.
    *   `generateQuestionsForCreativeWork`: Custom prompt paths for generating questions analyzing books, movies, etc., using character names, plot points, based purely on LLM knowledge.
    *   Supports multiple image generation proxy endpoints (`generateImageWithGeminiFlash`, `generateImageWithImagen`).

**`documentParser.js`**
*   **Feature/Purpose**: File Ingestion & Parsing.
*   **What it does**: Employs `pdf-parse` to convert `.pdf` documents to raw text strings, and `mammoth` to convert `.docx` documents to raw text, allowing the AI layer to easily prompt the content. Includes graceful error handling for unsupported file paths.

---

## 3. Database Models

**`models/ActivityLog.js`**
*   **Feature/Purpose**: Tracking User Progress.
*   **What it does**: Mongoose schema that records when users upload materials or solve questions.

**`models/Material.js`**
*   **Feature/Purpose**: Core Data Entity for Study Items.
*   **What it does**: Mongoose schema containing the definition of an uploaded resource (PDF, YouTube video, Creative Topic). Incorporates a sub-document schema `questionSchema` mapped to questions, their options, correct answers, image prompts, explanations, and spawn tracking.

**`models/ReelsBuffer.js`**
*   **Feature/Purpose**: The "TikTok Style" Queue Cache.
*   **What it does**: Stores an array of pre-generated study questions mixed from various materials uniquely mapped to a user, ensuring fast UI loads when swiping.

**`models/User.js`**
*   **Feature/Purpose**: User Entity Definition.
*   **What it does**: Basic Mongoose schema mapping user credentials (userId, password hashes, and signup dates).

---

## 4. API Controllers (Feature Implementations)

**`controllers/youtubeController.js`**
*   **Feature/Purpose**: Transforms YouTube videos into study sets. 
*   **What it does**: Extracts metadata and transcripts from a YouTube URL. Passes the transcript to `aiService` to generate a summary and initial MCQs. Kicks off background services to lazily generate images for the questions.

**`controllers/uploadController.js`**
*   **Feature/Purpose**: Parses uploaded documents into quizzes.
*   **What it does**: Coordinates the `documentParser` to extract text from a user's uploaded file. Runs the content through `aiService` for a summary and quiz questions, saves the material document, and attaches default placeholders/Picusm images while generating related question imagery. Includes rename capabilities.

**`controllers/reelsController.js`**
*   **Feature/Purpose**: Manages the "Reels" / Endless feed mechanism.
*   **What it does**: Fetches the pre-generated reels buffer for quick UI loading. Contains `consumeReels` (removing viewed questions from the list), `generateMoreReels` (randomly selecting parts of the user's library and pre-fetching more related questions via AI), and `spawnQuestions` (diverging a "similar" set from a specific question origin ID).

**`controllers/libraryController.js`**
*   **Feature/Purpose**: User Library and Study Stats Aggregator.
*   **What it does**: Fetches a user's entire study vault, aggregating `ActivityLog` entries to compute metrics like "Questions Solved" and "Time Saved". Also provides endpoints to delete files, toggle "Likes" on specific questions, manually inject custom questions, update user-generated categories, and regenerate missing file summaries.

**`controllers/authController.js`**
*   **Feature/Purpose**: Registration and Session Management.
*   **What it does**: Validates new user credentials, securely hashes passwords using `bcryptjs`, and validates authentications. Crucially, uses a fallback architecture: tries saving/reading from Mongo, and if unavailable, accesses `fileStore` to keep authentication operating seamlessly.

**`controllers/creativeController.js`**
*   **Feature/Purpose**: Book/Movie Analyzer.
*   **What it does**: Processes inputs like "Title", "Author", and "Type" to formulate an AI quiz centered around character arcs, history, or fiction, bypassing the need for an uploaded document script.

**`controllers/userController.js`**
*   **Feature/Purpose**: Profile and Analytics Management.
*   **What it does**: Calculates daily statistics, aggregates total time saved using hard/easy proxy metrics, computes active daily streaks, maps top study subjects based on file categorizations, and exposes endpoints (`trackSolve`) to register quiz interaction behaviors in real time.

---

## 5. Backend Services & Utilities

**`services/imageService.js`**
*   **Feature/Purpose**: Automated Illustration Generation for Quizzes.
*   **What it does**: Generates relevant aesthetic images to accompany questions using `gen.pollinations.ai` utilizing Flux models or Turbo (as fallback). Applies caching hashes by mapping question text to `md5` to prevent regenerating images the application already possesses.

**`services/youtubeService.js`**
*   **Feature/Purpose**: Multi-tiered Transcript Scraping.
*   **What it does**: Crucial pipeline taking a video ID to output a full English transcript. Because YouTube blocks requests aggressively, this employs 4 fallback strategies (and proxy integration):
    1. Python `youtube-transcript-api` (via `fetch_transcript.py`).
    2. Node.js `youtubei.js` internal Innertube library.
    3. Direct page HTML scraping utilizing RegExp filtering.
    4. Fetch queries direct to YouTube's internal `player` API format.

**`services/newsService.js`**
*   **Feature/Purpose**: Fetching News Feed Topics.
*   **What it does**: Reads Google News RSS feeds to find top news items covering specified subject matter keywords. Employs a basic heuristic to bubble up articles from major Trusted Sources (like BBC, NYT, Science, etc.).

**`utils/dbShim.js` & `utils/fileStore.js`**
*   **Feature/Purpose**: Local fallback Database driver.
*   **What it does**: During migrations or database outages, handles `saveDB` and `getDB` logic by shimming queries. Redirects fetches to `fileStore.js`, which securely saves JSON dumps mapping Library items, Users, and Activity Logs persistently to the server's local storage directory `/data`.

---

## 6. Frontend Vanilla Javascript (Client UI)

**`public/client_app.js`**
*   **Feature/Purpose**: The core frontend Single Page Application (SPA) Controller.
*   **What it does**:
    -   **Navigation**: Handles view switching across Upload, Library, Quiz Player, and Reels feeds.
    -   **Fetch Interceptor**: Automatically decorates all outbound internal HTTP requests with JWT tokens to secure session endpoints.
    -   **UI Interactions**: Controls translation modals polling Gemini translations natively. Render logic for Liked Questions (injecting dynamic CSS/heart buttons locally and syncing over API to the DB).
    -   **Capacitor Integrations**: Detects Native Mobile builds and directs API pathways explicitly to localhost vs relative URL structures. Captures YouTube intent-sharing protocols.

**`public/clientDB.js`**
*   **Feature/Purpose**: Offline storage capabilities via IndexedDB.
*   **What it does**: Client-side mirror for user state mirroring users, library data, activity logs, and system settings, ensuring quick loading capabilities mirroring mobile application functionalities.

**`public/clientAuth.js`**
*   **Feature/Purpose**: Standalone secure hashing.
*   **What it does**: Generates robust `SHA-256` digest buffers of passwords entered natively on the client using the `Web Crypto API` before synchronizing the payload to `clientDB`, functioning heavily for offline modes or pure PWA states.

**`public/sw.js`**
*   **Feature/Purpose**: PWA Service Worker.
*   **What it does**: Allows the Web Application to handle Push Configurations and custom `study-reminder` notifications directly to mobile screens periodically. Can intercept native mobile sharing functionalities (like routing standard `share` behaviors dynamically to upload video links back into the application buffer).

---

## 7. Python Scripts (Helpers)

**`fetch_transcript.py`** & **`debug_yt_lib.py`**
*   **Feature/Purpose**: Transcript CLI Fallbacks.
*   **What it does**: Small utility scripts acting as the "First Priority Strategy" mapped by `youtubeService.js` invoking Python's robust `youtube-transcript-api` libraries directly. Returns JSON payloads of cleanly parsed transcript strings.
