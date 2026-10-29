-- Slack member id of each person, so the Slack app can message them directly.
-- Set by a super_admin (from the person's Slack profile link); never by the person.
-- Idempotent: safe to run more than once.
alter table public.users add column if not exists slack_user_id text;
