import fetch from 'node-fetch';
import 'dotenv/config';

const apiKey = process.env.POLLINATIONS_API_KEY;
console.log("Loaded API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "NONE");

async function testPollinations() {
    // HYPOTHESIS: The slashes in the date "1/14/2026" are breaking the URL routing
    const rawPrompt = "[Context: News: The Guardian (1/14/2026)] ISS astr";
    const safePrompt = encodeURIComponent(rawPrompt);
    const randomSeed = Math.floor(Math.random() * 100000);

    // Exact URL construction from aiService.js
    let pUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=800&nologo=true&seed=${randomSeed}&model=flux`;
    if (apiKey) pUrl += `&key=${apiKey}`;

    const headers = {
        'User-Agent': 'InsightTube-Client/1.0'
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`\nTesting URL: ${pUrl}`);
    console.log(`Headers:`, headers);

    try {
        const res = await fetch(pUrl, { method: 'GET', headers });
        console.log(`\nResponse Status: ${res.status}`);
        console.log(`Content-Type: ${res.headers.get('content-type')}`);
        console.log(`Content-Length: ${res.headers.get('content-length')}`);

        const buffer = await res.buffer();
        console.log(`Actual Body Size: ${buffer.length} bytes`);

        if (buffer.length < 60000) {
            console.log("⚠️  RESULT: Likely 'Tier Limit' image (Size < 60KB)");
        } else {
            console.log("✅  RESULT: Success! Real image generated (Size > 60KB)");
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
    process.exit(0);
}

testPollinations();
setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 15000);


