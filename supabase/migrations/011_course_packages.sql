-- Course Design: a package of existing courses, taken in a set order.
--
-- One row per package. course_ids is the ordered list of course ids; each course stays an ordinary course (its own
-- lessons, quiz and training record), the package only chooses and orders them.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run. Nothing is dropped.

create table if not exists public.course_packages (
  id          text primary key,
  title       text not null,
  description text not null default '',
  course_ids  text[] not null default '{}',
  sequential  boolean not null default false,
  is_published boolean not null default false,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  extra       jsonb
);

-- Deny-all, like every table: the browser never holds a database key, so no policy is created.
alter table public.course_packages enable row level security;
alter table public.course_packages force row level security;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select relname, relrowsecurity from pg_class
--   where relname = 'course_packages';                   -- expect relrowsecurity = true
