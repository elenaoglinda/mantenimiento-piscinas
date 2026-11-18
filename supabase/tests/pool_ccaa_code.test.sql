-- pool.ccaa_code tests (Comunidad Autónoma as a code). Run from the repository root against a
-- scratch Postgres with every migration applied:
--   psql -v ON_ERROR_STOP=1 -d app -f supabase/tests/pool_ccaa_code.test.sql
-- It rolls the migration back, adds pools the way production has them (free text only),
-- re-applies the migration and checks the backfill. Each check raises on failure.
--
-- What must never break: the postcode wins, then the province, then the typed text; a code
-- already set is never overwritten; unknown places stay null; only the 19 codes are accepted;
-- the backfill isn't a user edit (updated_at unchanged); another org still can't see the pools.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.check(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise warning 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

create or replace function pg_temp.check_fails(sql text, expect text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(expect) in lower(sqlerrm)) > 0 then
      raise warning 'PASS % (refused: %)', label, left(sqlerrm, 70);
      return;
    end if;
    raise exception 'FAIL % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end $$;

\i supabase/rollback/20261113120000_pool_ccaa_code.down.sql
select pg_temp.check(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'pool' and column_name = 'ccaa_code'),
  'rollback drops pool.ccaa_code');

-- Fixture: two orgs; org A's pools cover every precedence rule, as they exist before the
-- migration (no ccaa_code). updated_at is set in the past to see that the backfill leaves it.
alter table auth.users add column if not exists email text;
create temporary table ids (k text primary key, v uuid);
grant select on ids to authenticated;
create or replace function pg_temp.id(k text) returns uuid language sql stable as
  $$ select v from ids where ids.k = $1 $$;

do $$
declare
  a_org uuid; b_org uuid; a_client uuid; b_client uuid;
  a_admin uuid := gen_random_uuid(); b_admin uuid := gen_random_uuid();
begin
  insert into public.org (name, type) values ('CCAA org A', 'company') returning id into a_org;
  insert into public.org (name, type) values ('CCAA org B', 'company') returning id into b_org;
  insert into auth.users (id) values (a_admin), (b_admin);
  insert into public.app_user (id, org_id, role, full_name) values
    (a_admin, a_org, 'admin', 'Ana A'), (b_admin, b_org, 'admin', 'Bea B');
  insert into public.client (org_id, name) values (a_org, 'Cliente A') returning id into a_client;
  insert into public.client (org_id, name) values (b_org, 'Cliente B') returning id into b_client;
  insert into public.pool (org_id, client_id, denominacion, cp, provincia, ccaa) values
    (a_org, a_client, 'cp wins',            '08001', 'Málaga',    'Madrid'),
    (a_org, a_client, 'province next',      null,    'Lérida',    'Madrid'),
    (a_org, a_client, 'bad cp, province',   '1234',  'Girona',    null),
    (a_org, a_client, 'text: Barcelona',    null,    null,        'Barcelona'),
    (a_org, a_client, 'text: CAT',          null,    null,        'CAT'),
    (a_org, a_client, 'text: Catalunya',    '',      '',          'Catalunya'),
    (a_org, a_client, 'text: C. de Madrid', null,    null,        'Comunidad de Madrid'),
    (a_org, a_client, 'text: Cataluña',     null,    null,        'Cataluña'),
    (a_org, a_client, 'text: País Vasco',   null,    null,        'País Vasco'),
    (a_org, a_client, 'text: C-La Mancha',  null,    null,        'Castilla-La Mancha'),
    (a_org, a_client, 'Ceuta',              '51001', null,        null),
    (a_org, a_client, 'unknown',            '99999', 'Marbella',  'España'),
    (a_org, a_client, 'nothing',            null,    null,        null);
  insert into public.pool (org_id, client_id, denominacion, cp)
    values (b_org, b_client, 'org B pool', '28013');
  alter table public.pool disable trigger pool_set_updated_at;
  update public.pool set updated_at = '2026-01-01T00:00:00Z' where org_id in (a_org, b_org);
  alter table public.pool enable trigger pool_set_updated_at;
  insert into ids values ('a_org', a_org), ('b_org', b_org), ('a_admin', a_admin), ('b_admin', b_admin);
end $$;

\i supabase/migrations/20261113120000_pool_ccaa_code.sql

create or replace function pg_temp.code(name text) returns text language sql stable as
  $$ select ccaa_code from public.pool where denominacion = $1 and org_id = pg_temp.id('a_org') $$;

select pg_temp.check(pg_temp.code('cp wins') = 'CT', 'postcode wins over province and text');
select pg_temp.check(pg_temp.code('province next') = 'CT', 'province name (Lérida) before text');
select pg_temp.check(pg_temp.code('bad cp, province') = 'CT', 'a malformed postcode falls through');
select pg_temp.check(pg_temp.code('text: Barcelona') = 'CT', 'typed "Barcelona" → CT');
select pg_temp.check(pg_temp.code('text: CAT') = 'CT', 'typed "CAT" → CT');
select pg_temp.check(pg_temp.code('text: Catalunya') = 'CT', 'typed "Catalunya" → CT');
select pg_temp.check(pg_temp.code('text: C. de Madrid') = 'MD', 'typed "Comunidad de Madrid" → MD');
-- Official names that are also listed as aliases: one row each, or the backfill errors.
select pg_temp.check(pg_temp.code('text: Cataluña') = 'CT', 'typed "Cataluña" → CT');
select pg_temp.check(pg_temp.code('text: País Vasco') = 'PV', 'typed "País Vasco" → PV');
select pg_temp.check(pg_temp.code('text: C-La Mancha') = 'CM', 'typed "Castilla-La Mancha" → CM');
select pg_temp.check(pg_temp.code('Ceuta') = 'CE', 'Ceuta (51) → CE');
select pg_temp.check(pg_temp.code('unknown') is null, 'nothing recognisable stays null');
select pg_temp.check(pg_temp.code('nothing') is null, 'no address stays null');
select pg_temp.check(
  (select bool_and(updated_at = '2026-01-01T00:00:00Z') from public.pool
    where org_id in (pg_temp.id('a_org'), pg_temp.id('b_org'))),
  'the backfill leaves updated_at alone');
select pg_temp.check(
  exists (select 1 from pg_trigger where tgname = 'pool_set_updated_at' and tgenabled = 'O'),
  'the updated_at trigger is enabled again');

-- A code someone chose is never overwritten by the backfill (it only fills nulls).
update public.pool set ccaa_code = 'MD' where denominacion = 'cp wins';
update public.pool
   set ccaa_code = coalesce(public.ccaa_from_postcode(cp), public.ccaa_from_province(provincia),
                            public.ccaa_from_text(ccaa))
 where ccaa_code is null;
select pg_temp.check(pg_temp.code('cp wins') = 'MD', 'the backfill keeps a code already set');

select pg_temp.check_fails(
  $$update public.pool set ccaa_code = 'XX' where denominacion = 'nothing'$$,
  'pool_ccaa_code_check', 'only the 19 community codes are accepted');
select pg_temp.check_fails(
  $$update public.pool set ccaa_code = 'ct' where denominacion = 'nothing'$$,
  'pool_ccaa_code_check', 'codes are upper case');

-- Every province prefix 01-52 maps to a community; 00 and 53 don't.
select pg_temp.check(
  (select count(*) from generate_series(1, 52) g
    where public.ccaa_from_postcode(lpad(g::text, 2, '0') || '001') is not null) = 52,
  'all 52 province prefixes resolve');
select pg_temp.check(
  public.ccaa_from_postcode('00123') is null and public.ccaa_from_postcode('53001') is null,
  'prefixes 00 and 53 do not');

-- Tenancy is unchanged: org B's admin sees and changes only org B's pools.
select set_config('request.jwt.claim.sub', pg_temp.id('b_admin')::text, false);
set role authenticated;
select pg_temp.check(
  (select count(*) from public.pool where ccaa_code is not null) = 1
  and (select ccaa_code from public.pool) = 'MD',
  'org B reads only its own pool (and its code)');
with u as (update public.pool set ccaa_code = 'AN'
            where org_id = pg_temp.id('a_org') returning 1)
select pg_temp.check((select count(*) from u) = 0, 'org B cannot set org A''s codes');
select pg_temp.check_fails($$select public.ccaa_from_postcode('08001')$$, 'permission denied',
  'the helper functions are not callable from the API');
reset role;

-- Leave the database as the migrations left it, for any step after this file.
delete from public.pool where org_id in (pg_temp.id('a_org'), pg_temp.id('b_org'));
