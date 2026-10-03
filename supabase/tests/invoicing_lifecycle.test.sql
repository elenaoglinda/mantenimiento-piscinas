-- Phase 1a state-machine tests. Run against a scratch Postgres with every migration applied:
--   psql -v ON_ERROR_STOP=1 -d app -f supabase/tests/invoicing_lifecycle.test.sql
-- Each check raises on failure, so a clean run means every assertion held.
--
-- These exercise the rules the UI must never be the only thing enforcing: illegal transitions,
-- immutability, rectificativa constraints and concurrent issuing.

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.check(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

-- Asserts that `sql` fails, and that its message mentions `expect`.
create or replace function pg_temp.check_fails(sql text, expect text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(expect) in lower(sqlerrm)) > 0 then
      raise notice 'PASS % (refused: %)', label, left(sqlerrm, 60);
      return;
    end if;
    raise exception 'FAIL % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid; v_user uuid := gen_random_uuid(); v_client uuid;
begin
  insert into public.org (name, type) values ('Test SL', 'company') returning id into v_org;
  insert into auth.users (id) values (v_user);
  insert into public.app_user (id, org_id, role, full_name)
    values (v_user, v_org, 'admin', 'Tester');
  insert into public.client (org_id, name, cif_nif)
    values (v_org, 'Comunidad Las Palomas', 'A15022510') returning id into v_client;
  insert into public.billing_profile (org_id, nif, razon_social)
    values (v_org, 'B75777847', 'Test SL');
  insert into public.invoice_series (org_id, code, description)
    values (v_org, 'T2026', 'Ordinaria'), (v_org, 'RT2026', 'Rectificativa');
  perform set_config('request.jwt.claim.sub', v_user::text, false);
end $$;

set role authenticated;

-- Helper: build a draft with one 200 € line at 21 %.
create or replace function pg_temp.new_draft(p_series text default 'T2026') returns uuid
language plpgsql security definer as $$
declare v_org uuid := public.current_org_id(); v_id uuid; v_series uuid; v_client uuid;
begin
  select id into v_series from public.invoice_series where org_id = v_org and code = p_series;
  select id into v_client from public.client where org_id = v_org limit 1;
  insert into public.invoice (org_id, series_id, client_id, descripcion)
    values (v_org, v_series, v_client, 'Mantenimiento') returning id into v_id;
  insert into public.invoice_line (org_id, invoice_id, description, quantity, unit_price_cents)
    values (v_org, v_id, 'Mantenimiento mensual', 1, 20000);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Totals and issuing
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_inv public.invoice;
begin
  v_id := pg_temp.new_draft();
  select * into v_inv from public.invoice where id = v_id;
  perform pg_temp.check(v_inv.base_cents = 20000 and v_inv.tax_cents = 4200
                        and v_inv.total_cents = 24200, 'totals computed by trigger');
  perform pg_temp.check(v_inv.number is null, 'a draft has no number');

  v_inv := public.issue_invoice(v_id);
  perform pg_temp.check(v_inv.status = 'issued' and v_inv.send_status = 'queued'
                        and v_inv.number = 1, 'issue assigns number 1 and queues');
  perform pg_temp.check(
    exists (select 1 from public.invoice_activity where invoice_id = v_id and kind = 'issued'),
    'issuing writes a timeline entry');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Illegal transitions are refused server-side
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select id into v_id from public.invoice where number = 1;

  perform pg_temp.check_fails(
    format('update public.invoice set descripcion = ''hacked'' where id = %L', v_id),
    'inmutable', 'cannot edit an issued invoice');

  perform pg_temp.check_fails(
    format('delete from public.invoice where id = %L', v_id),
    'no puede eliminarse', 'cannot delete an issued invoice');

  perform pg_temp.check_fails(
    format('insert into public.invoice_line (org_id, invoice_id, description, unit_price_cents)
            select org_id, id, ''extra'', 100 from public.invoice where id = %L', v_id),
    'líneas de una factura emitida', 'cannot add a line to an issued invoice');

  -- queued -> accepted skips the in-flight state entirely.
  perform pg_temp.check_fails(
    format('update public.invoice set send_status = ''accepted'' where id = %L', v_id),
    'transición no permitida', 'queued cannot jump straight to accepted');

  -- Going back to draft would un-issue a numbered invoice.
  perform pg_temp.check_fails(
    format('update public.invoice set status = ''draft'', number = null, issue_date = null
            where id = %L', v_id),
    'transición no permitida', 'an issued invoice cannot return to draft');
end $$;

-- ---------------------------------------------------------------------------
-- 3. The happy path: claim -> AEAT accepted
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_rec public.invoice_aeat_record; v_inv public.invoice;
begin
  select id into v_id from public.invoice where number = 1;
  v_rec := public.claim_invoice_for_send(v_id);
  perform pg_temp.check(v_rec.kind = 'alta' and v_rec.attempts = 1, 'claim creates the alta');
  select * into v_inv from public.invoice where id = v_id;
  perform pg_temp.check(v_inv.send_status = 'sending', 'claim moves it in-flight');

  v_inv := public.record_aeat_result(v_rec.id, 'Correcta', 'uuid-1', 'HUELLA1',
                                     'https://aeat/qr', null, null, null, false);
  perform pg_temp.check(v_inv.send_status = 'accepted', 'Correcta becomes accepted');
  perform pg_temp.check(
    exists (select 1 from public.invoice_activity
             where invoice_id = v_id and kind = 'aeat_accepted'),
    'acceptance is on the timeline');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Concurrency
-- ---------------------------------------------------------------------------
do $$
declare v_a uuid; v_inv public.invoice; v_rec public.invoice_aeat_record;
begin
  -- Two users pressing Emitir: the second must be refused, not allocate a second number.
  v_a := pg_temp.new_draft();
  v_inv := public.issue_invoice(v_a);
  perform pg_temp.check_fails(format('select public.issue_invoice(%L)', v_a),
    'ya fue emitida', 'a second Emitir on the same draft is refused');
  perform pg_temp.check(
    (select count(*) from public.invoice where number = v_inv.number) = 1,
    'the number was allocated exactly once');

  -- pg_cron sweeping while a user presses "Reintentar": the second claim is a no-op.
  perform public.claim_invoice_for_send(v_a);
  v_rec := public.claim_invoice_for_send(v_a);
  perform pg_temp.check(v_rec is null, 'claiming an in-flight invoice returns null (no-op)');
  perform pg_temp.check(
    (select count(*) from public.invoice_aeat_record where invoice_id = v_a and kind = 'alta') = 1,
    'no second AEAT record is created by a racing claim');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Rejection, retry and the idempotency key
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_rec public.invoice_aeat_record; v_inv public.invoice; v_key uuid;
begin
  v_id := pg_temp.new_draft();
  perform public.issue_invoice(v_id);
  v_rec := public.claim_invoice_for_send(v_id);
  v_key := v_rec.idempotency_key;

  -- Transport failure: we do not know whether AEAT got it.
  v_inv := public.record_aeat_result(v_rec.id, null, null, null, null, null,
                                     'ETIMEDOUT', 'timeout', true);
  perform pg_temp.check(v_inv.send_status = 'failed', 'a transport error becomes failed');

  v_rec := public.claim_invoice_for_send(v_id);
  perform pg_temp.check(v_rec.idempotency_key = v_key,
    'a retry REUSES the idempotency key — never a fresh one');
  perform pg_temp.check(v_rec.attempts = 2, 'the retry is counted');

  -- AEAT rejects it.
  v_inv := public.record_aeat_result(v_rec.id, 'Incorrecta', null, null, null, null,
                                     '1100', 'NIF no censado', false);
  perform pg_temp.check(v_inv.send_status = 'rejected', 'Incorrecta becomes rejected');

  -- A plain retry must not silently re-send a rejected record: that needs a subsanación.
  perform pg_temp.check(public.claim_invoice_for_send(v_id) is null,
    'a rejected record is not re-sent by a plain claim');

  -- Subsanación of a rejected record carries rechazo_previo = X.
  v_rec := public.claim_invoice_for_send(v_id, 'subsanacion');
  perform pg_temp.check(v_rec.rechazo_previo = 'X',
    'subsanación of a rejected record uses rechazo_previo = X');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Rectificativa rules
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_rec public.invoice_aeat_record; v_new public.invoice;
        v_ord uuid; v_rect uuid; v_rejected uuid;
begin
  select id into v_ord from public.invoice_series where code = 'T2026';
  select id into v_rect from public.invoice_series where code = 'RT2026';

  v_id := pg_temp.new_draft();
  perform public.issue_invoice(v_id);
  v_rec := public.claim_invoice_for_send(v_id);
  perform public.record_aeat_result(v_rec.id, 'Correcta', 'u', 'h', null, null,
                                    null, null, false);

  perform pg_temp.check_fails(
    format('select public.create_rectificativa(%L, ''R1'', ''I'', %L)', v_id, v_ord),
    'serie específica', 'a rectificativa cannot reuse the original series');

  perform pg_temp.check_fails(
    format('select public.create_rectificativa(%L, ''R9'', ''I'', %L)', v_id, v_rect),
    'no válido', 'R9 is not a valid rectificativa type');

  v_new := public.create_rectificativa(v_id, 'R1', 'I', v_rect);
  perform pg_temp.check(v_new.status = 'draft' and v_new.rectifies_invoice_id = v_id
                        and v_new.rectificativa_tipo = 'I',
    'por diferencias: a linked draft in the rectificativa series');
  perform pg_temp.check(
    (select count(*) from public.invoice_line where invoice_id = v_new.id) = 1,
    'rectificativa lines are prefilled from the original');
  perform pg_temp.check(
    exists (select 1 from public.invoice_activity
             where invoice_id = v_id and kind = 'rectified_by'),
    'the original records who rectified it');

  -- Por sustitución must carry the rectified amounts.
  v_new := public.create_rectificativa(v_id, 'R1', 'S', v_rect);
  perform pg_temp.check(v_new.rectificativa_base_cents = 20000
                        and v_new.rectificativa_quota_cents = 4200,
    'por sustitución records the rectified base and quota');

  -- A rejected record has nothing at AEAT to rectify.
  v_rejected := pg_temp.new_draft();
  perform public.issue_invoice(v_rejected);
  v_rec := public.claim_invoice_for_send(v_rejected);
  perform public.record_aeat_result(v_rec.id, 'Incorrecta', null, null, null, null,
                                    '1100', 'rechazada', false);
  perform pg_temp.check_fails(
    format('select public.create_rectificativa(%L, ''R1'', ''I'', %L)', v_rejected, v_rect),
    'aceptada por la AEAT', 'cannot rectify an invoice AEAT never accepted');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Anulación and "Anular y crear nueva"
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_rec public.invoice_aeat_record; v_new public.invoice; v_old public.invoice;
begin
  v_id := pg_temp.new_draft();
  perform public.issue_invoice(v_id);
  v_rec := public.claim_invoice_for_send(v_id);

  -- In flight: annulling now would race the verdict.
  perform pg_temp.check_fails(format('select public.cancel_invoice(%L)', v_id),
    'espere la respuesta', 'cannot annul while awaiting AEAT');

  perform public.record_aeat_result(v_rec.id, 'Correcta', 'u', 'h', null, null,
                                    null, null, false);

  v_new := public.cancel_and_replace(v_id);
  select * into v_old from public.invoice where id = v_id;
  perform pg_temp.check(v_old.status = 'void' and v_old.cancelled_at is not null,
    'the original is annulled');
  perform pg_temp.check(v_old.replaced_by_invoice_id = v_new.id,
    'the original points at its replacement');
  perform pg_temp.check(v_new.status = 'draft' and v_new.number is null,
    'the replacement starts as a draft with NO number');
  perform pg_temp.check(
    (select count(*) from public.invoice_line where invoice_id = v_new.id) = 1,
    'the replacement inherits the lines');

  -- The replacement gets its own number, never the annulled one.
  perform public.issue_invoice(v_new.id);
  select * into v_new from public.invoice where id = v_new.id;
  perform pg_temp.check(v_new.number <> v_old.number,
    'the replacement is numbered separately from the annulled invoice');

  -- Annulling twice is a no-op, not an error.
  perform pg_temp.check(public.cancel_invoice(v_id) is null, 'annulling twice is idempotent');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Payment axis and the append-only timeline
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_inv public.invoice;
begin
  v_id := pg_temp.new_draft();
  perform pg_temp.check_fails(format('select public.mark_invoice_paid(%L)', v_id),
    'borrador', 'a draft cannot be marked paid');

  perform public.issue_invoice(v_id);
  v_inv := public.mark_invoice_paid(v_id);
  perform pg_temp.check(v_inv.payment_status = 'paid' and v_inv.paid_at is not null,
    'marking paid sets both columns together');

  v_inv := public.mark_invoice_paid(v_id, false);
  perform pg_temp.check(v_inv.payment_status = 'pending' and v_inv.paid_at is null,
    'un-marking clears paid_at');

  -- Layer 1: `authenticated` holds only SELECT, so it is refused before any trigger runs.
  perform pg_temp.check_fails(
    'update public.invoice_activity set kind = ''paid'' where true',
    'permission denied', 'authenticated cannot write the timeline at all');
end $$;

-- Layer 2: even with table privileges, the append-only trigger refuses.
reset role;
do $$
begin
  perform pg_temp.check_fails(
    'update public.invoice_activity set kind = ''paid'' where true',
    'historial', 'the timeline cannot be rewritten, even by a privileged role');
  perform pg_temp.check_fails(
    'delete from public.invoice_activity where true',
    'historial', 'the timeline cannot be deleted, even by a privileged role');
end $$;
set role authenticated;

reset role;
select 'ALL LIFECYCLE TESTS PASSED' as result;
