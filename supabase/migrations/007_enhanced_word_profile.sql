-- ═══════════════════════════════════════════════════════════════
-- Wordsmith — Enhanced word profile
-- Adds: simple_definition, grammar_note, word_family
-- ═══════════════════════════════════════════════════════════════

-- Shared word library
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS simple_definition text,
  ADD COLUMN IF NOT EXISTS grammar_note      text,
  ADD COLUMN IF NOT EXISTS word_family       jsonb DEFAULT '[]';

-- User word collections
ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS simple_definition text,
  ADD COLUMN IF NOT EXISTS grammar_note      text,
  ADD COLUMN IF NOT EXISTS word_family       jsonb DEFAULT '[]';
