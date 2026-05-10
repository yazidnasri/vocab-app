/**
 * Shared Gemini helper — used by enrich.js, extract-word.js, extract-words.js
 * Model: gemini-2.0-flash (via Google AI Studio)
 * Env var: GEMINI_API_KEY
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          { role: "user", parts: [{ text: userPrompt }] },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch {
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
