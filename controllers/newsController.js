import { fetchNewsForInterest, fetchArticleContent } from '../services/newsService.js';
import { generateQuestions } from '../services/questionGenerator.js';
import { getDB, saveDB } from '../utils/dbShim.js';
import { getUserID } from '../utils/user.js';

export const generateNewsQuiz = async (req, res) => {
    try {
        const userId = getUserID(req);
        console.log(`[News API] Request from user: ${userId}`);

        let interests = [];
        try {
            const headerVal = req.headers['x-user-interests'];
            if (headerVal) {
                interests = JSON.parse(decodeURIComponent(headerVal));
            }
        } catch (e) { }
        if (!interests || interests.length === 0) {
            interests = ["Technology", "Science", "Business", "Health", "World News"];
        }

        const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
        let allArticlesPool = [];

        console.log(`[News API] User Interests: ${interests.join(', ')}`);

        // Fetch concurrently
        const interestPromises = interests.map(async (topic) => {
            try {
                const articles = await fetchNewsForInterest(topic);
                return articles.map(a => ({ ...a, interestCategory: topic }));
            } catch (e) {
                return [];
            }
        });

        const resultsPerInterest = await Promise.all(interestPromises);
        resultsPerInterest.forEach(list => {
            if (list && list.length > 0) allArticlesPool.push(...list);
        });

        if (!allArticlesPool || allArticlesPool.length === 0) {
            return res.status(404).json({ error: 'No relevant news found.' });
        }

        const seenUrls = new Set();
        const distinctPool = allArticlesPool.filter(a => {
            if (seenUrls.has(a.link)) return false;
            seenUrls.add(a.link);
            return true;
        });

        const targetCount = Math.max(5, interests.length);
        let selectedArticles = [];
        const articlesByInterest = {};

        distinctPool.forEach(a => {
            if (!articlesByInterest[a.interestCategory]) articlesByInterest[a.interestCategory] = [];
            articlesByInterest[a.interestCategory].push(a);
        });

        let interestKeys = Object.keys(articlesByInterest);
        interestKeys.sort(() => Math.random() - 0.5);

        let attempts = 0;
        while (selectedArticles.length < targetCount && attempts < 50) {
            attempts++;
            let addedSomething = false;

            for (const key of interestKeys) {
                if (selectedArticles.length >= targetCount) break;
                const candidates = articlesByInterest[key];
                if (candidates && candidates.length > 0) {
                    const picked = candidates.shift();
                    selectedArticles.push(picked);
                    addedSomething = true;
                }
            }
            if (!addedSomething) break;
        }

        console.log(`[News API] Selected ${selectedArticles.length} articles`);

        const results = await Promise.all(selectedArticles.map(async (article) => {
            try {
                let text = await fetchArticleContent(article.link);
                if (!text || text.length < 200) text = article.title + "\n\n" + (article.description || "");

                const aiResult = await generateQuestions(text, apiKey, 1, article.title, `Source: ${article.source}`, null, 'news-hook');
                if (!aiResult.questions || aiResult.questions.length === 0) return null;

                const q = aiResult.questions[0];
                q.questionContext = `News: ${article.source} (${new Date(article.pubDate).toLocaleDateString()})`;
                q.relatedLink = article.link;
                q.newsSource = { name: article.source, url: article.sourceUrl, link: article.link };
                q.forcedImageUrl = null;
                return q;
            } catch (e) {
                return null;
            }
        }));

        const validQuestions = results.filter(q => q !== null);

        if (validQuestions.length === 0) {
            return res.status(500).json({ error: 'Failed to generate any news questions.' });
        }

        const db = await getDB(req);
        const newFileId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

        const newFileEntry = {
            id: newFileId,
            filename: `News Quiz: ${new Date().toLocaleDateString()}`,
            uploadDate: new Date().toISOString(),
            type: 'news_quiz',
            path: null,
            questions: validQuestions,
            summary: "A curated news quiz based on your interests.",
            processed: true,
            isHidden: true
        };

        db.files.unshift(newFileEntry);
        await saveDB(req, db);

        res.json(newFileEntry);

    } catch (error) {
        console.error('[News API] Error:', error);
        res.status(500).json({ error: 'Failed to generate news quiz' });
    }
};
