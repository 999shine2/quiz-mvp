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

// Module-level proxy agent — used by ALL strategies
const proxyUrl = process.env.YOUTUBE_PROXY_URL;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
if (proxyUrl) log.info(`[YouTube] Using Proxy: ${proxyUrl.replace(/:([^:]*@)/, ':****@')}`);

// Wrapper: adds proxy agent to every fetch call when proxy is configured
function proxiedFetch(input, init = {}) {
    if (proxyAgent) init = { ...init, agent: proxyAgent };
    return fetch(input, init);
}

let yt = null;

// Initialize Innertube Global (with proxy)
(async () => {
    try {
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true,
            lang: 'en',
            location: 'US',
            fetch: proxiedFetch
        });
        log.info('[YouTube] Innertube Client Initialized');
    } catch (e) {
        log.error('[YouTube] Innertube Init Failed:', e);
    }
})();

// Strategy 1: Python youtube-transcript-api
async function tryPythonTranscript(videoId) {
    const pythonScript = path.join(PROJECT_ROOT, 'fetch_transcript.py');
    if (!fs.existsSync(pythonScript)) throw new Error('Python script not found');

    const command = `python3 "${pythonScript}" "${videoId}"`;
    const { stdout } = await execAsync(command, { timeout: 15000 });
    const lines = stdout.split('\n').filter(line =>
        !line.includes('Warning') && line.trim().length > 0
    );
    const result = JSON.parse(lines.join('\n').trim());
    if (!result.success) throw new Error(result.error);

    return { text: result.text, segments: result.segments, language: result.language, isGenerated: result.is_generated };
}

// Strategy 2: Innertube (youtubei.js)
async function tryInnertubeTranscript(videoId) {
    if (!yt) {
        // Re-init with proxy if needed
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            fetch: proxiedFetch
        });
    }
    if (!yt) throw new Error('Innertube not available');

    const info = await yt.getInfo(videoId);
    const transcriptData = await info.getTranscript();

    if (!transcriptData || !transcriptData.transcript) throw new Error("No transcript data via Innertube");

    const segments = transcriptData.transcript.content.body.initial_segments.map(seg => ({
        text: seg.snippet.text,
        start: Number(seg.start_ms) / 1000,
        duration: Number(seg.end_ms - seg.start_ms) / 1000
    }));

    const fullText = segments.map(s => s.text).join(' ');
    // Detect language from transcript content rather than hardcoding 'en'
    const detectedLang = transcriptData.transcript?.content?.body?.initial_segments?.[0]?.snippet?.language || 'unknown';
    return { text: fullText, segments, language: detectedLang, isGenerated: false };
}

// Strategy 3: Direct YouTube page scraping (extract captions from page HTML)
async function tryPageScrapeTranscript(videoId) {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await proxiedFetch(pageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000
    });

    if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`);
    const html = await res.text();

    // Check for CAPTCHA
    if (html.includes('class="g-recaptcha"')) {
        throw new Error('YouTube requires CAPTCHA (IP blocked)');
    }

    // Extract captions data from ytInitialPlayerResponse
    const playerMatch = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s)
        || html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);

    if (!playerMatch) throw new Error('Could not find player response in page');

    let playerData;
    try {
        playerData = JSON.parse(playerMatch[1]);
    } catch (e) {
        throw new Error('Failed to parse player response JSON');
    }

    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) throw new Error('No caption tracks found in page');

    // Pick best caption track:
    // 1. Prefer the video's default language track (marked vssId starting with '.')
    // 2. Then manual captions in any language
    // 3. Fall back to first available (usually auto-generated in original language)
    let track = captions.find(c => c.vssId && c.vssId.startsWith('.'))
        || captions.find(c => c.kind !== 'asr')
        || captions[0];
    const captionUrl = track.baseUrl;

    // Fetch the actual caption XML
    const captionRes = await proxiedFetch(captionUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000
    });

    if (!captionRes.ok) throw new Error(`Caption fetch failed: ${captionRes.status}`);
    const captionXml = await captionRes.text();

    // Parse XML captions
    const segmentRegex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    const segments = [];
    let match;
    while ((match = segmentRegex.exec(captionXml)) !== null) {
        const text = match[3]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]+>/g, '')
            .trim();
        if (text) {
            segments.push({
                text,
                start: parseFloat(match[1]),
                duration: parseFloat(match[2])
            });
        }
    }

    if (segments.length === 0) throw new Error('No segments parsed from captions');

    const fullText = segments.map(s => s.text).join(' ');
    const lang = track.languageCode || 'en';

    return { text: fullText, segments, language: lang, isGenerated: track.kind === 'asr' };
}

// Strategy 4: Innertube player API (manual HTTP, different from youtubei.js library)
async function tryInnertubePlayerAPI(videoId) {
    const playerBody = {
        context: {
            client: {
                clientName: 'WEB',
                clientVersion: '2.20240101.00.00',
                hl: 'en',
                gl: 'US'
            }
        },
        videoId: videoId
    };

    const playerRes = await proxiedFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
        },
        body: JSON.stringify(playerBody),
        timeout: 10000
    });

    if (!playerRes.ok) throw new Error(`Innertube player API failed: ${playerRes.status}`);
    const playerData = await playerRes.json();

    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) throw new Error('No captions from player API');

    // Pick best track: default language > manual > first available
    let track = captions.find(c => c.vssId && c.vssId.startsWith('.'))
        || captions.find(c => c.kind !== 'asr')
        || captions[0];
    const captionUrl = track.baseUrl + '&fmt=json3';

    const captionRes = await proxiedFetch(captionUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000
    });

    if (!captionRes.ok) throw new Error(`Caption fetch failed: ${captionRes.status}`);
    const captionData = await captionRes.json();

    if (!captionData.events) throw new Error('No transcript events');

    const segments = captionData.events
        .filter(e => e.segs)
        .map(e => ({
            text: e.segs.map(s => s.utf8).join(''),
            start: (e.tStartMs || 0) / 1000,
            duration: (e.dDurationMs || 0) / 1000
        }));

    const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    return { text: fullText, segments, language: track.languageCode || 'en', isGenerated: track.kind === 'asr' };
}

export async function fetchYouTubeTranscript(videoId) {
    const strategies = [
        { name: 'Python', fn: () => tryPythonTranscript(videoId) },
        { name: 'Innertube', fn: () => tryInnertubeTranscript(videoId) },
        { name: 'PageScrape', fn: () => tryPageScrapeTranscript(videoId) },
        { name: 'InnertubeAPI', fn: () => tryInnertubePlayerAPI(videoId) },
    ];

    for (const strategy of strategies) {
        try {
            log.info(`[YouTube] Trying ${strategy.name}...`);
            const result = await strategy.fn();
            if (result.text && result.text.length >= 50) {
                log.info(`[YouTube] ${strategy.name} succeeded! Length: ${result.text.length}`);
                return result;
            }
            log.warn(`[YouTube] ${strategy.name} returned insufficient text (${result.text?.length || 0} chars)`);
        } catch (e) {
            log.warn(`[YouTube] ${strategy.name} failed: ${e.message}`);
        }
    }

    log.error('[YouTube] All transcript strategies failed');
    return { text: "", segments: [], language: 'en', isGenerated: false };
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
