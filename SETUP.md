# Wordsmith — Setup & Deployment Guide

## Free Stack (no credit card required)

| Service | Purpose | Free Tier |
|---|---|---|
| [Supabase](https://supabase.com) | Database + Auth | 500MB DB, 50k users |
| [Vercel](https://vercel.com) | Frontend + API functions | Unlimited hobby |
| [Google AI Studio](https://aistudio.google.com) | Gemini API key | 15 req/min, free |
| Free Dictionary API | Word data (no key!) | Always free |

---

## 1. Supabase Setup (5 min)

1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Then run `supabase/migrations/002_add_etymology.sql`
4. Go to **Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY` (seed script only, never in client)

## 2. Gemini API Key (optional but recommended, 2 min)

1. Go to [aistudio.google.com](https://aistudio.google.com) → Get API key
2. Copy the key → `GEMINI_API_KEY`

Without this key the app still works — words come from the Free Dictionary API. You just won't get simplified phonetics, memory hooks, or word forms.

## 3. Seed the Word Library (optional)

Adds ~250 curated vocabulary words so users have something to browse from day one.

```bash
cd server
pip install httpx python-dotenv

export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_KEY=your-service-role-key
python seed_words.py
```

## 4. Deploy to Vercel (3 min)

Everything — frontend + API functions — deploys to Vercel in one step.

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Add these **Environment Variables** in the Vercel dashboard:

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
   | `GEMINI_API_KEY` | Your Gemini key (optional) |

4. Click **Deploy** — done.

Vercel auto-detects Vite for the frontend and serves `api/*.js` files as serverless functions.

## 5. Local Development

For local dev, use `vercel dev` — it runs the frontend and API functions together:

```bash
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

npx vercel dev   # → http://localhost:3000
```

If you don't have the Vercel CLI: `npm install -g vercel` then `vercel login`.

> **Alternative:** `npm run dev` works for the frontend only (word enrichment API calls will fail). Good enough for UI work.

## 6. Supabase Production Checklist

- [ ] **Auth → URL Configuration**: Set Site URL to your Vercel URL (e.g. `https://wordsmith.vercel.app`)
- [ ] **Auth → Email**: Decide if email confirmation is required
- [ ] **RLS**: All tables have RLS enabled (done automatically in migration)
- [ ] **service_role key**: Never committed to git or exposed in client

## Architecture

```
Browser (Vercel CDN)
  ├── Supabase JS client → Supabase (auth + user_words + profiles)
  └── /api/enrich        → Vercel Serverless Function
  └── /api/extract-word  → Vercel Serverless Function
        ├── Free Dictionary API (no key needed)
        └── Gemini 2.0 Flash (optional, fills gaps + fallback)
```

No separate server. No Railway. No Docker. Everything on Vercel's free tier.
