-- Phase 2.1 — Core domain: client, pool, basin, treatment + reference tables
-- (siloe_catalog, parameter_def). All tenant tables key off org_id and reuse the
-- current_org_id()/current_user_role() helpers from Phase 1. Org consistency across the
-- client→pool→basin→treatment tree is enforced with composite (id, org_id) foreign keys, so
-- a child can never point at a parent in another org. See docs/technical-spec.md §5.1, §7.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.pool_type as enum ('tipo_1', 'tipo_2', 'tipo_3a');
create type public.water_source as enum ('red_publica', 'mar', 'captacion_propia');
create type public.basin_class as enum ('cubierto', 'descubierto', 'mixto');
create type public.treatment_kind as enum (
  'filtracion', 'desinfeccion', 'coagulacion', 'correccion_ph', 'otros'
);
create type public.param_medium as enum ('water', 'air');

-- Roles allowed to mutate domain data (viewer is read-only).
create or replace function public.current_user_can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() in ('admin', 'technician');
$$;
revoke execute on function public.current_user_can_write() from public, anon;
grant execute on function public.current_user_can_write() to authenticated;

-- ---------------------------------------------------------------------------
-- client
-- ---------------------------------------------------------------------------
create table public.client (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.org (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  cif_nif       text,
  contact_email text,
  contact_phone text,
  is_self       boolean not null default false, -- the implicit client for owner orgs
  archived      boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id)
);
create index client_org_id_idx on public.client (org_id);

-- ---------------------------------------------------------------------------
-- pool (SILOE "instalación")
-- ---------------------------------------------------------------------------
create table public.pool (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.org (id) on delete cascade,
  client_id         uuid not null,
  denominacion      text not null check (length(trim(denominacion)) > 0),
  pool_type         public.pool_type,
  agua_alimentacion public.water_source[] not null default '{}',
  -- Territorial (free text now; mapped to SILOE id_localidad/id_isla in Phase 5)
  ccaa              text,
  provincia         text,
  municipio         text,
  localidad         text,
  cp                text,
  direccion         text,
  lat               numeric(12, 10),
  lng               numeric(13, 10),
  -- SILOE identifiers (assigned by SILOE after registration)
  siloe_cod_p       text,
  siloe_cod_ccaa    text,
  observaciones     text,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (client_id, org_id) references public.client (id, org_id) on delete restrict
);
create index pool_org_id_idx on public.pool (org_id);
create index pool_client_id_idx on public.pool (client_id);

-- ---------------------------------------------------------------------------
-- basin (SILOE "vaso")
-- ---------------------------------------------------------------------------
create table public.basin (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.org (id) on delete cascade,
  pool_id        uuid not null,
  num_orden      integer,
  denominacion   text not null check (length(trim(denominacion)) > 0),
  clase          public.basin_class,
  tipo_vaso      text[] not null default '{}', -- labels now; → SILOE id_tipo_vaso in Phase 5
  capacidad_m3   numeric(12, 2),
  lamina_m2      numeric(12, 2),
  prof_max       numeric(4, 2),
  prof_min       numeric(4, 2),
  siloe_cod_v    text,
  siloe_cod_v_p  text,
  observaciones  text,
  fecha_baja     date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id),
  foreign key (pool_id, org_id) references public.pool (id, org_id) on delete cascade
);
create index basin_pool_id_idx on public.basin (pool_id);
create index basin_org_id_idx on public.basin (org_id);

-- ---------------------------------------------------------------------------
-- treatment (per basin)
-- ---------------------------------------------------------------------------
create table public.treatment (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.org (id) on delete cascade,
  basin_id      uuid not null,
  kind          public.treatment_kind not null,
  -- kind-specific data (sistemas, sustancias, filtration superficie/velocidad, etc.).
  -- Free-form until the SILOE registration catalogs (id_sistema/id_sustancia) arrive.
  details       jsonb not null default '{}',
  comercial     text,
  observaciones text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (basin_id, org_id) references public.basin (id, org_id) on delete cascade
);
create index treatment_basin_id_idx on public.treatment (basin_id);
create index treatment_org_id_idx on public.treatment (org_id);

-- ---------------------------------------------------------------------------
-- Reference data: siloe_catalog (SILOE code tables) + parameter_def (thresholds)
-- ---------------------------------------------------------------------------
create table public.siloe_catalog (
  id        bigint generated always as identity primary key,
  kind      text not null,        -- parametro | lugar | metodo | tipo_pm | tipo_analisis | motivo_cierre
  siloe_id  integer not null,     -- the numeric code SILOE expects
  label_es  text not null,
  extra     jsonb not null default '{}',
  unique (kind, siloe_id)
);

create table public.parameter_def (
  id             uuid primary key default gen_random_uuid(),
  siloe_param_id integer not null,            -- → siloe_catalog parametro id_parametro
  ccaa           text,                        -- null = national RD 742/2013 default; 'CT' = Cataluña
  name_es        text not null,
  unit           text,
  medium         public.param_medium not null default 'water',
  min_ok         numeric,
  max_ok         numeric,
  min_warn       numeric,
  max_warn       numeric,
  closure_min    numeric,
  closure_max    numeric,
  warn_margin_ratio numeric not null default 0.1,
  frequency      text,                         -- e.g. daily | monthly
  mandatory      boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (siloe_param_id, ccaa)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger client_set_updated_at before update on public.client
  for each row execute function public.set_updated_at();
create trigger pool_set_updated_at before update on public.pool
  for each row execute function public.set_updated_at();
create trigger basin_set_updated_at before update on public.basin
  for each row execute function public.set_updated_at();
create trigger treatment_set_updated_at before update on public.treatment
  for each row execute function public.set_updated_at();
create trigger parameter_def_set_updated_at before update on public.parameter_def
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Owner orgs get an implicit "self" client automatically.
-- ---------------------------------------------------------------------------
create or replace function public.create_self_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'owner' then
    insert into public.client (org_id, name, is_self) values (new.id, new.name, true);
  end if;
  return new;
end;
$$;

create trigger org_create_self_client
  after insert on public.org
  for each row execute function public.create_self_client();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client enable row level security;
alter table public.pool enable row level security;
alter table public.basin enable row level security;
alter table public.treatment enable row level security;
alter table public.siloe_catalog enable row level security;
alter table public.parameter_def enable row level security;

-- Tenant tables: read within org; write requires admin/technician in the same org.
do $$
declare t text;
begin
  foreach t in array array['client', 'pool', 'basin', 'treatment']
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

-- Reference tables: readable by any authenticated user; only seeded via migrations.
create policy siloe_catalog_select on public.siloe_catalog
  for select to authenticated using (true);
create policy parameter_def_select on public.parameter_def
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs rows)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.client to authenticated;
grant select, insert, update, delete on public.pool to authenticated;
grant select, insert, update, delete on public.basin to authenticated;
grant select, insert, update, delete on public.treatment to authenticated;
grant select on public.siloe_catalog to authenticated;
grant select on public.parameter_def to authenticated;
