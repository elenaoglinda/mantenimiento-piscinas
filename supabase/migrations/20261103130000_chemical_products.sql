-- Service log, part 1: chemicals added at each visit.
--   chemical_product  the org's catalogue (what the technician can pick), preloaded with the
--                     usual products for every org, existing and new.
--   report_chemical   what was added at one visit, with quantity and unit.
-- Same tenancy pattern as every other tenant table (docs/ONBOARDING.md §5.2): org_id, RLS,
-- composite (id, org_id) foreign keys, updated_at trigger. report_chemical follows
-- report_is_editable(), so a signed report's products can't change.
-- Rollback: supabase/rollback/20261103130000_chemical_products.down.sql

create type public.chemical_unit as enum ('kg', 'g', 'L', 'ml', 'pastillas', 'uds');

-- ---------------------------------------------------------------------------
-- chemical_product: the org's catalogue
-- ---------------------------------------------------------------------------
create table public.chemical_product (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.org (id) on delete cascade,
  nombre             text not null check (btrim(nombre) <> ''),
  unidad             public.chemical_unit not null,
  cantidad_habitual  numeric(10, 3) check (cantidad_habitual is null or cantidad_habitual > 0),
  activo             boolean not null default true,
  orden              integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id)
);
create index chemical_product_org_idx on public.chemical_product (org_id, orden);
-- One "Floculante" per org, whatever the capitalisation.
create unique index chemical_product_org_nombre_key
  on public.chemical_product (org_id, lower(btrim(nombre)));

-- ---------------------------------------------------------------------------
-- report_chemical: products added at a visit
-- ---------------------------------------------------------------------------
create table public.report_chemical (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  report_id   uuid not null,
  product_id  uuid not null,
  cantidad    numeric(10, 3) not null check (cantidad > 0),
  -- Copied from the product when recorded, so a later change to the catalogue never rewrites
  -- what was logged.
  unidad      public.chemical_unit not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (report_id, org_id) references public.report (id, org_id) on delete cascade,
  -- A product that was ever used can't be deleted, only deactivated: the log must keep it.
  foreign key (product_id, org_id) references public.chemical_product (id, org_id) on delete restrict
);
create index report_chemical_report_idx on public.report_chemical (report_id);
create index report_chemical_product_idx on public.report_chemical (product_id);

create trigger chemical_product_set_updated_at before update on public.chemical_product
  for each row execute function public.set_updated_at();
create trigger report_chemical_set_updated_at before update on public.report_chemical
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.chemical_product enable row level security;
alter table public.report_chemical enable row level security;

-- Catalogue: everyone in the org reads it; only admins change it (Ajustes).
create policy chemical_product_select on public.chemical_product
  for select to authenticated using (org_id = public.current_org_id());
create policy chemical_product_insert on public.chemical_product
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');
create policy chemical_product_update on public.chemical_product
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin')
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');
create policy chemical_product_delete on public.chemical_product
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin');

-- Per-visit rows: like measurement — can_write AND the report still editable (not signed).
create policy report_chemical_select on public.report_chemical
  for select to authenticated using (org_id = public.current_org_id());
create policy report_chemical_insert on public.report_chemical
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_can_write()
              and public.report_is_editable(report_id));
create policy report_chemical_update on public.report_chemical
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write()
         and public.report_is_editable(report_id))
  with check (org_id = public.current_org_id() and public.current_user_can_write()
              and public.report_is_editable(report_id));
create policy report_chemical_delete on public.report_chemical
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write()
         and public.report_is_editable(report_id));

grant select, insert, update, delete on public.chemical_product to authenticated;
grant select, insert, update, delete on public.report_chemical to authenticated;

-- ---------------------------------------------------------------------------
-- Default catalogue, for every existing org and (through provision_account) every new one.
-- ---------------------------------------------------------------------------
create or replace function public.seed_org_catalogues(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chemical_product (org_id, nombre, unidad, orden)
  values
    (p_org_id, 'Cloro granulado', 'kg', 1),
    (p_org_id, 'Cloro en pastillas', 'pastillas', 2),
    (p_org_id, 'Minorador de pH', 'kg', 3),
    (p_org_id, 'Incrementador de pH', 'kg', 4),
    (p_org_id, 'Floculante', 'L', 5),
    (p_org_id, 'Alguicida', 'L', 6),
    (p_org_id, 'Clarificante', 'L', 7),
    (p_org_id, 'Sal', 'kg', 8)
  on conflict do nothing;
end;
$$;
-- Internal: only provision_account (and this migration) call it. Nobody can seed another org.
revoke execute on function public.seed_org_catalogues(uuid) from public, anon, authenticated;

select public.seed_org_catalogues(id) from public.org;

-- provision_account: unchanged, plus the default catalogue for the new org.
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

  perform public.seed_org_catalogues(v_org.id);

  return v_org;
end;
$$;
revoke execute on function public.provision_account(public.org_type, text, text) from public, anon;
grant execute on function public.provision_account(public.org_type, text, text) to authenticated;
