/**
 * Shared Gemini helper — used by enrich.js, extract-word.js, extract-words.js
 * Model: gemini-1.5-flash (Google AI Studio)
 * Env var: GEMINI_API_KEY
 */

const MODEL      = "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent`;

/**
 * Call the Gemini API.
 * Returns the raw text content, or null on any failure.
 */
export async function callAI(systemPrompt, userPrompt, {
  maxTokens   = 1024,
  temperature = 0.20,
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Merge system + user into a single user turn — most compatible format
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${userPrompt}`
    : userPrompt;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: fullPrompt }] },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Gemini API error:", res.status, JSON.stringify(err));
      return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (e) {
    console.error("Gemini fetch error:", e.message);
    return null;
  }
}

/**
 * Call the AI and parse the response as JSON.
 * Handles markdown fences and stray surrounding text automatically.
 * Returns the parsed value, or null if parsing fails.
 */
export async function callAIJson(systemPrompt, userPrompt, options = {}) {
  const raw = await callAI(systemPrompt, userPrompt, options);
  if (!raw) return null;
  return extractJson(raw);
}

/**
 * Best-effort JSON extractor — strips markdown fences, finds the first
 * JSON object or array in the text even when the model adds commentary.
 */
export function extractJson(text) {
  try {
    let clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    if (!/^[\[{]/.test(clean)) {
      const m = clean.match(/([\[{][\s\S]*[\]}])/);
      if (m) clean = m[1];
    }
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
