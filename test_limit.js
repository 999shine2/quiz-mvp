import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY ? process.env.POLLINATIONS_API_KEY.trim() : '';
const longPrompt = "A highly detailed, cinematic shot of a futuristic city with flying cars and neon lights, cyberpunk style, 8k resolution, trending on artstation " + "word ".repeat(50);

async function testPostForm() {
    console.log("Testing POST with Form Data Body...");

    // URL: Base endpoint + Query Params (Model, Seed, Auth Flags)
    // Prompt: In Body
    const seed = Math.floor(Math.random() * 100000);
    const url = `https://image.pollinations.ai/prompt/?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&private=true`;

    // We send 'prompt' as data
    // Note: The endpoint might expect /prompt/THE_PROMPT 
    // If we send to /prompt/ with data?

    const filename = "test_form.jpg";
    const args = [
        '-X', 'POST',
        '-L', '-s',
        '-o', filename,
        '-H', `Authorization: Bearer ${apiKey}`,
        '--data-urlencode', `prompt=${longPrompt}`, // Safe encoding
        url + "PLACEHOLDER" // Pollinations might route based on path? 
        // Actually, let's try just the base URL first
    ];

    // Attempt 1: URL ending in /prompt/ and body has prompt
    const args1 = [
        '-X', 'POST', '-L', '-s', '-o', 'test_form_1.jpg',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-d', longPrompt, // Just raw body?
        `https://image.pollinations.ai/prompt/?model=flux&nologo=true`
    ];

    // Attempt 2: Fake path but prompt in body?
    // Pollinations code reads path. If path is absent/empty?

    // Let's try the only thing that worked: Truncation.
    // I will write a script to test if 800 chars is indeed too long.
}

async function testTruncationLimits() {
    console.log("Testing Prompt Length Limits with URL method...");
    const urlBase = `https://image.pollinations.ai/prompt/`;
    const params = `?model=flux&width=1024&seed=123&nologo=true&private=true`;

    // Test 500 chars (Should work)
    await runTest(500, "test_500.jpg");

    // Test 1000 chars (Maybe fail?)
    await runTest(1000, "test_1000.jpg");
}

async function runTest(len, name) {
    const p = "word ".repeat(Math.ceil(len / 5)).substring(0, len);
    const enc = encodeURIComponent(p);
    const url = `https://image.pollinations.ai/prompt/${enc}?model=flux&width=1024&seed=${Math.floor(Math.random() * 1000)}&nologo=true&private=true`;

    return new Promise(resolve => {
        const args = ['-X', 'POST', '-L', '-s', '-o', name, '-H', `Authorization: Bearer ${apiKey}`, url];
        const curl = spawn('curl', args);
        curl.on('close', () => {
            const kb = Math.round(fs.statSync(name).size / 1024);
            console.log(`Length ${len}: ${kb}KB`);
            resolve();
        });
    });
}

testTruncationLimits();
