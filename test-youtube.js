/**
 * Test script: Fetches a YouTube transcript and saves it to a .txt file.
 * 
 * Usage:
 *   node test-youtube.js
 * 
 * Edit the URL below before running.
 */

import 'dotenv/config';
import fs from 'fs';
import { extractVideoId, fetchVideoMetadata, fetchYouTubeTranscript } from './services/youtubeService.js';

// ─── EDIT THIS URL ───────────────────────────────────────
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=REPLACE_ME';
// ─────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🎬 Testing YouTube transcript fetch...`);
    console.log(`   URL: ${YOUTUBE_URL}\n`);

    // 1. Extract video ID
    const videoId = extractVideoId(YOUTUBE_URL);
    if (!videoId) {
        console.error('❌ Invalid YouTube URL. Could not extract video ID.');
        process.exit(1);
    }
    console.log(`✅ Video ID: ${videoId}`);

    // 2. Fetch metadata
    console.log(`\n📋 Fetching metadata...`);
    let title = 'Unknown';
    let description = '';
    try {
        const metadata = await fetchVideoMetadata(videoId);
        title = metadata.title || 'Unknown';
        description = metadata.description || '';
        console.log(`   Title: ${title}`);
        console.log(`   Description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
    } catch (e) {
        console.warn(`⚠️  Metadata fetch failed: ${e.message}`);
    }

    // 3. Fetch transcript
    console.log(`\n📝 Fetching transcript (4-strategy cascade)...`);
    let transcriptData;
    try {
        transcriptData = await fetchYouTubeTranscript(videoId);
    } catch (e) {
        console.error(`❌ Transcript fetch threw: ${e.message}`);
        transcriptData = { text: '', segments: [], language: 'unknown' };
    }

    // 4. Report results
    const hasTranscript = transcriptData.text && transcriptData.text.length >= 50;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Result: ${hasTranscript ? '✅ SUCCESS' : '❌ FAILED (empty or too short)'}`);
    console.log(`Language: ${transcriptData.language || 'unknown'}`);
    console.log(`Text length: ${transcriptData.text?.length || 0} chars`);
    console.log(`Segments: ${transcriptData.segments?.length || 0}`);

    // 5. Write to file
    const output = [
        `YouTube Transcript Test`,
        `${'='.repeat(50)}`,
        `URL: ${YOUTUBE_URL}`,
        `Video ID: ${videoId}`,
        `Title: ${title}`,
        `Language: ${transcriptData.language || 'unknown'}`,
        `Generated: ${transcriptData.isGenerated ? 'Yes (auto-captions)' : 'No (manual)'}`,
        `Text Length: ${transcriptData.text?.length || 0} chars`,
        `Segments: ${transcriptData.segments?.length || 0}`,
        `Fetched At: ${new Date().toISOString()}`,
        ``,
        `${'─'.repeat(50)}`,
        `TRANSCRIPT:`,
        `${'─'.repeat(50)}`,
        ``,
        transcriptData.text || '(No transcript available)',
    ].join('\n');

    const filename = `transcript-${videoId}.txt`;
    fs.writeFileSync(filename, output, 'utf8');
    console.log(`\n💾 Saved to: ${filename}`);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
