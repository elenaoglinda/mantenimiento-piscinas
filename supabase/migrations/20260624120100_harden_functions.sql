-- Phase 1.1 hardening — address Supabase security advisors.
--   1. Pin set_updated_at's search_path (function_search_path_mutable).
--   2. Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER functions; Postgres grants EXECUTE
--      to PUBLIC by default, which would expose them to the anon role. Only `authenticated`
--      should call them (and RLS policies need them for the authenticated role).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.provision_account(public.org_type, text, text) from public, anon;
