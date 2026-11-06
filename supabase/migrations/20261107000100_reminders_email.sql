-- =============================================================================
-- Habitat — email reminders
-- =============================================================================
-- Per-person opt-out for reminder emails, and a marker so each notification is
-- emailed at most once by the scheduled job (scripts/jobs.ts, /api/cron/reminders).

alter table public.profiles add column email_reminders boolean not null default true;
grant update (email_reminders) on public.profiles to authenticated;

alter table public.notifications add column emailed_at timestamptz;
create index notifications_unemailed_idx on public.notifications (user_id)
  where emailed_at is null and read_at is null;
