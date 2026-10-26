-- Align the schema with the data that actually exists, and add the login link.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is guarded (`if exists` / `if not exists`).
-- Run it AFTER 004, and BEFORE loading any data.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
--
-- 004 was written from the TypeScript types. Reading the real Firestore
-- documents afterwards showed that for several tables the type and the data
-- disagree with what 004 assumed, and that four tables (tools, knowledge_decks,
-- cuisine_guides, mandatory_items) had been designed from a guess rather than
-- from their types at all. Left alone, inserts into some of them would have
-- failed outright — cuisine_guides.title is NOT NULL but the real documents
-- have `name`, not `title`. Every table touched here is still empty, so
-- columns are replaced rather than migrated.
--
-- ── 1. Identity: separate the person from the login (decision "A") ──────────
--
-- A person can exist twice today: once from the HR CSV (`csv-{employeeId}`) and
-- once from their first Google login (a Firebase uid), because first login
-- creates a new document without looking for the HR row. Rather than re-key
-- people at login — which has to find and update every table that mentions
-- them, and silently orphans history if one is missed — the key never changes.
--
--   users.uid       the stable person id. `csv-{employeeId}` for anyone from HR
--                   (1,653 of 1,658 existing rows already are), or the Firebase
--                   uid for someone who logged in before HR knew them.
--   users.auth_uid  the Firebase uid they sign in with, once known.
--
-- Login resolves by auth_uid; if that finds nothing it matches the HR row by
-- email and stores the uid here. One UPDATE on one row, touching no history.

alter table public.users add column if not exists auth_uid text;

-- Partial: most people have not logged in yet, and a unique index over many
-- nulls is not the constraint wanted here. One Firebase uid maps to one person.
create unique index if not exists users_auth_uid_key
  on public.users (auth_uid) where auth_uid is not null;

-- ── 2. Notifications: the key was wrong ─────────────────────────────────────
--
-- Firestore nested these under notifications/{uid}/items, and the document id
-- is `{type}_{refId}` so that re-sending the same notice overwrites instead of
-- stacking. That id is unique only WITHIN one person's feed — the same course
-- published to fifty people produces fifty documents with the same id — so a
-- primary key of `id` alone would have made each person's notice overwrite the
-- previous person's.

alter table public.notifications add column if not exists created_by_uid text;

alter table public.notifications drop constraint if exists notifications_pkey;
alter table public.notifications add primary key (uid, id);

-- ── 3. Tables whose columns did not match the real documents ────────────────

-- tools — SaleTool in src/lib/tools.ts: imageUrl and departments were missing;
-- icon and order do not exist on it.
alter table public.tools add column if not exists image_url   text   not null default '';
alter table public.tools add column if not exists departments text[] not null default '{}';
alter table public.tools drop column if exists icon;
alter table public.tools drop column if exists "order";
create index if not exists tools_created_idx on public.tools (created_at);

-- knowledge_decks — KnowledgeDeck in hooks/useFirestore.ts is just
-- { title, subtitle, url, createdAt }.
alter table public.knowledge_decks add column if not exists subtitle text not null default '';
alter table public.knowledge_decks drop column if exists description;
alter table public.knowledge_decks drop column if exists cover_url;
alter table public.knowledge_decks drop column if exists category;
alter table public.knowledge_decks drop column if exists tags;
alter table public.knowledge_decks drop column if exists "order";
alter table public.knowledge_decks drop column if exists is_published;
create index if not exists knowledge_decks_created_idx on public.knowledge_decks (created_at);

-- cuisine_guides — CuisineGuideItem in lib/cuisineGuide.ts. It is named `name`,
-- not `title`, and the SKU list is a field of its own rather than a generic
-- `content` blob. Saved whole (replace semantics) so a removed SKU disappears.
alter table public.cuisine_guides add column if not exists name       text  not null default '';
alter table public.cuisine_guides add column if not exists skus       jsonb not null default '[]'::jsonb;
alter table public.cuisine_guides add column if not exists created_by text;
alter table public.cuisine_guides drop column if exists title;
alter table public.cuisine_guides drop column if exists category;
alter table public.cuisine_guides drop column if exists content;
alter table public.cuisine_guides drop column if exists "order";
create index if not exists cuisine_guides_created_idx on public.cuisine_guides (created_at);

-- mandatory_items — MandatoryItem in lib/mandatory.ts. departmentAccess is a
-- list of OBJECTS, { department, showHistory }, not a list of names — each
-- entry both targets a department and says whether it also unlocks the archive
-- for them — so it is jsonb, not text[]. (Dropping target_departments takes its
-- GIN index with it.)
alter table public.mandatory_items add column if not exists week_label        text  not null default '';
alter table public.mandatory_items add column if not exists slides_url        text  not null default '';
alter table public.mandatory_items add column if not exists department_access jsonb not null default '[]'::jsonb;
alter table public.mandatory_items add column if not exists created_by        text;
alter table public.mandatory_items drop column if exists url;
alter table public.mandatory_items drop column if exists cover_url;
alter table public.mandatory_items drop column if exists target_departments;
alter table public.mandatory_items drop column if exists "order";

-- csv_imports — the real record is one row per import of course results, with
-- per-outcome counts, not a generic upload log.
alter table public.csv_imports add column if not exists type          text;
alter table public.csv_imports add column if not exists course_id     text;
alter table public.csv_imports add column if not exists course_title  text;
alter table public.csv_imports add column if not exists total_rows    integer not null default 0;
alter table public.csv_imports add column if not exists success_rows  integer not null default 0;
alter table public.csv_imports add column if not exists skipped_rows  integer not null default 0;
alter table public.csv_imports add column if not exists failed_rows   integer not null default 0;
alter table public.csv_imports add column if not exists imported_at   timestamptz not null default now();
alter table public.csv_imports drop column if exists uploaded_by;   -- NOT NULL, and nothing writes it
alter table public.csv_imports drop column if exists row_count;
alter table public.csv_imports drop column if exists success_count;
alter table public.csv_imports drop column if exists error_count;
alter table public.csv_imports drop column if exists created_at;
create index if not exists csv_imports_imported_idx on public.csv_imports (imported_at desc);

-- assessment_sessions — the server records the limit it enforced.
alter table public.assessment_sessions add column if not exists time_limit_minutes integer;

-- user_bucket_results — `code` (the MBTI type, e.g. INFP) is what the profile
-- badge shows and what a team breakdown would group by, so it is a column. The
-- per-dimension tallies stay in `result`.
alter table public.user_bucket_results add column if not exists code      text;
alter table public.user_bucket_results add column if not exists course_id text;

-- ── 4. A place for fields the schema does not know about ────────────────────
--
-- Firestore documents drift: the five courses already carry five legacy fields
-- (hasPreAssessment, assessmentType, …) that no current type mentions. Dropping
-- them silently would be unrecoverable and failing the load would block it, so
-- anything without a column lands here, and the migration reports which fields
-- ended up here so they can be looked at rather than discovered later.
--
-- Not added to app_config / app_meta / slack_posts (already free-form jsonb),
-- to user_stats (derived, recomputed from training_records), or to
-- cuisine_sale (a separate feature).

do $$
declare t text;
begin
  foreach t in array array[
    'users','teams','courses','assessments','training_records',
    'assessment_attempts','assessment_sessions','assessment_scores','takeaways',
    'user_bucket_results','course_feedback','shadow_records',
    'shadow_acknowledgments','roleplay_assessments','tools','knowledge_decks',
    'cuisine_guides','mandatory_items','announcements','resources',
    'notifications','csv_imports'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists extra jsonb not null default ''{}''::jsonb', t);
  end loop;
end
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'users' and column_name = 'auth_uid';
--   -- expect one row
--
--   select a.attname from pg_index i
--   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
--   where i.indrelid = 'public.notifications'::regclass and i.indisprimary;
--   -- expect uid and id
