/**
 * /api/extract-word
 * Given a sentence, identifies the single best vocabulary word for a learner to study.
 * Picks the word that is most educationally valuable — advanced but genuinely useful.
 */

import { callAI } from "./_ai.js";

const SYSTEM_PROMPT = `You are a vocabulary coach helping someone improve their English.
Given a sentence, identify the SINGLE most valuable word for an intermediate-to-advanced learner to study.

Rules:
- Prefer words that are B2-C2 level (challenging but useful)
- Avoid extremely rare/archaic words that rarely appear in real life
- Avoid proper nouns, abbreviations, and numbers
- If multiple strong candidates exist, pick the one with the richest learning potential
- Return ONLY the base form of the word (infinitive for verbs, singular for nouns)
- Return NOTHING ELSE — no punctuation, no explanation, just the single word`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: "NVIDIA_API_KEY not set in Vercel env vars" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { word, sentence } = body || {};
  const text = sentence || word;
  if (!text) return res.status(400).json({ error: "sentence or word is required" });

  const extracted = await callAI(
    SYSTEM_PROMPT,
    `Sentence: "${text}"`,
    { maxTokens: 20, temperature: 0.1 }
  );

  if (!extracted) return res.status(503).json({ error: "Could not extract word" });

  // Sanitise: take only the first token, remove any punctuation
  const clean = extracted.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "").trim();
  if (!clean) return res.status(503).json({ error: "Could not extract word" });

  return res.json({ word: clean });
}
