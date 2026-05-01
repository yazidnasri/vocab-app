"""
Seed the Supabase 'words' table with enriched vocabulary from the Free Dictionary API.

Usage:
  export SUPABASE_URL=https://your-project.supabase.co
  export SUPABASE_SERVICE_KEY=your-service-role-key
  python seed_words.py

The service role key bypasses RLS — never use it in client code.
Run this once to populate the shared word library.
"""
import asyncio
import os
import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
FREE_DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/{word}"

# ─── Curated vocabulary list (GRE / academic / business level) ────────────────
WORDS = [
    "abate", "aberrant", "abstain", "acerbic", "acquiesce", "adamant",
    "admonish", "adroit", "advocate", "aesthetic", "affable", "alacrity",
    "ambiguous", "ameliorate", "amiable", "anachronism", "anomaly",
    "antagonist", "appease", "archaic", "ardent", "arduous", "articulate",
    "ascetic", "astute", "audacity", "augment", "austere", "avarice",
    "aversion", "belligerent", "benevolent", "blithe", "bolster", "bombastic",
    "brevity", "candid", "capricious", "catalyst", "caustic", "clandestine",
    "clemency", "coerce", "cogent", "coherent", "complacent", "concede",
    "concise", "condescending", "convoluted", "copious", "corroborate",
    "credulous", "cryptic", "cursory", "cynical", "dauntless", "debilitate",
    "deference", "deliberate", "demagogue", "deprecate", "diligent",
    "discern", "disparage", "dissonance", "dogmatic", "eccentric", "eloquent",
    "eminent", "empirical", "ephemeral", "equivocal", "esoteric", "exemplary",
    "exonerate", "exorbitant", "expedient", "explicit", "extol", "exuberant",
    "fallacious", "fastidious", "fervent", "flagrant", "frugal", "gregarious",
    "hackneyed", "haughty", "hedonism", "heresy", "hypocrite", "impetuous",
    "implicit", "inane", "incipient", "incongruous", "indignant", "indolent",
    "inherent", "insolent", "intrepid", "jaded", "laconic", "laudable",
    "lavish", "lethargic", "leverage", "lucid", "malevolent", "meticulous",
    "mitigate", "mollify", "mundane", "negligent", "nuanced", "oblivious",
    "obstinate", "ominous", "opulent", "paradigm", "persevere", "pragmatic",
    "pretentious", "prevalent", "prolific", "prudent", "quandary",
    "reconcile", "resilient", "reticent", "scrutinize", "shrewd",
    "skeptical", "sophisticated", "stoic", "succinct", "taciturn",
    "tangible", "tenacious", "transcend", "ubiquitous", "vacuous",
    "venerate", "verbose", "zealous", "aberration", "abscond", "accolade",
    "acrimony", "adulation", "aggrandize", "alleviate", "altruistic",
    "ambivalent", "ameliorate", "anachronism", "antipathy", "apathy",
    "approbation", "arid", "articulate", "assiduous", "atrophy",
    "auspicious", "banal", "bellicose", "benign", "brazen", "bucolic",
    "burgeon", "callous", "catharsis", "chicanery", "circumspect",
    "contentious", "contrition", "culpable", "decorum", "deft",
    "deleterious", "deride", "diatribe", "didactic", "diffident",
    "dilettante", "discordant", "disdain", "dubious", "duplicity",
    "ebullient", "effrontery", "egregious", "elusive", "embellish",
    "engender", "enumerate", "equanimity", "erudite", "euthanasia",
    "evocative", "exacerbate", "exculpate", "facetious", "fortuitous",
    "garrulous", "gratuitous", "hubris", "iconoclast", "idiosyncrasy",
    "ignominious", "impartial", "impetuous", "incisive", "indolent",
    "ineffable", "inexorable", "insipid", "insular", "intransigent",
    "inveterate", "invincible", "irascible", "judicious", "juxtapose",
    "languid", "loquacious", "lugubrious", "magnanimous", "malfeasance",
    "malleable", "mendacious", "misanthrope", "myriad", "nonchalant",
    "obdurate", "obsequious", "obtuse", "odious", "ostensible", "ostracize",
    "panacea", "pariah", "partisan", "penchant", "perfidious", "perspicacious",
    "petulant", "pious", "placate", "polarize", "polemic", "pompous",
    "portentous", "precocious", "prescient", "profligate", "propitious",
    "protracted", "provincial", "querulous", "quixotic", "rancor",
    "recalcitrant", "recondite", "repudiate", "sagacious", "sanctimonious",
    "sanguine", "sardonic", "scrupulous", "sedulous", "sycophant",
    "temerity", "tenuous", "truculent", "turgid", "ubiquitous",
    "unctuous", "upbraid", "vapid", "venial", "vitriolic", "whimsical",
    "wily", "zealotry",
]

# Remove duplicates
WORDS = list(dict.fromkeys(WORDS))


async def fetch_word(client: httpx.AsyncClient, word: str) -> dict | None:
    """Fetch a single word from the Free Dictionary API."""
    try:
        resp = await client.get(FREE_DICT_URL.format(word=word.lower()), timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data or not isinstance(data, list):
            return None

        entry = data[0]

        # Extract phonetics
        ipa = ""
        audio_url = ""
        for ph in entry.get("phonetics", []):
            if ph.get("text") and not ipa:
                ipa = ph["text"].strip("/")
            if ph.get("audio") and not audio_url:
                audio_url = ph["audio"]
        if not ipa and entry.get("phonetic"):
            ipa = entry["phonetic"].strip("/")

        # Extract meanings
        examples, synonyms, antonyms = [], [], []
        part_of_speech, definition = "", ""
        for meaning in entry.get("meanings", []):
            if not part_of_speech:
                part_of_speech = meaning.get("partOfSpeech", "")
            for defn in meaning.get("definitions", []):
                if not definition:
                    definition = defn.get("definition", "")
                if defn.get("example") and len(examples) < 3:
                    examples.append(defn["example"])
                synonyms.extend(defn.get("synonyms", []))
                antonyms.extend(defn.get("antonyms", []))

        if not definition:
            return None

        return {
            "word": entry.get("word", word).capitalize(),
            "phonetic": ipa,  # Use IPA as phonetic (simplified version added by Gemini later)
            "ipa": ipa,
            "part_of_speech": part_of_speech,
            "definition": definition,
            "forms": [],
            "examples": examples[:3],
            "synonyms": list(dict.fromkeys(synonyms))[:5],
            "antonyms": list(dict.fromkeys(antonyms))[:4],
            "register": None,
            "memory_hook": None,
            "audio_url": audio_url,
        }
    except Exception as e:
        print(f"  ✗ {word}: {e}")
        return None


async def insert_batch(words_data: list[dict]) -> bool:
    """Insert a batch of words into Supabase."""
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        # Ignore duplicates (same word already in table)
        "Prefer": "return=minimal,resolution=ignore-duplicates",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/words",
            headers=headers,
            json=words_data,
        )
    if resp.status_code in (200, 201):
        return True
    print(f"  Insert error {resp.status_code}: {resp.text[:200]}")
    return False


async def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
        return

    print(f"Fetching {len(WORDS)} words from Free Dictionary API...")
    print("(This may take a minute — being polite to the free API)\n")

    enriched = []
    # Batch requests to be nice to the free API
    batch_size = 10
    async with httpx.AsyncClient() as client:
        for i in range(0, len(WORDS), batch_size):
            batch = WORDS[i:i + batch_size]
            tasks = [fetch_word(client, w) for w in batch]
            results = await asyncio.gather(*tasks)
            for word, result in zip(batch, results):
                if result:
                    enriched.append(result)
                    print(f"  ✓ {word}")
                else:
                    print(f"  ✗ {word} (not found)")
            # Brief pause between batches
            if i + batch_size < len(WORDS):
                await asyncio.sleep(0.5)

    print(f"\nFetched {len(enriched)}/{len(WORDS)} words successfully.")
    print("Inserting into Supabase...")

    # Insert in batches of 50
    insert_batch_size = 50
    total_inserted = 0
    for i in range(0, len(enriched), insert_batch_size):
        batch = enriched[i:i + insert_batch_size]
        ok = await insert_batch(batch)
        if ok:
            total_inserted += len(batch)
            print(f"  Inserted {total_inserted}/{len(enriched)}")

    print(f"\nDone! {total_inserted} words in the shared library.")


if __name__ == "__main__":
    asyncio.run(main())
