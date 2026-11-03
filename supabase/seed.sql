-- Local development seed: a small "Piscinas Mediterráneo (demo)" org with a login, loaded by
-- `supabase db reset` (config.toml: [db.seed]). The full 90-day demo for sales demos is
-- scripts/demo-seed.ts; this is the quick version for working on the app locally.
--
-- Login (LOCAL ONLY): demo@cloro.local / demo-local
--
-- Safety: it seeds only an EMPTY database (no org at all) and does nothing otherwise, so it can
-- never add a known login or demo rows to a database that already has customers. Supabase
-- runs seed files on local resets and on preview branches, not on production; the guard is the
-- second lock. CI loads it on top of the migrations to keep it working.

do $seed$
declare
  v_user   uuid := 'd0000000-0000-4000-8000-000000000001';
  v_org    uuid := 'd0000000-0000-4000-8000-000000000002';
  v_c1     uuid := 'd0000000-0000-4000-8000-000000000011';
  v_c2     uuid := 'd0000000-0000-4000-8000-000000000012';
  v_p1     uuid := 'd0000000-0000-4000-8000-000000000021';
  v_p2     uuid := 'd0000000-0000-4000-8000-000000000022';
  v_b1     uuid := 'd0000000-0000-4000-8000-000000000031';
  v_b2     uuid := 'd0000000-0000-4000-8000-000000000032';
  v_b3     uuid := 'd0000000-0000-4000-8000-000000000033';
  v_ph     uuid;
  v_cl     uuid;
  v_cc     uuid;
  v_report uuid;
  v_day    date;
  v_basin  record;
  v_ph_val numeric;
  v_cl_val numeric;
  v_n      int := 0;
  v_route  uuid := 'd0000000-0000-4000-8000-000000000041';
  v_series uuid := 'd0000000-0000-4000-8000-000000000051';
  v_inv    uuid := 'd0000000-0000-4000-8000-000000000052';
begin
  if exists (select 1 from public.org) then
    raise notice 'seed.sql: the database already has organisations; nothing seeded.';
    return;
  end if;

  -- The login. On a real Supabase stack (auth.identities exists) with a password; on the bare
  -- Postgres CI uses, just the user row the app_user foreign key needs.
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
        'demo@cloro.local', extensions.crypt('demo-local', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{"full_name":"Administración (demo)"}',
        now(), now(), '', '', '', '')
    $q$ using v_user;
    execute $q$
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), $1, $1::text,
        jsonb_build_object('sub', $1::text, 'email', 'demo@cloro.local', 'email_verified', true),
        'email', now(), now(), now())
    $q$ using v_user;
  else
    execute 'insert into auth.users (id) values ($1)' using v_user;
  end if;

  insert into public.org (id, type, name) values (v_org, 'company', 'Piscinas Mediterráneo (demo)');
  insert into public.app_user (id, org_id, role, full_name, email)
  values (v_user, v_org, 'admin', 'Administración (demo)', 'demo@cloro.local');
  perform public.seed_org_catalogues(v_org);

  insert into public.client (id, org_id, name, contact_email, notes) values
    (v_c1, v_org, 'Comunidad de Propietarios Residencial Mar Azul',
      'administracion@marazul.example.com', 'Llaves en conserjería.'),
    (v_c2, v_org, 'Hotel Costa Blanca Playa', 'mantenimiento@hotelcostablanca.example.com', null);

  insert into public.pool (id, org_id, client_id, denominacion, pool_type, ccaa, provincia,
    municipio, cp, direccion, lat, lng, siloe_cod_p, agua_alimentacion) values
    (v_p1, v_org, v_c1, 'Residencial Mar Azul · Fase I', 'tipo_3a', 'Comunitat Valenciana',
      'Alicante', 'Alicante', '03540', 'Avenida de Niza, 21', 38.3712, -0.4123, '030140',
      '{red_publica}'),
    (v_p2, v_org, v_c2, 'Hotel Costa Blanca · Spa', 'tipo_2', 'Comunitat Valenciana',
      'Alicante', 'Benidorm', '03503', 'Avenida del Mediterráneo, 112', 38.5362, -0.1183,
      '030144', '{red_publica}');

  insert into public.basin (id, org_id, pool_id, num_orden, denominacion, clase, siloe_cod_v) values
    (v_b1, v_org, v_p1, 1, 'Piscina de adultos', 'descubierto', 'V011'),
    (v_b2, v_org, v_p1, 2, 'Piscina infantil', 'descubierto', 'V012'),
    (v_b3, v_org, v_p2, 1, 'Piscina climatizada', 'cubierto', 'V051');

  select id into v_ph from public.parameter_def where siloe_param_id = 1 and ccaa is null;
  select id into v_cl from public.parameter_def where siloe_param_id = 10 and ccaa is null;
  select id into v_cc from public.parameter_def where siloe_param_id = 9 and ccaa is null;

  -- 30 days, Monday/Wednesday/Friday, one report per vaso. The last 7 days are signed.
  for v_day in select d::date from generate_series(current_date - 29, current_date, '1 day') d loop
    continue when extract(isodow from v_day) not in (1, 3, 5);
    for v_basin in select id, pool_id from public.basin where org_id = v_org order by id loop
      v_n := v_n + 1;
      v_report := gen_random_uuid();
      v_ph_val := round((7.45 + 0.2 * sin(v_n / 3.0))::numeric, 2);
      v_cl_val := case when v_n = 7 then 0.3 else round((1.15 + 0.3 * cos(v_n / 4.0))::numeric, 2) end;
      insert into public.report (id, org_id, pool_id, basin_id, technician_id, visited_at, status,
        signed_at, signed_by_name, signed_by_dni)
      values (v_report, v_org, v_basin.pool_id, v_basin.id, v_user,
        (v_day + time '09:30') at time zone 'Europe/Madrid',
        case when v_day > current_date - 7 then 'signed' else 'completed' end::public.report_status,
        case when v_day > current_date - 7 then (v_day + time '10:00') at time zone 'Europe/Madrid' end,
        case when v_day > current_date - 7 then 'Marta Soler' end,
        case when v_day > current_date - 7 then '12345678Z' end);
      insert into public.measurement (org_id, report_id, parameter_def_id, value, compliant, status) values
        (v_org, v_report, v_ph, v_ph_val, true, 'green'),
        (v_org, v_report, v_cl, v_cl_val, v_cl_val >= 0.5,
          case when v_cl_val < 0.5 then 'red' else 'green' end::public.measurement_status),
        (v_org, v_report, v_cc, 0.2, true, 'green');
      if v_cl_val < 0.5 then
        insert into public.incident (org_id, report_id, description, corrective_action)
        values (v_org, v_report, 'Cloro libre por debajo del mínimo legal.',
          'Cloración de choque; nueva medición: 1,1 mg/L.');
      end if;
      insert into public.report_chemical (org_id, report_id, product_id, cantidad, unidad)
      select v_org, v_report, id, 0.5, unidad from public.chemical_product
       where org_id = v_org and nombre = 'Cloro granulado';
      insert into public.report_task (org_id, report_id, task_id, hecho)
      select v_org, v_report, id, true from public.task_def
       where org_id = v_org and orden in (1, 3);
    end loop;
  end loop;

  -- Today's route: both pools, still to do.
  insert into public.route (id, org_id, technician_id, route_date, start_lat, start_lng)
  values (v_route, v_org, v_user, current_date, 38.3452, -0.481);
  insert into public.route_stop (org_id, route_id, pool_id, seq) values
    (v_org, v_route, v_p1, 1), (v_org, v_route, v_p2, 2);

  -- One draft invoice (no billing profile: it can't be issued).
  insert into public.invoice_series (id, org_id, code, description)
  values (v_series, v_org, 'DEMO', 'Serie de la demo (solo borradores)');
  insert into public.invoice (id, org_id, series_id, client_id, descripcion)
  values (v_inv, v_org, v_series, v_c1, 'Mantenimiento de piscinas (borrador de la demo)');
  insert into public.invoice_line (org_id, invoice_id, line_no, description, quantity, unit_price_cents)
  values (v_org, v_inv, 1, 'Mantenimiento mensual Fase I', 1, 32000);

  raise notice 'seed.sql: demo org seeded; sign in as demo@cloro.local / demo-local.';
end
$seed$;
