-- Phase 1.1 — Tenancy foundation: org + app_user, RLS, helpers, account provisioning.
--
-- Multi-tenant isolation unit is `org`. An owner account is an org with one (implicit)
-- client; a company account is an org with many clients (clients land in Phase 2). Every
-- tenant table keys off org_id. RLS resolves the caller's org via a SECURITY DEFINER helper
-- (current_org_id) rather than a JWT claim — simpler than an access-token hook and avoids
-- recursion because the helper bypasses RLS on app_user. See docs/technical-spec.md §4.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_type as enum ('owner', 'company');
create type public.user_role as enum ('admin', 'technician', 'viewer');

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.org (
  id         uuid primary key default gen_random_uuid(),
  type       public.org_type not null,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_user (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.org (id) on delete cascade,
  role       public.user_role not null default 'technician',
  full_name  text,
  email      text,
  dni_nif    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_user_org_id_idx on public.app_user (org_id);

create trigger org_set_updated_at
  before update on public.org
  for each row execute function public.set_updated_at();

create trigger app_user_set_updated_at
  before update on public.app_user
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER → bypass RLS, no recursion on app_user)
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.app_user where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.app_user where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.org enable row level security;
alter table public.app_user enable row level security;

-- org: members can read their org; only admins can update it. Inserts happen via the
-- provisioning RPC (SECURITY DEFINER), so no client insert/delete policy is granted.
create policy org_select_same_org on public.org
  for select to authenticated
  using (id = public.current_org_id());

create policy org_update_admin on public.org
  for update to authenticated
  using (id = public.current_org_id() and public.current_user_role() = 'admin')
  with check (id = public.current_org_id() and public.current_user_role() = 'admin');

-- app_user: members can read everyone in their org. A user can update their own row;
-- admins can update/delete any member in their org. First user is created via the RPC;
-- subsequent invites (Phase 1.5) also go through a SECURITY DEFINER path.
create policy app_user_select_same_org on public.app_user
  for select to authenticated
  using (org_id = public.current_org_id());

create policy app_user_update_self_or_admin on public.app_user
  for update to authenticated
  using (id = auth.uid() or (org_id = public.current_org_id() and public.current_user_role() = 'admin'))
  with check (org_id = public.current_org_id());

create policy app_user_delete_admin on public.app_user
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() = 'admin'
    and id <> auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Account provisioning RPC
-- Creates the org + the caller's admin app_user row in one atomic, RLS-safe step.
-- Called from the onboarding wizard (Phase 1.4) after first sign-in.
-- ---------------------------------------------------------------------------
create or replace function public.provision_account(
  p_account_type public.org_type,
  p_org_name text,
  p_full_name text
)
returns public.org
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.org;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.app_user where id = v_uid) then
    raise exception 'Account already provisioned' using errcode = '23505';
  end if;

  insert into public.org (type, name)
    values (p_account_type, p_org_name)
    returning * into v_org;

  insert into public.app_user (id, org_id, role, full_name, email)
    values (
      v_uid,
      v_org.id,
      'admin',
      nullif(trim(p_full_name), ''),
      (select email from auth.users where id = v_uid)
    );

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs row visibility)
-- ---------------------------------------------------------------------------
grant select, update on public.org to authenticated;
grant select, update, delete on public.app_user to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.provision_account(public.org_type, text, text) to authenticated;
