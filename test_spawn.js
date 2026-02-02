import { spawn } from 'child_process';
import 'dotenv/config';

const KEY = process.env.POLLINATIONS_API_KEY;
const url = `https://image.pollinations.ai/prompt/test?model=flux&width=768&height=1024&nologo=true&seed=999&key=${KEY}`;

console.log("Full URL:", url);
console.log("URL length:", url.length);

const curl = spawn('curl', ['-s', url]);
const chunks = [];

curl.stdout.on('data', c => chunks.push(c));
curl.on('close', () => {
    const buffer = Buffer.concat(chunks);
    console.log("Response size:", buffer.length, "bytes");
    if (buffer.length > 1000000) {
        console.log("✅ SUCCESS - Got full image");
    } else {
        console.log("❌ FAILED - Got tier limit error");
        console.log("First 200 chars:", buffer.toString().substring(0, 200));
    }
});
