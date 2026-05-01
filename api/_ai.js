/**
 * Shared NVIDIA NIM helper — used by enrich.js, extract-word.js, extract-words.js
 * Model: google/gemma-3-27b-it  (free tier via NVIDIA NIM)
 * Env var: NVIDIA_API_KEY
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL      = "google/gemma-3-27b-it";

/**
 * Call the NVIDIA NIM API.
 * Returns the raw text content, or null on any failure.
 */
export async function callAI(systemPrompt, userPrompt, {
  maxTokens   = 1024,
  temperature = 0.20,
  topP        = 0.70,
} = {}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        max_tokens:  maxTokens,
        temperature,
        top_p: topP,
        stream: false,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
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
    // Strip ```json ... ``` or ``` ... ``` fences
    let clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    // If still not parseable, find the first JSON object or array
    if (!/^[\[{]/.test(clean)) {
      const m = clean.match(/([\[{][\s\S]*[\]}])/);
      if (m) clean = m[1];
    }
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
