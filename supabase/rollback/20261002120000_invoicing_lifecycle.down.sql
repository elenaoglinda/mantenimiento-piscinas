-- Rollback for 20261002120000_invoicing_lifecycle.sql
--
-- GUARDED. Refuses to run if any invoice has left draft. Once an invoice is issued it is a
-- fiscal record with a retention obligation, and anything already filed continues to exist at
-- AEAT regardless of what this database holds — dropping the local rows would destroy the only
-- copy of what was sent while changing nothing at the administration.
--
-- To roll back anyway you must delete those invoices deliberately first, which is a decision,
-- not a side effect.

begin;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.invoice where status <> 'draft';
  if v_count > 0 then
    raise exception
      'Rollback cancelado: existen % facturas emitidas. Son registros fiscales con obligación de conservación y pueden estar presentadas en la AEAT. Expórtelas y elimínelas explícitamente antes de revertir.',
      v_count
      using errcode = 'P0001';
  end if;
end $$;

drop function if exists public.reap_stuck_sends(interval);
drop function if exists public.invoices_needing_attention();
drop function if exists public.invoices_pending_send();
drop function if exists public.send_backoff(integer);
drop function if exists public.mark_invoice_paid(uuid, boolean);
drop function if exists public.create_rectificativa(uuid, text, text, uuid);
drop function if exists public.cancel_and_replace(uuid);
drop function if exists public.cancel_invoice(uuid);
drop function if exists public.copy_invoice_lines(uuid, uuid);
drop function if exists public.record_aeat_result(
  uuid, text, text, text, text, text, text, text, boolean);
drop function if exists public.claim_invoice_for_send(uuid, public.aeat_record_kind);
drop function if exists public.log_invoice_activity(uuid, public.invoice_activity_kind, jsonb);
drop function if exists public.invoice_max_send_attempts();

drop trigger if exists invoice_activity_append_only on public.invoice_activity;
drop function if exists public.invoice_activity_append_only();

drop table if exists public.invoice_activity;
drop table if exists public.invoice_aeat_record;

alter table public.invoice
  drop constraint if exists invoice_rectifies_fkey,
  drop constraint if exists invoice_replaced_by_fkey,
  drop constraint if exists invoice_rectificativa_coherent,
  drop constraint if exists invoice_rectificativa_sustitucion,
  drop constraint if exists invoice_cancelled_at_matches_status,
  drop constraint if exists invoice_paid_at_matches_status,
  drop constraint if exists invoice_draft_not_settled;

alter table public.invoice
  drop column if exists rectifies_invoice_id,
  drop column if exists rectificativa_tipo,
  drop column if exists rectificativa_base_cents,
  drop column if exists rectificativa_quota_cents,
  drop column if exists replaced_by_invoice_id,
  drop column if exists cancelled_at,
  drop column if exists payment_status,
  drop column if exists paid_at,
  drop column if exists due_date,
  drop column if exists aeat_csv;

drop type if exists public.invoice_payment_status;
drop type if exists public.invoice_activity_kind;
drop type if exists public.aeat_record_kind;

-- Restore the Phase 1 guard (immutability without transition validation).
create or replace function public.invoice_guard_immutable()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una factura emitida no puede eliminarse.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;
  if (new.org_id, new.series_id, new.client_id, new.number, new.issue_date,
      new.operation_date, new.tipo_factura, new.descripcion,
      new.base_cents, new.tax_cents, new.total_cents, new.idempotency_key)
     is distinct from
     (old.org_id, old.series_id, old.client_id, old.number, old.issue_date,
      old.operation_date, old.tipo_factura, old.descripcion,
      old.base_cents, old.tax_cents, old.total_cents, old.idempotency_key)
  then
    raise exception 'Una factura emitida es inmutable.' using errcode = 'P0001';
  end if;
  return new;
end $fn$;

drop function if exists public.invoice_transition_allowed(
  public.invoice_status, public.invoice_send_status,
  public.invoice_status, public.invoice_send_status);

commit;
