# Phase 1: Supabase Schema - Research

**Researched:** 2026-04-12
**Domain:** Supabase Postgres schema design + Row Level Security
**Confidence:** HIGH

## Summary

Supabase provides a Postgres DB with built-in auth.users table. RLS policies use `auth.uid()` to scope rows to the current user. The standard pattern for a vocabulary app is: a shared `words` table (public read, admin write) and a `user_words` table (per-user, full CRUD via RLS).

**Primary recommendation:** Fully denormalize user word data in `user_words` (no join to `words`), use `(select auth.uid())` in policies (not bare `auth.uid()`—the subquery prevents per-row re-evaluation), and index `user_id` columns.

## Standard Stack

| Library | Purpose |
|---------|---------|
| @supabase/supabase-js v2 | JS client |
| Supabase Postgres | DB + auth.users |
| RLS policies | Row-level authorization |

## Architecture: Schema Design

```
words          — shared library (public read, service-role write)
user_words     — per-user word list + SRS state (RLS: own rows only)
profiles       — user profile (streak, last_review_date) (RLS: own row)
```

**Why denormalize user_words?** Avoids joins in RLS policies (joins in policies cause full table scans). User can also have words not in the shared library (custom words).

## RLS Patterns

```sql
-- Performance: use (select auth.uid()) not bare auth.uid()
-- Bare auth.uid() is evaluated per-row; subquery is evaluated once

-- User-owned rows
create policy "own rows only"
on user_words for all
to authenticated
using ( (select auth.uid()) = user_id )
with check ( (select auth.uid()) = user_id );

-- Public read
create policy "public read"
on words for select
to authenticated, anon
using ( true );
```

## Common Pitfalls

1. **Missing index on user_id** — 100x+ performance hit on large tables. Always `create index on user_words(user_id)`.
2. **Bare auth.uid() in policies** — Use `(select auth.uid())` to prevent per-row re-evaluation.
3. **No RLS on tables** — Any table without RLS is fully public via the anon key. Enable RLS on every table.
4. **Testing in SQL Editor** — SQL editor bypasses RLS. Test via client SDK only.
5. **service_role key in client** — Service role bypasses RLS. Never use it in frontend code.

## Trigger Pattern (auto-create profile)

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
