-- Phase 2.3 — Seed parameter_def with RD 742/2013 national thresholds (ccaa = null) plus a
-- Cataluña ('CT') override scaffold. The app resolves a parameter for a pool by preferring the
-- CT row, falling back to the national default. Thresholds feed the evaluate() traffic-light.
--
-- NOTE: exact Cataluña parametric values are still to be confirmed against the current Catalan
-- decree (technical-spec.md §13.3). Only free chlorine is seeded as a (provisional, commonly
-- stricter) CT override; all other Catalan params fall back to the national RD values, which
-- apply in Cataluña as the legal floor regardless.
-- Idempotent on (siloe_param_id, ccaa).

insert into public.parameter_def
  (siloe_param_id, ccaa, name_es, unit, medium, min_ok, max_ok, closure_min, closure_max, frequency, mandatory)
values
  -- In-situ water, mandatory (daily)
  (1,  null, 'pH', 'pH', 'water', 7.2, 8.0, 6.0, 9.0, 'daily', true),
  (2,  null, 'Potencial REDOX', 'mV', 'water', 250, 900, null, null, 'daily', true),
  (3,  null, 'Temperatura del agua', '°C', 'water', 24, 30, null, 40, 'daily', true),
  (4,  null, 'Tiempo de recirculación', 'horas', 'water', null, null, null, null, 'daily', true),
  (5,  null, 'Transparencia', null, 'water', null, null, null, null, 'daily', true),
  (6,  null, 'Turbidez', 'UNF', 'water', null, 5, null, null, 'daily', true),
  (7,  null, 'Ácido isocianúrico', 'mg/L', 'water', null, 75, null, null, 'daily', true),
  (8,  null, 'Bromo total', 'mg/L', 'water', 2, 5, null, null, 'daily', true),
  (9,  null, 'Cloro combinado residual', 'mg/L', 'water', null, 0.6, null, null, 'daily', true),
  (10, null, 'Cloro libre residual', 'mg/L', 'water', 0.5, 2.0, null, null, 'daily', true),
  -- Lab water, mandatory (monthly)
  (11, null, 'E. coli', 'UFC/100ml', 'water', null, 0, null, null, 'monthly', true),
  (12, null, 'Legionella sp', 'UFC/L', 'water', null, 100, null, null, 'monthly', true),
  (13, null, 'P. aeruginosa', 'UFC/100ml', 'water', null, 0, null, null, 'monthly', true),
  -- Air, mandatory for covered pools (daily)
  (14, null, 'CO2', 'mg/m3', 'air', null, 500, null, null, 'daily', true),
  (15, null, 'Humedad relativa aire', '%', 'air', null, 65, null, null, 'daily', true),
  (16, null, 'Temperatura ambiente', '°C', 'air', null, null, null, null, 'daily', true),
  -- Cataluña override (provisional — confirm vs Catalan decree, §13.3)
  (10, 'CT', 'Cloro libre residual', 'mg/L', 'water', 0.5, 1.5, null, null, 'daily', true)
on conflict (siloe_param_id, ccaa) do update set
  name_es = excluded.name_es,
  unit = excluded.unit,
  medium = excluded.medium,
  min_ok = excluded.min_ok,
  max_ok = excluded.max_ok,
  closure_min = excluded.closure_min,
  closure_max = excluded.closure_max,
  frequency = excluded.frequency,
  mandatory = excluded.mandatory;
