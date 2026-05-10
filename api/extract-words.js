/**
 * /api/extract-words
 * Given a text passage, extracts 3-6 vocabulary words worth learning.
 * Intelligently skips words the learner likely already knows.
 */

import { callAI, extractJson } from "./_ai.js";

const SYSTEM_PROMPT = `You are a vocabulary coach building a personalized word list for an English learner.
Analyze the text and select 3 to 6 words that offer the most learning value.

Selection criteria:
- Target B1–C2 level words (skip A1/A2 basics like "house", "walk", "happy")
- Prioritize words that are: precise, versatile, appear in professional/academic writing
- Include a mix of difficulty: 1-2 accessible (B1/B2) + 1-2 advanced (C1/C2)
- Prefer verbs and adjectives that express nuance — not just nouns
- Skip proper nouns, brand names, numbers, and abbreviations
- Return each word in its BASE FORM (infinitive for verbs, singular noun, positive adjective)

Return ONLY a JSON array of strings. Example: ["meticulous", "ambiguous", "resilient", "scrutinize"]
No other text, no markdown fences, no explanation.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set in Vercel env vars" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { text } = body || {};
  if (!text) return res.status(400).json({ error: "text is required" });

  const raw = await callAI(
    SYSTEM_PROMPT,
    `Text: "${text.substring(0, 3000)}"`,
    { maxTokens: 120, temperature: 0.15 }
  );

  if (!raw) return res.status(503).json({ error: "Could not extract vocabulary words" });

  const words = extractJson(raw);
  if (!Array.isArray(words) || !words.length) {
    return res.status(502).json({ error: "Invalid response from AI" });
  }

  // Sanitise each word: base form, no punctuation
  const clean = words
    .map(w => String(w).trim().replace(/[^a-zA-Z'-]/g, ""))
    .filter(Boolean)
    .slice(0, 6);

  return res.json({ words: clean });
}
