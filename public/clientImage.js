/**
 * clientImage.js — Client-Side Image Generation
 * Calls Pollinations API directly from browser (CORS-friendly).
 * Uses IndexedDB for image caching.
 */
const clientImage = (() => {

    // ── Generate image for a question ─────────────────────────
    async function generateForQuestion(question, userId) {
        const questionText = question.question || '';
        // Use the AI-generated imagePrompt (a vivid visual description) as the image prompt.
        // Fall back to the raw question text only if imagePrompt is missing.
        const imagePrompt = question.imagePrompt || questionText;

        if (!questionText) return null;

        // Build prompt from imagePrompt, not the raw question text
        let optimizedPrompt = imagePrompt;

        // Check cache
        const hash = hashQuestion(optimizedPrompt);
        const cached = await clientDB.getCachedImage(hash);
        if (cached && cached.blob) {
            console.log(`[ClientImage] Cache HIT: ${hash}`);
            return URL.createObjectURL(cached.blob);
        }

        const cleanPrompt = optimizedPrompt
            .replace(/\?|-\s*T\d+/g, '')
            .substring(0, 150);

        const encodedPrompt = encodeURIComponent(cleanPrompt);
        const seed = Math.floor(Math.random() * 1000000);

        console.log(`[ClientImage] Fetching image for prompt: "${cleanPrompt.substring(0, 60)}..."`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            // Always route through server proxy so the pollen-tier API key
            // and model=flux are applied server-side (avoids CORS auth issues).
            const proxyUrl = `/api/proxy/image?prompt=${encodedPrompt}&seed=${seed}&model=flux`;
            const response = await fetch(proxyUrl, { signal: controller.signal });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Proxy Error: ${response.status}`);
            }

            const blob = await response.blob();

            if (blob.size < 1000) {
                console.warn(`[ClientImage] Image too small: ${blob.size} bytes`);
                return null;
            }

            // Save to cache
            await clientDB.saveCachedImage(hash, blob, cleanPrompt);
            console.log(`[ClientImage] ✅ Cached: ${hash} (${blob.size} bytes)`);

            // Return a persistent proxy URL so it survives page refreshes
            return `/api/proxy/image?prompt=${encodedPrompt}&seed=${seed}&model=flux`;

        } catch (err) {
            console.error('[ClientImage] Generation failed:', err.message);
            return null;
        }
    }

    // ── Generate images for multiple questions ────────────────
    async function generateForQuestions(questions, userId, concurrency = 5) {
        const results = await Promise.all(
            questions.map(q => generateForQuestion(q, userId))
        );

        results.forEach((url, idx) => {
            if (url) {
                questions[idx].imageUrl = url;
            }
        });

        return results;
    }

    // ── Get cached image as blob URL ──────────────────────────
    async function getCachedUrl(questionText) {
        const hash = hashQuestion(questionText);
        const cached = await clientDB.getCachedImage(hash);
        if (cached && cached.blob) {
            return URL.createObjectURL(cached.blob);
        }
        return null;
    }

    // ── Hash helper ───────────────────────────────────────────
    function hashQuestion(text) {
        // Cache Versioning: Increment to force re-cache (e.g., when fixing prompt logic)
        const CACHE_VERSION = 'v2145_';
        const versionedText = CACHE_VERSION + text;

        try {
            return btoa(unescape(encodeURIComponent(versionedText.trim())))
                .replace(/[/+=]/g, '_')
                .substring(0, 32);
        } catch (e) {
            // Fallback: simple string hash
            let hash = 0;
            for (let i = 0; i < versionedText.length; i++) {
                const char = versionedText.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit int
            }
            return 'h' + Math.abs(hash).toString(36);
        }
    }

    // ── Public API ────────────────────────────────────────────
    return {
        generateForQuestion,
        generateForQuestions,
        getCachedUrl,
        hashQuestion
    };
})();
