# Roadmap: Wordsmith

## Overview

Wordsmith starts as a localStorage-only vocab app. v2.0 "Connected" migrates it to a real backend: Supabase for auth + persistent storage, a free dictionary API to reduce Gemini dependency, a seeded shared word library, and production deployment.

## Domain Expertise

None configured.

## Milestones

- 🚧 **v2.0 Connected** - Phases 1-6 (in progress)

## Phases

### 🚧 v2.0 Connected (In Progress)

**Milestone Goal:** Replace localStorage with Supabase, add user auth, integrate a free dictionary API, seed a starter word library, and deploy to production.

#### Phase 1: supabase-schema

**Goal**: Set up Supabase project, design and apply DB schema (users, words, user_words with SRS state), enable RLS policies
**Depends on**: Nothing (first phase)
**Research**: Likely (new Supabase project setup, RLS patterns)
**Research topics**: Supabase schema design for per-user word lists + shared word library, RLS policy patterns
**Plans**: TBD

Plans:
- [ ] 01-01: TBD (run /gsd:plan-phase 1 to break down)

#### Phase 2: auth

**Goal**: Add Supabase Auth (email/password + Google OAuth) to the React app — signup, login, session persistence, protected routes
**Depends on**: Phase 1
**Research**: Likely (Supabase Auth JS SDK v2 patterns, React session management)
**Research topics**: @supabase/supabase-js v2 auth hooks, session persistence, Google OAuth setup
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

#### Phase 3: dictionary-api

**Goal**: Integrate Free Dictionary API (api.dictionaryapi.dev) as the primary word data source; use Gemini only as fallback/enrichment for missing fields
**Depends on**: Phase 1
**Research**: Likely (Free Dictionary API response shape, field mapping to our word model)
**Research topics**: api.dictionaryapi.dev response format, coverage gaps, how to merge with Gemini enrichment
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

#### Phase 4: data-migration

**Goal**: Replace all localStorage reads/writes with Supabase queries; migrate existing word state to the DB; real-time sync across tabs/devices
**Depends on**: Phases 1, 2, 3
**Research**: Unlikely (Supabase client CRUD is straightforward once schema is set)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

#### Phase 5: word-library

**Goal**: Seed Supabase with a curated shared word library (500-1000 common advanced English words); let users browse and add from it without needing AI
**Depends on**: Phase 4
**Research**: Likely (sourcing word list, batch seeding strategy, Free Dictionary API bulk fetch)
**Research topics**: Public domain word lists (GRE, IELTS, academic), bulk Supabase insert patterns
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

#### Phase 6: deploy

**Goal**: Deploy frontend to Vercel/Netlify, configure production Supabase env vars, lock down CORS/RLS, add rate limiting to FastAPI
**Depends on**: Phases 4, 5
**Research**: Likely (Vercel deploy config for Vite, Railway/Render for FastAPI, Supabase prod checklist)
**Research topics**: Vercel env vars for Vite, FastAPI rate limiting (slowapi), Supabase prod hardening
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. supabase-schema | v2.0 | 0/? | Not started | - |
| 2. auth | v2.0 | 0/? | Not started | - |
| 3. dictionary-api | v2.0 | 0/? | Not started | - |
| 4. data-migration | v2.0 | 0/? | Not started | - |
| 5. word-library | v2.0 | 0/? | Not started | - |
| 6. deploy | v2.0 | 0/? | Not started | - |
