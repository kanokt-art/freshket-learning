-- What the running app needs from the database, beyond what loading the data did.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run. Run it after 005.
--
-- ── 1. Two more tables that did not match what the app writes ───────────────
--
-- Found by reading the code that writes them, the same way 005 was found. Both
-- are still empty, and both would have failed on their first real write:
--
--   takeaways       the app writes { uid, courseId, courseTitle, text,
--                   updatedAt }; 004 had `body` and `lesson_id`.
--   course_feedback the app writes { memberUid, courseId, comment, score,
--                   leadUid, leadName, updatedAt } — there is no `uid`, so 004's
--                   NOT NULL uid rejected every insert, and `rating` (checked
--                   1–5) is really `score`, whose scale the app does not fix.
--
-- announcements also records who last edited a post (updatedAt / updatedBy).

alter table public.takeaways add column if not exists course_title text not null default '';
alter table public.takeaways add column if not exists text         text not null default '';
alter table public.takeaways drop column if exists body;
alter table public.takeaways drop column if exists lesson_id;
alter table public.takeaways drop column if exists created_at;

alter table public.course_feedback add column if not exists lead_uid   text;
alter table public.course_feedback add column if not exists lead_name  text;
alter table public.course_feedback add column if not exists score      numeric;
alter table public.course_feedback add column if not exists updated_at timestamptz not null default now();
alter table public.course_feedback drop column if exists uid;
alter table public.course_feedback drop column if exists rating;
alter table public.course_feedback drop column if exists created_at;

alter table public.announcements add column if not exists updated_at timestamptz;
alter table public.announcements add column if not exists updated_by text;

-- ── 2. Finding a person by email ────────────────────────────────────────────
--
-- Signing in matches an existing HR row by email (see users.auth_uid in 005).
-- The index from 004 is on lower(email), which the REST layer cannot filter on,
-- and a case-insensitive LIKE would treat the `_` that appears in real
-- addresses as a wildcard — so `first_last@` would also match `firstXlast@`.
-- A stored lower-cased copy makes it a plain equality.

alter table public.users
  add column if not exists email_lc text generated always as (lower(email)) stored;

create index if not exists users_email_lc_idx on public.users (email_lc);
drop index if exists public.users_email_idx;       -- superseded by the one above

-- ── 3. Adding learners to a course without losing anyone ────────────────────
--
-- A course roster is an array on the course row. Adding people by reading it,
-- appending, and writing it back loses a learner whenever two requests do that
-- at once — and they do: moving several people between teams triggers one per
-- course. Doing the union inside the database makes it a single statement.
--
-- The roster keeps its order — existing learners first, new ones appended — and
-- the row is locked while it is read and written, so two callers cannot
-- interleave. Returns how many uids were actually new (0 when the course does
-- not exist or everyone was already on it).

create or replace function public.add_course_learners(p_course_id text, p_uids text[])
returns integer
language plpgsql
as $$
declare
  current_ids text[];
  new_ids     text[];
begin
  select assigned_user_ids into current_ids
    from public.courses where id = p_course_id for update;
  if not found then
    return 0;
  end if;

  new_ids := array(
    select u from (select distinct on (u) u, o from unnest(p_uids) with ordinality as t(u, o) order by u, o) d
     where u is not null and u <> all(current_ids)
     order by o
  );
  if coalesce(cardinality(new_ids), 0) = 0 then
    return 0;
  end if;

  update public.courses
     set assigned_user_ids = current_ids || new_ids,
         updated_at = now()
   where id = p_course_id;
  return cardinality(new_ids);
end;
$$;

-- ⚠ This matters. Functions in the `public` schema are callable through the
-- REST layer by anyone holding the anon key — and the anon key is shipped to
-- every browser. Row Level Security protects tables, NOT functions, so without
-- this anybody could call add_course_learners and put arbitrary people into any
-- course. Only the server (service_role) may run it.
revoke all on function public.add_course_learners(text, text[]) from public;
revoke all on function public.add_course_learners(text, text[]) from anon, authenticated;
grant execute on function public.add_course_learners(text, text[]) to service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   -- who may run the function (expect service_role, and not anon/authenticated):
--   select r.rolname, has_function_privilege(r.rolname, 'public.add_course_learners(text,text[])', 'execute')
--   from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role');
