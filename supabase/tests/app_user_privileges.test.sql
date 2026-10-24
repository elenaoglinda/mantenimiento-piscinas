-- app_user privilege guard. Run against a scratch Postgres with every migration applied:
--   psql -v ON_ERROR_STOP=1 -d app -f supabase/tests/app_user_privileges.test.sql
-- Each check raises on failure, so a clean run means every assertion held.
--
-- A member can edit their own profile but must not be able to make themselves admin or move
-- themselves into another organisation; an admin can still change other members' roles.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.check(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

create or replace function pg_temp.check_fails(sql text, expect text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(expect) in lower(sqlerrm)) > 0 then
      raise notice 'PASS % (refused: %)', label, left(sqlerrm, 60);
      return;
    end if;
    raise exception 'FAIL % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end $$;

-- Fixture: one org with an admin and a technician, and a second org.
do $$
declare v_org uuid; v_other uuid;
  v_admin uuid := gen_random_uuid(); v_tech uuid := gen_random_uuid();
begin
  insert into public.org (name, type) values ('Guard SL', 'company') returning id into v_org;
  insert into public.org (name, type) values ('Other SL', 'company') returning id into v_other;
  insert into auth.users (id) values (v_admin), (v_tech);
  insert into public.app_user (id, org_id, role, full_name) values
    (v_admin, v_org, 'admin', 'Admin'),
    (v_tech, v_org, 'technician', 'Tech');
  perform set_config('guard.admin', v_admin::text, false);
  perform set_config('guard.tech', v_tech::text, false);
  perform set_config('guard.other_org', v_other::text, false);
end $$;

-- ---------------------------------------------------------------------------
-- As the technician
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('guard.tech'), false);
set role authenticated;

update public.app_user set full_name = 'Tech Renamed', dni_nif = '12345678Z' where id = auth.uid();
select pg_temp.check(
  (select full_name from public.app_user where id = auth.uid()) = 'Tech Renamed',
  'a member can still edit their own profile');

select pg_temp.check_fails(
  'update public.app_user set role = ''admin'' where id = auth.uid()',
  'only an admin can change roles',
  'a technician cannot make themselves admin');

select pg_temp.check_fails(
  format('update public.app_user set org_id = %L where id = auth.uid()', current_setting('guard.other_org')),
  'another organisation',
  'a member cannot move themselves to another organisation');

select pg_temp.check(
  (select role from public.app_user where id = auth.uid()) = 'technician',
  'the technician is still a technician');

reset role;

-- ---------------------------------------------------------------------------
-- As the admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('guard.admin'), false);
set role authenticated;

update public.app_user set role = 'viewer' where id = current_setting('guard.tech')::uuid;
select pg_temp.check(
  (select role from public.app_user where id = current_setting('guard.tech')::uuid) = 'viewer',
  'an admin can change a member''s role');

reset role;

-- ---------------------------------------------------------------------------
-- Server-side (no signed-in user) stays trusted
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false);
update public.app_user set role = 'technician' where id = current_setting('guard.tech')::uuid;
select pg_temp.check(
  (select role from public.app_user where id = current_setting('guard.tech')::uuid) = 'technician',
  'server-side code can still change roles');
