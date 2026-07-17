-- ROLLBACK for 20260713120000_team_invitations.sql
--
-- Cleanly reverses the team-invitations migration. Run in the Supabase SQL editor only if
-- you need to undo that feature. Idempotent (IF EXISTS everywhere) and safe to re-run.
--
-- NOTE: this file lives in supabase/rollback/ (NOT supabase/migrations/) on purpose — the
-- Supabase CLI applies every *.sql under migrations/ as a forward migration, so a "down"
-- file there would drop the table on the next `db push`. Keep rollbacks out of that path.
--
-- Drop order follows dependencies: functions → table (its own drop removes the four RLS
-- policies, the three indexes and the updated_at trigger) → enum type. Shared objects
-- (public.set_updated_at, the user_role enum) are intentionally left intact.

drop function if exists public.accept_invitation(text, text);
drop function if exists public.get_invitation(text);

drop table if exists public.invitation cascade;

drop type if exists public.invitation_status;
