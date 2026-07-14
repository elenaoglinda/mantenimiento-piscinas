-- ROLLBACK for 20260713130000_onboarding_dismissed.sql
--
-- Removes the dashboard onboarding-checklist dismissal column. Run in the Supabase SQL editor
-- only if you need to undo that migration. Idempotent and safe to re-run.
--
-- NOTE: this file lives in supabase/rollback/ (NOT supabase/migrations/) on purpose — a "down"
-- file under migrations/ would be applied as a forward migration by `supabase db push`.

alter table public.org
  drop column if exists onboarding_dismissed_at;
