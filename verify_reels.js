import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
    // 1. Setup User
    const usersDir = path.join(__dirname, 'data/users');
    if (!fs.existsSync(usersDir)) {
        console.log('Creating users dir:', usersDir);
        fs.mkdirSync(usersDir, { recursive: true });
    }

    const userId = 'debug_verify_user';
    const filePath = path.join(usersDir, `${userId}.json`);

    // Create mock DB with 1 file and 0 buffer
    const mockDB = {
        reelsBuffer: [],
        files: [{
            id: 'file_123',
            filename: 'PHYSICAL_PROOF_BOOK',
            questions: [{
                question: 'Test Question?',
                options: ['A', 'B'],
                correctAnswer: 0
            }]
        }]
    };

    fs.writeFileSync(filePath, JSON.stringify(mockDB, null, 2));
    console.log(`[Test] Created mock user: ${userId} at ${filePath}`);

    // 2. Call API
    try {
        console.log('[Test] Fetching /api/reels/pregenerated...');
        const res = await fetch('http://localhost:3001/api/reels/pregenerated', {
            headers: { 'x-user-id': userId }
        });
        const data = await res.json();

        console.log('[Test] Response received.');

        if (Array.isArray(data) && data.length > 0) {
            const item = data[0];
            // Log the QUESTION object to see if it has sourceTitle
            console.log('[Test] Inspecting first item properties:');
            // The item.question is what the client renders
            console.log(JSON.stringify(item.question, null, 2));

            // Check if sourceTitle/materialName is present on the QUESTION object
            if (item.question.sourceTitle === 'PHYSICAL_PROOF_BOOK') {
                console.log('✅ SUCCESS: sourceTitle is correctly attached to the question object.');
            } else {
                console.log('❌ FAILURE: sourceTitle is MISSING or WRONG.');
                console.log('Actual keys:', Object.keys(item.question));
            }
        } else {
            console.log('⚠️ Buffer empty (Refill failed or returned empty array)');
            console.log('Response:', JSON.stringify(data, null, 2));
        }

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

test();
