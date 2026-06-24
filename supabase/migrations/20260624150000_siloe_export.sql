-- Phase 5.1 — SILOE annual-results export: aggregated per-basin/season results that map to the
-- `muestreo`/`mvaso`/`parametro` XML (Appendix A), their open/close sub-periods, and an export
-- log. Org-scoped RLS; write requires admin/technician. See docs/technical-spec.md §5.2.

-- ---------------------------------------------------------------------------
-- annual_result (one per basin + year + analysis type → SILOE mvaso)
-- ---------------------------------------------------------------------------
create table public.annual_result (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.org (id) on delete cascade,
  basin_id        uuid not null,
  year            integer not null,
  analysis_type   public.analysis_type not null default 'autocontrol',
  fecha_apertura  date,
  fecha_cierre    date,
  dias_apertura   integer,
  n_iniciales     integer not null default 0,
  n_rutina        integer not null default 0,
  n_periodicos    integer not null default 0,
  n_vigilancia    integer,
  punto_muestreo  smallint not null default 2, -- SILOE TIPO_PM
  laboratorio     text,                         -- SILOE lab code
  observaciones   text,
  generated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id),
  unique (basin_id, year, analysis_type),
  foreign key (basin_id, org_id) references public.basin (id, org_id) on delete cascade
);
create index annual_result_org_year_idx on public.annual_result (org_id, year);

-- ---------------------------------------------------------------------------
-- annual_result_param (one per parameter → SILOE parametro)
-- ---------------------------------------------------------------------------
create table public.annual_result_param (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.org (id) on delete cascade,
  annual_result_id  uuid not null,
  siloe_param_id    integer not null,   -- id_parametro
  id_lugar          smallint not null default 1, -- LUGAR
  id_metodo         smallint not null default 14, -- METODO (14 = Otros default)
  deter             integer not null default 0,   -- nº determinaciones
  deter_c           integer not null default 0,   -- nº conformes
  dias_nc           integer not null default 0,   -- días incumplimiento
  vc_med            numeric,
  vc_min            numeric,
  vc_max            numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (annual_result_id, org_id)
    references public.annual_result (id, org_id) on delete cascade,
  unique (annual_result_id, siloe_param_id)
);
create index annual_result_param_ar_idx on public.annual_result_param (annual_result_id);

-- ---------------------------------------------------------------------------
-- annual_result_period (peraperturas — multiple open/close spans in a year)
-- ---------------------------------------------------------------------------
create table public.annual_result_period (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.org (id) on delete cascade,
  annual_result_id  uuid not null,
  per_fecha_a       date not null,
  per_fecha_c       date not null,
  per_num_dias      integer not null,
  per_observ_cierre text,
  per_id_motivo     smallint, -- MOTIVO_CIERRE
  created_at        timestamptz not null default now(),
  foreign key (annual_result_id, org_id)
    references public.annual_result (id, org_id) on delete cascade
);
create index annual_result_period_ar_idx on public.annual_result_period (annual_result_id);

-- ---------------------------------------------------------------------------
-- xml_export (history of generated files)
-- ---------------------------------------------------------------------------
create table public.xml_export (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.org (id) on delete cascade,
  kind         text not null, -- 'resultado_anual' | 'piscina'
  period_year  integer,
  item_count   integer not null default 0,
  file_path    text,
  created_by   uuid references public.app_user (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index xml_export_org_idx on public.xml_export (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger annual_result_set_updated_at before update on public.annual_result
  for each row execute function public.set_updated_at();
create trigger annual_result_param_set_updated_at before update on public.annual_result_param
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (org-scoped; writes require admin/technician)
-- ---------------------------------------------------------------------------
alter table public.annual_result enable row level security;
alter table public.annual_result_param enable row level security;
alter table public.annual_result_period enable row level security;
alter table public.xml_export enable row level security;

do $$
declare t text;
begin
  foreach t in array array['annual_result', 'annual_result_param', 'annual_result_period', 'xml_export']
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated
         using (org_id = public.current_org_id());', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated
         with check (org_id = public.current_org_id() and public.current_user_can_write());', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write())
         with check (org_id = public.current_org_id() and public.current_user_can_write());', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write());', t);
  end loop;
end $$;

grant select, insert, update, delete on public.annual_result to authenticated;
grant select, insert, update, delete on public.annual_result_param to authenticated;
grant select, insert, update, delete on public.annual_result_period to authenticated;
grant select, insert, update, delete on public.xml_export to authenticated;
