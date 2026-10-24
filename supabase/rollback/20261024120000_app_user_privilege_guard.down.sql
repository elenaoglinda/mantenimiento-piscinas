-- ROLLBACK for 20261024120000_app_user_privilege_guard.sql
--
-- Removes the guard that stops members from changing their own role or organisation. Rolling it
-- back re-opens that privilege escalation; only do it to replace the guard with a better one.
-- Run in the Supabase SQL editor. Idempotent and safe to re-run.
--
-- NOTE: this file lives in supabase/rollback/ (NOT supabase/migrations/) on purpose — a "down"
-- file under migrations/ would be applied as a forward migration by `supabase db push`.

drop trigger if exists app_user_guard_privileged on public.app_user;
drop function if exists public.app_user_guard_privileged();
