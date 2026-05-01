-- Store pre-generated quiz questions per user word
ALTER TABLE public.user_words
  ADD COLUMN IF NOT EXISTS quiz_questions jsonb DEFAULT '[]';
