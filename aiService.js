import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { spawn } from 'child_process';

// Restored Key
// API Key from environment only
const defaultApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const VALID_CATEGORIES = [
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

async function generateQuestions(text, apiKey, count = 5, title = "", relatedContext = "", userProfile = null, distribution = "standard", avoidQuestions = []) {
    const key = apiKey || defaultApiKey;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // SHARED SANITIZATION FUNCTION (prevents Gemini API pattern errors)
    const sanitizeInput = (str) => {
        if (!str) return '';
        // Remove problematic characters while preserving Unicode (Korean, Chinese, Japanese, etc.)
        return str.replace(/[^\w\s가-힣一-龯ぁ-んァ-ン\-''.,!?&:()]/g, '').trim();
    };

    // Sanitize all text inputs before sending to Gemini
    const cleanTitle = sanitizeInput(title);
    const cleanContext = sanitizeInput(relatedContext);
    // Note: Don't sanitize 'text' (transcript/document content) as it may be long and already validated

    // Basic validation to ensure key isn't a placeholder
    if (!key || key === 'YOUR_API_KEY_HERE' || key.length < 10) {
        console.warn('No valid API key provided, returning mock questions');
        return getMockQuestions("No Valid API Key Provided (Check logic)");
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest",
            generationConfig: {
                maxOutputTokens: 8192
            }
        });

        // Determine Logic: Adaptive Ratios based on whether context exists
        // Fix: Safe check for context existence
        const safeContext = cleanContext || "";
        const hasContext = safeContext.trim().length > 50;
        let typeInstructions = '';

        if (distribution === 'conceptual') {
            // CONCEPTUAL MODE (5 Questions - Type 2)
            typeInstructions = `
      **TONE & STYLE GUIDE (CRITICAL):**
      - **FRIENDLY & CONVERSATIONAL:** Do NOT sound like a standardized test.
      - **COACHING VIBE:** Frame questions as if you are a curious study buddy.
      
      **STRICT QUESTION DISTRIBUTION (Target: 5 Questions):**
      1. **Questions 1 to 5:** **Type 2 (Conceptual Understanding)**.
         - Focus: Core academic concepts, deep understanding.
         - Label: End with " - T2".
            `;
        } else if (distribution === 'applicable') {
            // APPLICABLE MODE (5 Questions - Mix)
            typeInstructions = `
      **TONE & STYLE GUIDE (CRITICAL):**
      - **FRIENDLY & CONVERSATIONAL:** Do NOT sound like a standardized test.
      
      **STRICT QUESTION DISTRIBUTION (Target: 5 Questions):**
      1. **Questions 1 to 3:** **Type 1 (Personalized Application/MCQ)**.
         - Focus: Apply concepts to real scenarios.
         - Label: End with " - T1".
      2. **Question 4:** **Type 3 (Synthesis)**.
         - Focus: Connect concepts.
         - Label: End with " - T3".
      3. **Question 5:** **Type 4 (Short Answer)**.
         - Focus: Reflection.
         - JSON type: "SAQ".
         - Label: None needed (type field handles it).
            `;
        } else if (distribution === 'news-hook') {
            // NEWS HOOK MODE (Curiosity Driver)
            typeInstructions = `
      **GOAL: INDUCE CURIOSITY (CRITICAL - EXTREME CONCISENESS):**
      - The user has **NOT** read this article yet.
      - Your goal is NOT to test their knowledge, but to make them **want to read** the article.
      
      **STRICT NEGATIVE CONSTRAINTS (DO NOT IGNORE):**
      1. **NEVER start with "Imagine..." or "Picture this..."**
      2. **NEVER use hypothetical framing for real events.**
      3. **NEVER ask "What does the text say?".**

      **CONCISENESS RULES:**
      - **Questions:** Max 2 short sentences. Direct and punchy.
      - **Options:** Max 10-15 words. No fluff.

      **REQUIRED FORMAT (Fact + Implications):**
      - **Sentence 1:** State the **Main Event** as a concrete fact.
      - **Sentence 2:** Ask a provocative question about the *implications* or *future*.
      
      **Examples:**
      - *Excellent:* "SpaceX caught its Super Heavy booster. How might this change Mars colonization economics?"
      - *Excellent:* "The Fed cut rates by 0.5%. Does this signal worry for the economy?"
      
      **STRICT QUESTION DISTRIBUTION (Target: 5 Questions):**
      1. **Questions 1-5:** **Type 2 (Conceptual Hook)**.
         - Focus: "X happened. Why does it matter?"
         - Label: End with " - T2".
         - Ensure exactly 5 questions.
            `;
        } else {
            // STANDARD MODE (Default 10 Questions)
            typeInstructions = `
                ** TONE & STYLE GUIDE (CRITICAL - CREATIVE STYLE):**
       - **ROLE:** You are an expert coach and curious study buddy.
       - **TONE:** Friendly, conversational, and insightful. Do NOT sound like a robot or a standardized test.
       - **CONCISE & DIRECT:** 
         - Get straight to the point.
         - **DELETE FLUFF:** Remove phrases like "In the video...", "The speaker mentions...", etc.
         - **STRICT LENGTH LIMIT (CRITICAL):**
           - **Questions:** Max 2 short sentences.
           - **OPTIONS:** **MAX 120 CHARACTERS PER OPTION.** Keep them descriptive but concise.
           - Rule of thumb: If it wraps to a third line on mobile, it's too long.

       ** STRICT QUESTION DISTRIBUTION (Target: ${count} questions):**
       (Modeled after Creative Work Style for higher engagement)

       1. ** QUESTIONS 1-2 (2 Questions):** **Type 2 (Conceptual Understanding)**
          - Focus: Core concepts, deep understanding, "Why" and "How".
          - Label: End with " - T2".
          
       2. ** QUESTIONS 3-4 (2 Questions):** **Type 1 (Scenario/Application)**
          - Focus: "What would you do?" or "If you were in this situation..."
          - Connect the lesson to real life.
          - Label: End with " - T1".
          
       3. ** QUESTION 5 (1 Question):** **Type 4 (Short Answer Reflection)**
          - Focus: Warm, open-ended thought experiment.
          - Label: None needed.

       (Note: If count > 5, continue alternating T2 and T1).
       Ensure the total number is exactly ${count}.
      `;
        }

        const prompt = `
      Analyze the following lecture note / transcript.
      
      **CRITICAL INSTRUCTION: Language Matching**
      1. Detect the primary language of the Title ("${cleanTitle}") and the Text.
      2. If the text is in Korean, ALL generated questions, options, and explanations MUST be in Korean.
      3. If the text is in English, use English.
      4. Generally, the output language must strictly match the source text language.
      **EXCEPTION: The 'imagePrompt' AND 'categories' fields MUST ALWAYS be in English, regardless of the source language. NO EXCEPTIONS.**
      
      Part 1: Generate ${count} high-quality questions following the Tone and Distribution rules.
      
      ${typeInstructions}
      
      **STRICT NEGATIVE CONSTRAINTS (DO NOT IGNORE):**
      1. **NO META-REFERENCES:** NEVER use phrases like "According to the text", "In the video", "As mentioned in the lecture", "The speaker says", "At the end of the clip", "In this incident".
      2. **NO LOCATION-BASED TRIVIA:** Do NOT ask what happened "at the beginning", "in the middle", or "at the end".
      3. **NO NONSENSE OPTIONS:** Distractors must be plausible.
      4. **STANDALONE:** Questions must test understanding, not rote memorization.
      5. **NO TRIVIAL FACTS:** Do NOT ask about meaningless numbers, dates, or durations that don't provide insight.
      6. **NO TITLE DUMPING:** Do NOT paste the entire video title into the question. Use a short, natural description of the event/topic (e.g. "The Apple Antitrust Case" instead of "Breaking News: Apple Sued by DOJ for...").
      
      **MANDATORY: SELF-CONTAINED CONTEXT (CRITICAL)**
      - **Users may review this question WEEKS later.** They will NOT remember what "this video" or "the incident" refers to.
      - **NEVER** use vague phrases like: "this incident", "the speaker", "the video", "this situation", "the text", "it", "they".
      - **ALWAYS** explicitly state the subject.
        - ❌ BAD: "What lesson can be learned from this incident?" (User asks: "What incident??")
        - ✅ GOOD: "What lesson can be learned from the [Banana Art Stunt]?"
        - ❌ BAD: "How does his argument..."
        - ✅ GOOD: "How does [Seth Godin's] argument..."
      - **Keep it CONCISE:** Do not dump the whole title. **EXTRACT ONLY THE CORE SUBJECT.**
        - ❌ BAD: "In [Mona Lisa: The Theft and the Birth of a Superstar]..." (Way too long)
        - ✅ GOOD: "In [Mona Lisa]..." (Perfect)
        - ❌ BAD: "What does [Breaking News: Apple Sued by DOJ for Monopoly] tell us?"
        - ✅ GOOD: "What does [The Apple Lawsuit] tell us?"
        - Use a short, recognizable tag (e.g. "The 2008 Crash", "SpaceX Launch", "The Banana Incident").

      **MANDATORY: FOCUS ON TRANSFERABLE CONCEPTS & INSIGHTS**
      - Every question MUST test a CONCEPT, PRINCIPLE, TECHNIQUE, or INSIGHT that can be applied elsewhere
      - Focus on WHY and HOW, not just WHAT or WHEN
      - Questions should help users retain knowledge they can USE in the real world
      - ✅ GOOD: "How might Starbucks' and Dunkin's contrasting strategies impact..."
      
      **FORBIDDEN (Trivial Memorization):**
      ❌ "How long did [company] run for?" (meaningless number)
      ❌ "What year did [event] happen?" (date without context)
      ❌ "How many people attended?" (trivial statistic)
      ❌ "What was the exact price?" (meaningless number)
      ❌ "What are the goals of this topic?" (too generic)
      ❌ "Who is the target audience?" (not insightful)
      ❌ "How might their strategy impact growth?" (Who is "their"? Missing context!)
      
      **REQUIRED (Conceptual Understanding & Insights):**
      ✅ "WHY did [specific strategy] lead to [outcome] for [company/person]?" (causal + context)
      ✅ "What principle explains why [specific technique] is effective?" (transferable concept)
      ✅ "How does [Company A's approach] differ from [Company B's approach] in achieving [goal]?" (comparative + specific)
      ✅ "What key insight from [specific example] can be applied to [similar situation]?" (transferable + context)
      ✅ "What mistake should be avoided when [doing specific X]?" (practical wisdom + specific)

      Part 2: Identify the ONE single emoji that best represents the specific subject matter.
      Part 3: Generate an EXTREMELY CONCISE title (max 5 words).
      Part 4: Select 1-2 categories STRICTLY from this list: ${VALID_CATEGORIES.join(", ")}.
      Do NOT invent new categories.

      **CRITICAL: IMAGE PROMPT INSTRUCTION**
      - For each question, generate an "imagePrompt".
      - **INSTRUCTION:** Generate a detailed image prompt that specifically visualizes the content of this specific question.
      - Use the question itself as the basis for the image.
      - **LANGUAGE:** MUST BE IN ENGLISH.

      ${avoidQuestions && avoidQuestions.length > 0 ? `
      **STRICT DUPLICATION CHECK:**
      The following questions ALREADY EXIST. You must NOT generate questions that test the exact same specific fact or scenario.
      AVOID THESE TOPICS/ANGLES:
      ${avoidQuestions.map(q => `- ${q}`).join('\n')}
      ` : ''}

      Output the result as a strictly valid JSON object with this structure:
      {
        "subjectEmoji": "🧬",
        "suggestedTitle": "Title of the Content",
        "categories": ["Science", "Technology"],
        "questions": [
          {
            "type": "MCQ",
            "question": "Friendly Question Text (Append ' - T1' / ' - T2' / ' - T3')",
            "options": ["...", "...", "...", "..."],
            "correctAnswer": 0,
            "explanation": "...",
            "imagePrompt": "A single concrete object or scene: e.g. 'A golden ancient coin on a velvet cushion, digital art'"
          },
          {
            "type": "SAQ",
            "question": "Friendly Type 4 Question Text",
            "options": [],
            "idealAnswer": "Key points related to...",
            "imagePrompt": "Visual description in English..."
          }
        ]
      }
      
      Do not include markdown formatting (like code blocks) in the response, just the raw JSON.
      
      Title of Content: ${cleanTitle}
      
      *** RELATED CONTEXT (Previous Studies) ${hasContext ? '(Included)' : '(Empty)'} ***:
      ${hasContext ? cleanContext.substring(0, 3000) : "No previous context available."}
      
      *** USER PROFILE (For Personalization) ***:
      ${userProfile ? JSON.stringify(userProfile, null, 2) : "No user profile provided."}
      
      *** TEXT TO ANALYZE (Current Material) ***:
      ${(text || "").substring(0, 15000)}
      `;

        // IMPLEMENT RETRY LOGIC (for 429 errors)
        let result;
        let response;
        let textResponse;
        let attempt = 0;
        const maxRetries = 5;

        while (attempt < maxRetries) {
            try {
                result = await model.generateContent(prompt);
                response = await result.response;
                textResponse = response.text();
                break; // Success!
            } catch (err) {
                if (err.message.includes('429') || err.status === 429) {
                    const delay = (attempt + 1) * 4000 + Math.random() * 1000; // 4s, 8s, 12s... + jitter
                    console.warn(`[AI Service] Rate Limit (429) hit. Retrying in ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    attempt++;
                } else {
                    throw err; // Other errors, crash immediately
                }
            }
        }

        if (!textResponse) throw new Error("Failed to generate content after retries (Rate Limit).");

        console.log('Raw AI Response:', textResponse.substring(0, 500));

        let jsonString = textResponse;

        // BETTER JSON EXTRACTION
        const firstBracket = textResponse.indexOf('{');
        const lastBracket = textResponse.lastIndexOf('}');

        if (firstBracket !== -1 && lastBracket !== -1) {
            jsonString = textResponse.substring(firstBracket, lastBracket + 1);
        } else {
            // Fallback: cleanup common markdown artifacts
            jsonString = textResponse
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                .trim();
        }

        let parsedResponse;
        try {
            // Double-check if the string is still empty or looks invalid before parsing
            if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) {
                throw new Error("Response does not contain a JSON object");
            }
            parsedResponse = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.log("Attempting to repair truncated JSON...");

            try {
                const repairedJson = repairTruncatedJSON(jsonString);
                parsedResponse = JSON.parse(repairedJson);
                console.log("JSON Repair Successful!");
            } catch (repairError) {
                console.error('JSON Repair Failed:', repairError);

                // RETRY LOGIC (Once)
                if (count > 0 && !title.includes("RETRY")) {
                    console.log("Retrying generation due to JSON error...");
                    return generateQuestions(text, apiKey, count, title + " (RETRY)", relatedContext, userProfile, distribution, avoidQuestions);
                }

                console.warn('AI produced invalid JSON. Falling back to mock data.');
                return getMockQuestions("JSON Parse Error: " + parseError.message);
            }
        }

        const parsed = parsedResponse;

        // SANITIZE CATEGORIES
        let finalCategories = [];
        if (parsed.categories && Array.isArray(parsed.categories)) {
            finalCategories = parsed.categories.filter(c => VALID_CATEGORIES.includes(c));
        }
        // Fallback if empty or invalid
        if (finalCategories.length === 0) {
            finalCategories = ["Business"]; // Default safety
        }

        if (Array.isArray(parsed)) {
            // Handle edge case where AI returns array directly
            return { questions: parsed, subjectEmoji: '📄', suggestedTitle: 'Study Guide', isMock: false };
        }
        return {
            questions: parsed.questions,
            categories: finalCategories,
            subjectEmoji: parsed.subjectEmoji || '📄',
            suggestedTitle: parsed.suggestedTitle || '',
            isMock: false
        };
    } catch (error) {
        console.error('AI Generation Error Full Details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('503')) {
            console.error("Quota Exceeded/Rate Limit Hit. Verify API Key functionality in Google AI Studio.");
        }

        throw error;
    }
}

// Helper: Repair Truncated JSON
function repairTruncatedJSON(jsonStr) {
    // 1. Find the "questions" array
    const qIndex = jsonStr.indexOf('"questions"');
    if (qIndex === -1) throw new Error("No questions array found");

    // 2. Find the array start '['
    const arrayStart = jsonStr.indexOf('[', qIndex);
    if (arrayStart === -1) throw new Error("No array start found");

    // 3. Find the last successfully closed object '}'
    // We scan backwards from the end
    let lastClose = -1;
    let balance = 0;

    // Simple heuristic: search for "}," from the end, or just "}" if it's the very last one (unlikely if truncated)
    // Actually, if truncated, we might have `... "some prop": "val` or `... "some prop"`
    // We want to slice up to the last `}` that closes a question object.

    // Robust approach: find the last `}` that is part of the questions array
    // Let's assume the array content is standard: `[{...}, {...}, ...`

    const lastObjectClose = jsonStr.lastIndexOf('}');
    if (lastObjectClose <= arrayStart) throw new Error("No completed objects found in array");

    // We need to verify if this `}` is a top-level object close (i.e., question object) or nested.
    // Given the simple structure, `}` usually closes the question object.

    // Strategy:
    // 1. Cut the string at `lastObjectClose + 1`.
    // 2. Append `]}` to close the questions array and the root object.
    // 3. Hope that `lastObjectClose` was indeed a question closer.
    // 4. If it was nested (e.g. inside options), this might fail, but it's worth a shot.

    // Refined Strategy:
    // Look for `},` pattern which separates objects.
    const lastCommaClose = jsonStr.lastIndexOf('},');
    let cutPoint = -1;

    if (lastCommaClose > arrayStart) {
        // We have at least one object followed by a comma. 
        // We cut AFTER the `}`. 
        cutPoint = lastCommaClose + 1;
    } else {
        // Maybe we have only one object and it was closed? Or truncation happened inside the first one.
        // If truncation happened inside the first one, we can't save much.
        // If we have `[{...} ...`, but no comma (maybe partial second object), `lastIndexOf('}')` is the first object.
        cutPoint = lastObjectClose + 1;
    }

    // Construct attempted valid JSON
    // We assume the root started with `{`
    let candidate = jsonStr.substring(0, cutPoint) + ']}';

    // Verify? No inside here we just throw on the caller if `JSON.parse` fails again.
    return candidate;
}


async function generateSummary(text, apiKey, title = "") {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const key = apiKey || defaultApiKey;
    if (!key || key === 'YOUR_API_KEY_HERE') return "Summary not available (Missing API Key).";

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
      Summarize the following educational content into MAXIMUM 2 concise paragraphs (approx 150 words total).
      
      **CRITICAL INSTRUCTION: Language Matching**
      1. Detect the language of the Title: "${title}"
      2. The detailed summary MUST be written in the SAME language as the Title.
      (e.g. If title is Korean, summary MUST be Korean. If title is English, summary MUST be English).
      
      Capture the main ideas, key arguments, and conclusions.
      Use bullet points for key takeaways if appropriate.
      
      Text:
      ${text.substring(0, 15000)}
    `;

        // IMPLEMENT RETRY LOGIC (for 429 errors)
        let result;
        let response;
        let textResponse;
        let attempt = 0;
        const maxRetries = 5;

        while (attempt < maxRetries) {
            try {
                result = await model.generateContent(prompt);
                response = await result.response;
                textResponse = response.text();
                break; // Success!
            } catch (err) {
                if (err.message.includes('429') || err.status === 429) {
                    const delay = (attempt + 1) * 4000 + Math.random() * 1000;
                    console.warn(`[Summary Service] Rate Limit (429) hit. Retrying in ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    attempt++;
                } else {
                    throw err;
                }
            }
        }

        if (!textResponse) throw new Error("Failed to generate summary after retries (Rate Limit).");

        return textResponse;
    } catch (error) {
        console.error('Summary Gen Error:', error);
        return "Failed to generate summary.";
    }
}

async function generateQuestionsForCreativeWork(title, author, type, apiKey, count = 5) {
    const key = apiKey || defaultApiKey;
    if (!key || key === 'YOUR_API_KEY_HERE') return getMockQuestions("Missing API Key");

    // Sanitize inputs to prevent Gemini API pattern validation errors
    const sanitizeInput = (str) => {
        if (!str) return '';
        // Remove problematic characters while keeping letters, numbers, spaces, and common punctuation
        // Supports Unicode (Korean, Chinese, Japanese, etc.)
        return str.replace(/[^\w\s가-힣一-龯ぁ-んァ-ン\-''.,!?&]/g, '').trim();
    };

    const cleanTitle = sanitizeInput(title);
    const cleanAuthor = author ? sanitizeInput(author) : '';

    if (!cleanTitle || cleanTitle.length < 2) {
        throw new Error('Title is too short or contains invalid characters. Please use at least 2 letters or numbers.');
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest",
            generationConfig: { maxOutputTokens: 8192 }
        });

        const prompt = `
      You are an expert on pop culture, literature, and cinema.
      The user wants to study the creative work: "${cleanTitle}" ${cleanAuthor ? `by ${cleanAuthor}` : ''} (${type}).
      
      **TASK:**
      1. Recall details, themes, characters, and plot points of this work.
      2. Generate ${count} high-quality study/trivia questions.
      
      **TONE & STYLE GUIDE (CRITICAL):**
      - **FRIENDLY & CONVERSATIONAL:** Do NOT sound like a standardized test.
      - **CONCISE & DIRECT:** 
        - Avoid unnecessary words or long preambles.
        - Get straight to the point, but ensure the question is clear and high-quality.
        - **DELETE FLUFF:** Remove phrases like "In the context of the movie...", "Considering the plot...", "In the book [Title]...", etc.

      **STRICT NEGATIVE CONSTRAINTS (DO NOT IGNORE):**
      1. **NO TITLE DUMPING:** Do NOT paste the entire title into the question.
      2. **CORE SUBJECT ONLY:** Use a short, recognizable tag or the main character/theme.
         - ❌ BAD: "In the movie [Terminator 2: Judgment Day]..."
         - ✅ GOOD: "In [Terminator 2]..."
         - ❌ BAD: "What does [Harry Potter and the Sorcerer's Stone] teach us?"
         - ✅ GOOD: "What does [The Sorcerer's Stone] teach us?"
      3. **SELF-CONTAINED CONTEXT:** Ensure the user knows the TOPIC even if they see the question a week later.
         - ❌ BAD: "Why did he do that?" (Who??)
         - ✅ GOOD: "Why did [Gatsby] do that?"

      **CRITICAL: LANGUAGE CONSTRAINT**
      - The questions/options MUST match the user's input language (e.g. Korean if title is Korean).
      - **EXCEPTION:** The 'imagePrompt' AND 'categories' fields MUST ALWAYS be in English, regardless of the source language. This is for the image generator.

      **STRICT QUESTION DISTRIBUTION (Target: ${count} Questions):**

      **STRICT QUESTION DISTRIBUTION (Target: ${count} Questions):**
      
      1. **Questions 1 to 4:** **Type 2 (Conceptual Understanding)**.
         - Focus: Core themes, plot mechanics, character motivations.
         - Label: End with " - T2".

      2. **Questions 5 to 6:** **Type 1 (Scenario/Application)**.
         - Focus: "What would you do?" or "If this character were in X situation..."
         - Connect the work's lessons to real life.
         - Label: End with " - T1".

      3. **Questions 7 to 8:** **Type 3 (Synthesis)**.
         - Focus: Compare this work to other similar works, genres, or historical contexts.
         - Label: End with " - T3".

      4. **Questions 9 to 10:** **Type 4 (Short Answer Reflection)**.
         - Focus: Warm, open-ended thought experiment about the work's impact or meaning.
         - **FORMAT:** JSON field \`"type": "SAQ"\`.
         - Provide \`"idealAnswer"\` instead of \`"correctAnswer"\`.

      **OUTPUT FORMAT:**
      Strictly valid JSON.
      {
        "subjectEmoji": "🎬 (or 📖/📺/🎵)",
        "suggestedTitle": "${title}",
        "categories": ["Category1", "Category2"],
        "questions": [
           {
             "type": "MCQ",
             "question": "Question Text... - T2",
             "options": ["...", "...", "...", "..."],
             "correctAnswer": 0,
             "explanation": "...",
             "imagePrompt": "Visual description in ENGLISH representing the question context..."
           },
           {
             "type": "SAQ",
             "question": "Reflection Question...",
             "options": [],
             "idealAnswer": "Key points..."
           }
        ]
      }
      
      Do NOT include markdown backticks. Just raw JSON.
    `;

        // IMPLEMENT RETRY LOGIC (for 429 errors)
        let result;
        let response;
        let text;
        let attempt = 0;
        const maxRetries = 10; // Aggressive retry
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        while (attempt < maxRetries) {
            try {
                result = await model.generateContent(prompt);
                response = await result.response;
                text = response.text();
                break; // Success!
            } catch (err) {
                if (err.status === 429 || err.message?.includes('429') || err.message?.includes('Resource exhausted')) {
                    // Wait longer: 8s, 16s, 24s...
                    const delay = (attempt + 1) * 8000 + Math.random() * 2000;
                    console.warn(`[Creative Service] Rate Limit (429) hit. Attempt ${attempt + 1}/${maxRetries}. Retrying in ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    attempt++;
                } else {
                    throw err; // Stop for non-rate-limit errors
                }
            }
        }

        if (!text) throw new Error("Failed to generate creative questions after retries (Rate Limit).");

        // Clean JSON
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1) text = text.substring(first, last + 1);

        const parsed = JSON.parse(text);

        // HANDLE ARRAY RESPONSE DIRECTLY
        if (Array.isArray(parsed)) {
            return {
                questions: parsed,
                categories: ["Creative"],
                subjectEmoji: '🎨',
                suggestedTitle: title,
                summary: `A study set about: ${title}.`,
                isMock: false
            };
        }

        // Sanitize categories
        if (parsed.categories) {
            parsed.categories = parsed.categories.filter(c => VALID_CATEGORIES.includes(c));
            if (parsed.categories.length === 0) parsed.categories = ["Design"]; // Fallback
        }

        return {
            questions: parsed.questions,
            categories: parsed.categories || ["Design"],
            subjectEmoji: parsed.subjectEmoji || '🎨',
            suggestedTitle: parsed.suggestedTitle || cleanTitle,
            summary: `A study set about the ${type}: ${cleanTitle}.`,
            isMock: false
        };

    } catch (error) {
        console.error("Error generating creative work questions:", error);

        // Check for specific error types
        if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Resource exhausted')) {
            throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        }

        if (error.message?.includes('pattern') || error.message?.includes('INVALID_ARGUMENT')) {
            throw new Error('Invalid input format. Please check the title and author.');
        }

        if (error.message?.includes('API_KEY') || error.status === 401) {
            throw new Error('Invalid API key. Please check your configuration.');
        }

        throw new Error('Failed to generate questions. Please try again.');
    }
}

/**
 * Generates a visual description for image generation based on question content.
 * Pollinations requires English visual descriptions, not raw questions.
 */
async function generateImagePrompt(questionText, apiKey, explanationText = "") {
    const key = apiKey || defaultApiKey;
    if (!key || key === 'YOUR_API_KEY_HERE') {
        // Fallback: extract visual concepts from question
        return extractVisualConcepts(questionText);
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Convert this question into a SHORT, VISUAL description for image generation (max 10 words).
Focus on the main subject/concept, not the question structure.
Output ONLY the visual description in English, nothing else.

Question: ${questionText}

Example:
Question: "What impact do food trends have on society?"
Output: "diverse food trends influencing modern society"

Question: "How does AI affect daily life?"
Output: "artificial intelligence transforming everyday activities"

Output:`;

        const result = await model.generateContent(prompt);
        const description = result.response.text().trim()
            .replace(/^["']|["']$/g, '') // Remove quotes
            .substring(0, 200); // Limit length

        console.log(`[Image Prompt] "${questionText.substring(0, 30)}..." → "${description}"`);
        return description;

    } catch (error) {
        console.error('Image prompt generation error:', error.message);
        return extractVisualConcepts(questionText);
    }
}

// Fallback: Extract key visual concepts from question text
function extractVisualConcepts(questionText) {
    // Remove question markers and extract nouns
    let visual = questionText
        .replace(/\?|-\s*T\d+/g, '') // Remove ? and T1/T2 markers
        .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
        .trim();

    // Take first 100 chars of meaningful content
    visual = visual.substring(0, 100).trim();

    return visual || "abstract concept illustration";
}


// Gemini 2.5 Flash Image Generaiton (Nano Banana)
// Gemini 2.5 Flash Image Generaiton (Nano Banana)
async function generateImageWithGeminiFlash(prompt, apiKey) {
    // DIRECT POLLINATIONS.AI INTEGRATION
    // We delegate to the robust curl-based function defined below to ensure proper Header Auth
    try {
        // Use the POLLINATIONS_API_KEY from env, not the Gemini key passed in
        const pKey = process.env.POLLINATIONS_API_KEY || "";
        return await generateImageWithPollinations(prompt, pKey);

    } catch (error) {
        console.error("Pollinations (via Flash) Generation Failed:", error.message);
        return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    }
}

/**
 * Native Google Imagen 3 Integration
 * Calls the Imagen 3 API using the user's Gemini API Key.
 */
async function generateImageWithImagen(prompt, apiKey) {
    const key = apiKey || defaultApiKey;
    if (!key || key.length < 10) throw new Error("Missing Gemini API Key");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;

    const body = {
        instances: [
            { prompt: prompt }
        ],
        parameters: {
            sampleCount: 1,
            aspectRatio: "3:4" // Preferred for mobile-style quiz cards
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Imagen API Error ${response.status}:`, errorText);
            throw new Error(`Imagen API failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data.predictions && data.predictions.length > 0) {
            return data.predictions[0].bytesBase64Encoded;
        } else {
            throw new Error("No image data in Imagen response");
        }
    } catch (error) {
        console.error("Imagen Request Failed:", error);
        throw error;
    }
}

/**
 * Generates 2 similar questions based on a "seed" question and its context.
 * Used for "Endless Review" spawning.
 */
async function generateSimilarQuestions(seedQuestion, context, type, apiKey, existingQuestions = [], sourceTitle = "this material") {
    const key = apiKey || defaultApiKey;
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Use available model

    const typeLabel = type === 'SAQ' ? 'Type 4 (Short Answer)' : `Type ${type} (Multiple Choice)`;

    const hasContext = context && context.length > 50;
    const safeContext = hasContext ? context : "";

    // Format exclusion list (take recent 20 to save tokens)
    const exclusionList = existingQuestions
        .slice(0, 30)
        .map(q => `- ${q}`)
        .join('\n');


    const prompt = `
    CONTEXT: The user just answered this question correctly:
    "${seedQuestion}"

    FULL TRANSCRIPT/DESCRIPTION:
    """
    ${hasContext ? safeContext.substring(0, 15000) : 'No transcript available.'}
    """
    
    **CRITICAL INSTRUCTION: Language Matching**
    1. Detect the primary language of the SEED QUESTION: "${seedQuestion}"
    2. The generated question, options, and explanation MUST be in the SAME language.
    (e.g. If input is Korean, output MUST be Korean. If input is English, output MUST be English).
    
    **ALREADY COVERED TOPICS (DO NOT REPEAT):**
    The user has already answered questions about the following. 
    **YOU MUST AVOID THESE SPECIFIC ANGLES:**
    ${exclusionList}

    **ROLE & TONE:**
    - You are an **EXPERT COACH** and curious study buddy.
    - **TONE:** Friendly, conversational, and insightful.
    - **GOAL:** Extract a **LIFE LESSON** or **KEY INSIGHT** that is useful in the real world.

    **CRITICAL: SELF-CONTAINED CONTEXT (ZERO AMBIGUITY)**
    - The user is reviewing multiple books/movies at once.
    - ❌ **NEVER** use vague phrases like: "In the book...", "According to the video...", "In this incident..."
    - ✅ **ALWAYS USE THE SHORT TITLE / CORE SUBJECT:** "In *${sourceTitle}*, how does..."
    - ✅ **CORE SUBJECT ONLY:** Do NOT dump the full title if it's long. Use the main character or event name.
       - ❌ BAD: "In [Mona Lisa: The Theft...]"
       - ✅ GOOD: "In [Mona Lisa]..."
    - **IF THE QUESTION DOESNT MENTION THE SUBJECT, IT IS WRONG.**

    **MANDATORY REQUIREMENTS:**
    1. **SPECIFICITY + UNIVERSALITY:** 
       - Use a specific detail as the anchor.
       - ✅ "How does [Person]'s trick of [Simple Action] actually improve focus?" (Useful & Light)
       - ❌ "What is the profound philosophical implication of [Concept]?" (Too Heavy)
       
    2. **NATURAL RECALL (NO META-TALK):** 
       - ❌ NEVER say: "According to the text...", "In the video..."
    
    3. **AVOID "SCHOOL" QUESTIONS:**
       - ❌ NO: Dates, Names of minor characters, exact numbers, "What doesn't belong".
       - ✅ YES: Psychology, Strategy, Decision Making, Root Causes.
    
    4. **CONCISE & DIRECT:**
       - **Question:** MAX 25 words. Get straight to the point.
       - **Options:** MAX 10-12 words.

    **REQUIRED:**
    ✅ Focus on *Application*: "How can [Concept] help solve [Problem]?"
    ✅ Focus on *Wisdom*: "What is the counter-intuitive truth about [Topic] revealed here?"
    
    **STRICT RULES:**
    - Same TYPE: ${typeLabel}
    - Add type marker: ${type === 'SAQ' ? '- T4' : type === 1 ? '- T1' : '- T2'}
    
    **OUTPUT FORMAT (JSON ARRAY):**
    [
        {
            "type": "${type === 'SAQ' ? 'SAQ' : 'MCQ'}",
            "question": "Friendly question text... ${type === 'SAQ' ? '- T4' : type === 1 ? '- T1' : '- T2'}",
            "options": ["Insightful Option A", "B", "C", "D"], // MCQ only
            "correctAnswer": 0, // MCQ only
            "answer": "Answer explaining the wisdom...", // SAQ only
            "explanation": "Explanation of how this insight applies to real life or broader understanding."
        }
    ]
    `;

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7, // Lower temperature for more focused, consistent output
                topP: 0.9,
                topK: 40
            }
        });
        const response = await result.response;
        const text = response.text();

        // Parse JSON
        // Create a robust cleanup function
        const cleanText = text
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        return JSON.parse(cleanText);

    } catch (e) {
        console.error("Spawn Generation Error:", e);
        return [];
    }
}

export {
    generateQuestions,
    generateSimilarQuestions, // Export new function
    generateImagePrompt,
    generateImageWithGeminiFlash,
    generateImageWithImagen,
    generateSummary,
    generateQuestionsForCreativeWork
};

function getMockQuestions(reason = "Unknown Error") {
    return {
        subjectEmoji: "🐛",
        suggestedTitle: "Error Diagnosis",
        categories: ["Technology"],
        questions: [
            {
                type: "MCQ",
                question: `DEBUG INFO: Why are you seeing this ? REASON : ${reason} `,
                options: ["Report this", "Check API Key", "Retry", "Ignore"],
                correctAnswer: 0,
                explanation: "This mock question contains the specific error that triggered the fallback."
            },
            {
                type: "MCQ",
                question: "Which of the following describes the current state?",
                options: ["Success", "Loading", "Error Fallback", "Offline"],
                correctAnswer: 2,
                explanation: "You are seeing this because getMockQuestions() was called."
            },
            {
                type: "MCQ",
                question: "What should you do next?",
                options: ["Panic", "Refresh", "Check API Key", "Dance"],
                correctAnswer: 2,
                explanation: "Ensure your GEMINI_API_KEY is set correctly in .env or passed in headers."
            }
        ]
    };
}

// Pollinations AI (Flux) - Authenticated with API Key
export async function generateImageWithPollinations(prompt, apiKey) {
    // FIX: Truncate prompt to safe length (500 chars) to prevent URL length issues
    // Long URLs cause 414 URI Too Long or break the POST request signature
    const safePrompt = prompt.length > 500 ? prompt.substring(0, 500) : prompt;
    const encoded = encodeURIComponent(safePrompt);

    // Use the full API endpoint with model specification
    // FIX: Add random seed to prevent caching
    // FIX: Add nologo=true and private=true (Paid tier features)
    // CRITICAL: DO NOT use 'api_key' query param - it breaks authentication. Header only.
    const seed = Math.floor(Math.random() * 10000000);
    const safeKey = apiKey ? apiKey.trim() : '';

    const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&private=true&enhance=false`;

    console.log(`[Pollinations] Generating with Flux (authenticated)...`);
    console.log(`[Pollinations] API Key present: ${safeKey.length > 5 ? 'Yes' : 'No'}`);
    console.log(`[Pollinations] Prompt Length: ${safePrompt.length} (Truncated from ${prompt.length})`);

    return new Promise((resolve, reject) => {
        // Build curl arguments with Authorization header if API key is provided
        const curlArgs = [
            '-X', 'POST', // CRITICAL: Paid tier requires POST to work reliably
            '-L',  // Follow redirects
            '-s',  // Silent
        ];

        // CRITICAL: Add Authorization header with Bearer token
        if (safeKey.length > 0) {
            curlArgs.push('-H', `Authorization: Bearer ${safeKey}`);
            console.log(`[Pollinations] Using authenticated request (Header Only)`);
        } else {
            console.warn(`[Pollinations] Warning: No API key provided, using anonymous tier (rate limited)`);
        }

        curlArgs.push(url);

        const curl = spawn('curl', curlArgs);
        const chunks = [];

        curl.stdout.on('data', (chunk) => chunks.push(chunk));
        curl.stderr.on('data', (data) => console.error(`[Curl Stderr]: ${data}`));

        curl.on('close', (code) => {
            if (code !== 0) return reject(new Error(`Curl process exited with code ${code}`));

            const buffer = Buffer.concat(chunks);

            // CRITICAL: Check file size to detect "Anonymous Limit" image (~100KB)
            // Real Flux images are usually > 500KB - 1.5MB
            if (buffer.length < 200000) {
                console.warn(`[Pollinations] Rate Limit Hit (Small File: ${buffer.length} bytes). Switching to Fallback URL.`);
                // FALLBACK: Return Direct URL for client-side loading
                // This prevents 500 Internal Server Error and allows browser to try loading it
                const fallbackUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true`;
                return resolve(fallbackUrl);
            }

            console.log(`[Pollinations] Success: ${buffer.length} bytes`);
            resolve(buffer.toString('base64'));
        });

        curl.on('error', (err) => reject(err));
    });
}
