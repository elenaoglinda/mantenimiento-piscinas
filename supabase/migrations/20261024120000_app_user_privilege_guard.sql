-- Stop users from granting themselves privileges.
--
-- `app_user_update_self_or_admin` lets a user update their own row — that's how they edit their
-- name — but RLS can't limit *which columns* change, and `authenticated` has UPDATE on the whole
-- table. So any member (a technician, a read-only viewer) could run
--   update app_user set role = 'admin' where id = auth.uid()
-- and become an administrator of their organisation.
--
-- This trigger keeps self-service edits working and refuses, for signed-in users:
--   * changing `role` unless the person making the change is an admin of that org;
--   * changing `org_id` (moving a user between organisations) or `id`.
-- Requests with no signed-in user (service role, server code, the SQL editor) are trusted, as
-- they are everywhere else in this schema. No existing code updates these columns: accounts are
-- only ever inserted (provision_account, accept_invitation).

create or replace function public.app_user_guard_privileged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A user''s id cannot be changed' using errcode = '42501';
  end if;

  if new.org_id is distinct from old.org_id then
    raise exception 'Users cannot be moved to another organisation' using errcode = '42501';
  end if;

  -- current_user_role() reads the caller's row as it was before this statement, so a member
  -- can't promote themselves by changing their own role in the same update.
  if new.role is distinct from old.role
     and public.current_user_role() is distinct from 'admin' then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.app_user_guard_privileged() from public, anon, authenticated;

drop trigger if exists app_user_guard_privileged on public.app_user;
create trigger app_user_guard_privileged
  before update on public.app_user
  for each row
  execute function public.app_user_guard_privileged();
