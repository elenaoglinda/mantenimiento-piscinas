-- Phase 8.1 — Invoicing core: fiscal identity, series with gapless numbering, invoices,
-- lines, and the Veri*Factu send-tracking columns.
--
-- Design notes (see docs/INVOICING.md):
--   * Money is stored as INTEGER CENTS (bigint), never floats. Rounding happens once, in SQL,
--     so the figures sent to AEAT and the ones shown in the UI cannot drift apart.
--   * Numbers are allocated ONLY at issue, never at creation, so an abandoned draft can never
--     leave a gap in the series (RD 1007/2023 forbids gaps).
--   * An issued invoice is immutable. Business columns are frozen by trigger; only the
--     send-tracking columns may change afterwards. Mistakes are corrected with a rectificativa
--     or an abono, never by editing.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'issued', 'void');

-- Mirrors the lifecycle of the record at Verifacti/AEAT, not the document itself.
create type public.invoice_send_status as enum (
  'not_sent', 'queued', 'sending', 'accepted', 'rejected', 'failed'
);

-- ---------------------------------------------------------------------------
-- billing_profile — the org's own fiscal identity (the "obligado tributario"/emisor)
-- ---------------------------------------------------------------------------
create table public.billing_profile (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null unique references public.org (id) on delete cascade,
  nif          text not null check (length(trim(nif)) > 0),
  razon_social text not null check (length(trim(razon_social)) > 0),
  direccion    text,
  cp           text,
  municipio    text,
  provincia    text,
  pais         text not null default 'ES',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id)
);

create trigger billing_profile_set_updated_at
  before update on public.billing_profile
  for each row execute function public.set_updated_at();

-- Fiscal address of the billed customer. `client.cif_nif` already exists.
alter table public.client
  add column billing_direccion text,
  add column billing_cp        text,
  add column billing_municipio text,
  add column billing_provincia text,
  add column billing_pais      text not null default 'ES';

-- ---------------------------------------------------------------------------
-- invoice_series — one counter per series. `next_number` is allocated under a row lock.
-- ---------------------------------------------------------------------------
create table public.invoice_series (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  code        text not null check (length(trim(code)) > 0),
  description text,
  next_number integer not null default 1 check (next_number >= 1),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, code)
);
create index invoice_series_org_id_idx on public.invoice_series (org_id);

create trigger invoice_series_set_updated_at
  before update on public.invoice_series
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoice
-- ---------------------------------------------------------------------------
create table public.invoice (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.org (id) on delete cascade,
  series_id        uuid not null,
  client_id        uuid not null,
  -- Allocated at issue. Null while the invoice is a draft.
  number           integer check (number is null or number >= 1),
  status           public.invoice_status not null default 'draft',
  issue_date       date,
  operation_date   date,
  tipo_factura     text not null default 'F1'
                     check (tipo_factura in ('F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5')),
  descripcion      text not null check (length(trim(descripcion)) > 0),
  -- Totals in cents, maintained by trigger from invoice_line.
  base_cents       bigint not null default 0,
  tax_cents        bigint not null default 0,
  total_cents      bigint not null default 0,
  notes            text,
  -- Veri*Factu / AEAT tracking. These remain writable after issue; everything else does not.
  send_status      public.invoice_send_status not null default 'not_sent',
  verifacti_uuid   text,
  verifacti_huella text,
  aeat_url         text,
  aeat_estado      text,
  send_attempts    integer not null default 0,
  last_error       text,
  sent_at          timestamptz,
  aeat_checked_at  timestamptz,
  -- Sent as the Idempotency-Key header so a retry can never create a second AEAT record.
  idempotency_key  uuid not null default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, series_id, number),
  foreign key (series_id, org_id) references public.invoice_series (id, org_id),
  foreign key (client_id, org_id) references public.client (id, org_id),
  constraint invoice_number_matches_status check (
    (status = 'draft' and number is null and issue_date is null)
    or (status <> 'draft' and number is not null and issue_date is not null)
  )
);
create index invoice_org_id_idx on public.invoice (org_id);
create index invoice_org_status_idx on public.invoice (org_id, status);
create index invoice_client_id_idx on public.invoice (client_id);
create index invoice_series_id_idx on public.invoice (series_id);
-- Drives the retry sweep.
create index invoice_send_status_idx on public.invoice (send_status)
  where send_status in ('queued', 'sending', 'failed');

create trigger invoice_set_updated_at
  before update on public.invoice
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoice_line — what the customer reads. AEAT receives only the per-rate aggregate.
-- ---------------------------------------------------------------------------
create table public.invoice_line (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.org (id) on delete cascade,
  invoice_id       uuid not null,
  line_no          integer not null default 0,
  description      text not null check (length(trim(description)) > 0),
  quantity         numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null,
  tax_rate         numeric(5, 2) not null default 21.00
                     check (tax_rate >= 0 and tax_rate <= 100),
  -- Rounded once, here, so the line total is never recomputed differently elsewhere.
  base_cents       bigint generated always as
                     (round(quantity * unit_price_cents)::bigint) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (invoice_id, org_id) references public.invoice (id, org_id) on delete cascade
);
create index invoice_line_invoice_id_idx on public.invoice_line (invoice_id);
create index invoice_line_org_id_idx on public.invoice_line (org_id);

create trigger invoice_line_set_updated_at
  before update on public.invoice_line
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Totals — one rounding rule, applied in one place.
-- AEAT reconciles the quota per tax rate, so the base is summed per rate FIRST and the
-- quota rounded once per rate. Rounding each line separately would drift by cents.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_tax_breakdown(p_invoice_id uuid)
returns table (tax_rate numeric, base_cents bigint, quota_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.tax_rate,
         sum(l.base_cents)::bigint,
         round(sum(l.base_cents) * l.tax_rate / 100)::bigint
    from public.invoice_line l
   where l.invoice_id = p_invoice_id
   group by l.tax_rate
   order by l.tax_rate;
$$;
revoke execute on function public.invoice_tax_breakdown(uuid) from public, anon;
grant execute on function public.invoice_tax_breakdown(uuid) to authenticated;

create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_base    bigint;
  v_tax     bigint;
begin
  v_invoice := coalesce(new.invoice_id, old.invoice_id);

  select coalesce(sum(b.base), 0), coalesce(sum(b.quota), 0)
    into v_base, v_tax
    from (
      select sum(l.base_cents) as base,
             round(sum(l.base_cents) * l.tax_rate / 100) as quota
        from public.invoice_line l
       where l.invoice_id = v_invoice
       group by l.tax_rate
    ) b;

  -- No-ops when the parent row is already gone (cascade delete).
  update public.invoice
     set base_cents = v_base, tax_cents = v_tax, total_cents = v_base + v_tax
   where id = v_invoice;

  return null;
end $$;

create trigger invoice_line_recalc_totals
  after insert or update or delete on public.invoice_line
  for each row execute function public.recalc_invoice_totals();

-- ---------------------------------------------------------------------------
-- Immutability — the legal core of the module.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'Una factura emitida no puede eliminarse; emita una rectificativa o un abono.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  -- Past draft, only the Veri*Factu send-tracking columns may still move.
  if (new.org_id, new.series_id, new.client_id, new.number, new.issue_date,
      new.operation_date, new.tipo_factura, new.descripcion,
      new.base_cents, new.tax_cents, new.total_cents, new.idempotency_key)
     is distinct from
     (old.org_id, old.series_id, old.client_id, old.number, old.issue_date,
      old.operation_date, old.tipo_factura, old.descripcion,
      old.base_cents, old.tax_cents, old.total_cents, old.idempotency_key)
  then
    raise exception
      'Una factura emitida es inmutable; emita una rectificativa o un abono.'
      using errcode = 'P0001';
  end if;

  if new.status <> old.status and not (old.status = 'issued' and new.status = 'void') then
    raise exception 'Transición de estado no permitida: % -> %.', old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger invoice_guard_immutable
  before update or delete on public.invoice
  for each row execute function public.invoice_guard_immutable();

-- Lines follow their invoice: once it leaves draft they are frozen too.
create or replace function public.invoice_line_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invoice_status;
begin
  select i.status into v_status
    from public.invoice i
   where i.id = coalesce(new.invoice_id, old.invoice_id);

  -- Parent already gone: this is a cascade delete, let it through.
  if v_status is not null and v_status <> 'draft' then
    raise exception
      'No se pueden modificar las líneas de una factura emitida.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger invoice_line_guard_immutable
  before insert or update or delete on public.invoice_line
  for each row execute function public.invoice_line_guard_immutable();

-- ---------------------------------------------------------------------------
-- issue_invoice — allocates the number and freezes the document, in one transaction.
-- The series row is locked FOR UPDATE, so concurrent issues serialise and the sequence
-- can never skip a value (a Postgres SEQUENCE would, on rollback).
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoice
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.current_org_id();
  v_inv    public.invoice;
  v_number integer;
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado para emitir facturas.' using errcode = '42501';
  end if;

  select * into v_inv
    from public.invoice
   where id = p_invoice_id and org_id = v_org
   for update;

  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'La factura ya fue emitida.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_line where invoice_id = v_inv.id) then
    raise exception 'La factura no tiene líneas.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.billing_profile where org_id = v_org) then
    raise exception 'Faltan los datos fiscales de la empresa.' using errcode = 'P0001';
  end if;

  -- Lock the counter, then allocate.
  select next_number into v_number
    from public.invoice_series
   where id = v_inv.series_id and org_id = v_org
   for update;

  update public.invoice_series
     set next_number = next_number + 1
   where id = v_inv.series_id;

  update public.invoice
     set number      = v_number,
         status      = 'issued',
         -- Verifacti requires fecha_expedicion to be today, in Spain.
         issue_date  = (now() at time zone 'Europe/Madrid')::date,
         send_status = 'queued'
   where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end $$;
revoke execute on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.billing_profile enable row level security;
alter table public.invoice_series  enable row level security;
alter table public.invoice         enable row level security;
alter table public.invoice_line    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['billing_profile', 'invoice_series', 'invoice', 'invoice_line']
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

grant select, insert, update, delete on public.billing_profile to authenticated;
grant select, insert, update, delete on public.invoice_series  to authenticated;
grant select, insert, update, delete on public.invoice         to authenticated;
grant select, insert, update, delete on public.invoice_line    to authenticated;
