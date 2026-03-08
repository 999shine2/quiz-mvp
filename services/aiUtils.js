// Shared AI utility functions
// Extracted from the monolithic aiService.js

// API Key from environment only
export const defaultApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

export const VALID_CATEGORIES = [
    "Business",
    "Finance / Investing",
    "Science",
    "Technology",
    "Health / Medicine",
    "Engineering",
    "Design",
    "Philosophy / Thinking",
    "Career / Education",
    "Politics / Society"
];

// Shared sanitization function (prevents Gemini API pattern errors)
// Previously duplicated inside generateQuestions() and generateQuestionsForCreativeWork()
export function sanitizeInput(str) {
    if (!str) return '';
    // Remove problematic characters while preserving Unicode (Korean, Chinese, Japanese, etc.)
    return str.replace(/[^\w\s가-힣一-龯ぁ-んァ-ン\-''.,!?&:()]/g, '').trim();
}

// Helper: Fix unescaped newlines/tabs inside JSON string values
export function fixJsonStringNewlines(jsonStr) {
    let fixed = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < jsonStr.length; i++) {
        const ch = jsonStr[i];
        if (escape) { fixed += ch; escape = false; continue; }
        if (ch === '\\' && inString) { fixed += ch; escape = true; continue; }
        if (ch === '"') { inString = !inString; fixed += ch; continue; }
        if (inString) {
            if (ch === '\n') { fixed += '\\n'; continue; }
            if (ch === '\r') { continue; }
            if (ch === '\t') { fixed += ' '; continue; }
        }
        fixed += ch;
    }
    return fixed;
}

// Helper: Repair Truncated JSON
export function repairTruncatedJSON(jsonStr) {
    // 1. Find the "questions" array
    const qIndex = jsonStr.indexOf('"questions"');
    if (qIndex === -1) throw new Error("No questions array found");

    // 2. Find the array start '['
    const arrayStart = jsonStr.indexOf('[', qIndex);
    if (arrayStart === -1) throw new Error("No array start found");

    // 3. Find the last successfully closed object '}'
    const lastObjectClose = jsonStr.lastIndexOf('}');
    if (lastObjectClose <= arrayStart) throw new Error("No completed objects found in array");

    // Refined Strategy:
    // Look for `},` pattern which separates objects.
    const lastCommaClose = jsonStr.lastIndexOf('},');
    let cutPoint = -1;

    if (lastCommaClose > arrayStart) {
        // We have at least one object followed by a comma.
        // We cut AFTER the `}`.
        cutPoint = lastCommaClose + 1;
    } else {
        cutPoint = lastObjectClose + 1;
    }

    // Construct attempted valid JSON
    let candidate = jsonStr.substring(0, cutPoint) + ']}';
    return candidate;
}

// Fallback: Extract key visual concepts from question text
export function extractVisualConcepts(questionText) {
    // Remove question markers and extract nouns
    let visual = questionText
        .replace(/\?|-\s*T\d+/g, '') // Remove ? and T1/T2 markers
        .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
        .trim();

    // Take first 100 chars of meaningful content
    visual = visual.substring(0, 100).trim();

    return visual || "abstract concept illustration";
}

// Helper: sleep utility for retry loops
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
