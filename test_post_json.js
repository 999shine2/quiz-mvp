import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY ? process.env.POLLINATIONS_API_KEY.trim() : '';
const longPrompt = "A highly detailed, cinematic shot of a futuristic city with flying cars and neon lights, cyberpunk style, 8k resolution, trending on artstation " + "word ".repeat(50);

async function testPostJSON() {
    console.log("Testing POST with JSON Body...");

    const seed = Math.floor(Math.random() * 100000);
    // Standard Pollinations Endpoint for POST
    const url = `https://image.pollinations.ai/prompt/`;

    // Construct JSON Body
    const data = JSON.stringify({
        prompt: longPrompt,
        model: 'flux',
        width: 1024,
        height: 1024,
        seed: seed,
        nologo: true,
        private: true,
        enhance: false
    });

    fs.writeFileSync('payload.json', data);

    const filename = "test_json.jpg";
    const args = [
        '-X', 'POST',
        '-L', '-s',
        '-o', filename,
        '-H', `Authorization: Bearer ${apiKey}`,
        '-H', 'Content-Type: application/json',
        '-d', '@payload.json',
        url
    ];

    return new Promise(resolve => {
        const curl = spawn('curl', args);
        curl.stderr.on('data', d => console.log(d.toString()));
        curl.on('close', () => {
            // Check file size
            try {
                const stats = fs.statSync(filename);
                const kb = Math.round(stats.size / 1024);
                console.log(`Result: ${kb}KB`);
                if (kb > 200) console.log("✅ JSON Body Worked (Large File)");
                else console.log("❌ JSON Body Failed (Small File)");
                fs.unlinkSync('payload.json');
            } catch (e) { console.log("Error checking file"); }
            resolve();
        });
    });
}

testPostJSON();
