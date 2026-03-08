// Question generation functions
// Extracted from the monolithic aiService.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { defaultApiKey, VALID_CATEGORIES, sanitizeInput, fixJsonStringNewlines, repairTruncatedJSON, sleep } from './aiUtils.js';

async function generateQuestions(text, apiKey, count = 5, title = "", relatedContext = "", userProfile = null, distribution = "standard", avoidQuestions = []) {
    const key = apiKey || defaultApiKey;

    // Sanitize all text inputs before sending to Gemini
    const cleanTitle = sanitizeInput(title);
    const cleanContext = sanitizeInput(relatedContext);
    // Note: Don't sanitize 'text' (transcript/document content) as it may be long and already validated

    // Basic validation to ensure key isn't a placeholder
    if (!key || key === 'YOUR_API_KEY_HERE' || key.length < 10) {
        console.warn('No valid API key provided, returning mock questions');
        throw new Error('No valid Gemini API key configured. Set GEMINI_API_KEY in your .env file.');
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 8192
            }
        });

        // Determine Logic: Adaptive Ratios based on whether context exists
        const safeContext = cleanContext || "";
        const hasContext = safeContext.trim().length > 50;
        let typeInstructions = '';

        if (distribution === 'conceptual') {
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
      3. **HIGH-QUALITY DISTRACTORS (CRITICAL):**
         - Every wrong option MUST be plausible and related to the topic. A student who didn't study should genuinely hesitate.
         - Wrong options should be common misconceptions, partial truths, or things that SOUND right but are subtly wrong.
         - All 4 options must be similar in length, tone, and specificity. Do NOT make the correct answer obviously longer or more detailed.
         - ❌ BAD: Correct="Supply and demand imbalance" vs Wrong="Bananas", "The color blue", "A random guess" (obviously nonsensical)
         - ❌ BAD: Correct="By analyzing market trends and consumer behavior patterns" vs Wrong="Yes", "No", "Maybe" (length mismatch)
         - ✅ GOOD: All 4 options are realistic strategies/concepts that someone might confuse.
         - The student should need to THINK to pick the right answer, not just eliminate absurd options.
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
      
      **FORBIDDEN TERMS (STRICT):**
      ❌ **NEVER** use generic subjects like: "the book", "the novel", "the movie", "the film", "the video", "the text", "this work", "the author".
      ❌ **NEVER** start with "In the book..." or "How does the movie...".
      ✅ **ALWAYS** use the specific Title or Subject Name: "How does [The Great Gatsby]...", "In [Inception]...".

      **REQUIRED (Conceptual Understanding & Insights):**
      ✅ "WHY did [specific strategy] lead to [outcome] for [company/person]?" (causal + context)
      ✅ "What principle explains why [specific technique] is effective?" (transferable concept)
      ✅ "How does [Company A's approach] differ from [Company B's approach] in achieving [goal]?" (comparative + specific)
      ✅ "What key insight from [specific example] can be applied to [similar situation]?" (transferable + context)
      ✅ "What mistake should be avoided when [doing specific X]?" (practical wisdom + specific)

      Part 2: Identify the ONE single emoji that best represents the specific subject matter.
      Part 3: Generate an EXTREMELY CONCISE title (max 5 words).
      Part 4: CATEGORY SELECTION (CRITICAL — DO NOT DEFAULT TO "Design")
      Select 1-2 categories STRICTLY from this list based on the actual content:
      - "Business" — startups, management, marketing, entrepreneurship
      - "Finance / Investing" — money, investing, economics, markets
      - "Science" — biology, physics, chemistry, psychology, research
      - "Technology" — software, AI, engineering tools, internet
      - "Health / Medicine" — health, fitness, medicine, nutrition
      - "Engineering" — mechanical, electrical, civil, systems engineering
      - "Design" — ONLY visual design, UI/UX, graphic design, architecture
      - "Philosophy / Thinking" — philosophy, ethics, self-improvement, wisdom, literature
      - "Career / Education" — jobs, education, learning, professional development
      - "Politics / Society" — politics, government, social issues, inequality, history, law
      Do NOT pick "Design" unless the content is literally about visual/graphic design.
      Do NOT invent new categories.

      **CRITICAL: IMAGE PROMPT INSTRUCTION**
      - For each question, generate an "imagePrompt".
      - **INSTRUCTION:** Generate a detailed image prompt that specifically visualizes the content of this specific question.
      - Use the question itself as the basis for the image.
      - **LANGUAGE:** MUST BE IN ENGLISH.

      ${avoidQuestions && avoidQuestions.length > 0 ? `
      **🚨 CRITICAL: AVOID DUPLICATE LEARNING 🚨**
      The user has ALREADY learned these concepts from previous questions. Your goal is to teach them SOMETHING NEW.
      
      **EXISTING QUESTIONS (DO NOT REPEAT THESE CONCEPTS):**
      ${avoidQuestions.map(q => `- ${q}`).join('\n')}
      
      **YOUR TASK:**
      1. Read the transcript thoroughly and identify DIFFERENT facts, concepts, or insights
      2. Focus on parts of the content NOT covered by the existing questions above
      3. If the existing questions focus on concept A, create questions about concepts B, C, D
      4. Ensure each new question teaches something the user hasn't learned yet
      
      **UNACCEPTABLE:** Creating questions that test the same knowledge in slightly different wording
      **REQUIRED:** Find genuinely new learning opportunities in the material
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
                .trim();
        }
        // Fix unescaped newlines/tabs inside JSON string values
        jsonString = fixJsonStringNewlines(jsonString);

        let parsedResponse;
        try {
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
                throw new Error('AI returned invalid JSON that could not be repaired. Please try again.');
            }
        }

        const parsed = parsedResponse;

        // SANITIZE CATEGORIES
        let finalCategories = [];
        if (parsed.categories && Array.isArray(parsed.categories)) {
            finalCategories = parsed.categories.map(c => {
                if (VALID_CATEGORIES.includes(c)) return c;
                const normalized = c.trim().toLowerCase();
                return VALID_CATEGORIES.find(v => v.toLowerCase() === normalized
                    || v.toLowerCase().replace(/\s*\/\s*/g, '/') === normalized.replace(/\s*\/\s*/g, '/')
                ) || null;
            }).filter(Boolean);
        }
        // Fallback if empty or invalid
        if (finalCategories.length === 0) {
            finalCategories = ["Philosophy / Thinking"];
        }

        if (Array.isArray(parsed)) {
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


async function generateSummary(text, apiKey, title = "") {
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
    if (!key || key === 'YOUR_API_KEY_HERE') throw new Error('No valid Gemini API key configured. Set GEMINI_API_KEY in your .env file.');

    const cleanTitle = sanitizeInput(title);
    const cleanAuthor = author ? sanitizeInput(author) : '';

    if (!cleanTitle || cleanTitle.length < 2) {
        throw new Error('Title is too short or contains invalid characters. Please use at least 2 letters or numbers.');
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: { maxOutputTokens: 16384 }
        });

        const prompt = `
      You are an expert on pop culture, literature, and cinema.
      The user wants to study the creative work: "${cleanTitle}" ${cleanAuthor ? `by ${cleanAuthor}` : ''} (${type}).
      
      **TASK:**
      1. Recall details, themes, characters, and plot points of this work.
      2. Write a detailed "summary" field (250-400 words) with 3 sections using [H]...[/H] headers (see MANDATORY summary section below). MUST be in the SAME language as the title.
      3. Generate ${count} high-quality study/trivia questions.
      
      **FACTUAL ACCURACY (HIGHEST PRIORITY):**
      - The "correctAnswer" index MUST point to the option that is ACTUALLY correct based on the real work.
      - DOUBLE-CHECK every question: re-read the question, look at all 4 options, and verify the correctAnswer index (0-3) matches the truly correct option.
      - Wrong answers are UNACCEPTABLE. If you are unsure about a fact, do NOT make a question about it.
      - Wrong options must be WRONG but still PLAUSIBLE — they should sound like something a person who half-remembers the material might pick.
      - All 4 options must be similar in length and specificity. Do NOT make the correct answer obviously more detailed than the others.
      - The "explanation" field must clearly explain WHY the correct answer is right and why others are wrong.

      **TONE & STYLE GUIDE (CRITICAL):**
      - **FRIENDLY & CONVERSATIONAL:** Do NOT sound like a standardized test.
      - **CONCISE & DIRECT:**
        - Avoid unnecessary words or long preambles.
        - Get straight to the point, but ensure the question is clear and high-quality.
        - **DELETE FLUFF:** Remove phrases like "In the context of the movie...", "Considering the plot...", "In the book [Title]...", etc.

      **STRICT NEGATIVE CONSTRAINTS (DO NOT IGNORE):**
      1. **NO GENERIC SUBJECTS:** Do NOT use "the book", "the movie", "the novel", "the film".
      2. **ALWAYS NAMEDROP:** You MUST use the actual Title (e.g. "In [The Matrix]...") in the question text.
      3. **CORE SUBJECT ONLY:** Use a short, recognizable tag.
         - ❌ BAD: "In the movie [Terminator 2: Judgment Day]..."
         - ✅ GOOD: "In [Terminator 2]..."
         - ❌ BAD: "What does the book say about X?"
         - ✅ GOOD: "What does [1984] say about X?"

      **CRITICAL: LANGUAGE CONSTRAINT**
      - The questions/options MUST match the user's input language (e.g. Korean if title is Korean).
      - **EXCEPTION:** The 'imagePrompt' AND 'categories' fields MUST ALWAYS be in English, regardless of the source language. This is for the image generator.

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

      **CATEGORY SELECTION (CRITICAL — READ CAREFULLY):**
      You MUST select 1-2 categories from ONLY this list based on what the work is ABOUT:
      - "Business" — startups, management, marketing, entrepreneurship, corporate strategy
      - "Finance / Investing" — money, investing, economics, markets, personal finance
      - "Science" — biology, physics, chemistry, psychology, research, sci-fi themes about science
      - "Technology" — software, AI, engineering tools, internet, gadgets, sci-fi themes about tech
      - "Health / Medicine" — health, fitness, medicine, nutrition, mental health
      - "Engineering" — mechanical, electrical, civil, systems engineering
      - "Design" — ONLY for works literally about visual design, UI/UX, graphic design, or architecture
      - "Philosophy / Thinking" — philosophy, ethics, critical thinking, self-improvement, wisdom, literature, human nature, dystopia, existentialism
      - "Career / Education" — jobs, education, learning, professional development, skills
      - "Politics / Society" — politics, government, social issues, inequality, history, law, class struggle, revolution

      **STRICT RULES:**
      - "Design" means VISUAL/GRAPHIC DESIGN. A novel is NOT design. A movie is NOT design. Music is NOT design.
      - "1984" by Orwell → "Politics / Society"
      - "A Discourse on Inequality" by Rousseau → "Politics / Society"
      - A sci-fi movie → "Science" or "Philosophy / Thinking"
      - A drama about human relationships → "Philosophy / Thinking"
      - ONLY pick "Design" if the work is literally ABOUT visual art, graphic design, or UI/UX

      **MANDATORY "summary" FIELD (DO NOT SKIP):**
      You MUST write a detailed "summary" field (250-400 words) about THIS specific work.
      Structure it as **3 sections** with headers, using the format below:

      Each section MUST start with a header tag: [H]Section Title[/H] followed by the paragraph content.

      **Section 1 — Story & Characters (longest section):**
      Start with [H]📖 Story & Characters[/H] (use language-appropriate header if non-English, e.g. [H]📖 줄거리와 등장인물[/H])
      Describe the plot, setting, and main characters in detail. What is the premise? What happens to the protagonist? Include specific plot points, character names, and narrative arc.

      **Section 2 — Themes & Ideas:**
      Start with [H]💡 Themes & Ideas[/H] (or [H]💡 주제와 아이디어[/H] etc.)
      What are the core themes this work explores? (e.g., power, freedom, identity, morality, social inequality). Explain HOW the work explores these themes through its story or arguments.

      **Section 3 — Significance & Legacy:**
      Start with [H]🌟 Significance & Legacy[/H] (or [H]🌟 의의와 영향[/H] etc.)
      Why is this work important? What influence has it had on culture, literature, or society? What key concepts or phrases has it introduced?

      RULES:
      - MUST be in the SAME language as the title (Korean title → Korean summary, including section headers).
      - Use **bold** markdown for character names, key terms, and important concepts.
      - DO NOT write generic text like "A study set about..." — write a REAL, DETAILED description.
      - IMPORTANT: Separate the 3 sections with [PARA] between them (NOT literal newlines, which break JSON).
      - Each section MUST begin with [H]emoji Title[/H] header tag.

      **OUTPUT FORMAT:**
      Strictly valid JSON.
      {
        "subjectEmoji": "🎬 (or 📖/📺/🎵)",
        "suggestedTitle": "${title}",
        "summary": "[H]📖 Story & Characters[/H] Plot and characters paragraph... [PARA] [H]💡 Themes & Ideas[/H] Themes paragraph... [PARA] [H]🌟 Significance & Legacy[/H] Significance paragraph...",
        "categories": ["Philosophy / Thinking"],
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

        // DIRECT CALL (Paid Tier - High Quota)
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        if (!text) throw new Error("Failed to generate creative questions.");

        // Clean JSON
        let jsonString = text;
        const firstBracket = text.indexOf('{');
        const lastBracket = text.lastIndexOf('}');

        if (firstBracket !== -1 && lastBracket !== -1) {
            jsonString = text.substring(firstBracket, lastBracket + 1);
        } else {
            jsonString = text
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
        }

        // Fix unescaped newlines/tabs inside JSON string values
        jsonString = fixJsonStringNewlines(jsonString);

        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            console.error("JSON Parse Error in Creative Work:", e.message);
            console.error("JSON snippet (first 500 chars):", jsonString.substring(0, 500));
            // Try repair
            try {
                const repaired = repairTruncatedJSON(jsonString);
                parsed = JSON.parse(repaired);
                console.log("Creative Work JSON repaired successfully.");
            } catch (repairError) {
                console.error("Failed to repair creative work JSON:", repairError.message);
                throw new Error("AI returned invalid JSON format.");
            }
        }

        console.log(`[Creative] Parsed keys: ${Object.keys(parsed).join(', ')}`);
        console.log(`[Creative] parsed.summary = "${parsed.summary?.substring(0, 100) || 'MISSING'}"`);

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

        // Sanitize categories (flexible matching for AI variations)
        let creativeCategories = [];
        if (parsed.categories && Array.isArray(parsed.categories)) {
            creativeCategories = parsed.categories.map(c => {
                if (VALID_CATEGORIES.includes(c)) return c;
                const normalized = c.trim().toLowerCase();
                return VALID_CATEGORIES.find(v => v.toLowerCase() === normalized
                    || v.toLowerCase().replace(/\s*\/\s*/g, '/') === normalized.replace(/\s*\/\s*/g, '/')
                ) || null;
            }).filter(Boolean);
        }
        if (creativeCategories.length === 0) creativeCategories = ["Philosophy / Thinking"];

        return {
            questions: parsed.questions,
            categories: creativeCategories,
            subjectEmoji: parsed.subjectEmoji || '🎨',
            suggestedTitle: parsed.suggestedTitle || cleanTitle,
            summary: parsed.summary || `A study set about the ${type}: ${cleanTitle}.`,
            isMock: false
        };

    } catch (error) {
        console.error("Error generating creative work questions:", error);

        if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Resource exhausted')) {
            throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        }

        if (error.message?.includes('pattern') || error.message?.includes('INVALID_ARGUMENT')) {
            throw new Error('Invalid input format. Please check the title and author.');
        }

        if (error.message?.includes('API_KEY') || error.status === 401) {
            throw new Error('Invalid API key. Please check your configuration.');
        }

        console.error('[Creative] Full error details:', error.message, error.status);
        throw new Error(`Failed to generate questions. Please try again. (${error.message?.substring(0, 100) || 'Unknown error'})`);
    }
}


/**
 * Generates 2 similar questions based on a "seed" question and its context.
 * Used for "Endless Review" spawning.
 */
async function generateSimilarQuestions(seedQuestion, context, type, apiKey, existingQuestions = [], sourceTitle = "this material") {
    const key = apiKey || defaultApiKey;
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
    - ❌ **NEVER** use vague phrases like: "In the book...", "According to the video...", "In this incident...", "How does the book portray..."
    - ✅ **ALWAYS USE THE SHORT TITLE / CORE SUBJECT:** "In *${sourceTitle}*, how does..."
    - **MANDATORY:** You MUST include the Title ("${sourceTitle}") or the Author's Name in the Question Text itself.
    - ❌ BAD: "How does the book portray risk?"
    - ✅ GOOD: "How does [${sourceTitle}] portray risk?" (or a shortened version of the title)
    - **IF THE QUESTION DOESNT MENTION THE TITLE OR SUBJECT, IT IS WRONG.**

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

    **HIGH-QUALITY DISTRACTORS (CRITICAL):**
    - All 4 options must be plausible, similar in length, and related to the topic.
    - Wrong options should be common misconceptions or things that SOUND right but are subtly wrong.
    - The student should need to THINK to pick the right answer, not just eliminate absurd options.

    **OUTPUT FORMAT (JSON ARRAY):**
    [
        {
            "type": "${type === 'SAQ' ? 'SAQ' : 'MCQ'}",
            "question": "Friendly question text... ${type === 'SAQ' ? '- T4' : type === 1 ? '- T1' : '- T2'}",
            "options": ["Insightful Option A", "B", "C", "D"], // MCQ only
            "correctAnswer": 0, // MCQ only
            "answer": "Answer explaining the wisdom...", // SAQ only
            "explanation": "Explanation of how this insight applies to real life or broader understanding.",
            "imagePrompt": "A concise English description (10-15 words max) for an image that visually represents the core concept of this question. Focus on the main subject/scene, NOT text or abstract ideas."
        }
    ]
    `;

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                topK: 40
            }
        });
        const response = await result.response;
        const text = response.text();

        // Parse JSON
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
    generateSimilarQuestions,
    generateSummary,
    generateQuestionsForCreativeWork
};
