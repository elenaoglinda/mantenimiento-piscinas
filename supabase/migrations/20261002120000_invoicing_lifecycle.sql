-- Phase 1a — Veri*Factu fiscal lifecycle, enforced in the database.
--
-- The UI may not be the only client of this schema, and an illegal fiscal transition is not a
-- cosmetic bug, so every rule here is a constraint or a trigger. The UI's job is to not offer
-- the illegal action; the database's job is to refuse it anyway.
--
-- State is carried by the EXISTING pair (invoice.status, invoice.send_status). No enum value is
-- added, deliberately: `alter type ... add value` cannot be used in the same transaction that
-- references the new value, which makes it a poor fit for a migration that also defines
-- functions using it. The pair already expresses every state the spec needs:
--
--   Borrador             status=draft   send=not_sent
--   Pendiente de envío   status=issued  send in (queued, sending, failed)
--   Enviada              status=issued  send=accepted   (aeat_estado distinguishes
--                                                        Correcta / AceptadaConErrores)
--   Rechazada            status=issued  send=rejected
--   Anulada              status=void
--   Rectificada          DERIVED — a rectificativa points at this invoice. Never stored, so it
--                        cannot go stale.
--   Vencida              DERIVED from due_date. Same reason.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.aeat_record_kind as enum ('alta', 'anulacion', 'subsanacion');

create type public.invoice_activity_kind as enum (
  'created', 'edited', 'issued',
  'aeat_queued', 'aeat_accepted', 'aeat_rejected',
  'send_failed', 'send_retried', 'needs_attention',
  'resubmitted', 'subsanacion',
  'cancelled', 'replaced_by', 'rectified_by',
  'emailed', 'paid'
);

create type public.invoice_payment_status as enum ('pending', 'paid');

-- ---------------------------------------------------------------------------
-- invoice: lifecycle columns
-- ---------------------------------------------------------------------------
alter table public.invoice
  -- Rectificativa linkage, both directions navigable.
  add column rectifies_invoice_id      uuid,
  add column rectificativa_tipo        text check (rectificativa_tipo in ('S', 'I')),
  add column rectificativa_base_cents  bigint,
  add column rectificativa_quota_cents bigint,
  -- "Anular y crear nueva": the replacement ALWAYS gets its own number.
  add column replaced_by_invoice_id    uuid,
  add column cancelled_at              timestamptz,
  -- Payment is a separate axis from the fiscal state.
  add column payment_status            public.invoice_payment_status not null default 'pending',
  add column paid_at                   timestamptz,
  add column due_date                  date,
  -- AEAT's Codigo Seguro de Verificacion, IF a response ever carries one. Verifacti's
  -- documented responses do not expose it and the raw XML payloads are not readable, so this
  -- is populated opportunistically and nothing may depend on it being present.
  add column aeat_csv                  text;

alter table public.invoice
  add constraint invoice_rectifies_fkey
    foreign key (rectifies_invoice_id, org_id) references public.invoice (id, org_id),
  add constraint invoice_replaced_by_fkey
    foreign key (replaced_by_invoice_id, org_id) references public.invoice (id, org_id),
  -- A rectificativa is exactly: an R-type invoice that names its original.
  add constraint invoice_rectificativa_coherent check (
    (tipo_factura like 'R%' and rectifies_invoice_id is not null and rectificativa_tipo is not null)
    or (tipo_factura not like 'R%' and rectifies_invoice_id is null
        and rectificativa_tipo is null)
  ),
  -- Por sustitución carries the rectified amounts; por diferencias does not.
  add constraint invoice_rectificativa_sustitucion check (
    rectificativa_tipo is distinct from 'S'
    or (rectificativa_base_cents is not null and rectificativa_quota_cents is not null)
  ),
  add constraint invoice_cancelled_at_matches_status check (
    (status = 'void') = (cancelled_at is not null)
  ),
  add constraint invoice_paid_at_matches_status check (
    (payment_status = 'paid') = (paid_at is not null)
  ),
  -- A draft has never been issued, so it cannot have been paid or cancelled.
  add constraint invoice_draft_not_settled check (
    status <> 'draft' or (payment_status = 'pending' and cancelled_at is null)
  );

create index invoice_rectifies_idx on public.invoice (rectifies_invoice_id)
  where rectifies_invoice_id is not null;
create index invoice_payment_idx on public.invoice (org_id, payment_status)
  where status <> 'draft';

-- ---------------------------------------------------------------------------
-- invoice_aeat_record — one row per *registro de facturación* sent to AEAT.
-- An invoice can accumulate several: the alta, later a subsanación, or an anulación. Modelling
-- them separately keeps each one's idempotency key, attempts and verdict distinct, which a
-- flat set of columns on `invoice` cannot do once the second registro exists.
-- ---------------------------------------------------------------------------
create table public.invoice_aeat_record (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.org (id) on delete cascade,
  invoice_id      uuid not null,
  kind            public.aeat_record_kind not null,
  -- 'N' prior record accepted · 'X' prior record rejected · 'S' prior subsanación rejected
  rechazo_previo  char(1) check (rechazo_previo in ('N', 'X', 'S')),
  -- 'S' when AEAT holds no record of the invoice being annulled (a rejected or never-sent
  -- alta). Documented as: "indicar si la factura que se quiere anular existe en la AEAT".
  sin_registro_previo char(1) check (sin_registro_previo in ('N', 'S')),
  idempotency_key uuid not null default gen_random_uuid(),
  estado          text,
  verifacti_uuid  text,
  huella          text,
  aeat_url        text,
  aeat_csv        text,
  error_code      text,
  error_message   text,
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  -- Exponential-ish backoff. A worker must not pick the record up before this.
  next_attempt_at timestamptz,
  settled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id),
  foreign key (invoice_id, org_id) references public.invoice (id, org_id) on delete cascade
);
create index invoice_aeat_record_invoice_idx on public.invoice_aeat_record (invoice_id);
create index invoice_aeat_record_org_idx on public.invoice_aeat_record (org_id);

create trigger invoice_aeat_record_set_updated_at
  before update on public.invoice_aeat_record
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoice_activity — the timeline. Append-only by trigger.
-- ---------------------------------------------------------------------------
create table public.invoice_activity (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.org (id) on delete cascade,
  invoice_id uuid not null,
  kind       public.invoice_activity_kind not null,
  actor_id   uuid references public.app_user (id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (invoice_id, org_id) references public.invoice (id, org_id) on delete cascade
);
create index invoice_activity_invoice_idx
  on public.invoice_activity (invoice_id, created_at desc);

-- A timeline that can be rewritten is not evidence of anything.
create or replace function public.invoice_activity_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  raise exception 'El historial de la factura no puede modificarse ni borrarse.'
    using errcode = 'P0001';
end $fn$;

create trigger invoice_activity_append_only
  before update or delete on public.invoice_activity
  for each row execute function public.invoice_activity_append_only();

-- ---------------------------------------------------------------------------
-- The transition table, as a function. Single source of truth for what is legal.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_transition_allowed(
  old_status public.invoice_status,
  old_send   public.invoice_send_status,
  new_status public.invoice_status,
  new_send   public.invoice_send_status
) returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select case
    -- No fiscal movement (an edit to a draft, a payment flag, a CSV arriving late).
    when old_status = new_status and old_send = new_send then true

    -- Emitir.
    when old_status = 'draft' and old_send = 'not_sent'
         and new_status = 'issued' and new_send = 'queued' then true

    when old_status = 'issued' and new_status = 'issued' then
      case
        when old_send = 'queued'   and new_send in ('sending', 'failed') then true
        when old_send = 'sending'  and new_send in ('accepted', 'rejected', 'failed') then true
        -- Retry, manual or from pg_cron. Same idempotency key, always.
        when old_send = 'failed'   and new_send = 'sending' then true
        -- Subsanación of a rejected record (rechazo_previo = X).
        when old_send = 'rejected' and new_send = 'sending' then true
        -- Subsanación of an accepted record (rechazo_previo = N), non-fiscal fields only.
        when old_send = 'accepted' and new_send = 'sending' then true
        else false
      end

    -- Anulación. Only once a verdict exists: annulling something still in flight would race
    -- the AEAT response. The registro's own verdict is preserved.
    when old_status = 'issued' and new_status = 'void' and new_send = old_send
         and old_send in ('accepted', 'rejected', 'failed') then true

    else false
  end;
$fn$;

-- Replaces the Phase 1 guard: same immutability rules, plus transition validation, plus the
-- rectificativa linkage columns in the frozen set.
create or replace function public.invoice_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'Una factura emitida no puede eliminarse; emita una rectificativa o anúlela.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if not public.invoice_transition_allowed(old.status, old.send_status,
                                           new.status, new.send_status) then
    raise exception 'Transición no permitida: % / % -> % / %.',
      old.status, old.send_status, new.status, new.send_status
      using errcode = 'P0001';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if (new.org_id, new.series_id, new.client_id, new.number, new.issue_date,
      new.operation_date, new.tipo_factura, new.descripcion,
      new.base_cents, new.tax_cents, new.total_cents, new.idempotency_key,
      new.rectifies_invoice_id, new.rectificativa_tipo,
      new.rectificativa_base_cents, new.rectificativa_quota_cents)
     is distinct from
     (old.org_id, old.series_id, old.client_id, old.number, old.issue_date,
      old.operation_date, old.tipo_factura, old.descripcion,
      old.base_cents, old.tax_cents, old.total_cents, old.idempotency_key,
      old.rectifies_invoice_id, old.rectificativa_tipo,
      old.rectificativa_base_cents, old.rectificativa_quota_cents)
  then
    raise exception
      'Una factura emitida es inmutable; emita una rectificativa o anúlela.'
      using errcode = 'P0001';
  end if;

  return new;
end $fn$;

-- ---------------------------------------------------------------------------
-- Timeline helper
-- ---------------------------------------------------------------------------
create or replace function public.log_invoice_activity(
  p_invoice_id uuid,
  p_kind public.invoice_activity_kind,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_org uuid;
begin
  select org_id into v_org from public.invoice where id = p_invoice_id;
  if v_org is null then return; end if;
  insert into public.invoice_activity (org_id, invoice_id, kind, actor_id, payload)
  values (v_org, p_invoice_id, p_kind, auth.uid(), coalesce(p_payload, '{}'::jsonb));
end $fn$;
revoke execute on function
  public.log_invoice_activity(uuid, public.invoice_activity_kind, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- claim_invoice_for_send — the concurrency primitive.
--
-- Moves an invoice into `sending` ONLY if it is currently in a sendable state, and returns the
-- registro to send under. Two callers racing (a user pressing "Reintentar" while pg_cron sweeps,
-- or two tabs pressing Emitir) serialise on the row lock; the loser sees a state that is no
-- longer sendable and gets null, so it does nothing. Combined with the per-registro idempotency
-- key, a double send cannot create a second record at AEAT.
-- ---------------------------------------------------------------------------
create or replace function public.claim_invoice_for_send(
  p_invoice_id uuid,
  p_kind public.aeat_record_kind default 'alta'
) returns public.invoice_aeat_record
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org    uuid := public.current_org_id();
  v_inv    public.invoice;
  v_rec    public.invoice_aeat_record;
  v_prev   char(1);
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_inv from public.invoice
   where id = p_invoice_id and org_id = v_org for update;
  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'La factura aún no ha sido emitida.' using errcode = 'P0001';
  end if;
  -- Already in flight or already settled: not claimable. Caller treats null as a no-op.
  if v_inv.send_status not in ('queued', 'failed', 'rejected', 'accepted') then
    return null;
  end if;
  if p_kind = 'alta' and v_inv.send_status in ('rejected', 'accepted') then
    return null;  -- those need an explicit subsanación, not a plain retry
  end if;

  -- rechazo_previo follows the previous registro's fate, per the Verifacti contract.
  v_prev := case
    when p_kind <> 'subsanacion' then null
    when v_inv.send_status = 'rejected' then 'X'
    else 'N'
  end;

  -- Reuse an unsettled registro of this kind so the idempotency key survives a retry.
  select * into v_rec from public.invoice_aeat_record
   where invoice_id = v_inv.id and kind = p_kind and settled_at is null
   order by created_at desc limit 1;

  if not found then
    insert into public.invoice_aeat_record (org_id, invoice_id, kind, rechazo_previo)
    values (v_org, v_inv.id, p_kind, v_prev)
    returning * into v_rec;
  end if;

  update public.invoice_aeat_record
     set attempts = attempts + 1,
         last_attempt_at = now(),
         next_attempt_at = now() + public.send_backoff(attempts + 1)
   where id = v_rec.id
  returning * into v_rec;

  update public.invoice set send_status = 'sending' where id = v_inv.id;

  perform public.log_invoice_activity(
    v_inv.id,
    (case when v_rec.attempts > 1 then 'send_retried' else 'aeat_queued' end)
      ::public.invoice_activity_kind,
    jsonb_build_object('kind', p_kind, 'attempt', v_rec.attempts,
                       'record_id', v_rec.id, 'rechazo_previo', v_prev));
  return v_rec;
end $fn$;
revoke execute on function
  public.claim_invoice_for_send(uuid, public.aeat_record_kind) from public, anon;
grant execute on function
  public.claim_invoice_for_send(uuid, public.aeat_record_kind) to authenticated;

-- Retries before an invoice is flagged for a human. `needs_attention` is DERIVED
-- (send_status = 'failed' and send_attempts >= this), never stored, so it cannot go stale.
create or replace function public.invoice_max_send_attempts() returns integer
language sql immutable set search_path = '' as $fn$ select 5 $fn$;

-- ---------------------------------------------------------------------------
-- record_aeat_result — the only way a send verdict enters the database.
-- ---------------------------------------------------------------------------
create or replace function public.record_aeat_result(
  p_record_id     uuid,
  p_estado        text default null,
  p_uuid          text default null,
  p_huella        text default null,
  p_url           text default null,
  p_csv           text default null,
  p_error_code    text default null,
  p_error_message text default null,
  p_transport_failed boolean default false
) returns public.invoice
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org  uuid := public.current_org_id();
  v_rec  public.invoice_aeat_record;
  v_inv  public.invoice;
  v_send public.invoice_send_status;
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_rec from public.invoice_aeat_record
   where id = p_record_id and org_id = v_org for update;
  if not found then
    raise exception 'Registro AEAT no encontrado.' using errcode = 'P0002';
  end if;

  select * into v_inv from public.invoice where id = v_rec.invoice_id for update;

  if p_transport_failed then
    -- We do NOT know whether AEAT received it. Keep the idempotency key; never clear it.
    v_send := 'failed';
    update public.invoice_aeat_record
       set error_code = p_error_code, error_message = p_error_message
     where id = v_rec.id;
    update public.invoice set send_status = v_send, last_error = p_error_message
     where id = v_inv.id;
    perform public.log_invoice_activity(
      v_inv.id,
      (case when v_rec.attempts >= public.invoice_max_send_attempts()
            then 'needs_attention' else 'send_failed' end)::public.invoice_activity_kind,
      jsonb_build_object('attempt', v_rec.attempts, 'error', p_error_message));
    select * into v_inv from public.invoice where id = v_inv.id;
    return v_inv;
  end if;

  v_send := case lower(coalesce(p_estado, ''))
    when 'correcta' then 'accepted'
    when 'aceptada' then 'accepted'
    when 'aceptadaconerrores' then 'accepted'
    when 'incorrecta' then 'rejected'
    when 'rechazada' then 'rejected'
    -- Pendiente / anything unrecognised stays in flight. Guessing "failed" would invite a
    -- duplicate send of a record that may already exist at AEAT.
    else 'sending'
  end;

  update public.invoice_aeat_record
     set estado = p_estado,
         verifacti_uuid = coalesce(p_uuid, verifacti_uuid),
         huella = coalesce(p_huella, huella),
         aeat_url = coalesce(p_url, aeat_url),
         aeat_csv = coalesce(p_csv, aeat_csv),
         error_code = p_error_code,
         error_message = p_error_message,
         settled_at = case when v_send in ('accepted', 'rejected') then now() else settled_at end
   where id = v_rec.id;

  update public.invoice
     set send_status = v_send,
         aeat_estado = p_estado,
         verifacti_uuid = coalesce(p_uuid, verifacti_uuid),
         verifacti_huella = coalesce(p_huella, verifacti_huella),
         aeat_url = coalesce(p_url, aeat_url),
         aeat_csv = coalesce(p_csv, aeat_csv),
         aeat_checked_at = now(),
         sent_at = coalesce(sent_at, now()),
         last_error = p_error_message
   where id = v_inv.id;

  if v_send = 'accepted' then
    perform public.log_invoice_activity(v_inv.id, 'aeat_accepted',
      jsonb_build_object('estado', p_estado, 'huella', p_huella, 'csv', p_csv));
  elsif v_send = 'rejected' then
    perform public.log_invoice_activity(v_inv.id, 'aeat_rejected',
      jsonb_build_object('estado', p_estado, 'code', p_error_code,
                         'message', p_error_message));
  end if;

  select * into v_inv from public.invoice where id = v_inv.id;
  return v_inv;
end $fn$;
revoke execute on function public.record_aeat_result(
  uuid, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.record_aeat_result(
  uuid, text, text, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_invoice — registro de anulación.
--
-- For an invoice issued BY MISTAKE, not one issued WITH a mistake. Verifacti is explicit:
-- "la anulación no debe usarse para cancelar facturas emitidas con errores, si no para
-- facturas emitidas por error."
--
-- `sin_registro_previo` is set when AEAT holds nothing for this invoice (its alta was rejected
-- or never landed) — the field exists precisely to "indicar si la factura que se quiere anular
-- existe en la AEAT".
-- ---------------------------------------------------------------------------
create or replace function public.cancel_invoice(p_invoice_id uuid)
returns public.invoice_aeat_record
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid := public.current_org_id();
  v_inv public.invoice;
  v_rec public.invoice_aeat_record;
  v_sin char(1);
  v_rp  char(1);
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_inv from public.invoice
   where id = p_invoice_id and org_id = v_org for update;
  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'void' then
    return null;  -- already annulled; idempotent no-op
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Un borrador se elimina, no se anula.' using errcode = 'P0001';
  end if;
  if v_inv.send_status in ('queued', 'sending') then
    raise exception 'Espere la respuesta de la AEAT antes de anular.' using errcode = 'P0001';
  end if;

  v_sin := case when v_inv.send_status = 'accepted' then 'N' else 'S' end;
  v_rp  := case when v_inv.send_status = 'rejected' then 'S' else 'N' end;

  insert into public.invoice_aeat_record
    (org_id, invoice_id, kind, rechazo_previo, sin_registro_previo)
  values (v_org, v_inv.id, 'anulacion', v_rp, v_sin)
  returning * into v_rec;

  update public.invoice set status = 'void', cancelled_at = now() where id = v_inv.id;

  perform public.log_invoice_activity(v_inv.id, 'cancelled',
    jsonb_build_object('record_id', v_rec.id, 'sin_registro_previo', v_sin,
                       'rechazo_previo', v_rp));
  return v_rec;
end $fn$;
revoke execute on function public.cancel_invoice(uuid) from public, anon;
grant execute on function public.cancel_invoice(uuid) to authenticated;

-- Copies an invoice's lines into a fresh draft. Shared by "Anular y crear nueva" and by
-- rectificativas, which both start from the original's contents.
create or replace function public.copy_invoice_lines(p_from uuid, p_to uuid)
returns void
language sql
security definer
set search_path = ''
as $fn$
  insert into public.invoice_line
    (org_id, invoice_id, line_no, description, quantity, unit_price_cents, tax_rate)
  select l.org_id, p_to, l.line_no, l.description, l.quantity, l.unit_price_cents, l.tax_rate
    from public.invoice_line l
   where l.invoice_id = p_from
   order by l.line_no;
$fn$;
revoke execute on function public.copy_invoice_lines(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- cancel_and_replace — anular, then start a NEW draft from the same lines.
--
-- The replacement can never reuse the original's number: it is a new draft and will be
-- numbered at its own issue. Verifacti: "En el caso de que proceda emitir una nueva factura
-- correcta se deberá registrar con un alta y con un número de factura o fecha de expedición
-- diferente."
-- ---------------------------------------------------------------------------
create or replace function public.cancel_and_replace(p_invoice_id uuid)
returns public.invoice
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid := public.current_org_id();
  v_old public.invoice;
  v_new public.invoice;
begin
  select * into v_old from public.invoice where id = p_invoice_id and org_id = v_org;
  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;

  perform public.cancel_invoice(p_invoice_id);

  insert into public.invoice
    (org_id, series_id, client_id, descripcion, tipo_factura, operation_date, notes, due_date)
  values (v_org, v_old.series_id, v_old.client_id, v_old.descripcion, v_old.tipo_factura,
          v_old.operation_date, v_old.notes, v_old.due_date)
  returning * into v_new;

  perform public.copy_invoice_lines(v_old.id, v_new.id);

  update public.invoice set replaced_by_invoice_id = v_new.id where id = v_old.id;

  perform public.log_invoice_activity(v_old.id, 'replaced_by',
    jsonb_build_object('invoice_id', v_new.id));
  perform public.log_invoice_activity(v_new.id, 'created',
    jsonb_build_object('replaces_invoice_id', v_old.id));

  select * into v_new from public.invoice where id = v_new.id;
  return v_new;
end $fn$;
revoke execute on function public.cancel_and_replace(uuid) from public, anon;
grant execute on function public.cancel_and_replace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_rectificativa — R1..R5, por sustitución ('S') or por diferencias ('I').
--
-- Only over an invoice AEAT has ACCEPTED. A rectificativa references an original the
-- administration knows about; over a rejected record there is nothing to rectify, and the
-- documented remedy there is anulación (sin_registro_previo) plus a new invoice.
--
-- The rectificativa needs its own series — RD 1619/2012 requires a serie específica, and
-- Verifacti repeats it: "deberá emitirse una factura rectificativa con serie específica".
-- ---------------------------------------------------------------------------
create or replace function public.create_rectificativa(
  p_invoice_id  uuid,
  p_tipo        text,
  p_modo        text,
  p_series_id   uuid
) returns public.invoice
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid := public.current_org_id();
  v_old public.invoice;
  v_new public.invoice;
  v_series public.invoice_series;
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_tipo not in ('R1', 'R2', 'R3', 'R4', 'R5') then
    raise exception 'Tipo de rectificativa no válido: %.', p_tipo using errcode = 'P0001';
  end if;
  if p_modo not in ('S', 'I') then
    raise exception 'Modo de rectificación no válido: %.', p_modo using errcode = 'P0001';
  end if;

  select * into v_old from public.invoice where id = p_invoice_id and org_id = v_org;
  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  if v_old.status = 'draft' then
    raise exception 'Un borrador se edita; no necesita rectificativa.' using errcode = 'P0001';
  end if;
  if v_old.send_status <> 'accepted' then
    raise exception
      'Solo puede rectificarse una factura aceptada por la AEAT. Si el registro fue rechazado, anúlela y emita una nueva.'
      using errcode = 'P0001';
  end if;

  select * into v_series from public.invoice_series
   where id = p_series_id and org_id = v_org;
  if not found then
    raise exception 'Serie no encontrada.' using errcode = 'P0002';
  end if;
  if v_series.id = v_old.series_id then
    raise exception 'Una rectificativa requiere una serie específica, distinta de la original.'
      using errcode = 'P0001';
  end if;

  insert into public.invoice
    (org_id, series_id, client_id, descripcion, tipo_factura,
     operation_date, rectifies_invoice_id, rectificativa_tipo,
     rectificativa_base_cents, rectificativa_quota_cents)
  values (v_org, p_series_id, v_old.client_id,
          'Rectificativa de ' || v_old.descripcion, p_tipo,
          -- "Se incluirá como fecha de operación la fecha en que se realizó la entrega o
          -- prestó el servicio, indicada en la factura inicial."
          coalesce(v_old.operation_date, v_old.issue_date), v_old.id, p_modo,
          case when p_modo = 'S' then v_old.base_cents end,
          case when p_modo = 'S' then v_old.tax_cents end)
  returning * into v_new;

  -- Lines are prefilled from the original; the user edits them to the corrected amounts.
  perform public.copy_invoice_lines(v_old.id, v_new.id);

  perform public.log_invoice_activity(v_old.id, 'rectified_by',
    jsonb_build_object('invoice_id', v_new.id, 'tipo', p_tipo, 'modo', p_modo));
  perform public.log_invoice_activity(v_new.id, 'created',
    jsonb_build_object('rectifies_invoice_id', v_old.id, 'tipo', p_tipo, 'modo', p_modo));

  select * into v_new from public.invoice where id = v_new.id;
  return v_new;
end $fn$;
revoke execute on function public.create_rectificativa(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_rectificativa(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Payment (a separate axis from the fiscal state)
-- ---------------------------------------------------------------------------
create or replace function public.mark_invoice_paid(
  p_invoice_id uuid,
  p_paid boolean default true
) returns public.invoice
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org uuid := public.current_org_id();
  v_inv public.invoice;
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_inv from public.invoice
   where id = p_invoice_id and org_id = v_org for update;
  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Un borrador no puede marcarse como pagado.' using errcode = 'P0001';
  end if;

  update public.invoice
     set payment_status = (case when p_paid then 'paid' else 'pending' end)
                            ::public.invoice_payment_status,
         paid_at = case when p_paid then now() else null end
   where id = v_inv.id
  returning * into v_inv;

  if p_paid then
    perform public.log_invoice_activity(v_inv.id, 'paid', '{}'::jsonb);
  end if;
  return v_inv;
end $fn$;
revoke execute on function public.mark_invoice_paid(uuid, boolean) from public, anon;
grant execute on function public.mark_invoice_paid(uuid, boolean) to authenticated;

-- issue_invoice gains a timeline entry and a due date. Numbering is unchanged.
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoice
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_org    uuid := public.current_org_id();
  v_inv    public.invoice;
  v_number integer;
  v_series public.invoice_series;
begin
  if v_org is null or not public.current_user_can_write() then
    raise exception 'No autorizado para emitir facturas.' using errcode = '42501';
  end if;

  select * into v_inv from public.invoice
   where id = p_invoice_id and org_id = v_org for update;

  if not found then
    raise exception 'Factura no encontrada.' using errcode = 'P0002';
  end if;
  -- Second caller of a concurrent Emitir lands here, after waiting on the row lock.
  if v_inv.status <> 'draft' then
    raise exception 'La factura ya fue emitida.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_line where invoice_id = v_inv.id) then
    raise exception 'La factura no tiene líneas.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.billing_profile where org_id = v_org) then
    raise exception 'Faltan los datos fiscales de la empresa.' using errcode = 'P0001';
  end if;

  select * into v_series from public.invoice_series
   where id = v_inv.series_id and org_id = v_org for update;
  v_number := v_series.next_number;
  update public.invoice_series set next_number = next_number + 1 where id = v_series.id;

  update public.invoice
     set number      = v_number,
         status      = 'issued',
         issue_date  = (now() at time zone 'Europe/Madrid')::date,
         send_status = 'queued'
   where id = v_inv.id
  returning * into v_inv;

  perform public.log_invoice_activity(v_inv.id, 'issued',
    jsonb_build_object('serie', v_series.code, 'numero', v_number));
  return v_inv;
end $fn$;
revoke execute on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS for the new tables
-- ---------------------------------------------------------------------------
alter table public.invoice_aeat_record enable row level security;
alter table public.invoice_activity    enable row level security;

create policy invoice_aeat_record_select on public.invoice_aeat_record
  for select to authenticated using (org_id = public.current_org_id());
create policy invoice_activity_select on public.invoice_activity
  for select to authenticated using (org_id = public.current_org_id());

-- No insert/update/delete policies on purpose: both tables are written only by the
-- SECURITY DEFINER functions above, so the timeline and the AEAT ledger cannot be forged
-- by a client holding a session token.
grant select on public.invoice_aeat_record to authenticated;
grant select on public.invoice_activity    to authenticated;

-- ---------------------------------------------------------------------------
-- Retry scheduling
--
-- The worker that actually calls Verifacti lives in /api, because that is where the API key
-- is. These functions are the database half: which invoices are due, and how to recover ones
-- abandoned mid-flight by a crashed worker. Scheduling (pg_cron + pg_net calling the endpoint
-- with a shared secret) is deployment configuration and is documented, not hardcoded here.
-- ---------------------------------------------------------------------------
create or replace function public.send_backoff(p_attempt integer)
returns interval
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_attempt <= 1 then interval '1 minute'
    when p_attempt = 2  then interval '5 minutes'
    when p_attempt = 3  then interval '15 minutes'
    when p_attempt = 4  then interval '1 hour'
    else interval '3 hours'
  end;
$fn$;

-- Invoices whose send may be retried right now, oldest first.
create or replace function public.invoices_pending_send()
returns table (invoice_id uuid, org_id uuid, record_id uuid, attempts integer)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select i.id, i.org_id, r.id, r.attempts
    from public.invoice i
    join public.invoice_aeat_record r
      on r.invoice_id = i.id and r.settled_at is null
   where i.send_status = 'failed'
     and r.attempts < public.invoice_max_send_attempts()
     and (r.next_attempt_at is null or r.next_attempt_at <= now())
   order by r.next_attempt_at nulls first
   limit 100;
$fn$;
revoke execute on function public.invoices_pending_send() from public, anon;
grant execute on function public.invoices_pending_send() to authenticated;

-- Invoices a human has to look at: retried to exhaustion, or rejected by AEAT.
-- Derived, never stored, so it cannot disagree with the invoice's real state.
create or replace function public.invoices_needing_attention()
returns table (invoice_id uuid, org_id uuid, reason text)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select i.id, i.org_id,
         case when i.send_status = 'rejected' then 'rejected' else 'send_exhausted' end
    from public.invoice i
   where i.status = 'issued'
     and (
       i.send_status = 'rejected'
       or (i.send_status = 'failed'
           and exists (select 1 from public.invoice_aeat_record r
                        where r.invoice_id = i.id and r.settled_at is null
                          and r.attempts >= public.invoice_max_send_attempts()))
     );
$fn$;
revoke execute on function public.invoices_needing_attention() from public, anon;
grant execute on function public.invoices_needing_attention() to authenticated;

-- A worker that dies mid-send leaves the invoice in `sending` forever. Returning it to
-- `failed` makes it retry-eligible again; the idempotency key is untouched, so the retry
-- still cannot duplicate the AEAT record.
create or replace function public.reap_stuck_sends(p_older_than interval default '30 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_count integer;
begin
  with stuck as (
    select i.id
      from public.invoice i
      join public.invoice_aeat_record r
        on r.invoice_id = i.id and r.settled_at is null
     where i.send_status = 'sending'
       and r.last_attempt_at < now() - p_older_than
  )
  update public.invoice i
     set send_status = 'failed',
         last_error = 'Envío interrumpido; se reintentará.'
    from stuck s
   where i.id = s.id;
  get diagnostics v_count = row_count;
  return v_count;
end $fn$;
revoke execute on function public.reap_stuck_sends(interval) from public, anon;
