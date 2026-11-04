-- Learners' feedback on a course (stars and a comment), written after they finish it.
--
-- One row per learner per course (id = "<uid>_<courseId>"); saving again edits it. Only the learner who
-- wrote it and a super_admin can read it — the rule is in policies.ts, and the table itself is closed to
-- everyone but the server like every other table here.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run. Nothing is dropped.

create table if not exists public.learner_feedback (
  id           text primary key,
  uid          text not null,
  course_id    text not null,
  course_title text not null default '',
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  extra        jsonb
);

create index if not exists learner_feedback_course_idx on public.learner_feedback (course_id);
create index if not exists learner_feedback_uid_idx on public.learner_feedback (uid);

-- Deny-all, like every table: the browser never holds a database key, so no policy is created.
alter table public.learner_feedback enable row level security;
alter table public.learner_feedback force row level security;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select relname, relrowsecurity from pg_class
--   where relname = 'learner_feedback';                  -- expect relrowsecurity = true
