-- Add common_mistake column to both tables (missed in migration 004)
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS common_mistake text;

ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS common_mistake text;
