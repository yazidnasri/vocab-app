# State: Wordsmith

## Current Position

Phase: 6 of 6 (deploy)
Plan: Complete
Status: All phases implemented — ready for Supabase project creation + deploy
Last activity: 2026-04-12 - v2.0 Connected fully implemented

Progress: ██████████ 100%

## Active Context

### What Was Built (v2.0 Connected)

All 6 phases implemented in one pass:

**Phase 1 — Supabase Schema** ✅
- `supabase/migrations/001_initial_schema.sql`: words, user_words, profiles tables
- RLS policies (user_words: own rows only, words: public read, profiles: own row)
- Auto-create profile trigger on user signup
- Indexes on user_id and next_review columns

**Phase 2 — Auth** ✅
- `src/lib/supabase.js`: Supabase client singleton
- AuthScreen component (email/password, login/signup toggle)
- LoadingScreen for initial session check
- onAuthStateChange listener in VocabApp
- Sign-out via logout icon in HomeScreen header

**Phase 3 — Free Dictionary API** ✅
- `server/main.py` updated: fetch_free_dict() calls api.dictionaryapi.dev
- Hybrid: Free Dict API for basic data → Gemini fills gaps (phonetic, forms, register, memoryHook)
- Full Gemini fallback if Free Dict API fails
- Works without Gemini API key (uses Free Dict + defaults)
- Added httpx for async HTTP calls

**Phase 4 — Data Migration** ✅
- Replaced all localStorage with Supabase queries
- mapDbToWord / mapWordToDb mapper functions (snake_case ↔ camelCase)
- handleAddWord: supabase.insert()
- handleUpdateWord: supabase.update() + streak upsert
- Load words on user change: supabase.select()
- Real streak computed from profiles.last_review_date

**Phase 5 — Word Library** ✅
- `server/seed_words.py`: fetches ~250 words from Free Dict API, inserts to Supabase
- BrowseLibraryScreen: shows shared words table, lets users add to their list
- "Browse words" button in LibraryScreen header
- Duplicate detection: userWordIds set prevents re-adding

**Phase 6 — Deploy** ✅
- `server/Dockerfile`: Python 3.11-slim, uvicorn
- `vercel.json`: Vite build config + SPA rewrite rules
- `SETUP.md`: complete deployment instructions
- `.env.example`: all required variables documented
- CORS: ALLOWED_ORIGINS env var for production lockdown

## Decisions Made

- Fully denormalized user_words (no FK to words table) — simpler queries, no joins in RLS
- @supabase/supabase-js v2 (JS client)
- Free Dictionary API as primary source — no API key, always available
- Gemini optional — app works without it (reduced features)
- Vercel for frontend (static), Railway for FastAPI (Docker)
- No routing library — screen-based nav kept (no breaking changes)

## Blockers/Concerns Carried Forward
- User needs to manually create Supabase project and run migration SQL
- Email confirmation in Supabase may require configuring Site URL
- Gemini API key needed for memory hooks, word forms, simplified phonetics

## Session Continuity

Last session: 2026-04-12
Stopped at: Full v2.0 implementation complete
Resume file: None
