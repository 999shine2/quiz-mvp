import { Client } from '@notionhq/client';
import { User } from '../models/User.js';

export async function linkNotionAccount(userId, code, redirectUri) {
    const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
    const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;

    if (!NOTION_CLIENT_ID) throw new Error("Notion Client ID not configured.");

    const encoded = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');

    const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${encoded}`
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);

    const { access_token, workspace_name } = data;

    await User.findOneAndUpdate(
        { userId },
        {
            $set: {
                "notion.accessToken": access_token,
                "notion.workspaceName": workspace_name
            }
        },
        { upsert: true, new: true }
    );

    return { access_token, workspace_name };
}

export async function fetchNotionPages(accessToken) {
    const notion = new Client({ auth: accessToken });
    const searchResponse = await notion.search({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 20
    });
    return searchResponse.results;
}

export async function fetchPageContent(accessToken, pageId) {
    const notion = new Client({ auth: accessToken });
    const blocks = await notion.blocks.children.list({ block_id: pageId });

    let pageText = "";
    for (const block of blocks.results) {
        if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
            pageText += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
        } else if (['heading_1', 'heading_2', 'heading_3'].includes(block.type) && block[block.type].rich_text.length > 0) {
            pageText += block[block.type].rich_text.map(t => t.plain_text).join('') + '\n';
        } else if (block.type === 'bulleted_list_item' && block.bulleted_list_item.rich_text.length > 0) {
            pageText += '• ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
        } else if (block.type === 'numbered_list_item' && block.numbered_list_item.rich_text.length > 0) {
            pageText += '- ' + block.numbered_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
        }
    }
    return pageText;
}
