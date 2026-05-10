/**
 * /api/enrich  — Word enrichment endpoint
 *
 * Pipeline (in order, short-circuits as soon as we have enough):
 *   0. Supabase cache       → free, instant — any word enriched before costs 0 tokens
 *   1. Free Dictionary API  → definition, IPA, audio, examples, synonyms (free)
 *   2. Datamuse API         → richer synonyms, antonyms, collocations (free)
 *   3. NVIDIA NIM / Gemma   → fills every missing field + adds learning metadata
 *   4. Write-through cache  → saves result to shared library for future users
 *
 * Env vars: NVIDIA_API_KEY, SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { callAIJson } from "./_ai.js";

const FREE_DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DATAMUSE_URL  = "https://api.datamuse.com/words";

// ─── Supabase cache helpers ───────────────────────────────────────────────────

function getSupabase() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    key: process.env.SUPABASE_SERVICE_KEY || "",
  };
}

/** Read a fully-enriched word from the shared library. Returns null on miss. */
async function readCache(word) {
  const { url, key } = getSupabase();
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/words?word=ilike.${encodeURIComponent(word)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const [row] = await res.json() ?? [];
    // Only use cache if it has full enrichment data — skip partially-seeded rows
    if (!row?.definition || !row?.cefr_level) return null;
    return mapRowToResult(row);
  } catch { return null; }
}

/** Write an enriched result back to the shared library (fire-and-forget, non-critical). */
async function writeCache(result) {
  const { url, key } = getSupabase();
  if (!url || !key || !result?.word) return;
  try {
    await fetch(`${url}/rest/v1/words`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify([{
        word:              result.word,
        phonetic:          result.phonetic          || null,
        ipa:               result.ipa               || null,
        part_of_speech:    result.partOfSpeech      || null,
        definition:        result.definition        || null,
        simple_definition: result.simpleDefinition  || null,
        grammar_note:      result.grammarNote       || null,
        word_family:       result.wordFamily        || [],
        forms:             result.forms             || [],
        examples:          result.examples          || [],
        synonyms:          result.synonyms          || [],
        antonyms:          result.antonyms          || [],
        register:          result.register          || null,
        memory_hook:       result.memoryHook        || null,
        audio_url:         result.audioUrl          || null,
        etymology:         result.etymology         || null,
        collocations:      result.collocations      || [],
        usage_note:        result.usageNote         || null,
        common_mistake:    result.commonMistake     || null,
        cefr_level:        result.cefrLevel         || null,
      }]),
    });
  } catch { /* non-critical */ }
}

/** DB row (snake_case) → consistent camelCase result for the frontend */
function mapRowToResult(row) {
  return normalizeResult({
    word:             row.word,
    phonetic:         row.phonetic,
    ipa:              row.ipa,
    partOfSpeech:     row.part_of_speech,
    definition:       row.definition,
    simpleDefinition: row.simple_definition,
    grammarNote:      row.grammar_note,
    wordFamily:       row.word_family,
    forms:            row.forms,
    examples:         row.examples,
    synonyms:         row.synonyms,
    antonyms:         row.antonyms,
    register:         row.register,
    memoryHook:       row.memory_hook,
    audioUrl:         row.audio_url,
    etymology:        row.etymology,
    collocations:     row.collocations,
    usageNote:        row.usage_note,
    commonMistake:    row.common_mistake,
    cefrLevel:        row.cefr_level,
  });
}

/**
 * Normalise any mix of camelCase / snake_case keys from AI or DB into one
 * consistent camelCase shape. This is the single source of truth for what
 * the enrich endpoint returns.
 */
function normalizeResult(obj) {
  return {
    word:             obj.word                                     || "",
    phonetic:         obj.phonetic          || obj.ipa             || "",
    ipa:              obj.ipa                                      || "",
    partOfSpeech:     obj.partOfSpeech      || obj.part_of_speech  || "",
    definition:       obj.definition                               || "",
    simpleDefinition: obj.simpleDefinition  || obj.simple_definition || "",
    grammarNote:      obj.grammarNote       || obj.grammar_note     || "",
    wordFamily:       obj.wordFamily        || obj.word_family      || [],
    forms:            obj.forms                                     || [],
    examples:        (obj.examples          || []).slice(0, 5),
    synonyms:        (obj.synonyms          || []).slice(0, 8),
    antonyms:        (obj.antonyms          || []).slice(0, 6),
    register:         obj.register                                  || "Neutral",
    memoryHook:       obj.memoryHook        || obj.memory_hook      || "",
    audioUrl:         obj.audioUrl          || obj.audio_url        || "",
    etymology:        obj.etymology                                 || null,
    collocations:     obj.collocations                              || [],
    usageNote:        obj.usageNote         || obj.usage_note       || "",
    commonMistake:    obj.commonMistake     || obj.common_mistake   || "",
    cefrLevel:        obj.cefrLevel         || obj.cefr_level       || "",
  };
}

// ─── System prompts ───────────────────────────────────────────────────────────

const GAPS_SYSTEM_PROMPT = `You are an expert vocabulary coach and linguist.
A learner is studying this word. We already have some data — your job is to fill ONLY the missing fields.

Return ONLY a valid JSON object — no markdown fences, no explanation.
Use these exact camelCase key names:
{
  "phonetic":         "Stress-marked spelling: EL-oh-kwent (ALL-CAPS = stressed syllable)",
  "ipa":              "IPA without slashes: ɛl.ə.kwənt",
  "simpleDefinition": "1-2 sentences in plain everyday English — explain it like to a friend, zero jargon",
  "grammarNote":      "Grammar rules: countable/uncountable, transitive/intransitive, irregular forms, typical articles, common patterns",
  "wordFamily":       [{"word": "related word", "pos": "noun|verb|adj|adv", "note": "brief relationship note"}],
  "forms":            ["all inflected/derived forms with POS: 'eloquently (adv)', 'eloquence (noun)'"],
  "examples":         ["up to 5 sentences — label each context in brackets: [Military], [Everyday], [Business], [Figurative], [Academic]"],
  "synonyms":         ["6-8 synonyms most→least common, include informal variants"],
  "antonyms":         ["4-6 antonyms"],
  "register":         "Formal | Academic | Business | Literary | Neutral | Informal | Slang",
  "memoryHook":       "Vivid concrete mnemonic under 25 words — a scene, rhyme, or story",
  "etymology":        "One sentence: origin language, root meaning, century entered English",
  "collocations":     ["6-8 authentic multi-word phrases: verb+noun, adj+noun, fixed expressions"],
  "usageNote":        "2-3 sentences: when to use vs near-synonyms, register warnings, typical contexts",
  "commonMistake":    "One sentence: most frequent learner error with this word",
  "cefrLevel":        "A1 | A2 | B1 | B2 | C1 | C2"
}`;

const FULL_SYSTEM_PROMPT = `You are a world-class vocabulary enrichment engine for a language-learning app.
Generate a complete, richly detailed entry for this word.

Return ONLY a valid JSON object — no markdown fences, no explanation.
Use these exact camelCase key names:
{
  "word":             "Base form, title-cased",
  "phonetic":         "Stress-marked: EL-oh-kwent (ALL-CAPS = stressed)",
  "ipa":              "IPA without slashes: ɛl.ə.kwənt",
  "partOfSpeech":     "adjective | verb | noun | adverb | etc.",
  "definition":       "Clear 2-3 sentence explanation. Engaging, not robotic.",
  "simpleDefinition": "1-2 sentences in plain everyday English — explain it like to a friend, zero jargon. Include the most common figurative use if one exists.",
  "grammarNote":      "Grammar rules specific to this word: countable/uncountable for nouns, transitive/intransitive for verbs, irregular conjugations, comparative/superlative for adjectives, typical article usage, common structural patterns.",
  "wordFamily":       [{"word": "related word", "pos": "noun|verb|adj|adv", "note": "brief note on relationship or difference"}],
  "forms":            ["All inflected/derived forms with POS label: 'ran (past)', 'running (present participle)', 'eloquence (noun)'"],
  "examples":         [
    "[Everyday] Conversational sentence",
    "[Professional] Business or workplace sentence",
    "[Academic] Formal or written sentence",
    "[Figurative] Idiomatic or metaphorical use",
    "[News/Media] Sentence from journalism or current events"
  ],
  "synonyms":         ["6-8 synonyms most→least common, include informal short forms"],
  "antonyms":         ["4-6 antonyms"],
  "register":         "Formal | Academic | Business | Literary | Neutral | Informal | Slang",
  "memoryHook":       "Vivid concrete mnemonic under 25 words",
  "etymology":        "One sentence: origin, root meaning, century entered English",
  "collocations":     ["6-8 authentic multi-word phrases"],
  "usageNote":        "2-3 sentences: when to use, register, near-synonym differences",
  "commonMistake":    "One sentence: most frequent learner error",
  "cefrLevel":        "A1 | A2 | B1 | B2 | C1 | C2"
}`;

// ─── Free Dictionary API ──────────────────────────────────────────────────────
async function fetchFreeDictionary(word) {
  try {
    const res = await fetch(`${FREE_DICT_URL}${encodeURIComponent(word.toLowerCase())}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const entry = data[0];
    let ipa = "", audioUrl = "";

    for (const ph of entry.phonetics || []) {
      if (ph.text && !ipa)  ipa = ph.text.replace(/^\/|\/$/g, "");
      if (ph.audio && ph.audio.length > 4 && !audioUrl) {
        audioUrl = ph.audio.startsWith("//") ? `https:${ph.audio}` : ph.audio;
      }
    }
    if (!ipa && entry.phonetic) ipa = entry.phonetic.replace(/^\/|\/$/g, "");

    const examples = [], synonyms = [], antonyms = [], allDefs = [];
    let partOfSpeech = "", etymology = entry.origin || null;

    for (const meaning of entry.meanings || []) {
      if (!partOfSpeech) partOfSpeech = meaning.partOfSpeech || "";
      synonyms.push(...(meaning.synonyms || []));
      antonyms.push(...(meaning.antonyms || []));
      for (const defn of meaning.definitions || []) {
        if (defn.definition) allDefs.push(defn.definition);
        if (defn.example && examples.length < 3) examples.push(defn.example);
        synonyms.push(...(defn.synonyms || []));
        antonyms.push(...(defn.antonyms || []));
      }
    }

    if (!allDefs.length) return null;
    return {
      word:        (entry.word || word).charAt(0).toUpperCase() + (entry.word || word).slice(1),
      ipa,
      partOfSpeech,
      definition:  allDefs[0],
      examples:    examples.slice(0, 3),
      synonyms:    [...new Set(synonyms)].slice(0, 5),
      antonyms:    [...new Set(antonyms)].slice(0, 4),
      audioUrl,
      etymology,
    };
  } catch { return null; }
}

// ─── Datamuse API ─────────────────────────────────────────────────────────────
async function fetchDatamuse(word) {
  try {
    const [synRes, colRes, antRes] = await Promise.all([
      fetch(`${DATAMUSE_URL}?rel_syn=${encodeURIComponent(word)}&max=10`),
      fetch(`${DATAMUSE_URL}?lc=${encodeURIComponent(word)}&max=8`),
      fetch(`${DATAMUSE_URL}?rel_ant=${encodeURIComponent(word)}&max=6`),
    ]);
    return {
      synonyms:    (synRes.ok ? await synRes.json() : []).map(w => w.word).filter(Boolean).slice(0, 6),
      followWords: (colRes.ok ? await colRes.json() : []).map(w => w.word).filter(Boolean).slice(0, 6),
      antonyms:    (antRes.ok ? await antRes.json() : []).map(w => w.word).filter(Boolean).slice(0, 4),
    };
  } catch { return { synonyms: [], followWords: [], antonyms: [] }; }
}

// ─── Fill gaps via AI ─────────────────────────────────────────────────────────
async function enrichWithAI(word, partial, followWords) {
  const have = JSON.stringify({
    ipa:          partial.ipa          || "",
    partOfSpeech: partial.partOfSpeech || "",
    definition:   partial.definition   || "",
    examples:    (partial.examples     || []).slice(0, 2),
    synonyms:    (partial.synonyms     || []).slice(0, 3),
    followWords:  followWords.slice(0, 4),
  });

  const gaps = await callAIJson(
    GAPS_SYSTEM_PROMPT,
    `Word: "${word}"\nAlready have: ${have}`,
    { maxTokens: 1500, temperature: 0.2 }
  );

  if (gaps) {
    for (const [key, val] of Object.entries(gaps)) {
      if (val === null || val === undefined) continue;
      if (Array.isArray(val) && val.length === 0) continue;
      // Prefer AI value only if we don't already have it, or if AI array is richer
      if (!partial[key] || (Array.isArray(partial[key]) && partial[key].length < val.length)) {
        partial[key] = val;
      }
    }
  }

  return normalizeResult(partial);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { word, sentence } = body || {};
  if (!word) return res.status(400).json({ error: "word is required" });

  // ── Step 0: cache hit? Zero tokens, instant response ─────────────────────
  const cached = await readCache(word);
  if (cached) return res.json(cached);

  // ── Step 1+2: Free Dictionary + Datamuse in parallel ─────────────────────
  const [freeData, datuData] = await Promise.all([
    fetchFreeDictionary(word),
    fetchDatamuse(word),
  ]);

  let result;

  if (freeData) {
    // Merge Datamuse into Free Dict data before sending to AI
    if (datuData.synonyms.length)
      freeData.synonyms = [...new Set([...freeData.synonyms, ...datuData.synonyms])].slice(0, 7);
    if (datuData.antonyms.length)
      freeData.antonyms = [...new Set([...freeData.antonyms, ...datuData.antonyms])].slice(0, 5);

    // ── Step 3: AI fills the gaps ─────────────────────────────────────────
    result = await enrichWithAI(word, freeData, datuData.followWords);

  } else {
    // ── Step 3 (full): Free Dict had nothing → Gemma does everything ─────
    let userPrompt = `Word: "${word}"`;
    if (sentence) userPrompt += `\nContext from learner: "${sentence}"\nInclude this as one of the examples.`;

    const aiResult = await callAIJson(FULL_SYSTEM_PROMPT, userPrompt, { maxTokens: 2048, temperature: 0.2 });
    if (!aiResult) {
      return res.status(503).json({ error: "Could not enrich word. Check NVIDIA_API_KEY in Vercel env vars." });
    }

    // Try to get audio from Free Dictionary using AI-returned word form
    const dictAudio = await fetchFreeDictionary(aiResult.word || word);
    if (dictAudio?.audioUrl) aiResult.audioUrl = dictAudio.audioUrl;

    result = normalizeResult(aiResult);
  }

  // ── Step 4: write-through cache (non-blocking, non-critical) ─────────────
  writeCache(result); // intentionally not awaited

  return res.json(result);
}
