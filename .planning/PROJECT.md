# Project: Wordsmith

## What This Is
A mobile-style (390px) AI-powered vocabulary learning app. Users build a personal word library enriched by AI (definition, phonetic, IPA, examples, synonyms, antonyms, memory hook) and review words using spaced repetition (SM-2 algorithm).

## Core Value
Help users — especially content creators and non-native English speakers — build a rich active vocabulary through daily review. AI does all the word enrichment work; users just show up.

## Stack
- **Frontend**: React 19 + Vite, single App.jsx, inline styles, mobile-first
- **Backend**: FastAPI (Python) + Google Gemini 2.0 Flash
- **DB (planned)**: Supabase (Postgres + Auth + RLS)

## Key Features (v1 shipped)
- 5 screens: Home, Library, Word Detail, Add Word, Review
- Add modes: quick type, paste sentence, voice input, batch
- Review modes: flashcard, multiple-choice quiz, digest
- SM-2 spaced repetition scheduling
- localStorage persistence (temporary)

## Current Pain Points
- Words stored in localStorage — lost if browser cleared, no cross-device sync
- No user accounts — can't save progress server-side
- Gemini API is the only word data source (costs money, requires key)
- No shared/starter word database
- Streak is computed from localStorage activity log
