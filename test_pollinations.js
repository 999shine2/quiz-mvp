import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prompt = "A futuristic city with flying cars";
const encoded = encodeURIComponent(prompt);
const apiKey = process.env.POLLINATIONS_API_KEY || "";

// Test flux WITH API key authentication
const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1024&height=1024`;

console.log("================================================");
console.log("TESTING FLUX MODEL WITH AUTHENTICATION");
console.log(`URL: ${url}`);
console.log(`API Key present: ${apiKey ? 'Yes (' + apiKey.substring(0, 10) + '...)' : 'No - WILL HIT RATE LIMIT!'}`);
console.log("================================================\n");

// Build curl arguments with Authorization header
const curlArgs = ['-L', '-s', '-v', '-o', 'test_output.png'];

if (apiKey && apiKey.trim().length > 0) {
    curlArgs.push('-H', `Authorization: Bearer ${apiKey}`);
    console.log("✅ Using authenticated request with Authorization header");
} else {
    console.warn("⚠️  WARNING: No API key found! You will hit anonymous rate limits.");
}

curlArgs.push(url);

const curl = spawn('curl', curlArgs);
let stderr = "";

curl.stderr.on('data', (data) => stderr += data.toString());

curl.on('close', (code) => {
    const statusMatch = stderr.match(/< HTTP\/2 (\d+)/) || stderr.match(/< HTTP\/1\.1 (\d+)/);
    console.log(`HTTP Status: ${statusMatch ? statusMatch[1] : 'Unknown'}`);
    console.log(`Exit Code: ${code}`);

    // Check file size
    const fs = require('fs');
    try {
        const stats = fs.statSync('test_output.png');
        console.log(`\nFile Size: ${stats.size} bytes`);

        if (stats.size > 10000) {
            console.log("\n✅ SUCCESS! Image downloaded successfully!");
            console.log("File saved as: test_output.png");
        } else {
            console.log("\n❌ FAILED - File too small, likely an error response");
            const content = fs.readFileSync('test_output.png', 'utf8');
            console.log(content);
        }
    } catch (e) {
        console.log("\n❌ FAILED - No file created");
    }
});
