-- Core schema — the Firestore collections, as Postgres tables.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is guarded.
--
-- ── Three decisions this file encodes ───────────────────────────────────────
--
-- 1. HYBRID COLUMNS, NOT FULL NORMALIZATION.
--    A field becomes a real column when something filters, sorts, joins or
--    reports on it. Everything else stays in a jsonb blob, because the app
--    reads those documents whole and never looks inside them: a course's
--    topics[].lessons[] and an assessment's questions[].choices[] are loaded,
--    edited and saved as one unit by the builder UI. Normalizing them would
--    buy referential integrity the app never asks for, and cost a 3-table
--    join plus a reassembly step on every read.
--
--    Where a jsonb column exists, the TypeScript interface in src/types/ is
--    the schema. Postgres only guarantees it is valid JSON.
--
-- 2. DENY-ALL RLS. Firebase Auth stays (plan ก), so Postgres has no idea who
--    `uid` is — auth.uid() is null for every request this app makes. Rather
--    than write policies against an identity the database cannot see, every
--    table has RLS enabled and NO policy, which denies the anon and
--    authenticated keys outright. All access goes through Next.js API routes
--    holding the service_role key, which bypasses RLS and does its own
--    Firebase-token + RBAC check first. That is already how the 16 existing
--    API routes work, so this matches the architecture rather than fighting
--    it.
--
--    ⚠ The service_role key must never reach the browser. It belongs in a
--    server-only env var (no NEXT_PUBLIC_ prefix).
--
-- 3. NO REALTIME. onSnapshot is not carried over; reads become fetch-on-mount
--    plus an explicit refetch after a write. Nothing here is published to the
--    `supabase_realtime` publication.
--
-- ── Conventions ─────────────────────────────────────────────────────────────
--
-- · ids are `text`, not uuid: they carry over verbatim from Firestore, and
--   several are deterministic composites the app rebuilds client-side
--   (`{uid}_{courseId}`, `{uid}_{subject}_{type}_{ms}`) — that is what makes
--   re-importing a CSV update instead of duplicate.
-- · timestamps are `timestamptz`. Firestore Timestamps are absolute instants;
--   storing them without a zone would silently reinterpret them as Bangkok
--   local time.
-- · no foreign keys to users(uid). The users table is reconciled from an HR
--   CSV and people get merged or removed by dedup; an FK would reject history
--   that should outlive the person's row. Orphans are tolerated by design —
--   the app already renders a missing user as a blank name.
-- · `order` and `type` are reserved-ish words; quoted where used as columns.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- People
-- ════════════════════════════════════════════════════════════════════════════

-- One row per employee. `uid` is the Firebase Auth uid for anyone who has
-- signed in, or a synthetic `csv-…` id for an HR record not yet claimed by a
-- Google login.
create table if not exists public.users (
  uid                 text primary key,
  email               text not null,
  display_name        text not null default '',
  display_name_en     text,
  nickname            text,
  photo_url           text,
  role                text not null default 'sale'
                        check (role in ('sale','team_lead','manager','super_admin')),
  employee_id         text,
  department          text,
  position            text,
  rank                text,
  line_manager        text,
  start_date          timestamptz,
  -- HR CSV "Status" verbatim — deliberately not a check constraint. The source
  -- export is not a closed set (Active, Resigned, "No show", "Exit This Month",
  -- and it has grown before); only the literal 'Active' counts as active.
  employment_status   text,
  team_id             text,
  manager_id          text,
  -- null = sees every team; a list = only these. Not the same as an empty
  -- array, which means "sees nothing".
  visible_team_ids    text[],
  -- UI state, not HR data: the departments this admin last picked in the
  -- Mandatory Reading form.
  mandatory_last_departments text[],
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The Employees list sorts by name and filters by department (Phase 1 scoping).
create index if not exists users_display_name_idx on public.users (display_name);
create index if not exists users_department_idx   on public.users (department);
create index if not exists users_team_id_idx      on public.users (team_id) where team_id is not null;
-- Email is how the CSV importer and the score importer resolve a person.
create index if not exists users_email_idx        on public.users (lower(email));

create table if not exists public.teams (
  id             text primary key,
  name           text not null,
  department_id  text,
  -- Plural is what every write uses now. The singular manager_id/team_lead_id
  -- from older documents is folded into these arrays during the data migration,
  -- so the deprecated fields do not survive into Postgres.
  manager_ids    text[] not null default '{}',
  team_lead_ids  text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists teams_department_idx on public.teams (department_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Courses & assessments
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.courses (
  id                    text primary key,
  title                 text not null,
  description           text not null default '',
  category              text not null
                          check (category in ('product','sales_skill','compliance','onboarding','leadership')),
  level                 text check (level in ('beginner','intermediate','expert')),
  duration_minutes      integer not null default 0,
  thumbnail_url         text,
  is_required           boolean not null default false,
  is_published          boolean not null default false,
  target_roles          text[] not null default '{}',
  -- Resolved snapshot of who is assigned, kept in sync with the two fields
  -- below by /api/courses/sync-department-assignments. Additive only.
  assigned_user_ids     text[] not null default '{}',
  assigned_departments  text[] not null default '{}',
  assigned_team_ids     text[] not null default '{}',
  start_date            timestamptz,
  end_date              timestamptz,
  slide_url             text,
  form_url              text,
  intro_video_url       text,
  instructor_id         text,
  course_admin_ids      text[] not null default '{}',
  has_certificate       boolean not null default false,
  allow_retake          boolean not null default false,
  has_key_take_away     boolean not null default false,
  key_take_away_prompt  text,
  quiz_enabled          boolean,
  is_challenge          boolean not null default false,
  challenge_window_start timestamptz,
  challenge_window_end   timestamptz,
  challenge_multiplier   numeric(4,2),
  -- CourseTopic[] — see src/types/course.ts. The builder loads and saves the
  -- whole tree; nothing queries a lesson by id in SQL.
  topics                jsonb not null default '[]'::jsonb,
  grade_bands           jsonb not null default '[]'::jsonb,
  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The course list is "published, newest first"; the learner's own list is
-- "is this course assigned to me".
create index if not exists courses_published_created_idx
  on public.courses (is_published, created_at desc);
create index if not exists courses_assigned_users_idx
  on public.courses using gin (assigned_user_ids);
create index if not exists courses_assigned_teams_idx
  on public.courses using gin (assigned_team_ids);

create table if not exists public.assessments (
  id                  text primary key,
  title               text not null,
  description         text not null default '',
  -- Question[] with their choices and drag pairs. Graded server-side by
  -- gradeSubmission, which reads the whole document.
  questions           jsonb not null default '[]'::jsonb,
  google_form_url     text,
  is_published        boolean not null default false,
  passing_score       integer not null default 0,
  time_limit_minutes  integer,
  anti_cheat_enabled  boolean not null default false,
  answer_view_mode    text check (answer_view_mode in ('per_question','per_topic','all_in_one')),
  created_by          text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists assessments_created_idx on public.assessments (created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- Learner progress
-- ════════════════════════════════════════════════════════════════════════════

-- One row per learner per course. The id is `{uid}_{courseId}` so the CSV
-- importer and the learner's own progress writes converge on one record
-- instead of racing to create two.
create table if not exists public.training_records (
  id                   text primary key,
  user_id              text not null,
  member_name          text,
  course_id            text not null,
  course_title         text not null default '',
  status               text not null default 'not_started'
                         check (status in ('not_started','in_progress','completed','failed')),
  score                numeric(5,2),
  pass_score           numeric(5,2),
  pre_test_score       numeric(5,2),
  post_test_score      numeric(5,2),
  attempt_count        integer not null default 0,
  source               text not null default 'manual'
                         check (source in ('manual','csv_import','google_form')),
  import_batch_id      text,
  completed_lesson_ids text[] not null default '{}',
  total_lessons        integer,
  started_at           timestamptz,
  completed_at         timestamptz,
  due_date             timestamptz,
  updated_at           timestamptz not null default now()
);

-- "my records, newest first" and "everyone on this course" are the two reads.
create index if not exists training_records_user_updated_idx
  on public.training_records (user_id, updated_at desc);
create index if not exists training_records_course_idx
  on public.training_records (course_id);
-- The streak counter scans completions by day.
create index if not exists training_records_completed_at_idx
  on public.training_records (completed_at) where completed_at is not null;

-- Per-user aggregate, so the dashboards and leaderboard never scan
-- training_records. Recomputed from that table — never authored directly.
create table if not exists public.user_stats (
  uid             text primary key,
  total_count     integer not null default 0,
  completed_count integer not null default 0,
  score_sum       numeric(12,2) not null default 0,
  scored_count    integer not null default 0,
  updated_at      timestamptz not null default now()
);

-- The leaderboard orders by points.
create index if not exists user_stats_score_sum_idx on public.user_stats (score_sum desc);

-- Audit trail of every quiz submission. Written only by the server
-- (POST /api/assessment/submit) — the account being audited must not be able
-- to read or rewrite it, which deny-all RLS already guarantees.
create table if not exists public.assessment_attempts (
  id               text primary key,
  uid              text not null,
  assessment_id    text not null,
  assessment_title text not null default '',
  course_id        text,
  step             text check (step in ('pre','post')),
  score            numeric(5,2) not null default 0,
  passing_score    numeric(5,2) not null default 0,
  passed           boolean not null default false,
  points_earned    numeric(8,2) not null default 0,
  points_possible  numeric(8,2) not null default 0,
  attempt_number   integer not null default 1,
  -- AttemptAnswer[] — the learner's actual answers, kept so a bad question can
  -- be re-graded after the fact.
  answers          jsonb not null default '[]'::jsonb,
  auto_submitted   boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists assessment_attempts_uid_idx
  on public.assessment_attempts (uid, created_at desc);
create index if not exists assessment_attempts_assessment_idx
  on public.assessment_attempts (assessment_id, uid);

-- An in-flight quiz: created when the learner starts, closed on submit. Lets
-- the server enforce the time limit against its own clock rather than the
-- browser's.
create table if not exists public.assessment_sessions (
  id            text primary key,
  uid           text not null,
  assessment_id text not null,
  course_id     text,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  timed_out     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists assessment_sessions_uid_idx
  on public.assessment_sessions (uid, assessment_id);

-- Pre/Post scores imported from a Google-Forms CSV and matched to an employee
-- by email. The id is `{uid}_{subject}_{type}_{ms}`, so re-importing the same
-- export updates rather than duplicates.
create table if not exists public.assessment_scores (
  id         text primary key,
  uid        text not null,
  email      text not null,
  subject    text not null,
  "type"     text not null check ("type" in ('pre','post')),
  score      numeric(8,2) not null default 0,
  total      numeric(8,2) not null default 0,
  pct        numeric(5,2) not null default 0,
  taken_at   timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists assessment_scores_uid_taken_idx
  on public.assessment_scores (uid, taken_at);

-- Free-text reflection a learner writes at the end of a course.
create table if not exists public.takeaways (
  id         text primary key,
  uid        text not null,
  course_id  text not null,
  lesson_id  text,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists takeaways_course_idx on public.takeaways (course_id, uid);

-- Result of a non-graded questionnaire (MBTI, selling style). One row per
-- person per definition; the id is `{uid}_{definitionId}`.
create table if not exists public.user_bucket_results (
  id            text primary key,
  uid           text not null,
  definition_id text not null,
  -- Winning bucket per dimension plus the raw tallies — shape depends on the
  -- definition, which lives in code (lib/bucketAssessments/).
  result        jsonb not null default '{}'::jsonb,
  taken_at      timestamptz not null default now()
);

create index if not exists user_bucket_results_uid_idx on public.user_bucket_results (uid);

create table if not exists public.course_feedback (
  id         text primary key,
  course_id  text not null,
  uid        text not null,
  member_uid text,
  rating     integer check (rating between 1 and 5),
  comment    text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists course_feedback_course_idx on public.course_feedback (course_id);
create index if not exists course_feedback_member_idx on public.course_feedback (member_uid);

-- ════════════════════════════════════════════════════════════════════════════
-- Shadow visits & roleplay
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.shadow_records (
  id                  text primary key,
  observer_uid        text not null,
  observer_email      text not null default '',
  observer_name       text not null default '',
  mentor_name         text not null default '',
  mentor_position     text not null default '',
  store_name          text not null default '',
  segment             text,
  persona             text,
  -- The 7 evaluation criteria, free text.
  opening             text not null default '',
  interest_point      text not null default '',
  customer_pain       text not null default '',
  diagnostic_approach text not null default '',
  closing_next_step   text not null default '',
  best_practice       text not null default '',
  beyond_classroom    text not null default '',
  evaluator_email     text,
  rating_score        numeric(4,2),
  evaluation_feedback text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists shadow_records_observer_idx
  on public.shadow_records (observer_uid, created_at desc);
create index if not exists shadow_records_created_idx
  on public.shadow_records (created_at desc);

-- One acknowledgment per shadow record — the id IS the record id, which is why
-- the record must get its id from the store before the ack can be written.
create table if not exists public.shadow_acknowledgments (
  id            text primary key,
  reviewer_uid  text not null,
  reviewer_name text not null default '',
  rating        integer check (rating between 1 and 5),
  comment       text not null default '',
  reviewed_at   timestamptz not null default now()
);

create table if not exists public.roleplay_assessments (
  id            text primary key,
  assessor_uid  text not null,
  assessor_name text not null default '',
  assessor_role text,
  subject_uid   text not null,
  subject_name  text not null default '',
  subject_team  text not null default '',
  round         integer not null default 1,
  "type"        text not null default 'pre' check ("type" in ('pre','post')),
  overall_note  text not null default '',
  -- RoleplayTopicScore[] — 25 fixed topic keys defined in src/types/roleplay.ts,
  -- each with a 1–10 rating and a comment. Stored as a blob because the radar
  -- chart reads every topic at once and nothing queries one topic in isolation.
  topics        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists roleplay_subject_idx
  on public.roleplay_assessments (subject_uid, created_at desc);
create index if not exists roleplay_assessor_idx
  on public.roleplay_assessments (assessor_uid);

-- ════════════════════════════════════════════════════════════════════════════
-- Content: tools, knowledge, mandatory reading, announcements
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.tools (
  id           text primary key,
  title        text not null,
  description  text not null default '',
  url          text,
  icon         text,
  category     text,
  "order"      integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tools_order_idx on public.tools ("order", created_at);

create table if not exists public.knowledge_decks (
  id           text primary key,
  title        text not null,
  description  text not null default '',
  url          text,
  cover_url    text,
  category     text,
  tags         text[] not null default '{}',
  "order"      integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists knowledge_decks_order_idx on public.knowledge_decks ("order", created_at);

create table if not exists public.cuisine_guides (
  id           text primary key,
  title        text not null,
  description  text not null default '',
  cover_url    text,
  category     text,
  -- SKU list and any per-guide structured content. Saved whole (replace
  -- semantics) so a removed SKU actually disappears.
  content      jsonb not null default '{}'::jsonb,
  "order"      integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cuisine_guides_order_idx on public.cuisine_guides ("order", created_at);

create table if not exists public.mandatory_items (
  id                 text primary key,
  title              text not null,
  description        text not null default '',
  url                text,
  cover_url          text,
  target_departments text[] not null default '{}',
  "order"            integer not null default 0,
  is_published       boolean not null default false,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists mandatory_items_published_idx
  on public.mandatory_items (is_published, published_at desc);
create index if not exists mandatory_items_departments_idx
  on public.mandatory_items using gin (target_departments);

create table if not exists public.announcements (
  id                 text primary key,
  title              text not null,
  body               text not null default '',
  image_url          text,
  is_published       boolean not null default false,
  -- Empty array = everyone. Both gates must pass for a post to reach a reader.
  target_roles       text[] not null default '{}',
  target_departments text[] not null default '{}',
  author_name        text,
  created_by         text not null,
  created_at         timestamptz not null default now()
);

create index if not exists announcements_published_idx
  on public.announcements (is_published, created_at desc);

create table if not exists public.resources (
  id           text primary key,
  title        text not null,
  description  text not null default '',
  "type"       text check ("type" in ('pdf','video','link','document','playbook','sop')),
  url          text not null default '',
  image_url    text,
  category     text,
  tags         text[] not null default '{}',
  is_public    boolean not null default false,
  is_published boolean not null default false,
  target_roles text[] not null default '{}',
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists resources_published_idx on public.resources (is_published, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- Notifications
-- ════════════════════════════════════════════════════════════════════════════

-- The in-app bell's per-user feed. Firestore nested these under
-- notifications/{uid}/items; a subcollection is just a foreign key here, so
-- `uid` becomes a column and the per-user list is an indexed filter.
--
-- This feed coexists with the Slack channel rather than being replaced by it:
-- the bell is personal (one row per recipient, with a read flag), Slack is
-- shared (one post per event). See /api/notifications/push and
-- /api/notifications/announce.
create table if not exists public.notifications (
  id         text primary key,
  uid        text not null,
  "type"     text not null,
  title      text not null default '',
  body       text not null default '',
  read       boolean not null default false,
  ref_id     text,
  ref_path   text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_uid_created_idx
  on public.notifications (uid, created_at desc);
-- The unread badge counts only unread rows.
create index if not exists notifications_unread_idx
  on public.notifications (uid) where not read;

-- ════════════════════════════════════════════════════════════════════════════
-- Config & operations
-- ════════════════════════════════════════════════════════════════════════════

-- Singleton config documents, keyed by name: 'moduleAccess', 'newJoinerTeams',
-- 'newJoinerProblems'. A key/value table rather than one table per setting,
-- because these are read as whole documents and change shape independently of
-- the schema.
create table if not exists public.app_config (
  id         text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per CSV import run, for the import history screen.
create table if not exists public.csv_imports (
  id            text primary key,
  uploaded_by   text not null,
  file_name     text,
  row_count     integer not null default 0,
  success_count integer not null default 0,
  error_count   integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists csv_imports_created_idx on public.csv_imports (created_at desc);

create table if not exists public.slack_posts (
  id         text primary key,
  kind       text,
  ref_id     text,
  channel    text,
  posted_at  timestamptz not null default now(),
  payload    jsonb not null default '{}'::jsonb
);

create index if not exists slack_posts_ref_idx on public.slack_posts (kind, ref_id);

-- Internal bookkeeping (migration markers, rebuild timestamps). Was `_meta` in
-- Firestore; a leading underscore is legal but awkward in SQL.
create table if not exists public.app_meta (
  id         text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security — deny all, for every table.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Enabling RLS without defining a policy denies the anon and authenticated
-- roles completely. service_role bypasses RLS, so the API routes keep working.
-- This is the whole access-control story while Firebase Auth owns identity:
-- the database trusts nothing that arrives with a browser-held key.
--
-- Verified on this project (pg_roles.rolbypassrls):
--   service_role  true   ← API routes read and write normally
--   postgres      true   ← migrations and the SQL Editor
--   authenticated false  ← denied
--   anon          false  ← denied
--
-- FORCE does not change that. BYPASSRLS is a role attribute and outranks it;
-- FORCE only removes the *table owner's* implicit exemption, which is what
-- stops a stray owner-level connection from reading everything.
--
-- If a table is ever added without being listed here it will be WORLD-READABLE
-- through the anon key. The verification query at the bottom of this file
-- catches that.

do $$
declare t text;
begin
  foreach t in array array[
    'users','teams','courses','assessments','training_records','user_stats',
    'assessment_attempts','assessment_sessions','assessment_scores','takeaways',
    'user_bucket_results','course_feedback','shadow_records',
    'shadow_acknowledgments','roleplay_assessments','tools','knowledge_decks',
    'cuisine_guides','mandatory_items','announcements','resources',
    'notifications','app_config','csv_imports','slack_posts','app_meta'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Belt and braces: FORCE applies RLS to the table owner too, so a
    -- misconfigured connection string cannot quietly read everything.
    execute format('alter table public.%I force row level security', t);
  end loop;
end
$$;

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Run this after the migration. Every row must read `rls = true` and
-- `policies = 0`. Anything else is an open table.
--
--   select c.relname as table_name,
--          c.relrowsecurity as rls,
--          count(p.polname) as policies
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--   where n.nspname = 'public' and c.relkind = 'r'
--   group by 1, 2
--   order by 1;
