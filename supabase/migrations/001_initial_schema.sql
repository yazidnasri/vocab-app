-- ═══════════════════════════════════════════════════════════════
-- Wordsmith — Initial Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Shared word library ────────────────────────────────────
-- Seeded with curated vocabulary. Read-only for users.
create table if not exists public.words (
  id           uuid default gen_random_uuid() primary key,
  word         text not null,
  phonetic     text,
  ipa          text,
  part_of_speech text,
  definition   text,
  forms        text[] default '{}',
  examples     text[] default '{}',
  synonyms     text[] default '{}',
  antonyms     text[] default '{}',
  register     text,
  memory_hook  text,
  audio_url    text,
  created_at   timestamptz default now()
);

create index if not exists words_word_idx on public.words (lower(word));

-- ─── 2. User word collections + SRS state ─────────────────────
create table if not exists public.user_words (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  word           text not null,
  phonetic       text,
  ipa            text,
  part_of_speech text,
  definition     text,
  forms          text[] default '{}',
  examples       text[] default '{}',
  synonyms       text[] default '{}',
  antonyms       text[] default '{}',
  register       text,
  memory_hook    text,
  audio_url      text,
  -- SRS scheduling (SM-2 algorithm)
  status         text default 'new' check (status in ('new', 'learning', 'reviewing', 'mastered')),
  next_review    timestamptz default now(),
  interval_days  integer default 0,
  ease_factor    decimal(4,2) default 2.5,
  review_count   integer default 0,
  created_at     timestamptz default now()
);

create index if not exists user_words_user_id_idx on public.user_words (user_id);
create index if not exists user_words_next_review_idx on public.user_words (user_id, next_review);

-- ─── 3. User profiles (streak tracking) ───────────────────────
create table if not exists public.profiles (
  id               uuid references auth.users(id) on delete cascade primary key,
  streak           integer default 0,
  last_review_date date,
  created_at       timestamptz default now()
);

-- ─── 4. Enable Row Level Security ──────────────────────────────
alter table public.words      enable row level security;
alter table public.user_words enable row level security;
alter table public.profiles   enable row level security;

-- ─── 5. RLS Policies ──────────────────────────────────────────

-- words: public read (anyone can browse the library)
create policy "words are publicly readable"
  on public.words for select
  to authenticated, anon
  using (true);

-- user_words: users can only access their own rows
create policy "user_words: own rows only"
  on public.user_words for all
  to authenticated
  using  ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- profiles: users can only access their own profile
create policy "profiles: own row select"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "profiles: own row update"
  on public.profiles for update
  to authenticated
  using  ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "profiles: own row insert"
  on public.profiles for insert
  to authenticated
  with check ( (select auth.uid()) = id );

-- ─── 6. Auto-create profile on signup ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
