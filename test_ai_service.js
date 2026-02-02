import 'dotenv/config';
import { generateImageWithPollinations } from './aiService.js';

console.log("--- Testing AI Service Export ---");
const KEY = process.env.POLLINATIONS_API_KEY;
console.log(`Env Key Present: ${!!KEY}`);

async function run() {
    try {
        console.log("Calling generateImageWithPollinations...");
        const result = await generateImageWithPollinations("A cute robot holding a flower", KEY);
        console.log("Result type:", typeof result);
        console.log("Result length:", result ? result.length : 0);

        if (result && result.length > 50000) {
            console.log("SUCCESS: Image generated.");
        } else {
            console.log("FAILURE: Image too small or empty.");
            console.log("Snippet:", result.substring(0, 100));
        }
    } catch (e) {
        console.error("FAILED:", e);
    }
}

run();
