/**
 * clientAI.js — Client-Side AI Service
 * Port of server-side aiService.js to browser.
 * Calls Gemini API directly from the browser using fetch().
 */
const clientAI = (() => {

    const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const MODEL = 'gemini-2.0-flash';

    const VALID_CATEGORIES = [
        "Business", "Finance / Investing", "Science", "Technology",
        "Health / Medicine", "Engineering", "Design",
        "Philosophy / Thinking", "Career / Education", "Politics / Society"
    ];

    // ── Helpers ───────────────────────────────────────────────
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function sanitizeInput(str) {
        if (!str) return '';
        return str.replace(/[^\w\s가-힣一-龯ぁ-んァ-ン\-''.,!?&:()]/g, '').trim();
    }

    function extractJSON(text) {
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1) {
            return text.substring(first, last + 1);
        }
        return text.replace(/```json/g, '').replace(/```/g, '')
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    }

    function repairTruncatedJSON(jsonStr) {
        const qIndex = jsonStr.indexOf('"questions"');
        if (qIndex === -1) throw new Error("No questions array found");
        const arrayStart = jsonStr.indexOf('[', qIndex);
        if (arrayStart === -1) throw new Error("No array start found");
        const lastObjectClose = jsonStr.lastIndexOf('}');
        if (lastObjectClose <= arrayStart) throw new Error("No completed objects");
        const lastCommaClose = jsonStr.lastIndexOf('},');
        let cutPoint = lastCommaClose > arrayStart ? lastCommaClose + 1 : lastObjectClose + 1;
        return jsonStr.substring(0, cutPoint) + ']}';
    }

    // ── Core Gemini API Call ──────────────────────────────────
    async function callGemini(apiKey, prompt, maxRetries = 5, config = {}) {
        const url = `${GEMINI_API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;

        const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: config.maxTokens || 8192,
                ...(config.temperature !== undefined && { temperature: config.temperature }),
                ...(config.topP !== undefined && { topP: config.topP }),
                ...(config.topK !== undefined && { topK: config.topK })
            }
        };

        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (response.status === 429) {
                    const delay = (attempt + 1) * 4000 + Math.random() * 1000;
                    console.warn(`[ClientAI] Rate limit (429). Retrying in ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    attempt++;
                    continue;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    return data.candidates[0].content.parts[0].text;
                }
                throw new Error('No content in Gemini response');
            } catch (err) {
                if ((err.message.includes('429') || err.message.includes('quota')) && attempt < maxRetries - 1) {
                    const delay = (attempt + 1) * 4000 + Math.random() * 1000;
                    console.warn(`[ClientAI] Rate limit hit. Retrying in ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    attempt++;
                } else {
                    throw err;
                }
            }
        }
        throw new Error('Failed after max retries');
    }

    // ── Generate Questions ────────────────────────────────────
    async function generateQuestions(text, apiKey, count = 5, title = "", relatedContext = "", userProfile = null, distribution = "standard", avoidQuestions = []) {
        if (!apiKey || apiKey.length < 10) {
            throw new Error('No valid Gemini API key. Please set it in Settings.');
        }

        const cleanTitle = sanitizeInput(title);
        const cleanContext = sanitizeInput(relatedContext);
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
      6. **NO TITLE DUMPING:** Do NOT paste the entire video title into the question. Use a short, natural description of the event/topic.
      
      **MANDATORY: SELF-CONTAINED CONTEXT (CRITICAL)**
      - **Users may review this question WEEKS later.** They will NOT remember what "this video" or "the incident" refers to.
      - **NEVER** use vague phrases like: "this incident", "the speaker", "the video", "this situation", "the text", "it", "they".
      - **ALWAYS** explicitly state the subject.
      - **Keep it CONCISE:** Do not dump the whole title. **EXTRACT ONLY THE CORE SUBJECT.**
      
      **MANDATORY: FOCUS ON TRANSFERABLE CONCEPTS & INSIGHTS**
      - Every question MUST test a CONCEPT, PRINCIPLE, TECHNIQUE, or INSIGHT
      - Focus on WHY and HOW, not just WHAT or WHEN
      
      **FORBIDDEN TERMS (STRICT):**
      ❌ **NEVER** use generic subjects like: "the book", "the novel", "the movie", "the film", "the video", "the text", "this work", "the author".
      ✅ **ALWAYS** use the specific Title or Subject Name.

      ${avoidQuestions && avoidQuestions.length > 0 ? `
      **🚨 CRITICAL: AVOID DUPLICATE LEARNING 🚨**
      The user has ALREADY learned these concepts from previous questions. Teach SOMETHING NEW.
      
      **EXISTING QUESTIONS (DO NOT REPEAT THESE CONCEPTS):**
      ${avoidQuestions.map(q => `- ${q}`).join('\n')}
      
      **YOUR TASK:**
      1. Read the transcript thoroughly and identify DIFFERENT facts, concepts, or insights
      2. Focus on parts of the content NOT covered by the existing questions above
      ` : ''}

      Part 2: Identify the ONE single emoji that best represents the specific subject matter.
      Part 3: Generate an EXTREMELY CONCISE title (max 5 words).

      **Part 4: CATEGORY SELECTION (CRITICAL — DO NOT DEFAULT TO "Design")**
      You MUST select 1-2 categories from ONLY this list based on the actual content:
      - "Business" — startups, management, marketing, entrepreneurship, corporate strategy
      - "Finance / Investing" — money, investing, economics, markets, personal finance
      - "Science" — biology, physics, chemistry, psychology, research
      - "Technology" — software, AI, engineering tools, internet, gadgets
      - "Health / Medicine" — health, fitness, medicine, nutrition, mental health
      - "Engineering" — mechanical, electrical, civil, systems engineering
      - "Design" — visual design, UI/UX, graphic design, architecture, art
      - "Philosophy / Thinking" — philosophy, ethics, critical thinking, self-improvement, wisdom, literature
      - "Career / Education" — jobs, education, learning, professional development, skills
      - "Politics / Society" — politics, government, social issues, inequality, history, law

      **RULES:** Read the content carefully and pick the category that matches what the text is ABOUT.
      A book about inequality → "Politics / Society". A book about investing → "Finance / Investing".
      A psychology lecture → "Science". A self-help book → "Philosophy / Thinking".
      Do NOT pick "Design" unless the content is literally about visual/graphic design.

      **CRITICAL: IMAGE PROMPT INSTRUCTION (VISUAL-FIRST)**
      - For each question, generate a "imagePrompt".
      - **TRANSFORMATION RULE**: Do NOT just copy the question. Convert the concept into a CONCRETE VISUAL SCENE.
      - **METAPHOR GUIDE**: 
        - If abstract (e.g., "social influence", "inequality"): Visualize people interacting, symbolic objects (scales, locked gates), or expressive faces.
        - If technical: Visualize a specific high-tech component or a person using the technology.
      - **AESTHETIC**: Always append "Cinematic photography, high resolution, photorealistic, 8k, detailed".
      - **STRICT**: NO TEXT, NO LABELS, NO FLOATING NUMBERS in the image.
      - **LANGUAGE**: MUST BE IN ENGLISH.

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
            "imagePrompt": "A single concrete object or scene..."
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

        const textResponse = await callGemini(apiKey, prompt);
        console.log('[ClientAI] Raw response:', textResponse.substring(0, 300));

        let jsonString = extractJSON(textResponse);
        let parsed;

        try {
            if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) {
                throw new Error("Response does not contain a JSON object");
            }
            parsed = JSON.parse(jsonString);
        } catch (parseError) {
            console.warn('[ClientAI] JSON parse failed, attempting repair...');
            try {
                parsed = JSON.parse(repairTruncatedJSON(jsonString));
                console.log('[ClientAI] JSON repair successful');
            } catch (repairError) {
                // Retry once
                if (!title.includes("RETRY")) {
                    console.log('[ClientAI] Retrying generation due to JSON error...');
                    return generateQuestions(text, apiKey, count, title + " (RETRY)", relatedContext, userProfile, distribution, avoidQuestions);
                }
                throw new Error('AI returned invalid JSON. Please try again.');
            }
        }

        if (Array.isArray(parsed)) {
            return { questions: parsed, subjectEmoji: '📄', suggestedTitle: 'Study Guide', isMock: false };
        }

        // Sanitize categories (flexible matching for AI variations)
        let finalCategories = [];
        if (parsed.categories && Array.isArray(parsed.categories)) {
            finalCategories = parsed.categories.map(c => {
                // Exact match first
                if (VALID_CATEGORIES.includes(c)) return c;
                // Fuzzy match: normalize and compare
                const normalized = c.trim().toLowerCase();
                return VALID_CATEGORIES.find(v => v.toLowerCase() === normalized
                    || v.toLowerCase().replace(/\s*\/\s*/g, '/') === normalized.replace(/\s*\/\s*/g, '/')
                ) || null;
            }).filter(Boolean);
        }
        if (finalCategories.length === 0) finalCategories = ["Philosophy / Thinking"];

        return {
            questions: parsed.questions,
            categories: finalCategories,
            subjectEmoji: parsed.subjectEmoji || '📄',
            suggestedTitle: parsed.suggestedTitle || '',
            isMock: false
        };
    }

    // ── Generate Summary ──────────────────────────────────────
    async function generateSummary(text, apiKey, title = "") {
        if (!apiKey || apiKey.length < 10) return "Summary not available (No API Key).";

        const prompt = `
      Summarize the following educational content into MAXIMUM 2 concise paragraphs (approx 150 words total).
      
      **CRITICAL INSTRUCTION: Language Matching**
      1. Detect the language of the Title: "${title}"
      2. The detailed summary MUST be written in the SAME language as the Title.
      
      Capture the main ideas, key arguments, and conclusions.
      Use bullet points for key takeaways if appropriate.
      
      Text:
      ${text.substring(0, 15000)}
    `;

        try {
            return await callGemini(apiKey, prompt);
        } catch (error) {
            console.error('[ClientAI] Summary error:', error);
            return "Failed to generate summary.";
        }
    }

    // ── Generate Creative Work Questions ──────────────────────
    async function generateCreativeQuestions(title, author, type, apiKey, count = 10) {
        if (!apiKey || apiKey.length < 10) throw new Error('No valid Gemini API key.');

        const cleanTitle = sanitizeInput(title);
        const cleanAuthor = author ? sanitizeInput(author) : '';
        if (!cleanTitle || cleanTitle.length < 2) {
            throw new Error('Title is too short or contains invalid characters.');
        }

        const prompt = `
      You are an expert on pop culture, literature, and cinema.
      The user wants to study the creative work: "${cleanTitle}" ${cleanAuthor ? `by ${cleanAuthor}` : ''} (${type}).
      
      **TASK:**
      1. Recall details, themes, characters, and plot points of this work.
      2. Write a detailed "summary" field (150-250 words) covering: the main plot/premise, key characters, core themes and arguments, and why this work is significant. MUST be in the SAME language as the title.
      3. Generate ${count} high-quality study/trivia questions.
      
      **FACTUAL ACCURACY (HIGHEST PRIORITY):**
      - The "correctAnswer" index MUST point to the option that is ACTUALLY correct based on the real work.
      - DOUBLE-CHECK every question: re-read the question, look at all 4 options, and verify the correctAnswer index (0-3) matches the truly correct option.
      - Wrong answers are UNACCEPTABLE. If unsure about a fact, do NOT make a question about it.
      - Wrong options must be WRONG but still PLAUSIBLE — they should sound like something a person who half-remembers the material might pick.
      - All 4 options must be similar in length and specificity. Do NOT make the correct answer obviously more detailed than the others.
      - The "explanation" must explain WHY the correct answer is right.

      **TONE & STYLE GUIDE (CRITICAL):**
      - **FRIENDLY & CONVERSATIONAL:** Do NOT sound like a standardized test.
      - **CONCISE & DIRECT:** Get straight to the point.

      **STRICT NEGATIVE CONSTRAINTS (DO NOT IGNORE):**
      1. **NO GENERIC SUBJECTS:** Do NOT use "the book", "the movie", "the novel", "the film".
      2. **ALWAYS NAMEDROP:** You MUST use the actual Title in the question text.
      3. **CORE SUBJECT ONLY:** Use a short, recognizable tag.

      **CRITICAL: IMAGE PROMPT INSTRUCTION (VISUAL-FIRST)**
      - **RULE**: Convert the work's theme/scene into a CONCRETE VISUAL description.
      - **AESTHETIC**: Cinematic lighting, wide angle, high resolution, 8k, photorealistic.
      - **STRICT**: NO TEXT, NO LOGOS, NO CREDITS.
      - **LANGUAGE**: MUST BE IN ENGLISH.

      **STRICT QUESTION DISTRIBUTION (Target: ${count} Questions):**
      
      1. **Questions 1 to 4:** **Type 2 (Conceptual Understanding)**. Label: End with " - T2".
      2. **Questions 5 to 6:** **Type 1 (Scenario/Application)**. Label: End with " - T1".
      3. **Questions 7 to 8:** **Type 3 (Synthesis)**. Label: End with " - T3".
      4. **Questions 9 to 10:** **Type 4 (Short Answer Reflection)**.
         - JSON type: "SAQ". Provide "idealAnswer" instead of "correctAnswer".

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

      **STRICT RULES — DO NOT IGNORE:**
      - "Design" means VISUAL/GRAPHIC DESIGN. A novel is NOT design. A movie is NOT design. Music is NOT design.
      - "1984" by Orwell → "Politics / Society" (dystopia, surveillance, totalitarianism)
      - "A Discourse on Inequality" by Rousseau → "Politics / Society" (inequality, social contract)
      - A sci-fi movie → "Science" or "Philosophy / Thinking" (NOT "Design")
      - A drama about human relationships → "Philosophy / Thinking" (NOT "Design")
      - A book about self-improvement → "Philosophy / Thinking"
      - A thriller/action movie → "Philosophy / Thinking" (themes) or "Politics / Society" (if political)
      - ONLY pick "Design" if the work is literally ABOUT visual art, graphic design, or UI/UX

      **MANDATORY "summary" FIELD (DO NOT SKIP):**
      You MUST write a detailed "summary" field (250-400 words) about THIS specific work.
      Structure it as **3 sections** with headers using [H]emoji Title[/H] format:
      **Section 1:** [H]📖 Story & Characters[/H] then plot, setting, main characters, narrative arc.
      **Section 2:** [H]💡 Themes & Ideas[/H] then core themes and how the work explores them.
      **Section 3:** [H]🌟 Significance & Legacy[/H] then why this work matters, its influence.
      - MUST be in the SAME language as the title (including section headers).
      - Use **bold** markdown for character names and key terms.
      - DO NOT write generic text like "A study set about..."
      - IMPORTANT: Use [PARA] between sections (NOT literal newlines, which break JSON).
      - Each section MUST begin with [H]emoji Title[/H] header tag.

      **OUTPUT FORMAT:** Strictly valid JSON.
      {
        "subjectEmoji": "🎬",
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
             "imagePrompt": "Visual description in ENGLISH..."
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

        const textResponse = await callGemini(apiKey, prompt);
        let jsonString = extractJSON(textResponse);
        let parsed;

        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            try {
                parsed = JSON.parse(repairTruncatedJSON(jsonString));
            } catch (repairError) {
                throw new Error('AI returned invalid JSON format.');
            }
        }

        if (Array.isArray(parsed)) {
            return {
                questions: parsed, categories: ["Creative"],
                subjectEmoji: '🎨', suggestedTitle: title,
                summary: `A study set about: ${title}.`, isMock: false
            };
        }

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
    }

    // ── Generate Similar Questions (Endless Review Spawning) ─
    async function generateSimilarQuestions(seedQuestion, context, type, apiKey, existingQuestions = [], sourceTitle = "this material") {
        if (!apiKey || apiKey.length < 10) return [];

        const hasContext = context && context.length > 50;
        const safeContext = hasContext ? context : "";
        const typeLabel = type === 'SAQ' ? 'Type 4 (Short Answer)' : `Type ${type} (Multiple Choice)`;

        const exclusionList = existingQuestions.slice(0, 30).map(q => `- ${q}`).join('\n');

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
    
    **ALREADY COVERED TOPICS (DO NOT REPEAT):**
    ${exclusionList}

    **ROLE & TONE:**
    - You are an **EXPERT COACH** and curious study buddy.
    - **TONE:** Friendly, conversational, and insightful.
    - **GOAL:** Extract a **LIFE LESSON** or **KEY INSIGHT** useful in the real world.

    **CRITICAL: SELF-CONTAINED CONTEXT (ZERO AMBIGUITY)**
    - ❌ **NEVER** use vague phrases like: "In the book...", "According to the video..."
    - ✅ **ALWAYS USE THE SHORT TITLE:** "In *${sourceTitle}*, how does..."
    - **MANDATORY:** Include the Title ("${sourceTitle}") in the Question Text.

    **MANDATORY REQUIREMENTS:**
    1. **SPECIFICITY + UNIVERSALITY**
    2. **NATURAL RECALL (NO META-TALK)**
    3. **AVOID "SCHOOL" QUESTIONS:** Focus on Psychology, Strategy, Decision Making.
    4. **CONCISE & DIRECT:**
       - **Question:** MAX 25 words.
       - **Options:** MAX 10-12 words.

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
            "options": ["Insightful Option A", "B", "C", "D"],
            "correctAnswer": 0,
            "answer": "Answer...",
            "explanation": "Explanation...",
            "imagePrompt": "Convert the question's core subject into a vivid, cinematic visual scene. English, no text. Max 20 words."
        }
    ]
    `;

        try {
            const textResponse = await callGemini(apiKey, prompt, 5, {
                temperature: 0.7, topP: 0.9, topK: 40
            });
            const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (e) {
            console.error('[ClientAI] Spawn generation error:', e);
            return [];
        }
    }

    // ── Translate Text ────────────────────────────────────────
    async function translateText(text, targetLang, apiKey) {
        if (!apiKey || !text || !targetLang) return text;

        const langMap = {
            'en': 'English', 'zh': 'Chinese', 'ko': 'Korean', 'ja': 'Japanese',
            'fr': 'French', 'de': 'German', 'es': 'Spanish', 'pt': 'Portuguese',
            'vi': 'Vietnamese', 'hi': 'Hindi', 'ar': 'Arabic'
        };

        const targetLanguage = langMap[targetLang] || targetLang;
        const prompt = `Translate the following text to ${targetLanguage}. Only return the translation, nothing else.\n\nText: ${text}`;

        try {
            return (await callGemini(apiKey, prompt)).trim();
        } catch (error) {
            console.error('[ClientAI] Translation error:', error);
            throw error;
        }
    }

    // ── Generate Image Prompt ─────────────────────────────────
    async function generateImagePrompt(questionText, apiKey) {
        if (!apiKey || apiKey.length < 10) {
            return extractVisualConcepts(questionText);
        }

        try {
            const prompt = `Convert this question into a SHORT, VIVID visual scene description for image generation.
INSTRUCTIONS:
1. Translate abstract concepts into concrete objects/scenarios (e.g., 'friendship' -> 'two people walking', 'law' -> 'a wooden gavel on a desk').
2. Add cinematic keywords: "Cinematic photography, photorealistic, 8k, high detail".
3. NO TEXT in the output.
4. Output ONLY the visual description in English.

Question: ${questionText}`;

            const result = await callGemini(apiKey, prompt, 3, { temperature: 0.5 });
            return result.trim().replace(/^["']|["']$/g, '').substring(0, 300);
        } catch (error) {
            return extractVisualConcepts(questionText);
        }
    }

    function extractVisualConcepts(questionText) {
        let visual = questionText
            .replace(/\?|-\s*T\d+/g, '')
            .replace(/What|How|Why|When|Where|Which|Is|Does|Do|Can|Will|Should|Could|Would/gi, '')
            .trim();
        return visual.substring(0, 100).trim() || "abstract concept illustration";
    }

    // ── Public API ────────────────────────────────────────────
    return {
        generateQuestions,
        generateSummary,
        generateCreativeQuestions,
        generateSimilarQuestions,
        translateText,
        generateImagePrompt,
        extractVisualConcepts,
        callGemini
    };
})();
