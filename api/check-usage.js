/**
 * /api/check-usage
 * Checks if a learner used a vocabulary word correctly in their own sentence.
 * ~100 tokens per call — high educational value, very low cost.
 *
 * POST { word, sentence, definition? }
 * Returns { correct: bool, score: 1-5, feedback: string, corrected?: string }
 */

import { callAIJson } from "./_ai.js";

const SYSTEM_PROMPT = `You are an encouraging English language coach reviewing a learner's sentence.
The learner wrote a sentence to practice using a vocabulary word.

Evaluate three things:
1. Is the word used with the correct meaning in context?
2. Does the grammar and syntax around the word work naturally?
3. Does the sentence sound like something a fluent speaker would say?

Return ONLY valid JSON with these exact keys:
{
  "correct":   true | false,
  "score":     1-5,
  "feedback":  "1-2 sentences of specific, encouraging feedback. If wrong, briefly explain why.",
  "corrected": "An improved version of the sentence (include ONLY if score is 3 or below)"
}

Scoring guide:
  5 = Perfect — natural, correct, idiomatic
  4 = Good — correct meaning, minor phrasing issue
  3 = Mostly right — meaning understood but grammar/context needs work
  2 = Meaning partially off — wrong connotation or register
  1 = Incorrect — wrong meaning or completely unnatural`;

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
  const { word, sentence, definition } = body || {};
  if (!word || !sentence) return res.status(400).json({ error: "word and sentence are required" });

  let userPrompt = `Word: "${word}"\nLearner's sentence: "${sentence}"`;
  if (definition) userPrompt += `\nWord definition: "${definition}"`;

  const result = await callAIJson(SYSTEM_PROMPT, userPrompt, {
    maxTokens:   200,
    temperature: 0.15,
  });

  if (!result) return res.status(503).json({ error: "Could not check usage" });

  // Sanitise score to 1-5 integer
  result.score   = Math.min(5, Math.max(1, Math.round(Number(result.score) || 3)));
  result.correct = result.score >= 4;

  return res.json(result);
}
