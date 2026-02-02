import { spawn } from 'child_process';
import fs from 'fs';
import 'dotenv/config';

const API_KEY = process.env.POLLINATIONS_API_KEY;
const PROMPT = 'A futuristic city with flying cars';
const SEED = 42;
const WIDTH = 768;
const HEIGHT = 1024;

console.log("--- Pollinations Debug Script V2 ---");
if (!API_KEY) {
    console.error("CRITICAL: No POLLINATIONS_API_KEY found!");
    process.exit(1);
}

// URL matching the original GeminiFlash implementation but with clean Prompt
const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(PROMPT)}?model=flux&width=${WIDTH}&height=${HEIGHT}&nologo=true&seed=${SEED}`;

console.log(`Target URL: ${url}`);

async function testGen() {
    return new Promise((resolve, reject) => {
        // Try curl with Bearer Token
        const curl = spawn('curl', [
            '-v',
            '-H', `Authorization: Bearer ${API_KEY}`,
            '-H', 'User-Agent: Mozilla/5.0 (Test Script)',
            url
        ]);

        const chunks = [];
        curl.stdout.on('data', c => chunks.push(c));
        curl.stderr.on('data', d => console.error(`[CURL]: ${d}`));

        curl.on('close', (code) => {
            if (code !== 0) reject(new Error('Curl failed'));
            const buffer = Buffer.concat(chunks);
            console.log(`Received ${buffer.length} bytes`);

            // Analyze headers for errors in response body
            if (buffer.length < 1000) {
                console.log("Body:", buffer.toString());
            }

            fs.writeFileSync('test_output_v2.jpg', buffer);
            resolve();
        });
    });
}

testGen().catch(console.error);
