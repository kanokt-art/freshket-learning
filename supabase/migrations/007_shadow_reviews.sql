-- Shadow visits can be reviewed by more than one person.
--
-- A team lead AND a manager each give their own stars and feedback on a visit. Until
-- now a review's id was the visit's id, so a second reviewer replaced the first. A
-- review's id becomes "<visit>__<reviewer>", and the review remembers which visit it
-- is for (record_id) and in what role the reviewer gave it (reviewer_role).
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run. Run it after 006. Nothing is dropped, and a review saved before this
-- (if any) keeps working: it is read as a review of the visit whose id it carries.

alter table public.shadow_acknowledgments add column if not exists record_id     text;
alter table public.shadow_acknowledgments add column if not exists reviewer_role text;

-- A review saved the old way has the visit's id as its own id.
update public.shadow_acknowledgments set record_id = id where record_id is null;

create index if not exists shadow_acknowledgments_record_idx
  on public.shadow_acknowledgments (record_id);

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'shadow_acknowledgments'
--     and column_name in ('record_id', 'reviewer_role');      -- expect both
