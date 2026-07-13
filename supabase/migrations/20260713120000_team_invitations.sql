-- Phase 7 (Feature 1) — Team invitations via shareable link.
--
-- An org admin creates an invitation (email + role). The app turns the row's opaque token
-- into a share link. The invitee signs in/up with that email and calls accept_invitation(),
-- a SECURITY DEFINER RPC that provisions their app_user row into the inviting org. This is
-- the only write path into another org's app_user, mirroring provision_account()'s pattern
-- (init_tenancy.sql): the invitee has no current_org_id() yet, so the definer function does
-- the insert. Everything else stays inside the existing org_id / RLS / role model.

-- ---------------------------------------------------------------------------
-- Enum + table
-- ---------------------------------------------------------------------------
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.invitation (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  email       text not null check (position('@' in email) > 1),
  role        public.user_role not null default 'technician',
  token       text not null unique,             -- opaque bearer token (client-generated)
  status      public.invitation_status not null default 'pending',
  invited_by  uuid default auth.uid() references public.app_user (id) on delete set null,
  accepted_by uuid references public.app_user (id) on delete set null,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index invitation_org_id_idx on public.invitation (org_id);
create index invitation_token_idx on public.invitation (token);
-- At most one live invite per email per org; revoke before re-inviting.
create unique index invitation_one_pending_per_email
  on public.invitation (org_id, lower(email))
  where status = 'pending';

create trigger invitation_set_updated_at before update on public.invitation
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security — admins manage their own org's invitations. Invitees never read
-- this table directly; they resolve their invite through get_invitation() by token.
-- ---------------------------------------------------------------------------
alter table public.invitation enable row level security;

create policy invitation_select_admin on public.invitation
  for select to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin');

create policy invitation_insert_admin on public.invitation
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');

create policy invitation_update_admin on public.invitation
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin')
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');

create policy invitation_delete_admin on public.invitation
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- get_invitation(token): minimal, token-gated lookup so the accept screen can show the
-- org name + role before the invitee has an app_user row. Callable by anon (the invitee
-- may not be signed in yet); the token is the bearer secret.
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns table (
  org_name text,
  role public.user_role,
  email text,
  status public.invitation_status,
  expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.role, i.email, i.status, (i.expires_at < now())
  from public.invitation i
  join public.org o on o.id = i.org_id
  where i.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation(token, full_name): provisions the caller into the inviting org.
-- Validates the token is pending, unexpired, and bound to the caller's own email.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text, p_full_name text)
returns public.org
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.invitation;
  v_org   public.org;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_inv from public.invitation where token = p_token for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitation is no longer available' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if lower(coalesce(v_email, '')) <> lower(v_inv.email) then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.app_user where id = v_uid) then
    raise exception 'Account already provisioned' using errcode = '23505';
  end if;

  insert into public.app_user (id, org_id, role, full_name, email)
    values (v_uid, v_inv.org_id, v_inv.role, nullif(trim(p_full_name), ''), v_email);

  update public.invitation
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_inv.id;

  select * into v_org from public.org where id = v_inv.org_id;
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs rows). Harden the definer functions per the §12 gotcha:
-- pin search_path (done above) and revoke EXECUTE from unintended roles.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.invitation to authenticated;

revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

revoke execute on function public.accept_invitation(text, text) from public, anon;
grant execute on function public.accept_invitation(text, text) to authenticated;
