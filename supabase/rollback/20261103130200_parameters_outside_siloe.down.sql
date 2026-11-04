-- Rollback for 20261103130200_parameters_outside_siloe.sql.
-- DESTRUCTIVE: deletes every reading of alkalinity, calcium hardness, salt and phosphates
-- (measurement rows of in_siloe = false parameters, signed reports included), then the four
-- parameter rows, then the columns. SILOE readings are untouched.

delete from public.measurement m
  using public.parameter_def d
  where m.parameter_def_id = d.id and not d.in_siloe;
delete from public.parameter_def where not in_siloe;

drop index if exists public.parameter_def_clave_ccaa_key;
alter table public.parameter_def drop constraint if exists parameter_def_siloe_id_or_clave;
alter table public.parameter_def alter column siloe_param_id set not null;
alter table public.parameter_def drop column if exists clave;
alter table public.parameter_def drop column if exists in_siloe;
