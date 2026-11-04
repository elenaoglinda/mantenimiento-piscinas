-- Service log, part 3: readings private pools care about that SILOE doesn't ask for.
--
-- parameter_def gains:
--   in_siloe  true for every existing row (they are the SILOE parameters); false for the new
--             ones. The SILOE aggregation, the XML export and the photo-import prompt only ever
--             use in_siloe rows (packages/shared/src/siloe/season.ts, pinned by a byte-for-byte
--             XML test).
--   clave     stable key for a parameter without a SILOE id (e.g. 'alcalinidad_total').
-- siloe_param_id becomes nullable, but only for in_siloe = false rows (check constraint).
--
-- New rows (national, no CCAA override). min_ok/max_ok hold the RECOMMENDED range here — there is
-- no legal limit; the app labels them "recomendado", never "legal".
--   Alcalinidad total  mg/L CaCO3  80–120
--   Dureza cálcica     mg/L CaCO3  200–400
--   Sal                g/L         3–5
--   Fosfatos           mg/L        < 0,1
-- Rollback: supabase/rollback/20261103130200_parameters_outside_siloe.down.sql

alter table public.parameter_def
  add column in_siloe boolean not null default true,
  add column clave text,
  alter column siloe_param_id drop not null;

alter table public.parameter_def
  add constraint parameter_def_siloe_id_or_clave check (
    (in_siloe and siloe_param_id is not null)
    or (not in_siloe and siloe_param_id is null and clave is not null)
  );

create unique index parameter_def_clave_ccaa_key
  on public.parameter_def (clave, coalesce(ccaa, ''))
  where clave is not null;

insert into public.parameter_def
  (siloe_param_id, clave, in_siloe, ccaa, name_es, unit, medium, min_ok, max_ok, mandatory)
values
  (null, 'alcalinidad_total', false, null, 'Alcalinidad total', 'mg/L CaCO3', 'water', 80, 120, false),
  (null, 'dureza_calcica', false, null, 'Dureza cálcica', 'mg/L CaCO3', 'water', 200, 400, false),
  (null, 'sal', false, null, 'Sal', 'g/L', 'water', 3, 5, false),
  (null, 'fosfatos', false, null, 'Fosfatos', 'mg/L', 'water', null, 0.1, false)
on conflict do nothing;
