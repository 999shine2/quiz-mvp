/**
 * clientImage.js — Client-Side Image Generation
 * Calls Pollinations API directly from browser (CORS-friendly).
 * Uses IndexedDB for image caching.
 */
const clientImage = (() => {

    // ── Generate image for a question ─────────────────────────
    async function generateForQuestion(question, userId) {
        const questionText = question.question || '';
        const context = question.questionContext || '';

        if (!questionText) return null;

        // 1. Check cache
        const hash = hashQuestion(questionText);
        const cached = await clientDB.getCachedImage(hash);
        if (cached && cached.blob) {
            console.log(`[ClientImage] Cache HIT: ${hash}`);
            return URL.createObjectURL(cached.blob);
        }

        // 2. Build prompt
        const rawPrompt = context ? `${context}: ${questionText}` : questionText;
        const cleanPrompt = rawPrompt
            .replace(/\?|-\s*T\d+/g, '')
            .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
            .trim()
            .substring(0, 200);

        const encodedPrompt = encodeURIComponent(cleanPrompt);
        const seed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=600&seed=${seed}&nologo=true&model=flux`;

        console.log(`[ClientImage] Fetching: "${cleanPrompt.substring(0, 40)}..."`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(imageUrl, {
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Pollinations Error: ${response.status}`);
            }

            const blob = await response.blob();

            if (blob.size < 1000) {
                console.warn(`[ClientImage] Image too small: ${blob.size} bytes`);
                return null;
            }

            // 3. Save to cache
            await clientDB.saveCachedImage(hash, blob, cleanPrompt);
            console.log(`[ClientImage] ✅ Cached: ${hash} (${blob.size} bytes)`);

            return URL.createObjectURL(blob);

        } catch (err) {
            console.error('[ClientImage] Generation failed:', err.message);
            return null;
        }
    }

    // ── Generate images for multiple questions ────────────────
    async function generateForQuestions(questions, userId, concurrency = 2) {
        const results = [];

        for (let i = 0; i < questions.length; i += concurrency) {
            const batch = questions.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(q => generateForQuestion(q, userId))
            );

            batchResults.forEach((url, idx) => {
                if (url) {
                    questions[i + idx].imageUrl = url;
                    questions[i + idx].imageBlobUrl = true; // Mark as blob URL
                }
            });

            results.push(...batchResults);

            // Brief pause between batches
            if (i + concurrency < questions.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

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
        // Simple hash using btoa (base64) truncated
        try {
            return btoa(unescape(encodeURIComponent(text.trim())))
                .replace(/[/+=]/g, '_')
                .substring(0, 32);
        } catch (e) {
            // Fallback: simple string hash
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
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
