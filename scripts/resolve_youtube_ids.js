import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, '../data/youtube_channels.json');
const OUTPUT_FILE = path.join(__dirname, '../data/youtube_playlists.json');
const API_KEY = process.env.YOUTUBE_API_KEY;

console.log(`Using API KEY: ${API_KEY.substring(0, 5)}...`);

async function resolveHandleToPlaylist(handle) {
    try {
        // Remove '@' if present
        const cleanHandle = handle.replace('@', '');

        // 1. Get Channel Details (contentDetails)
        const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${cleanHandle}&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
            const uploadsId = data.items[0].contentDetails.relatedPlaylists.uploads;
            console.log(`✅ ${handle} -> ${uploadsId}`);
            return uploadsId;
        } else {
            console.warn(`❌ No channel found for: ${handle}`);
            return null;
        }
    } catch (error) {
        console.error(`⚠️ Error fetching ${handle}:`, error.message);
        return null;
    }
}

async function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error("Input file not found:", INPUT_FILE);
        return;
    }

    const channelsData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    const resultData = {};

    // Iterate categories
    for (const [category, handles] of Object.entries(channelsData)) {
        console.log(`\nProcessing Category: ${category}`);
        resultData[category] = [];

        for (const handle of handles) {
            const playlistId = await resolveHandleToPlaylist(handle);
            if (playlistId) {
                resultData[category].push({
                    handle: handle,
                    playlistId: playlistId
                });
            }
            // Add slight delay to avoid rate limits if sequential
            await new Promise(r => setTimeout(r, 100)); // 100ms
        }
    }

    // Save Output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultData, null, 2));
    console.log(`\n🎉 Done! Saved resolved playlists to: ${OUTPUT_FILE}`);
}

main();
