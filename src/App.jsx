import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./lib/supabase";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: "#0a0a0a",
  card: "#1a1a1e",
  cardBorder: "#2a2a2e",
  surface: "#222226",
  text: "#f5f5f5",
  textMuted: "#8a8a8e",
  textDim: "#5a5a5e",
  green: "#4ade80",  greenBg: "rgba(74,222,128,0.1)",
  orange: "#fb923c", orangeBg: "rgba(251,146,60,0.1)",
  red: "#f87171",    redBg: "rgba(248,113,113,0.1)",
  blue: "#60a5fa",   blueBg: "rgba(96,165,250,0.1)",
  purple: "#a78bfa", purpleBg: "rgba(167,139,250,0.1)",
  radius: 16, radiusSm: 10,
};

const STATUS_CONFIG = {
  new:       { label: "New",       color: T.purple, bg: T.purpleBg },
  learning:  { label: "Learning",  color: T.orange, bg: T.orangeBg },
  reviewing: { label: "Reviewing", color: T.blue,   bg: T.blueBg },
  mastered:  { label: "Mastered",  color: T.green,  bg: T.greenBg },
};

const API  = import.meta.env.VITE_API_URL ?? "";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Icons ────────────────────────────────────────────────────────────────────
const PATHS = {
  home:    "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  book:    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  plus:    "M12 5v14M5 12h14",
  zap:     "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  volume:  "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07",
  mic:     "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8",
  logout:  "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  check:   "M20 6L9 17l-5-5",
  star:    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  book2:   "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  sparkle: "M12 3v1m0 16v1M4.22 4.22l.707.707m12.727 12.728.707.707M3 12h1m16 0h1M4.927 19.073l.707-.707M18.364 5.636l.707-.707M12 7a5 5 0 0 0 0 10 5 5 0 0 0 0-10z",
  history: "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8",
  award:   "M12 15l-2 5 2-1 2 1-2-5zM12 2a7 7 0 1 0 0 14A7 7 0 0 0 12 2z",
  chart:   "M18 20V10M12 20V4M6 20v-6",
};
const Icon = ({ name, size = 20, color = T.textMuted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name] || ""} />
  </svg>
);

// ─── SRS Algorithm (SM-2) ─────────────────────────────────────────────────────
function scheduleWord(word, rating) {
  let { interval, easeFactor, reviewCount } = word;
  reviewCount += 1;
  if (rating === 1) { interval = 0; easeFactor = Math.max(1.3, easeFactor - 0.2); }
  else if (rating === 2) { interval = Math.max(1, interval); easeFactor = Math.max(1.3, easeFactor - 0.15); }
  else if (rating === 3) { interval = reviewCount === 1 ? 1 : reviewCount === 2 ? 3 : Math.round(interval * easeFactor); }
  else { interval = reviewCount === 1 ? 1 : Math.round(interval * easeFactor * 1.3); easeFactor = Math.min(3.0, easeFactor + 0.1); }
  const nextReview = new Date(Date.now() + interval * 86400000).toISOString();
  let status = "learning";
  if (interval >= 21) status = "mastered";
  else if (interval >= 3) status = "reviewing";
  return { ...word, interval, easeFactor, reviewCount, nextReview, status };
}

function getDueWords(words) {
  return words.filter(w => new Date(w.nextReview) <= new Date());
}

// ─── DB Mappers ───────────────────────────────────────────────────────────────
const mapDbToWord = (row) => ({
  id:            row.id,
  word:          row.word ?? "",
  phonetic:      row.phonetic ?? "",
  ipa:           row.ipa ?? "",
  partOfSpeech:  row.part_of_speech ?? "",
  definition:    row.definition ?? "",
  forms:         row.forms ?? [],
  examples:      row.examples ?? [],
  synonyms:      row.synonyms ?? [],
  antonyms:      row.antonyms ?? [],
  register:      row.register ?? "",
  memoryHook:    row.memory_hook ?? "",
  audioUrl:      row.audio_url ?? "",
  etymology:     row.etymology ?? "",
  collocations:  row.collocations ?? [],
  usageNote:     row.usage_note ?? "",
  commonMistake: row.common_mistake ?? "",
  cefrLevel:     row.cefr_level ?? "",
  quizQuestions: row.quiz_questions ?? [],
  status:        row.status ?? "new",
  nextReview:    row.next_review ?? new Date().toISOString(),
  interval:      row.interval_days ?? 0,
  easeFactor:    parseFloat(row.ease_factor) || 2.5,
  reviewCount:   row.review_count ?? 0,
  createdAt:     row.created_at ?? new Date().toISOString(),
});

const mapWordToDb = (word) => ({
  word:           word.word,
  phonetic:       word.phonetic || null,
  ipa:            word.ipa || null,
  part_of_speech: word.partOfSpeech || null,
  definition:     word.definition || null,
  forms:          word.forms || [],
  examples:       word.examples || [],
  synonyms:       word.synonyms || [],
  antonyms:       word.antonyms || [],
  register:       word.register || null,
  memory_hook:    word.memoryHook || null,
  audio_url:      word.audioUrl || null,
  etymology:      word.etymology || null,
  collocations:   word.collocations || [],
  usage_note:     word.usageNote || null,
  common_mistake: word.commonMistake || null,
  cefr_level:     word.cefrLevel || null,
  status:         word.status || "new",
  next_review:    word.nextReview || new Date().toISOString(),
  interval_days:  word.interval || 0,
  ease_factor:    word.easeFactor || 2.5,
  review_count:   word.reviewCount || 0,
});

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function Badge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: 0.8, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

function Pill({ label, color = T.textMuted, bg = T.surface }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "inline-block" }}>{label}</span>;
}

function Card({ children, style = {}, className = "", ...rest }) {
  return (
    <div className={className} style={{ background: T.card, borderRadius: T.radius, border: `1px solid ${T.cardBorder}`, padding: "16px 18px", marginBottom: 12, ...style }} {...rest}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={{ margin: "0 0 8px", fontSize: 10, color: T.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{children}</p>;
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function SkeletonLine({ w = "100%", h = 12 }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6, marginBottom: 6 }} />;
}

function SkeletonCard() {
  return (
    <Card>
      <SkeletonLine w="55%" h={16} />
      <SkeletonLine w="35%" h={10} />
      <SkeletonLine w="75%" h={10} />
    </Card>
  );
}

// ─── Toast system ─────────────────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 40px)", maxWidth: 350, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{
          background: t.type === "error" ? T.redBg : t.type === "warning" ? T.orangeBg : T.greenBg,
          border: `1px solid ${t.type === "error" ? "rgba(248,113,113,0.4)" : t.type === "warning" ? "rgba(251,146,60,0.4)" : "rgba(74,222,128,0.4)"}`,
          borderRadius: T.radiusSm, padding: "10px 14px",
          color: t.type === "error" ? T.red : t.type === "warning" ? T.orange : T.green,
          fontSize: 13, fontWeight: 600, lineHeight: 1.4,
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Onboarding modal ─────────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    icon: "sparkle", color: T.purple,
    title: "Welcome to Wordsmith",
    body: "The smart way to build vocabulary. AI enriches every word you add — definitions, phonetics, examples, memory hooks — then spaced repetition ensures you never forget them.",
  },
  {
    icon: "plus", color: T.blue,
    title: "Add words 4 ways",
    body: "Type any word, paste a sentence (AI picks the best word), speak it, or batch-import a list. The AI handles all the enrichment — you just show up.",
  },
  {
    icon: "zap", color: T.orange,
    title: "Review & remember",
    body: "Every session cycles through 3 modes: Flashcard (tap to reveal), Quiz (fill-in-the-blank), and Digest (read + absorb). Rate each word and the SM-2 algorithm schedules the next review.",
  },
  {
    icon: "award", color: T.green,
    title: "Build your streak",
    body: "Review at least once per day to keep your streak alive. Words graduate from New → Learning → Reviewing → Mastered as their review interval grows past 21 days.",
  },
];

function OnboardingModal({ onDone }) {
  const [step, setStep] = useState(0);
  const cur = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 390, background: T.card, borderRadius: "24px 24px 0 0", borderTop: `1px solid ${T.cardBorder}`, padding: "32px 28px 40px", fontFamily: FONT }}>
        {/* Step icon */}
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `${cur.color}18`, border: `1px solid ${cur.color}40`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Icon name={cur.icon} size={26} color={cur.color} />
        </div>

        {/* Content */}
        <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>{cur.title}</h2>
        <p style={{ margin: "0 0 28px", fontSize: 14, color: T.textMuted, lineHeight: 1.7 }}>{cur.body}</p>

        {/* Dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <span key={i} className={`dot${i === step ? " active" : ""}`} />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {!isLast && (
            <button onClick={onDone} style={{ flex: 1, background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "12px", color: T.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Skip
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            style={{ flex: 2, background: T.text, border: "none", borderRadius: T.radiusSm, padding: "12px", color: T.bg, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            {isLast ? "Let's go →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Word of the Day ──────────────────────────────────────────────────────────
function WordOfDayCard({ words, featuredWord, onSelect }) {
  // Prefer a fresh random word from the shared library; fall back to user's words
  const word = featuredWord || (words.length ? words[Math.floor(Math.random() * words.length)] : null);
  if (!word) return null;
  return (
    <Card className="card-clickable" style={{ border: `1px solid rgba(167,139,250,0.25)`, background: "rgba(167,139,250,0.04)", marginBottom: 12 }} onClick={() => onSelect(word)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="star" size={13} color={T.purple} />
          <span style={{ fontSize: 10, color: T.purple, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Word of the Day</span>
        </div>
        {word.status && <Badge status={word.status} />}
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, color: T.text }}>{word.word}</p>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: T.textDim }}>{[word.phonetic || word.ipa, word.partOfSpeech].filter(Boolean).join(" · ")}</p>
      <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.55 }}>{(word.definition || "").substring(0, 90)}{word.definition?.length > 90 ? "…" : ""}</p>
    </Card>
  );
}

// ─── Discover Card ───────────────────────────────────────────────────────────
function DiscoverCard({ userWordIds, onAdd, onToast, onSelectWord }) {
  const [pool, setPool]     = useState([]);
  const [idx, setIdx]       = useState(0);
  const [seen, setSeen]     = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [added, setAdded]   = useState(false);

  useEffect(() => {
    // Fetch all words (only lightweight fields needed for card display)
    supabase.from("words").select("id,word,phonetic,ipa,part_of_speech,definition,audio_url,cefr_level").limit(600)
      .then(({ data }) => {
        if (!data?.length) return;
        const available = data.filter(w => !userWordIds.has(w.word.toLowerCase()));
        if (!available.length) return;
        // Shuffle on load so order is fresh every session
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        setPool(shuffled);
        setIdx(0);
        setSeen(new Set());
      });
  }, [userWordIds]);

  const word = pool[idx];
  if (!word || added) return null;

  const handleAdd = async () => {
    setAdding(true);
    await onAdd(mapDbToWord({
      ...word, id: undefined, status: "new",
      next_review: new Date().toISOString(),
      interval_days: 0, ease_factor: 2.5, review_count: 0,
    }));
    setAdded(true);
    onToast(`"${word.word}" added to your library`);
  };

  return (
    <Card style={{ border: `1px solid rgba(96,165,250,0.2)`, background: "rgba(96,165,250,0.04)", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="sparkle" size={13} color={T.blue} />
          <span style={{ fontSize: 10, color: T.blue, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Discover</span>
        </div>
        {pool.length > 1 && (
          <button onClick={() => {
            setSeen(s => new Set([...s, idx]));
            setIdx(i => {
              // Find an unseen index; if all seen, reset
              const available = pool.map((_, j) => j).filter(j => j !== i && !seen.has(j));
              if (!available.length) { setSeen(new Set()); return (i + 1) % pool.length; }
              return available[Math.floor(Math.random() * available.length)];
            });
            setAdded(false);
          }} style={{ background: "none", border: "none", fontSize: 11, color: T.textDim, cursor: "pointer", padding: "2px 4px" }}>
            next →
          </button>
        )}
      </div>
      <div onClick={() => onSelectWord?.(mapDbToWord({ ...word, status: "new", next_review: new Date().toISOString(), interval_days: 0, ease_factor: 2.5, review_count: 0 }))} style={{ cursor: onSelectWord ? "pointer" : "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>{word.word}</p>
          <CefrBadge level={word.cefr_level} />
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: T.textDim }}>{[word.phonetic || word.ipa, word.part_of_speech].filter(Boolean).join(" · ")}</p>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: T.textMuted, lineHeight: 1.55 }}>
          {(word.definition || "").substring(0, 100)}{(word.definition || "").length > 100 ? "…" : ""}
        </p>
      </div>
      <button onClick={handleAdd} disabled={adding}
        style={{ background: T.blue, color: "#fff", border: "none", borderRadius: T.radiusSm, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: adding ? "default" : "pointer", opacity: adding ? 0.6 : 1 }}>
        {adding ? "Adding…" : "+ Add to my list"}
      </button>
    </Card>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ maxWidth: 390, margin: "0 auto", background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, color: T.text, margin: "0 0 10px" }}>Wordsmith</h1>
      <p style={{ color: T.textDim, fontSize: 13, margin: 0 }}>Loading…</p>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ mode, onToggleMode }) {
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [successMsg, setSuccessMsg]         = useState(null);

  const inp = {
    width: "100%", padding: "13px 16px", borderRadius: T.radiusSm,
    border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none",
    background: T.surface, color: T.text, boxSizing: "border-box",
  };

  // Reset all fields when switching between login/signup
  const handleToggleMode = () => {
    setEmail(""); setPassword(""); setConfirmPassword("");
    setError(null); setSuccessMsg(null);
    onToggleMode();
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) return;
    // Validate first — before setLoading — so early returns don't freeze the button
    if (mode === "signup") {
      if (password !== confirmPassword) { setError("Passwords don't match"); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    }
    setError(null); setSuccessMsg(null); setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // If email confirmation is disabled in Supabase, session is returned immediately
        // and onAuthStateChange handles login automatically. Otherwise show email prompt.
        if (!data.session) {
          setSuccessMsg("Check your email for a confirmation link.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 390, margin: "0 auto", background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px 40px", fontFamily: FONT }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: T.text, margin: "0 0 8px", letterSpacing: -0.5 }}>Wordsmith</h1>
        <p style={{ color: T.textDim, fontSize: 14, margin: 0 }}>Build your vocabulary, word by word</p>
      </div>

      <Card style={{ padding: "24px 20px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: "0 0 20px" }}>
          {mode === "login" ? "Welcome back" : "Create account"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" || confirmPassword) && handleSubmit()} style={inp} />
          {mode === "signup" && (
            <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inp} autoComplete="new-password" />
          )}
          {error    && <p style={{ margin: 0, fontSize: 12, color: T.red,   padding: "8px 12px", background: T.redBg,   borderRadius: T.radiusSm }}>{error}</p>}
          {successMsg && <p style={{ margin: 0, fontSize: 12, color: T.green, padding: "8px 12px", background: T.greenBg, borderRadius: T.radiusSm }}>{successMsg}</p>}
          <button onClick={handleSubmit} disabled={loading || !email.trim() || !password}
            style={{ background: T.text, color: T.bg, border: "none", borderRadius: T.radiusSm, padding: "13px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: (!email.trim() || !password || loading) ? 0.5 : 1, marginTop: 4 }}>
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
      </Card>

      <p style={{ textAlign: "center", color: T.textDim, fontSize: 13, marginTop: 16 }}>
        {mode === "login" ? "Don't have an account? " : "Already have an account? "}
        <button onClick={handleToggleMode} style={{ background: "none", border: "none", color: T.text, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}>
          {mode === "login" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

// ─── Daily Challenge ─────────────────────────────────────────────────────────
function DailyChallenge({ words, onToast }) {
  const today   = new Date().toISOString().split("T")[0];
  const doneKey = `wordsmith_challenge_${today}`;
  const [done, setDone]         = useState(() => localStorage.getItem(doneKey) === "1");
  const [answer, setAnswer]     = useState(null);
  const [revealed, setRevealed] = useState(false);

  // Pick word with date seed so it's consistent for the day
  const seed = today.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const word = words.length ? words[seed % words.length] : null;

  // Build fill-in-blank + options — memoized so they never reshuffle mid-interaction
  const { blank, options } = useMemo(() => {
    if (!word?.examples?.length) return { blank: "", options: [] };
    const stem    = word.word.toLowerCase().slice(0, 5);
    const example = word.examples.find(e => new RegExp(stem, "i").test(e)) || word.examples[0];
    const b = (() => {
      const r = example.replace(new RegExp(`\\b${word.word}\\w*`, "i"), "___________");
      return r !== example ? r : example.replace(new RegExp(stem + "\\w*", "i"), "___________");
    })();
    const distractors = [...(word.synonyms || []), ...(word.antonyms || [])].slice(0, 3);
    while (distractors.length < 3) distractors.push(["endeavor","clarity","impulse"][distractors.length] || "notion");
    return {
      blank: b,
      options: [...new Set([word.word, ...distractors.slice(0, 3)])].sort(() => Math.random() - 0.5),
    };
  }, [word?.word]); // only re-compute when the actual word changes

  if (!words.length || done || !word?.examples?.length) return null;

  const handleAnswer = (opt) => {
    if (answer) return;
    setAnswer(opt); setRevealed(true);
    setTimeout(() => {
      localStorage.setItem(doneKey, "1");
      setDone(true);
      onToast(opt === word.word ? "Daily challenge complete! Keep the streak going 🔥" : `Daily challenge done. The answer was "${word.word}"`, opt === word.word ? "success" : "warning");
    }, 1400);
  };

  return (
    <Card style={{ border: `1px solid rgba(251,146,60,0.3)`, background: "rgba(251,146,60,0.04)", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Icon name="zap" size={13} color={T.orange} />
        <span style={{ fontSize: 10, color: T.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Daily Challenge</span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: T.text, lineHeight: 1.7, fontStyle: "italic" }}>{blank}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {options.map(opt => {
          const correct = opt === word.word;
          const sel     = answer === opt;
          const showResult = revealed && (sel || correct);
          return (
            <button key={opt} onClick={() => handleAnswer(opt)} disabled={!!answer}
              style={{
                background: showResult ? (correct ? T.greenBg : sel ? T.redBg : T.surface) : T.surface,
                border: `1.5px solid ${showResult ? (correct ? T.green : sel ? T.red : T.cardBorder) : T.cardBorder}`,
                borderRadius: T.radiusSm, padding: "10px 8px", fontSize: 13, fontWeight: 600,
                color: showResult ? (correct ? T.green : sel ? T.red : T.text) : T.text,
                cursor: answer ? "default" : "pointer",
              }}>
              {opt}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
function HomeScreen({ words, streak, loading, onStartReview, onSignOut, onSelectWord, onAdd, onToast, userWordIds, featuredWord }) {
  const due     = getDueWords(words);
  const mastered = words.filter(w => w.status === "mastered").length;
  const total   = words.length;

  return (
    <div className="screen" style={{ padding: "24px 20px", paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: T.text }}>Wordsmith</h1>
        <button onClick={onSignOut} title="Sign out" style={{ background: T.surface, borderRadius: 50, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${T.cardBorder}`, cursor: "pointer" }}>
          <Icon name="logout" size={16} color={T.textMuted} />
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 110 }}>
          <div style={{ position: "relative", width: 48, height: 48 }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke={T.cardBorder} strokeWidth="3"/>
              <circle cx="24" cy="24" r="20" fill="none" stroke={T.text} strokeWidth="3"
                strokeDasharray={`${(Math.min(streak, 30) / 30) * 126} 126`}
                strokeLinecap="round" transform="rotate(-90 24 24)"/>
            </svg>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 14, fontWeight: 800, color: T.text }}>{streak}</span>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>Daily streak</p>
            <p style={{ margin: 0, fontSize: 11, color: T.textDim }}>{streak === 1 ? "1 day" : `${streak} days`} strong</p>
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 110 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", width: 36, height: 36 }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke={T.cardBorder} strokeWidth="2.5"/>
                <circle cx="18" cy="18" r="15" fill="none" stroke={T.green} strokeWidth="2.5"
                  strokeDasharray={`${(mastered / Math.max(total, 1)) * 94} 94`}
                  strokeLinecap="round" transform="rotate(-90 18 18)"/>
              </svg>
              <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 10, fontWeight: 800, color: T.green }}>{mastered}</span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>Mastered</p>
              <p style={{ margin: 0, fontSize: 11, color: T.textDim }}>of {total}</p>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 34, fontWeight: 900, color: T.text }}>{total}</span>
              <span style={{ fontSize: 13, color: T.textDim }}>words</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Review CTA */}
      {total > 0 && (
        <Card style={{ border: `1px solid ${due.length > 0 ? "rgba(251,146,60,0.3)" : T.cardBorder}`, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: T.text, fontSize: 16 }}>
                {due.length > 0 ? `${due.length} word${due.length === 1 ? "" : "s"} due` : "All caught up ✓"}
              </p>
              <p style={{ margin: "4px 0 0", color: T.textDim, fontSize: 12 }}>
                {due.length > 0 ? "Ready for review" : "Practice with a quiz anytime"}
              </p>
            </div>
            <button onClick={onStartReview} style={{ background: due.length > 0 ? T.text : T.surface, color: due.length > 0 ? T.bg : T.text, border: due.length > 0 ? "none" : `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {due.length > 0 ? "Start" : "Quiz"}
            </button>
          </div>
        </Card>
      )}

      {/* Daily Quiz Reminder */}
      {!loading && words.length > 0 && (() => {
        const today = new Date().toISOString().split("T")[0];
        const lastQuiz = localStorage.getItem("wordsmith_last_quiz");
        const didToday = lastQuiz === today;
        return (
          <Card style={{ border: didToday ? `1px solid ${T.cardBorder}` : `1px solid rgba(96,165,250,0.4)`, background: didToday ? T.card : "rgba(96,165,250,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 26 }}>{didToday ? "✅" : "🧠"}</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: T.text }}>
                    {didToday ? "Quiz done for today!" : "Daily Quiz"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textDim }}>
                    {didToday ? "Come back tomorrow for more" : "10 questions to keep your memory sharp"}
                  </p>
                </div>
              </div>
              {!didToday && (
                <button onClick={onStartReview} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: T.radiusSm, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Start
                </button>
              )}
            </div>
          </Card>
        );
      })()}

      {/* Daily Challenge */}
      {!loading && <DailyChallenge words={words} onToast={onToast} />}

      {/* Word of the Day */}
      {loading ? <SkeletonCard /> : <WordOfDayCard words={words} featuredWord={featuredWord} onSelect={(w) => onSelectWord({ ...w, _fromScreen: "home" })} />}

      {/* Discover a new word */}
      {!loading && <DiscoverCard userWordIds={userWordIds} onAdd={onAdd} onToast={onToast} onSelectWord={(w) => onSelectWord({ ...w, _fromScreen: "home" })} />}

      {/* Status breakdown */}
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <Card>
          <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: T.text }}>Library breakdown</p>
          {total === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: T.textDim, textAlign: "center", padding: "12px 0" }}>No words yet — tap + to add your first</p>
          ) : (
            Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = words.filter(w => w.status === key).length;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>{cfg.label}</span>
                    <span style={{ fontSize: 12, color: T.textDim }}>{count}</span>
                  </div>
                  <div style={{ background: T.surface, borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{ background: cfg.color, width: `${pct}%`, height: "100%", borderRadius: 6, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              );
            })
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Library Screen ───────────────────────────────────────────────────────────
function LibraryScreen({ words, loading, onSelectWord, onBrowse }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch]  = useState("");
  const filtered = words.filter(w =>
    (filter === "all" || w.status === filter) &&
    w.word.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="screen" style={{ padding: "24px 20px", paddingBottom: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: T.text }}>Library</h1>
        <button onClick={onBrowse} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "7px 14px", color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Browse words
        </button>
      </div>

      <input placeholder="Search words…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 12, background: T.card, color: T.text }} />

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[["all", "All"], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            background: filter === key ? T.text : T.surface, color: filter === key ? T.bg : T.textMuted,
            border: `1px solid ${filter === key ? T.text : T.cardBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {loading
        ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        : filtered.map(word => (
            <Card key={word.id} className="card-clickable" onClick={() => onSelectWord(word)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{word.word}</span>
                    <Badge status={word.status} />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: T.textDim }}>{[word.phonetic || word.ipa, word.partOfSpeech].filter(Boolean).join(" · ")}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textMuted }}>{(word.definition || "").substring(0, 55)}{word.definition?.length > 55 ? "…" : ""}</p>
                </div>
                <span style={{ color: T.textDim, fontSize: 18, marginLeft: 8 }}>&rsaquo;</span>
              </div>
            </Card>
          ))
      }
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ color: T.textDim, margin: "0 0 4px" }}>{words.length === 0 ? "No words yet" : "No words match your search"}</p>
          {words.length === 0 && <p style={{ color: T.textDim, fontSize: 12, margin: 0 }}>Tap + to add your first word</p>}
        </div>
      )}
    </div>
  );
}

// ─── Browse Library Screen ────────────────────────────────────────────────────
function BrowseLibraryScreen({ onBack, onAddWord, userWordIds, onToast, onSelectWord }) {
  const [search, setSearch]  = useState("");
  const [words, setWords]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]  = useState({});

  useEffect(() => {
    supabase.from("words").select("*").order("word")
      .then(({ data, error }) => {
        if (data) setWords(data);
        if (error) onToast("Couldn't load word library", "error");
        setLoading(false);
      });
  }, []);

  const filtered = words.filter(w => w.word.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async (dbWord) => {
    setAdding(p => ({ ...p, [dbWord.id]: true }));
    const ok = await onAddWord(mapDbToWord({ ...dbWord, id: undefined, status: "new", next_review: new Date().toISOString(), interval_days: 0, ease_factor: 2.5, review_count: 0 }));
    setAdding(p => ({ ...p, [dbWord.id]: false }));
    if (ok) onToast(`"${dbWord.word}" added to your library`);
  };

  return (
    <div className="screen" style={{ padding: "24px 20px", paddingBottom: 100 }}>
      <button onClick={onBack} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "8px 14px", color: T.textMuted, cursor: "pointer", marginBottom: 16, fontSize: 13 }}>
        &larr; Back
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: T.text }}>Word Library</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: T.textDim }}>{words.length} curated vocabulary words</p>

      <input placeholder="Search library…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 16, background: T.card, color: T.text }} />

      {loading
        ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        : filtered.map(word => {
            const added = userWordIds?.has(word.word.toLowerCase());
            return (
              <Card key={word.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onSelectWord?.(mapDbToWord({ ...word, status: "new", next_review: new Date().toISOString(), interval_days: 0, ease_factor: 2.5, review_count: 0 }))}>
                    <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 800, color: T.text }}>{word.word}</p>
                    <p style={{ margin: "0 0 4px", fontSize: 11, color: T.textDim }}>{[word.phonetic || word.ipa, word.part_of_speech].filter(Boolean).join(" · ")}</p>
                    <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>{(word.definition || "").substring(0, 60)}{word.definition?.length > 60 ? "…" : ""}</p>
                  </div>
                  <button onClick={() => !added && handleAdd(word)} disabled={added || adding[word.id]}
                    style={{ background: added ? T.greenBg : T.surface, color: added ? T.green : T.textMuted, border: `1px solid ${added ? "rgba(74,222,128,0.3)" : T.cardBorder}`, borderRadius: T.radiusSm, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: added ? "default" : "pointer", marginLeft: 12, flexShrink: 0 }}>
                    {adding[word.id] ? "…" : added ? "Added ✓" : "+ Add"}
                  </button>
                </div>
              </Card>
            );
          })
      }
      {!loading && filtered.length === 0 && <p style={{ textAlign: "center", padding: 40, color: T.textDim }}>No words found</p>}
    </div>
  );
}

// ─── Practice Exercise ───────────────────────────────────────────────────────
function PracticeExercise({ word }) {
  const [answer, setAnswer] = useState(null);
  const [done, setDone]     = useState(false);

  // Memoize fill-in-blank + options so they never reshuffle after an answer is picked
  const { blank, example, options } = useMemo(() => {
    const stem = word.word.toLowerCase().slice(0, 5);
    const ex   = word.examples?.find(e => new RegExp(stem, "i").test(e)) || word.examples[0];
    const b    = ex.replace(new RegExp(`\\b${word.word}\\w*`, "i"), "___________") !== ex
      ? ex.replace(new RegExp(`\\b${word.word}\\w*`, "i"), "___________")
      : ex.replace(new RegExp(stem + "\\w*", "i"), "___________");
    const distractors = [...(word.synonyms || []), ...(word.antonyms || [])].slice(0, 3);
    while (distractors.length < 3) distractors.push(["notion","clarity","burden","virtue","impulse"][distractors.length]);
    return {
      blank:   b,
      example: ex,
      options: [...new Set([word.word, ...distractors.slice(0, 3)])].sort(() => Math.random() - 0.5),
    };
  }, [word.word]);

  if (done) return (
    <Card style={{ background: "rgba(74,222,128,0.04)", border: `1px solid rgba(74,222,128,0.2)` }}>
      <SectionLabel>Practice</SectionLabel>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: T.green, fontWeight: 600 }}>
        {answer === word.word ? "Correct! Well done." : `The answer was: ${word.word}`}
      </p>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>{example /* from useMemo above */}</p>
      <button onClick={() => { setAnswer(null); setDone(false); }}
        style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "6px 14px", fontSize: 12, color: T.textMuted, cursor: "pointer" }}>
        Try again
      </button>
    </Card>
  );

  return (
    <Card style={{ background: "rgba(167,139,250,0.04)", border: `1px solid rgba(167,139,250,0.2)` }}>
      <SectionLabel>Practice</SectionLabel>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: T.text, lineHeight: 1.7, fontStyle: "italic" }}>{blank}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {options.map(opt => (
          <button key={opt} onClick={() => { setAnswer(opt); setDone(true); }}
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "10px 8px", fontSize: 13, fontWeight: 600, color: T.text, cursor: "pointer", textAlign: "center" }}>
            {opt}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─── CEFR badge ───────────────────────────────────────────────────────────────
const CEFR_COLOR = { A1:"#4ade80", A2:"#4ade80", B1:"#60a5fa", B2:"#60a5fa", C1:"#a78bfa", C2:"#f87171" };
function CefrBadge({ level }) {
  if (!level) return null;
  const color = CEFR_COLOR[level] || T.textMuted;
  return (
    <span style={{ background: `${color}18`, color, border: `1px solid ${color}40`, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, letterSpacing: 0.8, textTransform: "uppercase" }}>
      {level}
    </span>
  );
}

// ─── Word Detail Screen ───────────────────────────────────────────────────────
function WordDetailScreen({ word: initialWord, onBack, onAdd, onToast, userWordIds, onWordEnriched }) {
  const [word, setWord]               = useState(initialWord);
  const [enriching, setEnriching]     = useState(false);
  const display = word.phonetic || word.ipa || "";
  const [audioState, setAudioState]   = useState("idle"); // idle | loading | error
  const [addState, setAddState]       = useState("idle"); // idle | adding | added
  const [sentence, setSentence]       = useState("");
  const [checkState, setCheckState]   = useState("idle"); // idle | checking | done
  const [checkResult, setCheckResult] = useState(null);
  const inLibrary = userWordIds?.has(word.word.toLowerCase());

  // Auto-enrich words that are missing key data (seeded words from shared library)
  useEffect(() => {
    const needsEnrich = !word.definition || !word.examples?.length || !word.cefrLevel;
    if (!needsEnrich) return;
    let cancelled = false;
    setEnriching(true);
    fetch(`${API}/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: word.word }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        const enriched = { ...word, ...data };
        setWord(enriched);
        onWordEnriched?.(enriched); // update parent so library/user_words is refreshed
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnriching(false); });
    return () => { cancelled = true; };
  }, [initialWord.word]);

  const handleCheckUsage = async () => {
    if (!sentence.trim() || checkState === "checking") return;
    setCheckState("checking"); setCheckResult(null);
    try {
      const res = await fetch(`${API}/api/check-usage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.word, sentence: sentence.trim(), definition: word.definition }),
      });
      if (!res.ok) throw new Error("check failed");
      setCheckResult(await res.json());
      setCheckState("done");
    } catch {
      setCheckState("idle");
      onToast?.("Could not check usage — try again", "error");
    }
  };

  const playAudio = async () => {
    if (audioState === "loading") return;

    // 1. Try stored URL first
    const tryUrl = (url) => new Promise((resolve, reject) => {
      const a = new Audio(url);
      a.oncanplaythrough = () => { a.play().then(resolve).catch(reject); };
      a.onerror = reject;
    });

    if (word.audioUrl) {
      try { await tryUrl(word.audioUrl); return; } catch { /* fall through */ }
    }

    // 2. Fetch live from Free Dictionary API
    setAudioState("loading");
    try {
      const res  = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.word.toLowerCase())}`);
      const data = await res.json();
      const url  = Array.isArray(data) && data[0]?.phonetics?.find(p => p.audio && p.audio.length > 4)?.audio;
      const fixed = url ? (url.startsWith('//') ? `https:${url}` : url) : null;
      if (fixed) { await tryUrl(fixed); setAudioState("idle"); return; }
    } catch { /* fall through to TTS */ }

    // 3. Web Speech API — zero-cost built-in TTS fallback
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(word.word);
      utt.lang = 'en-US'; utt.rate = 0.85;
      window.speechSynthesis.speak(utt);
      setAudioState("idle"); return;
    }

    setAudioState("error");
  };

  const handleAdd = async () => {
    if (!onAdd || addState !== "idle") return;
    setAddState("adding");
    await onAdd({ ...word, status: "new", nextReview: new Date().toISOString(), interval: 0, easeFactor: 2.5, reviewCount: 0 });
    setAddState("added");
    onToast?.(`"${word.word}" added to your library`);
  };

  return (
    <div className="screen" style={{ paddingBottom: 100 }}>
      <div style={{ background: T.card, padding: "20px 20px 24px", borderBottom: `1px solid ${T.cardBorder}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={onBack} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "8px 14px", color: T.textMuted, cursor: "pointer", fontSize: 13 }}>
            &larr; Back
          </button>
          {onAdd && !inLibrary && (
            <button onClick={handleAdd} disabled={addState !== "idle"}
              style={{ background: addState === "added" ? T.greenBg : T.blue, color: addState === "added" ? T.green : "#fff", border: "none", borderRadius: T.radiusSm, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: addState !== "idle" ? "default" : "pointer", opacity: addState === "adding" ? 0.6 : 1 }}>
              {addState === "adding" ? "Adding…" : addState === "added" ? "Added ✓" : "+ Add to Library"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: T.text }}>{word.word}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 13, color: T.textDim }}>{word.partOfSpeech}</p>
              <CefrBadge level={word.cefrLevel} />
              {enriching && <span style={{ fontSize: 11, color: T.textDim, background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 20, padding: "2px 8px" }}>enriching…</span>}
            </div>
          </div>
          {inLibrary && <Badge status={word.status} />}
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* Pronunciation */}
        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <SectionLabel>Pronunciation</SectionLabel>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{display}</p>
            {word.ipa && word.phonetic && word.ipa !== word.phonetic && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textMuted, fontFamily: "serif" }}>/{word.ipa}/</p>
            )}
          </div>
          {audioState !== "error" && (
            <button onClick={playAudio} disabled={audioState === "loading"}
              style={{ background: T.surface, borderRadius: T.radiusSm, padding: 10, border: `1px solid ${T.cardBorder}`, cursor: audioState === "loading" ? "default" : "pointer", opacity: audioState === "loading" ? 0.5 : 1 }}
              title="Play pronunciation">
              <Icon name="volume" size={18} color={T.blue} />
            </button>
          )}
        </Card>

        {/* Definition */}
        <Card>
          <SectionLabel>Definition</SectionLabel>
          <p style={{ margin: 0, fontSize: 14, color: T.text, lineHeight: 1.7 }}>{word.definition}</p>
        </Card>

        {/* Word Forms */}
        {word.forms?.length > 0 && (
          <Card>
            <SectionLabel>Word Forms</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {word.forms.map(f => <Pill key={f} label={f} color={T.purple} bg={T.purpleBg} />)}
            </div>
          </Card>
        )}

        {/* Examples */}
        {word.examples?.length > 0 && (
          <Card>
            <SectionLabel>Examples</SectionLabel>
            {word.examples.map((ex, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < word.examples.length - 1 ? 10 : 0 }}>
                <span style={{ color: T.textDim, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
                <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>{ex}</p>
              </div>
            ))}
          </Card>
        )}

        {/* Synonyms / Antonyms */}
        {(word.synonyms?.length > 0 || word.antonyms?.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {word.synonyms?.length > 0 && (
              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Synonyms</SectionLabel>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {word.synonyms.map(s => <Pill key={s} label={s} color={T.green} bg={T.greenBg} />)}
                </div>
              </Card>
            )}
            {word.antonyms?.length > 0 && (
              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Antonyms</SectionLabel>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {word.antonyms.map(s => <Pill key={s} label={s} color={T.red} bg={T.redBg} />)}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Collocations */}
        {word.collocations?.length > 0 && (
          <Card>
            <SectionLabel>Common Phrases</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {word.collocations.map(c => <Pill key={c} label={c} color={T.blue} bg={T.blueBg} />)}
            </div>
          </Card>
        )}

        {/* Register */}
        {word.register && (
          <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: T.textMuted, fontWeight: 600 }}>Register</span>
            <Pill label={word.register} color={T.purple} bg={T.purpleBg} />
          </Card>
        )}

        {/* Usage Note */}
        {word.usageNote && (
          <Card style={{ background: "rgba(96,165,250,0.04)", border: `1px solid rgba(96,165,250,0.2)` }}>
            <SectionLabel>Usage Note</SectionLabel>
            <p style={{ margin: 0, fontSize: 13, color: T.blue, lineHeight: 1.6 }}>{word.usageNote}</p>
          </Card>
        )}

        {/* Common Mistake */}
        {word.commonMistake && (
          <Card style={{ background: "rgba(251,146,60,0.06)", border: `1px solid rgba(251,146,60,0.2)` }}>
            <SectionLabel>Common Mistake</SectionLabel>
            <p style={{ margin: 0, fontSize: 13, color: T.orange, lineHeight: 1.6 }}>{word.commonMistake}</p>
          </Card>
        )}

        {/* Memory Hook */}
        {word.memoryHook && (
          <Card style={{ background: "rgba(167,139,250,0.06)", border: `1px solid rgba(167,139,250,0.2)` }}>
            <SectionLabel>Memory Hook</SectionLabel>
            <p style={{ margin: 0, fontSize: 13, color: T.purple, lineHeight: 1.6 }}>{word.memoryHook}</p>
          </Card>
        )}

        {/* Etymology */}
        {word.etymology && (
          <Card>
            <SectionLabel>Etymology</SectionLabel>
            <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{word.etymology}</p>
          </Card>
        )}

        {/* Practice exercise */}
        {word.examples?.length > 0 && <PracticeExercise word={word} />}

        {/* Try a sentence — AI usage checker */}
        <Card style={{ background: "rgba(96,165,250,0.03)", border: `1px solid rgba(96,165,250,0.15)` }}>
          <SectionLabel>Try a sentence</SectionLabel>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: T.textDim }}>
            Write your own sentence using <strong style={{ color: T.text }}>"{word.word}"</strong> — AI will check if you used it correctly.
          </p>
          <textarea
            value={sentence}
            onChange={e => { setSentence(e.target.value); if (checkState === "done") { setCheckState("idle"); setCheckResult(null); } }}
            placeholder={`e.g. "The new policy will ${word.word.toLowerCase()} the problem…"`}
            rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 14, outline: "none", background: T.surface, color: T.text, resize: "none", boxSizing: "border-box", fontFamily: FONT, lineHeight: 1.5, marginBottom: 8 }}
          />
          <button
            onClick={handleCheckUsage}
            disabled={!sentence.trim() || checkState === "checking"}
            style={{ background: T.blue, color: "#fff", border: "none", borderRadius: T.radiusSm, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: (!sentence.trim() || checkState === "checking") ? "default" : "pointer", opacity: (!sentence.trim() || checkState === "checking") ? 0.5 : 1 }}>
            {checkState === "checking" ? "Checking…" : "Check my sentence"}
          </button>

          {checkResult && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12 }}>
              {/* Score bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {[1,2,3,4,5].map(n => (
                    <div key={n} style={{ width: 28, height: 6, borderRadius: 3, background: n <= checkResult.score ? (checkResult.score >= 4 ? T.green : checkResult.score === 3 ? T.orange : T.red) : T.surface }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: checkResult.score >= 4 ? T.green : checkResult.score === 3 ? T.orange : T.red }}>
                  {checkResult.score >= 4 ? "Great use!" : checkResult.score === 3 ? "Almost there" : "Needs work"}
                </span>
              </div>
              {/* Feedback */}
              <p style={{ margin: "0 0 8px", fontSize: 13, color: T.text, lineHeight: 1.6 }}>{checkResult.feedback}</p>
              {/* Corrected sentence */}
              {checkResult.corrected && (
                <div style={{ background: T.greenBg, border: `1px solid rgba(74,222,128,0.2)`, borderRadius: T.radiusSm, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 10, color: T.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Suggested improvement</p>
                  <p style={{ margin: 0, fontSize: 13, color: T.green, lineHeight: 1.6, fontStyle: "italic" }}>"{checkResult.corrected}"</p>
                </div>
              )}
              <button onClick={() => { setSentence(""); setCheckState("idle"); setCheckResult(null); }}
                style={{ background: "none", border: "none", color: T.textDim, fontSize: 11, cursor: "pointer", padding: "6px 0 0", fontWeight: 600 }}>
                Try another sentence →
              </button>
            </div>
          )}
        </Card>

        {/* SRS Stats — only shown for words already in the user's library */}
        {inLibrary && (
          <Card>
            <SectionLabel>SRS Progress</SectionLabel>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[
                { v: word.reviewCount,                    l: "Reviews" },
                { v: `${word.interval}d`,                 l: "Interval" },
                { v: (word.easeFactor || 2.5).toFixed(1), l: "Ease" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.text }}>{s.v}</p>
                  <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>{s.l}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Word Preview Card (Add screen) ──────────────────────────────────────────
function WordPreviewCard({ preview, onSave, saved, saving }) {
  const [audioState, setAudioState] = useState("idle");

  const playAudio = async () => {
    if (audioState === "loading") return;
    const tryUrl = (url) => new Promise((resolve, reject) => {
      const a = new Audio(url); a.oncanplaythrough = () => a.play().then(resolve).catch(reject); a.onerror = reject;
    });
    if (preview.audioUrl) { try { await tryUrl(preview.audioUrl); return; } catch {} }
    setAudioState("loading");
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(preview.word.toLowerCase())}`);
      const data = await res.json();
      const url = Array.isArray(data) && data[0]?.phonetics?.find(p => p.audio && p.audio.length > 4)?.audio;
      const fixed = url ? (url.startsWith('//') ? `https:${url}` : url) : null;
      if (fixed) { await tryUrl(fixed); setAudioState("idle"); return; }
    } catch {}
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(preview.word); u.lang = 'en-US'; u.rate = 0.85;
      window.speechSynthesis.speak(u); setAudioState("idle"); return;
    }
    setAudioState("error");
  };

  const display = preview.phonetic || preview.ipa || "";

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: T.textDim, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 0.8 }}>Preview</p>

      {/* Header card */}
      <Card style={{ background: "rgba(167,139,250,0.04)", border: `1px solid rgba(167,139,250,0.2)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.text }}>{preview.word}</h2>
              <CefrBadge level={preview.cefrLevel} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.textDim }}>{preview.partOfSpeech}</p>
          </div>
          {audioState !== "error" && (
            <button onClick={playAudio} disabled={audioState === "loading"}
              style={{ background: T.surface, borderRadius: T.radiusSm, padding: 10, border: `1px solid ${T.cardBorder}`, cursor: "pointer", flexShrink: 0, opacity: audioState === "loading" ? 0.5 : 1 }}>
              <Icon name="volume" size={18} color={T.blue} />
            </button>
          )}
        </div>
        {display && (
          <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: T.text, fontFamily: "serif" }}>{display}</p>
        )}
      </Card>

      {/* Definition */}
      <Card>
        <SectionLabel>Definition</SectionLabel>
        <p style={{ margin: 0, fontSize: 14, color: T.text, lineHeight: 1.7 }}>{preview.definition}</p>
      </Card>

      {/* Examples */}
      {preview.examples?.length > 0 && (
        <Card>
          <SectionLabel>Examples</SectionLabel>
          {preview.examples.map((ex, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < preview.examples.length - 1 ? 10 : 0 }}>
              <span style={{ color: T.textDim, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
              <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.6, fontStyle: "italic" }}>{ex}</p>
            </div>
          ))}
        </Card>
      )}

      {/* Synonyms / Antonyms */}
      {(preview.synonyms?.length > 0 || preview.antonyms?.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          {preview.synonyms?.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Synonyms</SectionLabel>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {preview.synonyms.map(s => <Pill key={s} label={s} color={T.green} bg={T.greenBg} />)}
              </div>
            </Card>
          )}
          {preview.antonyms?.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Antonyms</SectionLabel>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {preview.antonyms.map(s => <Pill key={s} label={s} color={T.red} bg={T.redBg} />)}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Collocations */}
      {preview.collocations?.length > 0 && (
        <Card>
          <SectionLabel>Common Phrases</SectionLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {preview.collocations.map(c => <Pill key={c} label={c} color={T.blue} bg={T.blueBg} />)}
          </div>
        </Card>
      )}

      {/* Memory Hook */}
      {preview.memoryHook && (
        <Card style={{ background: "rgba(251,146,60,0.06)", border: `1px solid rgba(251,146,60,0.2)` }}>
          <SectionLabel>Memory Hook</SectionLabel>
          <p style={{ margin: 0, fontSize: 13, color: T.orange, lineHeight: 1.6 }}>{preview.memoryHook}</p>
        </Card>
      )}

      {/* Usage note */}
      {preview.usageNote && (
        <Card style={{ background: "rgba(96,165,250,0.04)", border: `1px solid rgba(96,165,250,0.2)` }}>
          <SectionLabel>Usage Note</SectionLabel>
          <p style={{ margin: 0, fontSize: 13, color: T.blue, lineHeight: 1.6 }}>{preview.usageNote}</p>
        </Card>
      )}

      {/* Etymology */}
      {preview.etymology && (
        <Card>
          <SectionLabel>Etymology</SectionLabel>
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{preview.etymology}</p>
        </Card>
      )}

      <button onClick={onSave} disabled={saving || saved}
        style={{ width: "100%", background: saved ? T.green : T.text, color: saved ? "#fff" : T.bg, border: "none", borderRadius: T.radius, padding: "14px", fontSize: 15, fontWeight: 700, cursor: saving || saved ? "default" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
        {saved ? "Saved ✓" : saving ? "Saving…" : "Save to Library"}
      </button>
    </div>
  );
}

// ─── Add Word Screen ──────────────────────────────────────────────────────────
function AddWordScreen({ onAdd, onToast }) {
  const [mode, setMode]           = useState("quick");
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState(null);
  const [saved, setSaved]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [listening, setListening] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [textInput, setTextInput]   = useState("");
  const [textWords, setTextWords]   = useState([]);
  const [loadingText, setLoadingText] = useState(false);
  const [addedTextWords, setAddedTextWords] = useState(new Set());
  const recognitionRef = useRef(null);
  const resetTimerRef  = useRef(null); // tracks the post-save auto-clear timer

  // Cancel the reset timer when the component unmounts
  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);

  const enrichWord = async (word, sentence = null) => {
    // Cancel any pending auto-clear from a previous save so it can't wipe the new preview
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    setLoading(true); setError(null); setPreview(null); setSaved(false);
    try {
      const res = await fetch(`${API}/api/enrich`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, sentence }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || e.detail || `Could not enrich word (${res.status})`);
      }
      const data = await res.json();
      setPreview({ ...data, status: "new", nextReview: new Date().toISOString(), interval: 0, easeFactor: 2.5, reviewCount: 0 });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleQuickAdd = () => { if (input.trim()) enrichWord(input.trim()); };

  const handleSentence = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/extract-word`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: "", sentence: input.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || e.detail || `Could not extract word (${res.status})`);
      }
      const { word } = await res.json();
      if (!word) throw new Error("No word returned from extract API");
      await enrichWord(word, input.trim());
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const handleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition not supported in this browser"); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    recognitionRef.current = r;
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = e => { const t = e.results[0][0].transcript.trim(); setInput(t); setListening(false); if (t.split(" ").length <= 2) enrichWord(t); else setMode("sentence"); };
    r.onerror = () => { setListening(false); setError("Could not recognize speech"); };
    r.onend = () => setListening(false);
    r.start(); setListening(true);
  };

  const handleBatch = async () => {
    const wordList = batchInput.split(/[\n,]+/).map(w => w.trim()).filter(Boolean).slice(0, 10);
    if (!wordList.length) return;
    setLoading(true); setError(null);
    try {
      const results = await Promise.all(
        wordList.map(w =>
          fetch(`${API}/api/enrich`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: w }) })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        )
      );
      const enriched = results.filter(Boolean).map(d => ({ ...d, status: "new", nextReview: new Date().toISOString(), interval: 0, easeFactor: 2.5, reviewCount: 0 }));
      for (const w of enriched) await onAdd(w);
      setSaved(true);
      onToast(`${enriched.length} words added to your library`);
      setTimeout(() => { setSaved(false); setBatchInput(""); }, 1500);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleTextImport = async () => {
    if (!textInput.trim()) return;
    setLoadingText(true); setError(null); setTextWords([]);
    try {
      const extRes = await fetch(`${API}/api/extract-words`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: textInput.trim() }) });
      if (!extRes.ok) {
        const e = await extRes.json().catch(() => ({}));
        throw new Error(e.error || e.detail || `Could not extract vocabulary words (${extRes.status})`);
      }
      const { words: extracted } = await extRes.json();
      const enriched = await Promise.all(
        extracted.map(w =>
          fetch(`${API}/api/enrich`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: w }) })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        )
      );
      setTextWords(enriched.filter(Boolean).map(d => ({ ...d, status: "new", nextReview: new Date().toISOString(), interval: 0, easeFactor: 2.5, reviewCount: 0 })));
    } catch (e) { setError(e.message); }
    finally { setLoadingText(false); }
  };

  const handleAddTextWord = async (tw) => {
    await onAdd(tw);
    setAddedTextWords(p => new Set([...p, tw.word]));
    onToast(`"${tw.word}" added to your library`);
  };

  const handleSave = async () => {
    if (!preview || saving || saved) return;
    setSaving(true);
    await onAdd(preview);
    setSaving(false); setSaved(true);
    onToast(`"${preview.word}" added to your library`);
    // Use ref so enrichWord can cancel this before it wipes a new preview
    resetTimerRef.current = setTimeout(() => {
      setSaved(false); setInput(""); setPreview(null);
      resetTimerRef.current = null;
    }, 1500);
  };

  const modes = [{ id: "quick", label: "Quick" }, { id: "sentence", label: "Sentence" }, { id: "voice", label: "Voice" }, { id: "batch", label: "Batch" }, { id: "text", label: "Import" }];
  const btn = { background: T.text, color: T.bg, border: "none", borderRadius: T.radiusSm, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "12px" };

  return (
    <div className="screen" style={{ padding: "24px 20px", paddingBottom: 100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: T.text }}>Add Word</h1>
      <p style={{ color: T.textDim, fontSize: 13, margin: "0 0 20px" }}>AI enriches every word automatically</p>

      <div className="scroll-tabs" style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {modes.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setPreview(null); setError(null); setTextWords([]); setLoadingText(false); }} style={{
            flexShrink: 0,
            background: mode === m.id ? T.text : T.surface, color: mode === m.id ? T.bg : T.textMuted,
            border: `1px solid ${mode === m.id ? T.text : T.cardBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{m.label}</button>
        ))}
      </div>

      {mode === "quick" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input placeholder="Type a word…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleQuickAdd()}
            style={{ flex: 1, padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", background: T.card, color: T.text }} />
          <button onClick={handleQuickAdd} disabled={loading || !input.trim()} style={{ ...btn, padding: "12px 18px", opacity: loading ? 0.5 : 1 }}>
            {loading ? "…" : "Generate"}
          </button>
        </div>
      )}

      {mode === "sentence" && (
        <div style={{ marginBottom: 16 }}>
          <textarea placeholder="Paste a sentence — AI extracts the best word to learn…" value={input} onChange={e => setInput(e.target.value)}
            rows={3} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", background: T.card, color: T.text, resize: "vertical", boxSizing: "border-box", fontFamily: FONT }} />
          <button onClick={handleSentence} disabled={loading || !input.trim()} style={{ ...btn, width: "100%", marginTop: 8, opacity: loading ? 0.5 : 1 }}>
            {loading ? "Extracting & enriching…" : "Extract word & enrich"}
          </button>
        </div>
      )}

      {mode === "voice" && (
        <div style={{ textAlign: "center", marginBottom: 16, padding: "12px 0" }}>
          <button onClick={handleVoice} style={{ background: listening ? T.red : T.surface, border: `2px solid ${listening ? T.red : T.cardBorder}`, borderRadius: "50%", width: 80, height: 80, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", transition: "background 0.2s" }}>
            <Icon name="mic" size={32} color={listening ? T.text : T.textMuted} />
          </button>
          <p style={{ color: listening ? T.red : T.textDim, fontSize: 13, margin: 0, fontWeight: 600 }}>
            {listening ? "Listening… tap to stop" : "Tap to speak a word"}
          </p>
          {input && !loading && <p style={{ color: T.textMuted, fontSize: 13, marginTop: 12 }}>Heard: <strong style={{ color: T.text }}>{input}</strong></p>}
        </div>
      )}

      {mode === "batch" && (
        <div style={{ marginBottom: 16 }}>
          <textarea placeholder={"Words, one per line:\nresilient\neloquent\ntenacious"} value={batchInput} onChange={e => setBatchInput(e.target.value)}
            rows={5} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", background: T.card, color: T.text, resize: "vertical", boxSizing: "border-box", fontFamily: FONT }} />
          <button onClick={handleBatch} disabled={loading || !batchInput.trim()} style={{ ...btn, width: "100%", marginTop: 8, opacity: loading ? 0.5 : 1 }}>
            {loading ? "Processing…" : `Process ${batchInput.split(/[\n,]+/).filter(w => w.trim()).length || 0} words`}
          </button>
          {saved && <p style={{ color: T.green, fontSize: 13, textAlign: "center", marginTop: 8 }}>All words saved!</p>}
        </div>
      )}

      {mode === "text" && (
        <div style={{ marginBottom: 16 }}>
          <textarea
            placeholder="Paste any text — article, email, book excerpt — AI finds the top vocabulary words to learn…"
            value={textInput} onChange={e => { setTextInput(e.target.value); setTextWords([]); }}
            rows={4} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.cardBorder}`, fontSize: 16, outline: "none", background: T.card, color: T.text, resize: "vertical", boxSizing: "border-box", fontFamily: FONT }} />
          <button onClick={handleTextImport} disabled={loadingText || !textInput.trim()} style={{ ...btn, width: "100%", marginTop: 8, opacity: (loadingText || !textInput.trim()) ? 0.5 : 1 }}>
            {loadingText ? "Analyzing…" : "Find Vocabulary Words"}
          </button>

          {loadingText && (
            <div style={{ marginTop: 16 }}>
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          )}

          {textWords.length > 0 && !loadingText && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 10px", fontWeight: 600 }}>
                Found {textWords.length} vocabulary word{textWords.length !== 1 ? "s" : ""}
              </p>
              {textWords.map(tw => (
                <Card key={tw.word}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{tw.word}</span>
                        {tw.partOfSpeech && <span style={{ fontSize: 10, color: T.textDim }}>{tw.partOfSpeech}</span>}
                      </div>
                      <p style={{ margin: "0 0 3px", fontSize: 11, color: T.textDim }}>{tw.phonetic || tw.ipa}</p>
                      <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                        {(tw.definition || "").substring(0, 90)}{tw.definition?.length > 90 ? "…" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => !addedTextWords.has(tw.word) && handleAddTextWord(tw)}
                      disabled={addedTextWords.has(tw.word)}
                      style={{
                        background: addedTextWords.has(tw.word) ? T.greenBg : T.surface,
                        color: addedTextWords.has(tw.word) ? T.green : T.textMuted,
                        border: `1px solid ${addedTextWords.has(tw.word) ? "rgba(74,222,128,0.3)" : T.cardBorder}`,
                        borderRadius: T.radiusSm, padding: "7px 12px", fontSize: 12, fontWeight: 700,
                        cursor: addedTextWords.has(tw.word) ? "default" : "pointer", marginLeft: 10, flexShrink: 0,
                      }}>
                      {addedTextWords.has(tw.word) ? "Added ✓" : "+ Add"}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <Card style={{ border: `1px solid rgba(248,113,113,0.3)`, background: T.redBg }}><p style={{ margin: 0, fontSize: 13, color: T.red }}>{error}</p></Card>}

      {loading && mode !== "batch" && (
        <Card style={{ textAlign: "center", padding: 32 }}>
          <p style={{ margin: 0, color: T.textMuted, fontSize: 14 }}>AI is enriching your word…</p>
          <p style={{ margin: "4px 0 0", color: T.textDim, fontSize: 11 }}>Definition, examples, pronunciation & more</p>
        </Card>
      )}

      {preview && !loading && mode !== "batch" && (
        <WordPreviewCard preview={preview} onSave={handleSave} saved={saved} saving={saving} />
      )}

      {!loading && !preview && !error && (mode === "quick" || mode === "sentence") && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: T.textDim }}>
          <Icon name="sparkle" size={28} color={T.textDim} />
          <p style={{ fontWeight: 600, margin: "12px 0 4px", color: T.textMuted }}>AI-powered word entry</p>
          <p style={{ fontSize: 12, margin: 0 }}>{mode === "quick" ? "Type any word for instant enrichment" : "Paste a sentence — AI finds the best word to learn"}</p>
        </div>
      )}
      {!loadingText && textWords.length === 0 && !error && mode === "text" && !textInput && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: T.textDim }}>
          <Icon name="book2" size={28} color={T.textDim} />
          <p style={{ fontWeight: 600, margin: "12px 0 4px", color: T.textMuted }}>Import from any text</p>
          <p style={{ fontSize: 12, margin: 0 }}>Paste an article, email, or book excerpt — AI picks the best vocabulary words</p>
        </div>
      )}
    </div>
  );
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function DonutChart({ data, total }) {
  const cx = 55, cy = 55, r = 40;
  const circumference = 2 * Math.PI * r;
  let accumulated = 0;
  return (
    <svg width="110" height="110" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.surface} strokeWidth="12" />
      {total > 0 && data.map(d => {
        if (!d.value) return null;
        const dash = (d.value / total) * circumference;
        const offset = circumference / 4 - accumulated;
        accumulated += dash;
        return (
          <circle key={d.label} cx={cx} cy={cy} r={r}
            fill="none" stroke={d.color} strokeWidth="12"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={offset} />
        );
      })}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={T.text} fontSize="18" fontWeight="800">{total}</text>
    </svg>
  );
}

function getWeeklyData(words, numWeeks = 8) {
  const now = new Date();
  const weeks = Array.from({ length: numWeeks }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - (numWeeks - 1 - i) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, count: 0 };
  });
  for (const w of words) {
    const d = new Date(w.createdAt);
    for (const wk of weeks) {
      if (d >= wk.start && d < wk.end) { wk.count++; break; }
    }
  }
  return weeks;
}

// ─── Stats Screen ─────────────────────────────────────────────────────────────
function StatsScreen({ words, streak }) {
  const total        = words.length;
  const mastered     = words.filter(w => w.status === "mastered").length;
  const totalReviews = words.reduce((s, w) => s + (w.reviewCount || 0), 0);
  const avgInterval  = total ? Math.round(words.reduce((s, w) => s + (w.interval || 0), 0) / total) : 0;

  const statusData = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    label: cfg.label, value: words.filter(w => w.status === key).length, color: cfg.color,
  }));

  const weeklyData = getWeeklyData(words);
  const maxWeekly  = Math.max(...weeklyData.map(w => w.count), 1);

  const hardest = [...words]
    .filter(w => w.reviewCount >= 2)
    .sort((a, b) => a.easeFactor - b.easeFactor)
    .slice(0, 5);

  return (
    <div className="screen" style={{ padding: "24px 20px", paddingBottom: 100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 20px", color: T.text }}>Progress</h1>

      {/* Top stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[
          { label: "Total Words",   value: total,        color: T.text   },
          { label: "Mastered",      value: mastered,     color: T.green  },
          { label: "Day Streak",    value: streak,       color: T.orange },
          { label: "Total Reviews", value: totalReviews, color: T.blue   },
        ].map(s => (
          <Card key={s.label} style={{ textAlign: "center", padding: "16px 12px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 900, color: s.color }}>{s.value}</p>
            <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Status donut */}
      <Card>
        <SectionLabel>Status Breakdown</SectionLabel>
        {total === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: T.textDim, textAlign: "center", padding: "16px 0" }}>Add words to see breakdown</p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <DonutChart data={statusData} total={total} />
            <div style={{ flex: 1 }}>
              {statusData.map(d => (
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: T.textMuted }}>{d.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{d.value}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 8, marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: T.textDim }}>Avg interval</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{avgInterval}d</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Weekly bar chart */}
      <Card>
        <SectionLabel>Words Added (8 Weeks)</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72, marginBottom: 6 }}>
          {weeklyData.map((wk, i) => {
            const isThisWeek = i === weeklyData.length - 1;
            const barH = wk.count ? Math.max(4, Math.round((wk.count / maxWeekly) * 60)) : 0;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {wk.count > 0 && <span style={{ fontSize: 8, color: isThisWeek ? T.blue : T.textDim, fontWeight: 600 }}>{wk.count}</span>}
                <div style={{ width: "100%", background: isThisWeek ? T.blue : T.surface, borderRadius: "3px 3px 0 0", height: barH || 3, opacity: barH ? 1 : 0.3, transition: "height 0.4s ease" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, color: T.textDim }}>8 weeks ago</span>
          <span style={{ fontSize: 9, color: T.blue, fontWeight: 700 }}>This week</span>
        </div>
      </Card>

      {/* Mastery progress bar */}
      {total > 0 && (
        <Card>
          <SectionLabel>Mastery Rate</SectionLabel>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: T.textMuted }}>{mastered} of {total} words mastered</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{Math.round((mastered / total) * 100)}%</span>
          </div>
          <div style={{ background: T.surface, borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{ background: T.green, width: `${(mastered / total) * 100}%`, height: "100%", borderRadius: 6, transition: "width 0.6s ease" }} />
          </div>
        </Card>
      )}

      {/* Streak milestones */}
      {streak > 0 && (() => {
        const MILESTONES = [
          { days: 7,   label: "Week Warrior",   icon: "⚡", color: T.orange },
          { days: 30,  label: "Month Champion",  icon: "🏅", color: T.blue   },
          { days: 100, label: "Century Scholar", icon: "🏆", color: T.purple },
        ];
        return (
          <Card>
            <SectionLabel>Streak Milestones</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MILESTONES.map(m => {
                const achieved = streak >= m.days;
                const pct = Math.min(100, Math.round((streak / m.days) * 100));
                return (
                  <div key={m.days}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 16, opacity: achieved ? 1 : 0.35 }}>{m.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: achieved ? m.color : T.textDim }}>{m.label}</span>
                        {achieved && <span style={{ fontSize: 9, background: m.color, color: T.bg, borderRadius: 10, padding: "1px 7px", fontWeight: 700, textTransform: "uppercase" }}>Unlocked</span>}
                      </div>
                      <span style={{ fontSize: 11, color: T.textDim }}>{streak}/{m.days}d</span>
                    </div>
                    <div style={{ background: T.surface, borderRadius: 6, height: 5, overflow: "hidden" }}>
                      <div style={{ background: achieved ? m.color : T.cardBorder, width: `${pct}%`, height: "100%", borderRadius: 6, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* CEFR Level Distribution */}
      {total > 0 && (() => {
        const CEFR_ORDER  = ["A1","A2","B1","B2","C1","C2"];
        const CEFR_COLOR  = { A1: "#4ade80", A2: "#34d399", B1: "#60a5fa", B2: "#3b82f6", C1: "#a78bfa", C2: "#f87171" };
        const counts      = CEFR_ORDER.reduce((acc, lvl) => ({ ...acc, [lvl]: words.filter(w => w.cefrLevel === lvl).length }), {});
        const labeled     = CEFR_ORDER.filter(lvl => counts[lvl] > 0);
        if (!labeled.length) return null;
        const dominant    = labeled.reduce((a, b) => counts[a] >= counts[b] ? a : b);
        const nextLevel   = CEFR_ORDER[CEFR_ORDER.indexOf(dominant) + 1];
        return (
          <Card>
            <SectionLabel>Vocabulary Level</SectionLabel>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textDim }}>
              Your library is primarily <span style={{ color: CEFR_COLOR[dominant] || T.text, fontWeight: 700 }}>{dominant}</span> level
              {nextLevel ? ` — push toward ${nextLevel} to level up` : " — you've reached the top!"}
            </p>
            {CEFR_ORDER.map(lvl => {
              const count = counts[lvl];
              if (!count) return null;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={lvl} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: CEFR_COLOR[lvl] }}>{lvl}</span>
                    <span style={{ fontSize: 11, color: T.textDim }}>{count} words · {pct}%</span>
                  </div>
                  <div style={{ background: T.surface, borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{ background: CEFR_COLOR[lvl], width: `${pct}%`, height: "100%", borderRadius: 6, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })()}

      {/* Hardest words */}
      {hardest.length > 0 && (
        <Card>
          <SectionLabel>Needs Work</SectionLabel>
          {hardest.map((w, i) => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: i < hardest.length - 1 ? 10 : 0 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.word}</span>
                <span style={{ fontSize: 11, color: T.textDim, marginLeft: 8 }}>{w.reviewCount} review{w.reviewCount !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ background: T.redBg, borderRadius: 20, padding: "3px 10px" }}>
                <span style={{ fontSize: 10, color: T.red, fontWeight: 700 }}>ease {w.easeFactor.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {total === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <Icon name="chart" size={32} color={T.textDim} />
          <p style={{ color: T.textMuted, margin: "12px 0 4px", fontWeight: 600 }}>No data yet</p>
          <p style={{ color: T.textDim, fontSize: 12, margin: 0 }}>Add words and review them to see progress</p>
        </div>
      )}
    </div>
  );
}

// ─── Review Screen ────────────────────────────────────────────────────────────
// Builds a fallback question when a word has no AI bank yet
function buildFallbackQuestion(word, allWords) {
  const def = word.definition || `the word "${word.word}"`;
  const shorten = (s) => { const d = s || ""; return d.length > 80 ? d.slice(0, 77) + "…" : d; };
  const others = [...allWords]
    .filter(w => w.id !== word.id && w.definition)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  // Pad distractors if not enough other words
  while (others.length < 3) others.push({ definition: `not "${word.word}"` });
  const opts = [shorten(def), ...others.map(w => shorten(w.definition))].sort(() => Math.random() - 0.5);
  return {
    type: "DEFINITION",
    question: `What does "${word.word}" mean?`,
    options: opts,
    answer: shorten(def),
    explanation: word.memoryHook || `${word.word}: ${def.split(".")[0]}.`,
  };
}

function ReviewScreen({ words, onUpdateWord, onComplete, onGenerateQuiz }) {
  const ROUND_SIZE = 10; // fixed number of questions per round

  // ── Phase: "pick" → "quiz" → "done"
  const [phase, setPhase]       = useState("pick");
  const [quizMode, setQuizMode] = useState("mixed"); // "flashcard"|"multichoice"|"mixed"

  // ── Quiz state
  const [questions, setQuestions] = useState([]); // array of { word, question, mode }
  const [qIdx, setQIdx]           = useState(0);
  const [answer, setAnswer]       = useState(null);
  const [flipped, setFlipped]     = useState(false);
  const [results, setResults]     = useState([]); // array of { word, question, correct, userAnswer, mode }
  const [roundKey, setRoundKey]   = useState(0);
  const seenQIdx    = useRef(new Map()); // wordId → Set<questionIndex>
  const answeredRef = useRef(false); // prevent double-tap on answer buttons

  const currentQ = questions[qIdx] || null;
  // ── Helpers
  const getNextQuestion = useCallback((word) => {
    const qs = word.quizQuestions || [];
    if (!qs.length) return null;
    const seen = seenQIdx.current.get(word.id) || new Set();
    const unseen = qs.map((q, i) => ({ q, i })).filter(({ i }) => !seen.has(i));
    if (!unseen.length) { seenQIdx.current.set(word.id, new Set()); return getNextQuestion(word); }
    const { q, i } = unseen[Math.floor(Math.random() * unseen.length)];
    seenQIdx.current.set(word.id, new Set([...seen, i]));
    return q;
  }, []);

  // Build a round of ROUND_SIZE questions from the word pool
  const buildRound = useCallback(() => {
    const due = words.filter(w => !w.nextReview || new Date(w.nextReview) <= new Date());
    const pool = due.length > 0 ? due : words;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = [];
    for (let i = 0; i < ROUND_SIZE && shuffled.length > 0; i++) {
      picked.push(shuffled[i % shuffled.length]);
    }
    seenQIdx.current = new Map();
    return picked.map((word, idx) => {
      const freshWord = words.find(w => w.id === word.id) || word;
      const isMC = quizMode === "multichoice" || (quizMode === "mixed" && idx % 2 === 1);
      const mode = quizMode === "flashcard" ? "flashcard" : isMC ? "multichoice" : "flashcard";
      let question = null;
      if (mode === "multichoice") {
        question = getNextQuestion(freshWord) || buildFallbackQuestion(freshWord, words);
        if (!freshWord.quizQuestions?.length) onGenerateQuiz?.(freshWord.id, freshWord).catch(() => {});
      }
      return { word: freshWord, question, mode };
    });
  }, [words, quizMode, getNextQuestion, onGenerateQuiz]);

  // Reset answer state when question changes
  useEffect(() => { setAnswer(null); setFlipped(false); answeredRef.current = false; }, [roundKey, qIdx]);

  // Start quiz
  const startQuiz = useCallback(() => {
    if (!words.length) return;
    const qs = buildRound();
    setQuestions(qs);
    setQIdx(0);
    setResults([]);
    setPhase("quiz");
    setRoundKey(k => k + 1);
  }, [words, buildRound]);

  // Handle answer �� record result, update SRS, advance
  const handleAnswer = (wasCorrect, userAnswer) => {
    if (!currentQ || answeredRef.current) return;
    answeredRef.current = true;
    const { word } = currentQ;
    const updated = scheduleWord(word, wasCorrect ? 3 : 1);
    onUpdateWord(updated);

    setResults(prev => [...prev, {
      word: word.word,
      question: currentQ.question,
      correct: wasCorrect,
      userAnswer,
      mode: currentQ.mode,
    }]);

    setTimeout(() => {
      if (qIdx + 1 >= questions.length) {
        localStorage.setItem("wordsmith_last_quiz", new Date().toISOString().split("T")[0]);
        setPhase("done");
      } else {
        setQIdx(i => i + 1);
      }
    }, 1200);
  };

  // ── Phase: pick ───────────────────────────────────────────────
  if (phase === "pick") {
    if (!words.length) {
      return (
        <div className="screen" style={{ padding: "20px", paddingBottom: 100 }}>
          <button onClick={onComplete} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "8px 14px", color: T.textMuted, cursor: "pointer", marginBottom: 28, fontSize: 13 }}>← Home</button>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: T.text }}>No words to review</h2>
            <p style={{ color: T.textDim, fontSize: 13, margin: "0 0 24px" }}>Add some words to your library first, then come back to quiz yourself.</p>
            <button onClick={onComplete} style={{ background: T.text, color: T.bg, border: "none", borderRadius: T.radiusSm, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Add Words →</button>
          </div>
        </div>
      );
    }
    const modeOptions = [
      { id: "flashcard",   icon: "🃏", label: "Flash Cards",     desc: "See the word, reveal the definition" },
      { id: "multichoice", icon: "🎯", label: "Multiple Choice",  desc: "Pick the right answer from 4 options" },
      { id: "mixed",       icon: "🔀", label: "Mixed",            desc: "Alternates between both types" },
    ];
    const dueCount = words.filter(w => !w.nextReview || new Date(w.nextReview) <= new Date()).length;
    return (
      <div className="screen" style={{ padding: "20px", paddingBottom: 100 }}>
        <button onClick={onComplete} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "8px 14px", color: T.textMuted, cursor: "pointer", marginBottom: 28, fontSize: 13 }}>← Home</button>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, color: T.text }}>Daily Quiz</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: T.textDim }}>
          {ROUND_SIZE} questions{dueCount > 0 ? ` · ${dueCount} word${dueCount !== 1 ? "s" : ""} due` : ""}
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Choose mode</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {modeOptions.map(m => (
            <button key={m.id} onClick={() => setQuizMode(m.id)} style={{
              background: quizMode === m.id ? T.card : T.surface,
              border: `1.5px solid ${quizMode === m.id ? T.text : T.cardBorder}`,
              borderRadius: T.radius, padding: "14px 16px",
              cursor: "pointer", textAlign: "left", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text }}>{m.label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textDim }}>{m.desc}</p>
              </div>
              {quizMode === m.id && <span style={{ color: T.text, fontWeight: 900 }}>✓</span>}
            </button>
          ))}
        </div>
        <button onClick={startQuiz} style={{ width: "100%", background: T.text, color: T.bg, border: "none", borderRadius: T.radiusSm, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          Start Quiz →
        </button>
      </div>
    );
  }

  // ── Phase: done — score screen ────────────────────────────────
  if (phase === "done") {
    const correctCount = results.filter(r => r.correct).length;
    const total = results.length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const grade = pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : pct >= 50 ? "D" : "F";
    const gradeColor = pct >= 80 ? T.green : pct >= 60 ? T.orange : T.red;
    const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📖";
    const message = pct >= 90 ? "Outstanding!" : pct >= 70 ? "Great job!" : pct >= 50 ? "Keep it up!" : "Keep practicing!";

    return (
      <div className="screen" style={{ padding: "28px 20px", paddingBottom: 100 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px", color: T.text }}>{message}</h2>
          <p style={{ color: T.textDim, margin: 0, fontSize: 13 }}>Quiz complete</p>
        </div>

        {/* Score circle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke={T.surface} strokeWidth="8"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke={gradeColor} strokeWidth="8"
                strokeDasharray={`${(pct / 100) * 327} 327`}
                strokeLinecap="round" transform="rotate(-90 60 60)"
                style={{ transition: "stroke-dasharray 1s ease" }}/>
            </svg>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: gradeColor }}>{grade}</p>
              <p style={{ margin: 0, fontSize: 12, color: T.textDim }}>{pct}%</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <Card style={{ textAlign: "center", padding: "14px 8px" }}>
            <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: T.green }}>{correctCount}</p>
            <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>Correct</p>
          </Card>
          <Card style={{ textAlign: "center", padding: "14px 8px" }}>
            <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: T.red }}>{total - correctCount}</p>
            <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>Wrong</p>
          </Card>
          <Card style={{ textAlign: "center", padding: "14px 8px" }}>
            <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: T.blue }}>{total}</p>
            <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>Total</p>
          </Card>
        </div>

        {/* Results breakdown */}
        <Card style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textDim, letterSpacing: 0.8 }}>Results</p>
          {results.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i > 0 ? `1px solid ${T.cardBorder}` : "none" }}>
              <span style={{ fontSize: 16, color: r.correct ? T.green : T.red, flexShrink: 0, fontWeight: 700 }}>
                {r.correct ? "✓" : "✗"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{r.word}</p>
                {r.mode === "multichoice" && !r.correct && r.question && (
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Answer: {r.question.answer}
                  </p>
                )}
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => { setPhase("pick"); setQuestions([]); setResults([]); setQIdx(0); }}
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "12px 20px", color: T.text, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Take Another Quiz
          </button>
          <button onClick={onComplete} style={{ background: T.text, color: T.bg, border: "none", borderRadius: T.radiusSm, padding: "12px 32px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: quiz ───────────────────────────────────────────────
  if (!currentQ) { setPhase("done"); return null; }

  const progress = Math.round(((qIdx + 1) / questions.length) * 100);
  const answered = answer !== null;

  return (
    <div className="screen" style={{ padding: "20px", paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => {
          if (results.length > 0) { localStorage.setItem("wordsmith_last_quiz", new Date().toISOString().split("T")[0]); setPhase("done"); }
          else setPhase("pick");
        }} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: T.radiusSm, padding: "6px 12px", color: T.textMuted, cursor: "pointer", fontSize: 12 }}>
          ← {results.length > 0 ? "End" : "Quit"}
        </button>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{qIdx + 1} / {questions.length}</p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: T.textDim }}>{currentQ.word.word}</p>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: T.green, fontWeight: 700 }}>{results.filter(r => r.correct).length} correct</p>
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ background: T.surface, borderRadius: 6, height: 6, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(90deg, ${T.green}, ${T.blue})`, width: `${progress}%`, height: "100%", borderRadius: 6, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* Flashcard mode */}
      {currentQ.mode === "flashcard" && (
        <>
          <div onClick={() => !answered && setFlipped(f => !f)} style={{
            background: flipped ? T.card : T.surface, border: `1px solid ${T.cardBorder}`,
            borderRadius: 20, padding: "28px 24px", minHeight: 220,
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            textAlign: "center", cursor: answered ? "default" : "pointer", marginBottom: 16, transition: "background 0.2s",
          }}>
            {!flipped ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.textDim, letterSpacing: 1.5, marginBottom: 16 }}>What does this mean?</span>
                <h2 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 6px", color: T.text }}>{currentQ.word.word}</h2>
                <p style={{ margin: 0, fontSize: 13, color: T.textDim }}>{currentQ.word.phonetic || currentQ.word.ipa}</p>
                <p style={{ margin: "20px 0 0", fontSize: 11, color: T.textDim }}>Tap to reveal</p>
              </>
            ) : (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.textDim, letterSpacing: 1.5, marginBottom: 12 }}>{currentQ.word.word}</span>
                <p style={{ fontSize: 15, margin: "0 0 14px", lineHeight: 1.7, color: T.text }}>{currentQ.word.definition}</p>
                {currentQ.word.examples?.[0] && <p style={{ fontSize: 12, color: T.textMuted, margin: 0, fontStyle: "italic" }}>"{currentQ.word.examples[0]}"</p>}
              </>
            )}
          </div>
          {flipped && !answered && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { if (answeredRef.current) return; setAnswer("wrong"); handleAnswer(false, "missed"); }} style={{ flex: 1, background: T.card, border: `1.5px solid ${T.red}`, borderRadius: T.radiusSm, padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.red }}>
                ✗ Missed
              </button>
              <button onClick={() => { if (answeredRef.current) return; setAnswer("correct"); handleAnswer(true, "got it"); }} style={{ flex: 1, background: T.card, border: `1.5px solid ${T.green}`, borderRadius: T.radiusSm, padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.green }}>
                ✓ Got it
              </button>
            </div>
          )}
          {answered && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <p style={{ margin: 0, fontSize: 13, color: answer === "correct" ? T.green : T.red, fontWeight: 700 }}>
                {answer === "correct" ? "Nice! ✓" : "Noted — you'll see this again"}
              </p>
            </div>
          )}
        </>
      )}

      {/* Multiple choice mode */}
      {currentQ.mode === "multichoice" && (() => {
        const q = currentQ.question;
        if (!q) return null;
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.blue, background: `${T.blue}18`, borderRadius: 20, padding: "3px 10px" }}>
                {(q.type || "QUESTION").replace(/_/g, " ")}
              </span>
            </div>
            <Card style={{ padding: 20, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 15, color: T.text, lineHeight: 1.75, fontWeight: 500 }}>{q.question}</p>
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map(opt => {
                const correct  = opt === q.answer;
                const sel      = answer === opt;
                const revealed = answered && correct;
                return (
                  <button key={opt} onClick={() => {
                    if (answeredRef.current) return;
                    setAnswer(opt);
                    handleAnswer(opt === q.answer, opt);
                  }} style={{
                    background: revealed ? T.greenBg : (sel && !correct ? T.redBg : T.card),
                    border: `1.5px solid ${revealed ? T.green : (sel && !correct ? T.red : T.cardBorder)}`,
                    borderRadius: T.radiusSm, padding: "13px 16px",
                    cursor: answered ? "default" : "pointer",
                    fontSize: 14, fontWeight: 500,
                    color: revealed ? T.green : (sel && !correct ? T.red : T.text),
                    textAlign: "left", transition: "background 0.15s",
                  }}>
                    {opt}
                    {revealed && <span style={{ marginLeft: 8, fontWeight: 700 }}>✓</span>}
                    {sel && !correct && <span style={{ marginLeft: 8 }}>✗</span>}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div style={{ marginTop: 14 }}>
                <Card style={{ background: answer === q.answer ? T.greenBg : T.redBg }}>
                  <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: answer === q.answer ? T.green : T.red }}>
                    {answer === q.answer ? "Correct!" : `Answer: ${q.answer}`}
                  </p>
                  {q.explanation && (
                    <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.6 }}>{q.explanation}</p>
                  )}
                </Card>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function VocabApp() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode]       = useState("login");
  const [words, setWords]             = useState([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [screen, setScreen]           = useState("home");
  const [selectedWord, setSelectedWord] = useState(null);
  const [tab, setTab]                 = useState("home");
  const [streak, setStreak]           = useState(0);
  const [toasts, setToasts]           = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [featuredWord, setFeaturedWord] = useState(null);
  const autoStartedRef    = useRef(false);
  const lastStreakDateRef = useRef(null); // prevents redundant streak DB calls within same day

  // ── Toast helper
  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  }, []);

  // ── Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data on user change
  useEffect(() => {
    if (!user) { setWords([]); setStreak(0); return; }
    setWordsLoading(true);
    Promise.all([
      supabase.from("user_words").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("streak").eq("id", user.id).maybeSingle(),
    ]).then(([{ data: wData }, { data: pData }]) => {
      if (wData) {
        // Deduplicate by word text (keeps first/most-recent due to desc order)
        const seen = new Set();
        setWords(wData.map(mapDbToWord).filter(w => {
          const key = w.word.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }));
      }
      if (pData) setStreak(pData.streak || 0);
      setWordsLoading(false);
    });
  }, [user]);

  // ── Onboarding trigger: show when first-time user with no words
  useEffect(() => {
    if (!user || wordsLoading) return;
    if (words.length === 0 && !localStorage.getItem("wordsmith_onboarded")) {
      setShowOnboarding(true);
    }
  }, [user, wordsLoading, words.length]);

  // ── Auto-add starter words for brand new users
  useEffect(() => {
    if (!user || wordsLoading || words.length > 0 || autoStartedRef.current) return;
    autoStartedRef.current = true;
    supabase.from("words").select("*").limit(10).then(async ({ data }) => {
      if (!data?.length) return;
      const rows = data.slice(0, 8).map(w => ({
        ...mapWordToDb(mapDbToWord({ ...w, id: undefined, status: "new", next_review: new Date().toISOString(), interval_days: 0, ease_factor: 2.5, review_count: 0 })),
        user_id: user.id,
      }));
      const { data: inserted } = await supabase.from("user_words").insert(rows).select();
      if (inserted?.length) {
        setWords(inserted.map(mapDbToWord));
        toast(`Welcome! We added ${inserted.length} starter words to get you going`);
      }
    });
  }, [user, wordsLoading, words.length]);

  // Generate 10 quiz questions for a word and save to DB — returns Promise
  const generateQuizQuestions = useCallback(async (wordId, word) => {
    if (!word.definition) return;
    try {
      const res = await fetch(`${API}/api/quiz-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word:         word.word,
          definition:   word.definition,
          examples:     word.examples,
          synonyms:     word.synonyms,
          antonyms:     word.antonyms,
          collocations: word.collocations,
          usageNote:    word.usageNote,
          cefrLevel:    word.cefrLevel,
        }),
      });
      if (!res.ok) return;
      const { questions } = await res.json();
      if (!questions?.length) return;
      await supabase.from("user_words").update({ quiz_questions: questions }).eq("id", wordId);
      setWords(prev => prev.map(w => w.id === wordId ? { ...w, quizQuestions: questions } : w));
    } catch { /* non-critical background task */ }
  }, [user]);

  const handleAddWord = async (newWord) => {
    const { data, error } = await supabase
      .from("user_words")
      .insert({ ...mapWordToDb(newWord), user_id: user.id })
      .select().single();
    if (error) {
      const msg = error.code === "23505" ? `"${newWord.word}" is already in your library` : "Failed to save word";
      toast(msg, error.code === "23505" ? "warning" : "error");
      return false; // signal failure so callers don't show their own toast
    }
    if (data) {
      const mapped = mapDbToWord(data);
      setWords(prev => [mapped, ...prev]);
      generateQuizQuestions(mapped.id, { ...newWord, id: mapped.id });
    }
    return true; // success
  };

  const handleUpdateWord = async (updated) => {
    // Only update the SRS scheduling fields — avoids schema errors on content columns
    const srsFields = {
      status:        updated.status       || "learning",
      next_review:   updated.nextReview   || new Date().toISOString(),
      interval_days: updated.interval     ?? 0,
      ease_factor:   updated.easeFactor   ?? 2.5,
      review_count:  updated.reviewCount  ?? 0,
    };
    const { error } = await supabase
      .from("user_words")
      .update(srsFields)
      .eq("id", updated.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("handleUpdateWord:", error.code, error.message, error.details);
      toast(`Sync: ${error.message}`, "warning");
    }
    setWords(prev => prev.map(w => w.id === updated.id ? updated : w));

    // Update streak — at most once per calendar day (avoids 50+ DB calls in a quiz session)
    const today = new Date().toISOString().split("T")[0];
    if (lastStreakDateRef.current === today) return;
    lastStreakDateRef.current = today;
    const { data: p } = await supabase.from("profiles").select("streak, last_review_date").eq("id", user.id).maybeSingle();
    if (!p || p.last_review_date !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const s = p?.last_review_date === yesterday ? (p.streak || 0) + 1 : 1;
      await supabase.from("profiles").upsert({ id: user.id, streak: s, last_review_date: today });
      setStreak(s);
    }
  };

  const handleSignOut = () => { supabase.auth.signOut(); setScreen("home"); setTab("home"); };

  const navigateTo = (t) => { setTab(t); setScreen(t); setSelectedWord(null); };

  const selectWord = (w) => { setSelectedWord(w); setScreen("word"); };

  // Memoized — prevents DiscoverCard's useEffect from re-firing on every parent render
  const userWordIds = useMemo(() => new Set(words.map(w => w.word.toLowerCase())), [words]);

  // ── Featured word: fresh random word from shared library, never repeating seen ones
  // Must be declared AFTER userWordIds (used in deps array — TDZ otherwise)
  useEffect(() => {
    if (!user) return;
    const SEEN_KEY = `wordsmith_seen_featured_${user.id}`;
    const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));

    const fetchFeatured = async (attempt = 0) => {
      if (attempt >= 3) { localStorage.removeItem(SEEN_KEY); seen.clear(); }

      const offset = Math.floor(Math.random() * 470);
      const { data } = await supabase
        .from("words")
        .select("word, phonetic, ipa, part_of_speech, definition, cefr_level, memory_hook, examples, synonyms")
        .not("definition", "is", null)
        .range(offset, offset + 9);

      if (!data?.length) return;

      const pick = data
        .map(mapDbToWord)
        .find(w => !userWordIds.has(w.word.toLowerCase()) && !seen.has(w.word.toLowerCase()));

      if (!pick) { fetchFeatured(attempt + 1); return; }

      seen.add(pick.word.toLowerCase());
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
      setFeaturedWord(pick);
    };

    fetchFeatured();
  }, [user, userWordIds]);

  if (authLoading) return <LoadingScreen />;
  if (!user) return <AuthScreen mode={authMode} onToggleMode={() => setAuthMode(m => m === "login" ? "signup" : "login")} />;

  return (
    <div style={{ maxWidth: 390, margin: "0 auto", background: T.bg, minHeight: "100vh", position: "relative", fontFamily: FONT }}>

      {/* Onboarding overlay */}
      {showOnboarding && (
        <OnboardingModal onDone={() => { localStorage.setItem("wordsmith_onboarded", "1"); setShowOnboarding(false); }} />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />

      {/* Screens */}
      {screen === "home" && (
        <HomeScreen words={words} streak={streak} loading={wordsLoading} onStartReview={() => setScreen("review")} onSignOut={handleSignOut} onSelectWord={(w) => { setSelectedWord({ ...w, _fromScreen: "home" }); setScreen("word"); }} onAdd={handleAddWord} onToast={toast} userWordIds={userWordIds} featuredWord={featuredWord} />
      )}
      {screen === "library" && !selectedWord && (
        <LibraryScreen words={words} loading={wordsLoading} onSelectWord={selectWord} onBrowse={() => setScreen("browse")} />
      )}
      {screen === "browse" && (
        <BrowseLibraryScreen onBack={() => setScreen("library")} onAddWord={handleAddWord} userWordIds={userWordIds} onToast={toast}
          onSelectWord={(w) => { setSelectedWord({ ...w, _fromScreen: "browse" }); setScreen("word"); }} />
      )}
      {screen === "word" && selectedWord && (
        <WordDetailScreen word={selectedWord} onBack={() => { setScreen(selectedWord._fromScreen || "library"); setSelectedWord(null); }}
          onAdd={handleAddWord} onToast={toast} userWordIds={userWordIds}
          onWordEnriched={(enriched) => {
            // Update user_words row if this word is in the user's library
            const existing = words.find(w => w.word.toLowerCase() === enriched.word.toLowerCase());
            if (existing) {
              supabase.from("user_words").update(mapWordToDb({ ...existing, ...enriched })).eq("id", existing.id).then(() => {});
              setWords(prev => prev.map(w => w.id === existing.id ? { ...w, ...enriched } : w));
            }
            // Keep selectedWord updated so the detail screen doesn't revert
            setSelectedWord(prev => ({ ...prev, ...enriched }));
          }}
        />
      )}
      {screen === "add" && <AddWordScreen onAdd={handleAddWord} onToast={toast} />}
      {screen === "stats" && <StatsScreen words={words} streak={streak} />}
      {screen === "review" && (
        <ReviewScreen words={words} onUpdateWord={handleUpdateWord} onComplete={() => { navigateTo("home"); }} onGenerateQuiz={generateQuizQuestions} />
      )}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 390, background: T.card, borderTop: `1px solid ${T.cardBorder}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", padding: "6px 0 18px" }}>
        {[
          { id: "home",    icon: "home",  label: "Home" },
          { id: "library", icon: "book",  label: "Library" },
          { id: "add",     icon: "plus",  label: "Add" },
          { id: "stats",   icon: "chart", label: "Stats" },
          { id: "review",  icon: "zap",   label: "Review" },
        ].map(item => (
          <button key={item.id} onClick={() => navigateTo(item.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0" }}>
            {item.id === "add" ? (
              <div style={{ background: T.text, borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", marginTop: -10 }}>
                <Icon name="plus" size={20} color={T.bg} />
              </div>
            ) : (
              <Icon name={item.icon} size={20} color={tab === item.id ? T.text : T.textDim} />
            )}
            <span style={{ fontSize: 10, fontWeight: 600, color: tab === item.id ? T.text : T.textDim }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
