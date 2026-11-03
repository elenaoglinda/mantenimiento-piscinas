-- Service-log tests (products, tasks, readings outside SILOE, route stops). Run against a
-- scratch Postgres with every migration applied:
--   psql -v ON_ERROR_STOP=1 -d app -f supabase/tests/service_log.test.sql
-- Each check raises on failure, so a clean run means every assertion held.
--
-- What must never break: another org can't read or write any of the new tables, a viewer
-- can't write, only admins edit the catalogues, and a signed report's products and tasks
-- can't change.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.check(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

-- Asserts that `sql` fails, and that its message mentions `expect`.
create or replace function pg_temp.check_fails(sql text, expect text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(expect) in lower(sqlerrm)) > 0 then
      raise notice 'PASS % (refused: %)', label, left(sqlerrm, 70);
      return;
    end if;
    raise exception 'FAIL % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end $$;

-- Rows a statement touched (0 when RLS hides the target).
create or replace function pg_temp.affected(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture: org A (admin, technician, viewer) and org B (admin), each with a pool, a vaso and
-- reports. Built as the table owner; read back as each member.
-- ---------------------------------------------------------------------------
-- provision_account reads the new user's email; the local auth.users stand-in has only ids.
alter table auth.users add column if not exists email text;

create temporary table ids (k text primary key, v uuid);
grant select on ids to authenticated;
create or replace function pg_temp.id(k text) returns uuid language sql stable as
  $$ select v from ids where ids.k = $1 $$;

do $$
declare
  a_org uuid; b_org uuid;
  a_admin uuid := gen_random_uuid(); a_tech uuid := gen_random_uuid();
  a_view uuid := gen_random_uuid(); b_admin uuid := gen_random_uuid();
  a_client uuid; b_client uuid; a_pool uuid; b_pool uuid; a_basin uuid; b_basin uuid;
  a_draft uuid; a_signed uuid; b_draft uuid;
begin
  insert into public.org (name, type) values ('Org A', 'company') returning id into a_org;
  insert into public.org (name, type) values ('Org B', 'company') returning id into b_org;
  -- Orgs created after the migration get their catalogues through provision_account; these
  -- two are seeded the way the migration seeded every existing org.
  perform public.seed_org_catalogues(a_org);
  perform public.seed_org_catalogues(b_org);
  insert into auth.users (id) values (a_admin), (a_tech), (a_view), (b_admin);
  insert into public.app_user (id, org_id, role, full_name) values
    (a_admin, a_org, 'admin', 'Ana Admin'),
    (a_tech, a_org, 'technician', 'Tomás Técnico'),
    (a_view, a_org, 'viewer', 'Vera Viewer'),
    (b_admin, b_org, 'admin', 'Bea B');
  insert into public.client (org_id, name) values (a_org, 'Cliente A') returning id into a_client;
  insert into public.client (org_id, name) values (b_org, 'Cliente B') returning id into b_client;
  insert into public.pool (org_id, client_id, denominacion)
    values (a_org, a_client, 'Piscina A') returning id into a_pool;
  insert into public.pool (org_id, client_id, denominacion)
    values (b_org, b_client, 'Piscina B') returning id into b_pool;
  insert into public.basin (org_id, pool_id, denominacion)
    values (a_org, a_pool, 'Vaso A') returning id into a_basin;
  insert into public.basin (org_id, pool_id, denominacion)
    values (b_org, b_pool, 'Vaso B') returning id into b_basin;
  insert into public.report (org_id, pool_id, basin_id, technician_id, status)
    values (a_org, a_pool, a_basin, a_tech, 'draft') returning id into a_draft;
  insert into public.report (org_id, pool_id, basin_id, technician_id, status)
    values (a_org, a_pool, a_basin, a_tech, 'completed') returning id into a_signed;
  insert into public.report (org_id, pool_id, basin_id, technician_id, status)
    values (b_org, b_pool, b_basin, b_admin, 'draft') returning id into b_draft;

  insert into ids values
    ('a_org', a_org), ('b_org', b_org), ('a_admin', a_admin), ('a_tech', a_tech),
    ('a_view', a_view), ('b_admin', b_admin), ('a_pool', a_pool), ('b_pool', b_pool),
    ('a_basin', a_basin), ('b_basin', b_basin), ('a_draft', a_draft), ('a_signed', a_signed),
    ('b_draft', b_draft);
end $$;

-- ===========================================================================
-- 1. Products: chemical_product + report_chemical
-- ===========================================================================
do $$
begin
  perform pg_temp.check(
    (select count(*) from public.chemical_product where org_id = pg_temp.id('a_org')) = 8
    and (select count(*) from public.chemical_product where org_id = pg_temp.id('b_org')) = 8,
    'every org has the 8 default products');
  perform public.seed_org_catalogues(pg_temp.id('a_org'));
  perform pg_temp.check(
    (select count(*) from public.chemical_product where org_id = pg_temp.id('a_org')) = 8,
    'seeding twice adds nothing');
  perform pg_temp.check(not has_function_privilege('authenticated',
    'public.seed_org_catalogues(uuid)', 'execute'), 'members cannot seed catalogues');
end $$;

-- A new account gets the catalogue from provision_account.
do $$
declare v_new uuid := gen_random_uuid(); v_org public.org;
begin
  insert into auth.users (id) values (v_new);
  perform set_config('request.jwt.claim.sub', v_new::text, true);
  v_org := public.provision_account('owner', 'Nueva SL', 'Nuevo');
  perform pg_temp.check(
    (select count(*) from public.chemical_product where org_id = v_org.id) = 8,
    'provision_account preloads the products of a new org');
end $$;

-- Technician of A records products on the draft.
select set_config('request.jwt.claim.sub', pg_temp.id('a_tech')::text, false);
set role authenticated;
do $$
declare v_prod uuid;
begin
  select id into v_prod from public.chemical_product where nombre = 'Cloro granulado';
  insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
    values (pg_temp.id('a_org'), pg_temp.id('a_draft'), v_prod, 0.5, 'kg');
  insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
    values (pg_temp.id('a_org'), pg_temp.id('a_signed'), v_prod, 1, 'kg');
  perform pg_temp.check((select count(*) from public.report_chemical) = 2,
    'a technician records products on editable reports');
  perform pg_temp.check_fails(
    format('insert into public.chemical_product (org_id, nombre, unidad) values (%L, %L, %L)',
           pg_temp.id('a_org'), 'Producto X', 'kg'),
    'row-level security', 'a technician cannot add to the catalogue');
  perform pg_temp.check(pg_temp.affected(
    'update public.chemical_product set activo = false') = 0,
    'a technician cannot change the catalogue');
  perform pg_temp.check_fails(
    format('insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
            values (%L, %L, %L, 0, %L)', pg_temp.id('a_org'), pg_temp.id('a_draft'), v_prod, 'kg'),
    'check constraint', 'quantity must be positive');
end $$;
reset role;

-- Sign the second report (as the owner, like the app's sign flow would).
update public.report set status = 'signed', signed_at = now() where id = pg_temp.id('a_signed');

select set_config('request.jwt.claim.sub', pg_temp.id('a_admin')::text, false);
set role authenticated;
do $$
declare v_prod uuid;
begin
  select id into v_prod from public.chemical_product where nombre = 'Sal';
  perform pg_temp.check(pg_temp.affected(format(
    'update public.report_chemical set cantidad = 9 where report_id = %L', pg_temp.id('a_signed'))) = 0,
    'products of a signed report cannot be changed');
  perform pg_temp.check(pg_temp.affected(format(
    'delete from public.report_chemical where report_id = %L', pg_temp.id('a_signed'))) = 0,
    'products of a signed report cannot be deleted');
  perform pg_temp.check_fails(
    format('insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
            values (%L, %L, %L, 1, %L)', pg_temp.id('a_org'), pg_temp.id('a_signed'), v_prod, 'kg'),
    'row-level security', 'no products can be added to a signed report');
  -- Admin manages the catalogue.
  insert into public.chemical_product (org_id, nombre, unidad, cantidad_habitual)
    values (pg_temp.id('a_org'), 'Bromo', 'pastillas', 2);
  perform pg_temp.check_fails(
    format('insert into public.chemical_product (org_id, nombre, unidad) values (%L, %L, %L)',
           pg_temp.id('a_org'), '  bromo ', 'kg'),
    'duplicate key', 'product names are unique per org, ignoring case and spaces');
  perform pg_temp.check_fails(
    format('delete from public.chemical_product where id = %L',
           (select id from public.chemical_product where nombre = 'Cloro granulado')),
    'foreign key', 'a product used at a visit cannot be deleted, only deactivated');
end $$;
reset role;

-- Org B sees nothing of A and can't write into it.
select set_config('request.jwt.claim.sub', pg_temp.id('b_admin')::text, false);
set role authenticated;
do $$
declare v_a_prod uuid; v_b_prod uuid;
begin
  perform pg_temp.check((select count(*) from public.chemical_product) = 8,
    'org B sees only its own 8 products');
  perform pg_temp.check((select count(*) from public.report_chemical) = 0,
    'org B sees none of org A''s products added');
  select id into v_b_prod from public.chemical_product where nombre = 'Sal';
  perform pg_temp.check(pg_temp.affected('update public.report_chemical set cantidad = 99') = 0
    and pg_temp.affected('delete from public.report_chemical') = 0
    and pg_temp.affected(format('update public.chemical_product set activo = false where org_id = %L',
                                pg_temp.id('a_org'))) = 0,
    'org B cannot change or delete org A''s rows');
  perform pg_temp.check_fails(
    format('insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
            values (%L, %L, %L, 1, %L)', pg_temp.id('a_org'), pg_temp.id('a_draft'), v_b_prod, 'kg'),
    'row-level security', 'org B cannot add products to org A''s report');
  perform pg_temp.check_fails(
    format('insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
            values (%L, %L, %L, 1, %L)', pg_temp.id('b_org'), pg_temp.id('a_draft'), v_b_prod, 'kg'),
    -- Either guard may fire first (RLS on the report, or the composite foreign key).
    'violates', 'org B cannot point its own row at org A''s report');
  perform pg_temp.check_fails(
    format('insert into public.chemical_product (org_id, nombre, unidad) values (%L, %L, %L)',
           pg_temp.id('a_org'), 'Intruso', 'kg'),
    'row-level security', 'org B cannot add to org A''s catalogue');
end $$;
reset role;

-- A viewer reads but never writes.
select set_config('request.jwt.claim.sub', pg_temp.id('a_view')::text, false);
set role authenticated;
do $$
begin
  perform pg_temp.check((select count(*) from public.report_chemical) = 2, 'a viewer reads the log');
  perform pg_temp.check_fails(
    format('insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
            values (%L, %L, %L, 1, %L)', pg_temp.id('a_org'), pg_temp.id('a_draft'),
            (select id from public.chemical_product where nombre = 'Sal'), 'kg'),
    'row-level security', 'a viewer cannot record products');
end $$;
reset role;

-- ===========================================================================
-- 2. Tasks: task_def + report_task
-- ===========================================================================
do $$
begin
  perform pg_temp.check(
    (select count(*) from public.task_def where org_id = pg_temp.id('a_org')) = 8
    and (select count(*) from public.task_def where org_id = pg_temp.id('b_org')) = 8,
    'every org has the 8 default tasks');
  perform pg_temp.check(
    (select string_agg(nombre, '|' order by orden) from public.task_def
      where org_id = pg_temp.id('a_org')) like 'Barrido / limpieza de fondo|%|Retirada de hojas',
    'tasks keep their order');
end $$;

-- A new account gets the task list too.
do $$
declare v_new uuid := gen_random_uuid(); v_org public.org;
begin
  insert into auth.users (id) values (v_new);
  perform set_config('request.jwt.claim.sub', v_new::text, true);
  v_org := public.provision_account('company', 'Otra SL', 'Otra');
  perform pg_temp.check(
    (select count(*) from public.task_def where org_id = v_org.id) = 8,
    'provision_account preloads the tasks of a new org');
end $$;

-- Reopen the signed report so the technician can log tasks on both, then sign it again.
update public.report set status = 'completed', signed_at = null where id = pg_temp.id('a_signed');
select set_config('request.jwt.claim.sub', pg_temp.id('a_tech')::text, false);
set role authenticated;
do $$
declare v_task uuid; v_task2 uuid;
begin
  select id into v_task from public.task_def where orden = 1;
  select id into v_task2 from public.task_def where orden = 4;
  insert into public.report_task (org_id, report_id, task_id, hecho)
    values (pg_temp.id('a_org'), pg_temp.id('a_draft'), v_task, true),
           (pg_temp.id('a_org'), pg_temp.id('a_draft'), v_task2, false);
  insert into public.report_task (org_id, report_id, task_id, hecho, nota)
    values (pg_temp.id('a_org'), pg_temp.id('a_signed'), v_task, true, 'Mucha hoja');
  perform pg_temp.check((select count(*) from public.report_task) = 3,
    'a technician records tasks on editable reports');
  perform pg_temp.check_fails(
    format('insert into public.report_task (org_id, report_id, task_id) values (%L, %L, %L)',
           pg_temp.id('a_org'), pg_temp.id('a_draft'), v_task),
    'duplicate key', 'a task is recorded once per visit');
  perform pg_temp.check_fails(
    format('insert into public.task_def (org_id, nombre) values (%L, %L)',
           pg_temp.id('a_org'), 'Tarea nueva'),
    'row-level security', 'a technician cannot add to the task list');
  perform pg_temp.check(pg_temp.affected('update public.task_def set activo = false') = 0,
    'a technician cannot change the task list');
end $$;
reset role;

update public.report set status = 'signed', signed_at = now() where id = pg_temp.id('a_signed');

select set_config('request.jwt.claim.sub', pg_temp.id('a_admin')::text, false);
set role authenticated;
do $$
begin
  perform pg_temp.check(pg_temp.affected(format(
    'update public.report_task set hecho = false, nota = null where report_id = %L',
    pg_temp.id('a_signed'))) = 0, 'tasks of a signed report cannot be changed');
  perform pg_temp.check(pg_temp.affected(format(
    'delete from public.report_task where report_id = %L', pg_temp.id('a_signed'))) = 0,
    'tasks of a signed report cannot be deleted');
  perform pg_temp.check_fails(
    format('insert into public.report_task (org_id, report_id, task_id) values (%L, %L, %L)',
           pg_temp.id('a_org'), pg_temp.id('a_signed'),
           (select id from public.task_def where orden = 2)),
    'row-level security', 'no tasks can be added to a signed report');
  insert into public.task_def (org_id, nombre, orden) values (pg_temp.id('a_org'), 'Limpieza de duchas', 9);
  perform pg_temp.check(pg_temp.affected(
    'update public.task_def set orden = 0 where nombre = ''Limpieza de duchas''') = 1,
    'an admin edits the task list');
  perform pg_temp.check_fails(
    format('delete from public.task_def where id = %L', (select id from public.task_def where orden = 1)),
    'foreign key', 'a task logged at a visit cannot be deleted, only deactivated');
end $$;
reset role;

select set_config('request.jwt.claim.sub', pg_temp.id('b_admin')::text, false);
set role authenticated;
do $$
declare v_b_task uuid;
begin
  perform pg_temp.check((select count(*) from public.task_def) = 8,
    'org B sees only its own task list');
  perform pg_temp.check((select count(*) from public.report_task) = 0,
    'org B sees none of org A''s tasks');
  perform pg_temp.check(pg_temp.affected('update public.report_task set nota = ''x''') = 0
    and pg_temp.affected('delete from public.report_task') = 0
    and pg_temp.affected(format('delete from public.task_def where org_id = %L', pg_temp.id('a_org'))) = 0,
    'org B cannot change or delete org A''s tasks');
  select id into v_b_task from public.task_def where orden = 1;
  perform pg_temp.check_fails(
    format('insert into public.report_task (org_id, report_id, task_id) values (%L, %L, %L)',
           pg_temp.id('a_org'), pg_temp.id('a_draft'), v_b_task),
    'row-level security', 'org B cannot log tasks on org A''s report');
  perform pg_temp.check_fails(
    format('insert into public.report_task (org_id, report_id, task_id) values (%L, %L, %L)',
           pg_temp.id('b_org'), pg_temp.id('a_draft'), v_b_task),
    'violates', 'org B cannot point its own row at org A''s report');
end $$;
reset role;

select set_config('request.jwt.claim.sub', pg_temp.id('a_view')::text, false);
set role authenticated;
do $$
begin
  perform pg_temp.check((select count(*) from public.report_task) = 3, 'a viewer reads the tasks');
  perform pg_temp.check(pg_temp.affected('update public.report_task set nota = ''x''') = 0,
    'a viewer cannot change tasks');
end $$;
reset role;

-- ===========================================================================
-- 3. Readings outside SILOE: parameter_def.in_siloe
-- ===========================================================================
do $$
begin
  perform pg_temp.check(
    (select count(*) from public.parameter_def where not in_siloe) = 4
    and (select count(*) from public.parameter_def where not in_siloe and siloe_param_id is null) = 4,
    'four parameters outside SILOE, none with a SILOE id');
  perform pg_temp.check(
    (select count(*) from public.parameter_def where in_siloe and siloe_param_id is null) = 0,
    'every SILOE parameter keeps its SILOE id');
  perform pg_temp.check(
    (select string_agg(clave || ':' || coalesce(min_ok::text, '-') || '-' || max_ok::text, ',' order by clave)
       from public.parameter_def where not in_siloe)
    = 'alcalinidad_total:80-120,dureza_calcica:200-400,fosfatos:--0.1,sal:3-5',
    'recommended ranges as specified');
  perform pg_temp.check_fails(
    'insert into public.parameter_def (siloe_param_id, in_siloe, name_es) values (null, true, ''x'')',
    'check constraint', 'a SILOE parameter must have a SILOE id');
  perform pg_temp.check_fails(
    'insert into public.parameter_def (siloe_param_id, in_siloe, name_es) values (null, false, ''x'')',
    'check constraint', 'a parameter outside SILOE needs a clave');
  perform pg_temp.check_fails(
    'insert into public.parameter_def (siloe_param_id, clave, in_siloe, name_es) values (null, ''sal'', false, ''Sal'')',
    'duplicate key', 'one row per clave and region');
end $$;

-- Readings of these parameters behave like any other measurement (org-scoped, signed = frozen).
select set_config('request.jwt.claim.sub', pg_temp.id('a_tech')::text, false);
set role authenticated;
do $$
declare v_sal uuid := (select id from public.parameter_def where clave = 'sal');
begin
  insert into public.measurement (org_id, report_id, parameter_def_id, value, status, compliant)
    values (pg_temp.id('a_org'), pg_temp.id('a_draft'), v_sal, 4.2, 'green', null);
  perform pg_temp.check_fails(
    format('insert into public.measurement (org_id, report_id, parameter_def_id, value, status)
            values (%L, %L, %L, 4, %L)', pg_temp.id('a_org'), pg_temp.id('a_signed'), v_sal, 'green'),
    'row-level security', 'no readings can be added to a signed report');
  perform pg_temp.check_fails('update public.parameter_def set max_ok = 9 where clave = ''sal''',
    'permission denied', 'members cannot change parameter definitions');
end $$;
reset role;

select set_config('request.jwt.claim.sub', pg_temp.id('b_admin')::text, false);
set role authenticated;
do $$
begin
  perform pg_temp.check((select count(*) from public.measurement) = 0,
    'org B sees none of org A''s readings');
  perform pg_temp.check((select count(*) from public.parameter_def where not in_siloe) = 4,
    'the parameter list itself is shared reference data');
end $$;
reset role;

-- SERVICE_LOG_NEXT
