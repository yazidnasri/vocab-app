/**
 * /api/quiz-question
 * Generates a bank of 10 varied quiz questions for a vocabulary word.
 * One AI call (~900 tokens) cached forever in user_words.quiz_questions.
 *
 * POST { word, definition, examples?, synonyms?, antonyms?,
 *         collocations?, usageNote?, cefrLevel? }
 * Returns { questions: Array<{ type, question, options[4], answer, explanation }> }
 */

import { callAIJson } from "./_ai.js";

const SYSTEM_PROMPT = `You are a vocabulary quiz designer for English learners.
Given a word and its details, generate exactly 10 multiple-choice questions that each test a DIFFERENT aspect of the word.

Use exactly these 10 types (one each, any order):
1. FILL_BLANK   – Replace the word in a real example sentence with a blank
2. DEFINITION   – "What does this word mean?" (3 wrong definitions from unrelated concepts)
3. SYNONYM      – "Which word is closest in meaning?"
4. ANTONYM      – "Which word is most opposite in meaning?"
5. USAGE        – "In which situation would you most naturally use this word?"
6. REGISTER     – "This word is most appropriate in which context?" (formal / academic / informal / etc.)
7. COLLOCATION  – "Which phrase sounds most natural with this word?"
8. CONNOTATION  – "What does this word imply that '[simpler synonym]' does not?"
9. CONTEXT      – "Which sentence uses this word correctly?" (4 full sentences as options)
10. WORD_FORM   – "Which is the grammatically correct form to use in this sentence?"

Rules:
- Exactly 4 options per question
- Exactly one correct answer
- 3 plausible distractors — never obviously wrong
- Explanation: one sentence explaining why the answer is correct
- Questions progress from easier (1–4) to harder (5–10)
- The answer string must exactly match one of the options strings

Return ONLY a valid JSON array of exactly 10 objects — no markdown, no extra text:
[{
  "type": "FILL_BLANK",
  "question": "Complete the sentence: She spoke with such ___________ that the judges were silenced.",
  "options": ["eloquence", "hesitation", "confusion", "arrogance"],
  "answer": "eloquence",
  "explanation": "Eloquence describes fluent, persuasive speech — exactly what moves judges."
}]`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { word, definition, examples, synonyms, antonyms, collocations, usageNote, cefrLevel } = body || {};
  if (!word || !definition) return res.status(400).json({ error: "word and definition are required" });

  const userPrompt = [
    `Word: "${word}"`,
    `Definition: "${definition}"`,
    cefrLevel    ? `Level: ${cefrLevel}` : "",
    synonyms?.length    ? `Synonyms: ${synonyms.slice(0, 5).join(", ")}` : "",
    antonyms?.length    ? `Antonyms: ${antonyms.slice(0, 3).join(", ")}` : "",
    collocations?.length ? `Collocations: ${collocations.slice(0, 4).join(", ")}` : "",
    examples?.length    ? `Examples:\n${examples.slice(0, 3).map(e => `- ${e}`).join("\n")}` : "",
    usageNote    ? `Usage note: ${usageNote}` : "",
  ].filter(Boolean).join("\n");

  const questions = await callAIJson(SYSTEM_PROMPT, userPrompt, {
    maxTokens:   1500,
    temperature: 0.5,
  });

  // Validate: must be array with question objects
  if (!Array.isArray(questions) || questions.length < 5) {
    return res.status(503).json({ error: "Could not generate questions" });
  }

  // Sanitise each question
  const clean = questions
    .filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2 && q.answer)
    .map(q => {
      const opts = q.options.slice(0, 4);
      // Ensure answer is in options
      if (!opts.includes(q.answer)) opts[0] = q.answer;
      return {
        type:        q.type        || "QUESTION",
        question:    q.question,
        options:     opts,
        answer:      q.answer,
        explanation: q.explanation || "",
      };
    });

  if (!clean.length) return res.status(503).json({ error: "Invalid questions from AI" });

  return res.json({ questions: clean });
}
