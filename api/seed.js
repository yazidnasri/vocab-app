/**
 * One-time seed endpoint for the shared word library.
 * Fetches each word from the Free Dictionary API (audio included) and inserts into Supabase.
 * Processes in chunks so it fits within Vercel's 60s limit.
 *
 * Setup (Vercel env vars):
 *   SEED_SECRET           = any password you choose (e.g. "myseedpass123")
 *   SUPABASE_SERVICE_KEY  = from Supabase Dashboard → Settings → API → service_role key
 *
 * Usage — call once per chunk (chunk = 0, 1, 2, ... until done: true):
 *   POST /api/seed
 *   { "secret": "myseedpass123", "chunk": 0 }
 *
 * Or run all chunks automatically with a simple loop (see SETUP.md).
 */

export const config = { maxDuration: 60 };

const CHUNK_SIZE = 50;

// ─── ~400 curated vocabulary words ────────────────────────────────────────────
// Covers GRE, business, academic, literary, and emotional-intelligence vocab.
// The Free Dictionary API will supply definitions, examples, synonyms, and audio.
const ALL_WORDS = [
  // Already in migration 003 (will be skipped via upsert ignore)
  "eloquent","resilient","pragmatic","ephemeral","tenacious","nuance","catalyst",
  "scrutinize","paradox","meticulous","ambiguous","empathy","astute","verbose","anomaly",

  // GRE / Academic
  "abate","aberrant","abstain","acerbic","acquiesce","adamant","admonish","adroit",
  "advocate","aesthetic","affable","alacrity","ameliorate","amiable","anachronism",
  "antagonist","appease","archaic","ardent","arduous","articulate","ascetic",
  "audacity","augment","austere","avarice","aversion","belligerent","benevolent",
  "blithe","bolster","bombastic","brevity","candid","capricious","caustic",
  "clandestine","clemency","coerce","cogent","coherent","complacent","concede",
  "concise","condescending","convoluted","copious","corroborate","credulous",
  "cryptic","cursory","cynical","dauntless","debilitate","deference","deliberate",
  "demagogue","deprecate","diligent","discern","disparage","dissonance","dogmatic",
  "eccentric","eminent","empirical","equivocal","esoteric","exemplary","exonerate",
  "exorbitant","expedient","explicit","extol","exuberant","fallacious","fastidious",
  "fervent","flagrant","frugal","gregarious","hackneyed","haughty","hedonism",
  "heresy","hypocrite","impetuous","implicit","inane","incipient","incongruous",
  "indignant","indolent","inherent","insolent","intrepid","jaded","laconic",
  "laudable","lavish","lethargic","lucid","malevolent","mitigate","mollify",
  "mundane","negligent","oblivious","obstinate","ominous","opulent","persevere",
  "pretentious","prevalent","prolific","prudent","quandary","reconcile","reticent",
  "shrewd","skeptical","sophisticated","stoic","succinct","taciturn","tangible",
  "transcend","ubiquitous","vacuous","venerate","zealous",

  // GRE Advanced
  "aberration","abscond","accolade","acrimony","adulation","aggrandize","alleviate",
  "altruistic","ambivalent","antipathy","apathy","approbation","arid","assiduous",
  "atrophy","auspicious","banal","bellicose","benign","brazen","bucolic","burgeon",
  "callous","catharsis","chicanery","circumspect","contentious","contrition","culpable",
  "decorum","deft","deleterious","deride","diatribe","didactic","diffident",
  "dilettante","discordant","disdain","dubious","duplicity","ebullient","effrontery",
  "egregious","elusive","embellish","engender","equanimity","erudite","evocative",
  "exacerbate","exculpate","facetious","fortuitous","garrulous","gratuitous","hubris",
  "iconoclast","idiosyncrasy","ignominious","impartial","incisive","ineffable",
  "inexorable","insipid","insular","intransigent","inveterate","irascible","judicious",
  "juxtapose","languid","loquacious","lugubrious","magnanimous","malfeasance",
  "malleable","mendacious","misanthrope","myriad","nonchalant","obdurate","obsequious",
  "obtuse","odious","ostensible","ostracize","panacea","pariah","partisan","penchant",
  "perfidious","perspicacious","petulant","pious","placate","polarize","polemic",
  "pompous","portentous","precocious","prescient","profligate","propitious","protracted",
  "provincial","querulous","quixotic","rancor","recalcitrant","recondite","repudiate",
  "sagacious","sanctimonious","sanguine","sardonic","scrupulous","sedulous","sycophant",
  "temerity","tenuous","truculent","turgid","unctuous","upbraid","vapid","venial",
  "vitriolic","whimsical","wily","zealotry",

  // Emotional intelligence / psychology
  "alienate","aloof","angst","apprehensive","ardor","aversion","candor","charisma",
  "composed","confounded","consternation","despondent","distraught","elation",
  "exasperated","exhilarated","fervor","forthright","genuine","gratitude","harmony",
  "humility","impulsive","indignant","insecure","introspective","intuitive","jovial",
  "jubilant","lament","magnanimous","melancholy","mindful","nostalgic","optimistic",
  "passionate","pensive","perturbed","placid","poignant","profound","remorseful",
  "resolute","serene","solace","somber","sympathetic","tormented","tranquil",
  "turbulent","unflappable","wistful",

  // Business / professional
  "accountability","acumen","agile","alignment","autonomy","benchmark","brainstorm",
  "burnout","capacity","collaboration","compliance","contingency","credibility",
  "delegate","deliverable","disruptive","diversify","efficacy","empower","escalate",
  "facilitate","fiduciary","flexibility","forecast","governance","ideation","incentive",
  "innovate","insight","integrity","iterate","leverage","mandate","metrics","momentum",
  "negotiate","optimize","outcome","paradigm","performance","pivot","procurement",
  "proactive","productive","resilience","revenue","scalable","stakeholder","strategic",
  "streamline","sustainable","synergy","traction","transition","transparency","velocity",
  "viable","vision","workflow",

  // Literary / descriptive
  "abstruse","acrimonious","affinity","anachronistic","archetype","arcane","arresting",
  "cadence","cerebral","compelling","cryptic","decadent","desolate","dormant",
  "dynamic","earnest","elemental","enigmatic","ethereal","exquisite","fanciful",
  "formidable","haunting","iridescent","luminous","mercurial","mesmerizing",
  "monumental","nebulous","omniscient","ornate","palpable","peculiar","phosphorescent",
  "plangent","preternatural","primeval","radiant","rapturous","resplendent",
  "rhapsodic","singular","spectacular","sublime","surreal","tantalizing","transcendent",
  "unearthly","uncanny","visceral","vivid",

  // Practical high-frequency advanced words
  "abdicate","abolish","abstain","accelerate","accumulate","acknowledge","activate",
  "adamantine","adhere","affluent","aggravate","agitate","allege","allocate",
  "altruism","annihilate","apprehend","assert","atone","attain","authentic",
  "authorize","avow","bequeath","besiege","captivate","cede","charitable",
  "cognizant","cohesion","compassion","compel","complicit","concord","constraint",
  "contemplate","conviction","cultivate","cunning","degrade","denounce","derive",
  "devoted","dignity","discredit","disengage","dissuade","doctrine","dominate",
  "eclectic","efficient","endure","enlighten","equitable","evolve","exalt",
  "facilitate","faithful","flourish","forbear","foresee","formulate","fragile",
  "fulfill","fundamental","harness","illuminate","impede","incentivize","inclusive",
  "indispensable","inevitable","initiate","integrate","invoke","justify","manifest",
  "navigate","nourish","nurture","obstruct","pacify","perpetuate","persist",
  "persuade","principled","rational","reclaim","reform","reinforce","relentless",
  "remedy","renounce","restore","revere","sacrifice","steadfast","stimulate",
  "strive","transform","truthful","validate","vigilant","worthy",
];

const FREE_DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

async function fetchWord(word) {
  try {
    const res = await fetch(`${FREE_DICT_URL}${encodeURIComponent(word.toLowerCase())}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const entry = data[0];
    let ipa = '', audioUrl = '';
    for (const ph of entry.phonetics || []) {
      if (ph.text && !ipa) ipa = ph.text.replace(/^\/|\/$/g, '');
      if (ph.audio && ph.audio.length > 4 && !audioUrl) {
        audioUrl = ph.audio.startsWith('//') ? `https:${ph.audio}` : ph.audio;
      }
    }
    if (!ipa && entry.phonetic) ipa = entry.phonetic.replace(/^\/|\/$/g, '');

    const examples = [], synonyms = [], antonyms = [];
    let partOfSpeech = '', definition = '';

    for (const meaning of entry.meanings || []) {
      if (!partOfSpeech) partOfSpeech = meaning.partOfSpeech || '';
      synonyms.push(...(meaning.synonyms || []));
      antonyms.push(...(meaning.antonyms || []));
      for (const defn of meaning.definitions || []) {
        if (!definition) definition = defn.definition || '';
        if (defn.example && examples.length < 3) examples.push(defn.example);
        synonyms.push(...(defn.synonyms || []));
        antonyms.push(...(defn.antonyms || []));
      }
    }

    if (!definition) return null;

    return {
      word: (entry.word || word).charAt(0).toUpperCase() + (entry.word || word).slice(1),
      phonetic: ipa,
      ipa,
      part_of_speech: partOfSpeech,
      definition,
      forms: [],
      examples: examples.slice(0, 3),
      synonyms: [...new Set(synonyms)].slice(0, 5),
      antonyms: [...new Set(antonyms)].slice(0, 4),
      register: null,
      memory_hook: null,
      audio_url: audioUrl || null,
      etymology: null,
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const expectedSecret = process.env.SEED_SECRET;
  if (!expectedSecret) {
    return res.status(500).json({ error: 'SEED_SECRET env var not set in Vercel' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { secret, chunk = 0 } = body;

  if (secret !== expectedSecret) {
    return res.status(403).json({ error: 'Wrong secret' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY in Vercel env vars',
    });
  }

  // Deduplicate word list
  const words = [...new Set(ALL_WORDS)];
  const totalChunks = Math.ceil(words.length / CHUNK_SIZE);
  const chunkIdx = Number(chunk);

  if (chunkIdx >= totalChunks) {
    return res.json({ done: true, message: 'All chunks processed', total: words.length });
  }

  const slice = words.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);

  // Fetch all words in this chunk in parallel
  const results = await Promise.all(slice.map(fetchWord));
  const valid = results.filter(Boolean);

  let inserted = 0;
  if (valid.length) {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/words`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(valid),
    });
    if (insertRes.ok) inserted = valid.length;
  }

  const nextChunk = chunkIdx + 1;
  const done = nextChunk >= totalChunks;

  return res.json({
    done,
    chunk: chunkIdx,
    nextChunk: done ? null : nextChunk,
    inserted,
    skipped: slice.length - valid.length,
    totalChunks,
    totalWords: words.length,
    message: done
      ? `All ${totalChunks} chunks done! ~${words.length} words seeded.`
      : `Chunk ${chunkIdx + 1}/${totalChunks} done. Call again with chunk: ${nextChunk}`,
  });
}
