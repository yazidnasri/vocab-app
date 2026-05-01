-- Run this in Supabase SQL Editor after 001_initial_schema.sql
alter table public.words      add column if not exists etymology text;
alter table public.user_words add column if not exists etymology text;
