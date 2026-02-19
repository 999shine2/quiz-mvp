import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import { Innertube, UniversalCache } from 'youtubei.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { fileURLToPath } from 'url';
import { log } from '../utils/log.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

let yt = null;

// Initialize Innertube Global
(async () => {
    try {
        const proxyUrl = process.env.YOUTUBE_PROXY_URL;
        const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

        if (proxyUrl) log.info(`[YouTube] Using Proxy: ${proxyUrl.replace(/:([^:]*@)/, ':****@')}`);

        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true,
            lang: 'en',
            location: 'US',
            fetch: (input, init) => {
                if (agent) {
                    init = init || {};
                    init.agent = agent;
                }
                return fetch(input, init);
            }
        });
        log.info('[YouTube] Innertube Client Initialized');
    } catch (e) {
        log.error('[YouTube] Innertube Init Failed:', e);
    }
})();

export async function fetchYouTubeTranscript(videoId) {
    const pythonScript = path.join(PROJECT_ROOT, 'fetch_transcript.py');
    const command = `python3 "${pythonScript}" "${videoId}"`;

    try {
        const { stdout } = await execAsync(command);
        const lines = stdout.split('\n').filter(line =>
            !line.includes('Warning') && line.trim().length > 0
        );
        const result = JSON.parse(lines.join('\n').trim());
        if (!result.success) throw new Error(result.error);

        return { text: result.text, segments: result.segments, language: result.language, isGenerated: result.is_generated };

    } catch (pythonError) {
        log.warn(`[YouTube] Python Transcript failed (${pythonError.message}). Switch to Innertube...`);

        if (!yt) {
            try {
                yt = await Innertube.create({ cache: new UniversalCache(false) });
            } catch (e) { }
        }

        if (!yt) return { text: "", segments: [], language: 'en', isGenerated: false };

        try {
            const info = await yt.getInfo(videoId);
            const transcriptData = await info.getTranscript();

            if (!transcriptData || !transcriptData.transcript) throw new Error("No transcript data found via Innertube");

            const segments = transcriptData.transcript.content.body.initial_segments.map(seg => ({
                text: seg.snippet.text,
                start: Number(seg.start_ms) / 1000,
                duration: Number(seg.end_ms - seg.start_ms) / 1000
            }));

            const fullText = segments.map(s => s.text).join(' ');
            log.info(`[YouTube] Innertube Success! Length: ${fullText.length}`);

            return {
                text: fullText,
                segments: segments,
                language: 'en',
                isGenerated: false
            };
        } catch (innerError) {
            log.error('[YouTube] Innertube also failed:', innerError.message);
            return { text: "", segments: [], language: 'en', isGenerated: false };
        }
    }
}

export async function fetchVideoMetadata(videoId) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (YOUTUBE_API_KEY) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                return {
                    title: data.items[0].snippet.title,
                    description: data.items[0].snippet.description || ""
                };
            }
        } catch (e) { }
    }

    try {
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const data = await res.json();
        if (data.title) {
            return { title: data.title, description: "" };
        }
    } catch (e) { }

    if (yt) {
        try {
            const info = await yt.getBasicInfo(videoId);
            return { title: info.basic_info.title, description: info.basic_info.short_description || "" };
        } catch (e) { }
    }

    return { title: null, description: "" };
}

export function extractVideoId(url) {
    try {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    } catch (e) {
        return null;
    }
}
