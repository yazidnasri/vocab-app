-- ═══════════════════════════════════════════════════════════════
-- Wordsmith — Enriched word fields + duplicate prevention
-- ═══════════════════════════════════════════════════════════════

-- Add richer learning fields to shared library
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS collocations  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_note    text,
  ADD COLUMN IF NOT EXISTS cefr_level    text;

-- Add richer learning fields to user word collections
ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS collocations  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_note    text,
  ADD COLUMN IF NOT EXISTS cefr_level    text;

-- Deduplicate existing rows before adding unique constraint
-- Keep the row with the highest review_count (or latest created_at as tiebreaker)
DELETE FROM public.user_words
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, word) id
  FROM public.user_words
  ORDER BY user_id, word, review_count DESC, created_at ASC
);

-- Prevent duplicate words per user going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_words_unique_word'
  ) THEN
    ALTER TABLE public.user_words
      ADD CONSTRAINT user_words_unique_word UNIQUE (user_id, word);
  END IF;
END $$;
