import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY ? process.env.POLLINATIONS_API_KEY.trim() : '';
const longPrompt = "A highly detailed, cinematic shot of a futuristic city with flying cars and neon lights, cyberpunk style, 8k resolution, trending on artstation " + "word ".repeat(50); // Simulate long prompt

async function testPostBody() {
    console.log("Testing POST with Prompt in Body...");

    // URL without the prompt path
    const seed = Math.floor(Math.random() * 100000);
    // Pollinations usually takes prompt in URL path /prompt/:prompt
    // But for POST, maybe we can send it as JSON?
    // Let's try the standard endpoint for POST which is meant to be just root or /prompt

    // Strategy A: URL encoded prompt in body?
    // Strategy B: JSON body?

    // Let's try sending prompt as data with -d
    // The endpoint `https://image.pollinations.ai/prompt/` usually expects the prompt in URL.
    // However, clean POST usage usually puts it in body.
    // If we use `https://image.pollinations.ai/prompt/` and send `-d "prompt=..."`?

    // Actually, let's stick to the URL-embedded prompt for now but verify if LENGTH is the issue.
    // Let's just try to reproduce the failure first with a huge prompt.

    const encoded = encodeURIComponent(longPrompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&private=true&enhance=false`;

    const filename = "test_long_prompt.jpg";
    const args = ['-X', 'POST', '-L', '-s', '-o', filename, '-H', `Authorization: Bearer ${apiKey}`, url];

    return new Promise(resolve => {
        const curl = spawn('curl', args);
        curl.stderr.on('data', d => console.log(d.toString()));
        curl.on('close', () => {
            const stats = fs.statSync(filename);
            const kb = Math.round(stats.size / 1024);
            console.log(`Result: ${kb}KB`);
            if (kb < 200) console.log("❌ REPRODUCED FAILURE with Long Prompt");
            else console.log("✅ Long Prompt Worked");
            resolve();
        });
    });
}

testPostBody();
