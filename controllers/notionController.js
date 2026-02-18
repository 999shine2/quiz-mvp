import { linkNotionAccount, fetchNotionPages, fetchPageContent } from '../services/notionService.js';
import { generateQuestions } from '../aiService.js';
import { getDB, saveDB } from '../utils/dbShim.js';

export const loginNotion = (req, res) => {
    const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
    const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI || 'http://localhost:3001/auth/notion/callback';

    if (!NOTION_CLIENT_ID) return res.status(500).send('Notion Client ID not configured.');

    const userId = req.query.userId || 'guest';
    const state = encodeURIComponent(userId);
    const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(NOTION_REDIRECT_URI)}&state=${state}`;

    res.redirect(authUrl);
};

export const notionCallback = async (req, res) => {
    const { code, error, state } = req.query;
    if (error) return res.status(400).send(`Notion Auth Error: ${error}`);
    if (!code) return res.status(400).send('No code returned.');

    const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI || 'http://localhost:3001/auth/notion/callback';

    try {
        let userId = 'guest';
        if (state) userId = decodeURIComponent(state).replace(/[^a-zA-Z0-9_\uAC00-\uD7A3]/g, '');
        if (!userId) userId = 'guest';

        await linkNotionAccount(userId, code, NOTION_REDIRECT_URI);
        res.redirect('/?view=profile&notion_connected=true');

    } catch (err) {
        console.error('Notion Callback Error:', err);
        res.status(500).send(`Authentication Failed: ${err.message}`);
    }
};

export const syncNotion = async (req, res) => {
    try {
        const db = await getDB(req);
        if (!db.notion || !db.notion.accessToken) {
            return res.status(401).json({ error: 'Notion not connected.' });
        }

        console.log('Searching Notion pages...');
        const pages = await fetchNotionPages(db.notion.accessToken);
        const newFiles = [];
        const { apiKey } = req.body;

        for (const page of pages) {
            try {
                const titleProp = page.properties.title || page.properties.Name;
                let title = 'Untitled Notion Page';
                if (titleProp && titleProp.title && titleProp.title.length > 0) {
                    title = titleProp.title[0].plain_text;
                }

                console.log(`Processing Notion Page: ${title}`);
                const pageText = await fetchPageContent(db.notion.accessToken, page.id);

                if (pageText.length < 50) continue;

                const aiResult = await generateQuestions(pageText, apiKey, 3, title);

                const newFileEntry = {
                    id: `notion-${page.id}`,
                    filename: `[Notion] ${title}`,
                    type: 'notion',
                    path: null,
                    uploadedAt: new Date().toISOString(),
                    questions: aiResult.questions,
                    subjectEmoji: '📓',
                    categories: ['Notion', ...(aiResult.categories || [])],
                    summary: `Synced from Notion workspace: ${db.notion.workspaceName}`,
                    originalUrl: page.url
                };

                const existingIdx = db.files.findIndex(f => f.id === newFileEntry.id);
                if (existingIdx !== -1) db.files.splice(existingIdx, 1);

                db.files.unshift(newFileEntry);
                newFiles.push(newFileEntry);
            } catch (pageErr) {
                console.error(`Error processing page ${page.id}:`, pageErr);
            }
        }

        db.notion.lastSyncedAt = new Date().toISOString();
        await saveDB(req, db);

        res.json({ success: true, syncedCount: newFiles.length, files: newFiles });
    } catch (err) {
        console.error('Notion Sync Error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const getNotionStatus = async (req, res) => {
    try {
        const db = await getDB(req);
        if (db.notion && db.notion.accessToken) {
            res.json({
                connected: true,
                workspaceName: db.notion.workspaceName,
                lastSyncedAt: db.notion.lastSyncedAt
            });
        } else {
            res.json({ connected: false });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
};
