-- Course Design now owns who a course is for and when it opens: add the audience and the dates to course_packages.
--
-- assigned_user_ids        the people named one by one, plus the snapshot of whoever the conditions picked
-- assigned_departments     whole departments the audience follows
-- assigned_team_ids        individual teams the audience follows
-- target_roles             the role fallback (only a package made from an older course carries any)
-- start_date / end_date    when the package opens and closes (null = open at once / no deadline)
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run (after 011).
-- Safe to re-run. Nothing is dropped.

alter table public.course_packages
  add column if not exists assigned_user_ids    text[] not null default '{}',
  add column if not exists assigned_departments text[] not null default '{}',
  add column if not exists assigned_team_ids    text[] not null default '{}',
  add column if not exists target_roles         text[] not null default '{}',
  add column if not exists start_date           timestamptz,
  add column if not exists end_date             timestamptz;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--   where table_name = 'course_packages' order by ordinal_position;
