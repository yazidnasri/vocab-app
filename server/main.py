import os
import json
import asyncio
import httpx
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("GEMINI_API_KEY", "")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
FREE_DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/{word}"

# ─── Gemini setup (optional — used only when free API has gaps) ────────────────
gemini_model = None
if API_KEY:
    import google.generativeai as genai
    genai.configure(api_key=API_KEY)
    gemini_model = genai.GenerativeModel("gemini-2.0-flash")

# ─── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Wordsmith API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ─── Prompts ───────────────────────────────────────────────────────────────────
FULL_SYSTEM_PROMPT = """You are a vocabulary enrichment engine. Given a word (and optionally a sentence it appeared in), return a JSON object with exactly these fields:

{
  "word": "base form, capitalized",
  "phonetic": "simple phonetic spelling like EL-oh-kwent",
  "ipa": "IPA transcription like ˈɛl.ə.kwənt",
  "partOfSpeech": "e.g. adjective, verb / noun",
  "definition": "Clear, plain-English explanation (2-3 sentences, not dictionary robotic)",
  "forms": ["list of word forms with part of speech, e.g. eloquently (adv)"],
  "examples": ["3 real-world example sentences in business, conversation, or content contexts"],
  "synonyms": ["3-5 synonyms"],
  "antonyms": ["3-4 antonyms"],
  "register": "Formal / Casual / Academic / Business / Neutral etc",
  "memoryHook": "A short mnemonic or visual association to help remember the word"
}

Return ONLY valid JSON, no markdown fences, no extra text."""

GAPS_SYSTEM_PROMPT = """Given a word and its part of speech, return ONLY the missing enrichment fields as JSON:
{
  "phonetic": "simple phonetic spelling like EL-oh-kwent (capitalize the stressed syllable, no slashes)",
  "ipa": "clean IPA transcription like ˈɛl.ə.kwənt (no slashes)",
  "forms": ["word forms with part of speech, e.g. 'eloquently (adv)', 'eloquence (noun)'"],
  "register": "Formal / Casual / Academic / Business / Neutral",
  "memoryHook": "A short memorable mnemonic or visual association"
}
Return ONLY valid JSON, no markdown fences, no extra text."""


# ─── Helpers ───────────────────────────────────────────────────────────────────
def parse_json_safe(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _call_gemini(prompt: str, system: str) -> dict:
    """Synchronous Gemini call — run via asyncio.to_thread from async routes."""
    if not gemini_model:
        raise HTTPException(500, "GEMINI_API_KEY not set. Set it and restart the server.")
    import google.generativeai as genai
    response = gemini_model.generate_content(
        system + "\n\n" + prompt,
        generation_config=genai.types.GenerationConfig(
            response_mime_type="application/json"
        ),
    )
    return parse_json_safe(response.text)


async def call_gemini(prompt: str, system: str = FULL_SYSTEM_PROMPT) -> dict:
    return await asyncio.to_thread(_call_gemini, prompt, system)


async def fetch_free_dict(word: str) -> dict | None:
    """Fetch word data from the Free Dictionary API (no API key needed)."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(FREE_DICT_URL.format(word=word.lower()))
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data or not isinstance(data, list):
            return None

        entry = data[0]

        # Extract IPA and audio from phonetics array
        ipa = ""
        audio_url = ""
        for ph in entry.get("phonetics", []):
            if ph.get("text") and not ipa:
                # Strip slashes e.g. "/həˈloʊ/" → "həˈloʊ"
                ipa = ph["text"].strip("/")
            if ph.get("audio") and not audio_url:
                audio_url = ph["audio"]

        # Top-level phonetic as fallback IPA
        if not ipa and entry.get("phonetic"):
            ipa = entry["phonetic"].strip("/")

        # Extract etymology
        etymology = entry.get("origin", "") or ""

        # Extract meanings — collect from ALL meanings for richer data
        examples: list[str] = []
        synonyms: list[str] = []
        antonyms: list[str] = []
        all_definitions: list[str] = []
        part_of_speech = ""

        for meaning in entry.get("meanings", []):
            if not part_of_speech:
                part_of_speech = meaning.get("partOfSpeech", "")
            # Synonyms/antonyms at meaning level (more common than definition level)
            synonyms.extend(meaning.get("synonyms", []))
            antonyms.extend(meaning.get("antonyms", []))
            for defn in meaning.get("definitions", []):
                if defn.get("definition"):
                    all_definitions.append(defn["definition"])
                if defn.get("example") and len(examples) < 3:
                    examples.append(defn["example"])
                # Also collect synonyms/antonyms at definition level
                synonyms.extend(defn.get("synonyms", []))
                antonyms.extend(defn.get("antonyms", []))

        # Use best definition (first one)
        definition = all_definitions[0] if all_definitions else ""

        return {
            "word": entry.get("word", word).capitalize(),
            "ipa": ipa,
            "partOfSpeech": part_of_speech,
            "definition": definition,
            "examples": examples[:3],
            "synonyms": list(dict.fromkeys(synonyms))[:5],
            "antonyms": list(dict.fromkeys(antonyms))[:4],
            "audioUrl": audio_url,
            "etymology": etymology or None,
        }
    except Exception:
        return None


async def enrich_gaps(word: str, partial: dict) -> dict:
    """Fill missing fields (phonetic, ipa, forms, register, memoryHook) via Gemini."""
    if not gemini_model:
        # No Gemini key — return partial with sensible defaults
        partial.setdefault("phonetic", partial.get("ipa", word.upper()))
        partial.setdefault("forms", [])
        partial.setdefault("register", "Neutral")
        partial.setdefault("memoryHook", "")
        return partial
    try:
        prompt = (
            f'Word: "{word}"\n'
            f'Part of speech: "{partial.get("partOfSpeech", "")}"\n'
            f'Existing IPA: "{partial.get("ipa", "")}"'
        )
        gaps = await call_gemini(prompt, GAPS_SYSTEM_PROMPT)
        # Merge: only fill fields that are missing or empty in partial
        for key, value in gaps.items():
            if value and not partial.get(key):
                partial[key] = value
    except Exception:
        pass  # Non-critical — return what we have
    partial.setdefault("phonetic", partial.get("ipa", word.upper()))
    partial.setdefault("forms", [])
    partial.setdefault("register", "Neutral")
    partial.setdefault("memoryHook", "")
    return partial


# ─── Request models ────────────────────────────────────────────────────────────
class WordRequest(BaseModel):
    word: str
    sentence: Optional[str] = None


class BatchRequest(BaseModel):
    words: List[str]


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.post("/api/enrich")
async def enrich_word(req: WordRequest):
    """
    1. Try Free Dictionary API (free, no key)
    2. Fill gaps (phonetic, forms, register, memoryHook) via Gemini
    3. If free API fails, fall back to full Gemini enrichment
    """
    free_data = await fetch_free_dict(req.word)

    if free_data:
        result = await enrich_gaps(req.word, free_data)
        result.setdefault("etymology", None)
        return result

    # Full Gemini fallback
    prompt = f'Word: "{req.word}"'
    if req.sentence:
        prompt += f'\nOriginal sentence: "{req.sentence}"'
        prompt += "\nUse this sentence as the first example, and identify the word from context."
    return await call_gemini(prompt)


@app.post("/api/enrich-batch")
async def enrich_batch(req: BatchRequest):
    prompt = "Enrich each of these words. Return a JSON array of objects, one per word:\n"
    for w in req.words[:10]:
        prompt += f"- {w}\n"
    system = FULL_SYSTEM_PROMPT.replace("a JSON object", "a JSON array of objects, one per word")
    return await call_gemini(prompt, system)


@app.post("/api/extract-word")
async def extract_word(req: WordRequest):
    """Extract the most interesting/advanced word from a sentence."""
    if not gemini_model:
        raise HTTPException(500, "GEMINI_API_KEY not set")
    try:
        import google.generativeai as genai

        def _extract():
            response = gemini_model.generate_content(
                "Given a sentence, identify the most interesting or advanced vocabulary word worth learning. "
                "Return ONLY the single word, nothing else.\n\n"
                + (req.sentence or req.word)
            )
            return response.text.strip().strip('"').strip("'")

        extracted = await asyncio.to_thread(_extract)
        return {"word": extracted}
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
