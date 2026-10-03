import {
  buildCreatePayload,
  isPendingLookup,
  mapEstado,
  parseCreateResponse,
  toVerifactiDate,
  validateForSending,
  type SendStatus,
  type TaxBreakdownRow,
  type TipoFactura,
} from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import type { Tables } from '../../../lib/database.types.js';

/**
 * Invoicing data access and the Veri*Factu send orchestration.
 *
 * The send path is written around one principle: **a create that we are not sure failed must
 * never be re-sent with a fresh identity.** Every attempt reuses the invoice's stored
 * `idempotency_key`, so a timeout, a double click or a retry all collapse onto the same AEAT
 * record. The only thing a retry can change is our knowledge of it.
 */

export type InvoiceRow = Tables<'invoice'>;
export type InvoiceLineRow = Tables<'invoice_line'>;

export interface InvoiceWithRelations extends InvoiceRow {
  client: { name: string; cif_nif: string | null } | null;
  invoice_series: { code: string } | null;
  invoice_line: InvoiceLineRow[];
}

export type SendErrorCode =
  | 'unauthorized'
  | 'unavailable'
  | 'invalid'
  | 'conflict'
  | 'unknown_outcome'
  | 'failed';

export class InvoiceSendError extends Error {
  constructor(
    readonly code: SendErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'InvoiceSendError';
  }
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new InvoiceSendError('unauthorized');
  return token;
}

async function callApi(body: unknown): Promise<{ status: number; json: unknown }> {
  const token = await accessToken();
  let resp: Response;
  try {
    resp = await fetch('/api/verifacti', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    // Network died mid-flight: the record may or may not exist upstream.
    throw new InvoiceSendError('unknown_outcome');
  }
  let json: unknown = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return { status: resp.status, json };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface LoadResult<T> {
  data: T;
  failure: DbFailure | null;
}

export async function listInvoices(): Promise<LoadResult<InvoiceWithRelations[]>> {
  const { data, error } = await supabase
    .from('invoice')
    .select(
      '*, client!invoice_client_id_org_id_fkey(name, cif_nif), invoice_series!invoice_series_id_org_id_fkey(code), invoice_line(*)',
    )
    .order('created_at', { ascending: false });
  return { data: (data as InvoiceWithRelations[]) ?? [], failure: toDbFailure(error) };
}

export async function getInvoice(id: string): Promise<LoadResult<InvoiceWithRelations | null>> {
  const { data, error } = await supabase
    .from('invoice')
    .select(
      '*, client!invoice_client_id_org_id_fkey(name, cif_nif), invoice_series!invoice_series_id_org_id_fkey(code), invoice_line(*)',
    )
    .eq('id', id)
    .maybeSingle();
  return { data: (data as InvoiceWithRelations | null) ?? null, failure: toDbFailure(error) };
}

/** The per-tax-rate aggregate, computed in SQL so it matches the stored totals exactly. */
export async function getTaxBreakdown(invoiceId: string): Promise<LoadResult<TaxBreakdownRow[]>> {
  const { data, error } = await supabase.rpc('invoice_tax_breakdown', {
    p_invoice_id: invoiceId,
  });
  const rows = (data ?? []) as Array<{
    tax_rate: number | string;
    base_cents: number;
    quota_cents: number;
  }>;
  return {
    data: rows.map((r) => ({
      taxRate: Number(r.tax_rate),
      baseCents: Number(r.base_cents),
      quotaCents: Number(r.quota_cents),
    })),
    failure: toDbFailure(error),
  };
}

// ---------------------------------------------------------------------------
// Draft editing
// ---------------------------------------------------------------------------

export async function createDraft(input: {
  orgId: string;
  seriesId: string;
  clientId: string;
  descripcion: string;
  tipoFactura?: TipoFactura;
  operationDate?: string | null;
  notes?: string | null;
}): Promise<{ id: string | null; failure: DbFailure | null }> {
  const { data, error } = await supabase
    .from('invoice')
    .insert({
      org_id: input.orgId,
      series_id: input.seriesId,
      client_id: input.clientId,
      descripcion: input.descripcion,
      tipo_factura: input.tipoFactura ?? 'F1',
      operation_date: input.operationDate ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();
  return { id: data?.id ?? null, failure: toDbFailure(error) };
}

export async function addLine(input: {
  orgId: string;
  invoiceId: string;
  lineNo: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
}): Promise<DbFailure | null> {
  const { error } = await supabase.from('invoice_line').insert({
    org_id: input.orgId,
    invoice_id: input.invoiceId,
    line_no: input.lineNo,
    description: input.description,
    quantity: input.quantity,
    unit_price_cents: input.unitPriceCents,
    tax_rate: input.taxRate,
  });
  return toDbFailure(error);
}

export async function deleteLine(lineId: string): Promise<DbFailure | null> {
  const { error } = await supabase.from('invoice_line').delete().eq('id', lineId);
  return toDbFailure(error);
}

export async function deleteDraft(invoiceId: string): Promise<DbFailure | null> {
  // The DB trigger refuses this for anything past draft; we do not rely on the UI alone.
  const { error } = await supabase.from('invoice').delete().eq('id', invoiceId);
  return toDbFailure(error);
}

// ---------------------------------------------------------------------------
// Issue + send
// ---------------------------------------------------------------------------

/** Allocates the number and freezes the document. Gapless numbering happens in the RPC. */
export async function issueInvoice(invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase.rpc('issue_invoice', { p_invoice_id: invoiceId });
  const failure = toDbFailure(error);
  if (failure) throw new InvoiceSendError('invalid', failure.detail ?? failure.code);
  return data as unknown as InvoiceRow;
}

/**
 * Send an issued invoice to AEAT via Verifacti.
 *
 * Returns the resulting send status. On `unknown_outcome` the invoice is left as `failed` with
 * its idempotency key intact, which is precisely the state a later retry needs.
 */
export type AeatRecordKind = 'alta' | 'anulacion' | 'subsanacion';

/**
 * Send an issued invoice to AEAT.
 *
 * Every state change goes through an RPC, so the database — not this function — decides what is
 * legal. `claim_invoice_for_send` returns null when the invoice is not claimable (already in
 * flight, already settled, or claimed by the pg_cron sweep a moment earlier); that is a no-op,
 * not an error. The registro it returns carries the idempotency key, which is reused on every
 * retry and never regenerated.
 */
export async function sendInvoice(
  invoice: InvoiceWithRelations,
  kind: AeatRecordKind = 'alta',
): Promise<{ status: SendStatus; failure: DbFailure | null; skipped?: boolean }> {
  const claim = await supabase.rpc('claim_invoice_for_send', {
    p_invoice_id: invoice.id,
    p_kind: kind,
  });
  const claimFailure = toDbFailure(claim.error);
  if (claimFailure) return { status: invoice.send_status, failure: claimFailure };

  const record = claim.data as unknown as Tables<'invoice_aeat_record'> | null;
  if (!record) {
    // Someone else owns this send. Leave it alone.
    return { status: invoice.send_status, failure: null, skipped: true };
  }

  const { data: breakdown } = await getTaxBreakdown(invoice.id);
  const payloadInput = {
    seriesCode: invoice.invoice_series?.code ?? '',
    number: invoice.number!,
    issueDate: invoice.issue_date!,
    tipoFactura: invoice.tipo_factura as TipoFactura,
    descripcion: invoice.descripcion,
    breakdown,
    totalCents: Number(invoice.total_cents),
    clientNif: invoice.client?.cif_nif ?? null,
    clientName: invoice.client?.name ?? null,
  };

  const problems = validateForSending(payloadInput);
  if (problems.length > 0) {
    await recordResult(record.id, { transportFailed: true, errorMessage: problems.join(',') });
    return { status: 'failed', failure: { code: 'rule', detail: problems.join(', ') } };
  }

  let result: { status: number; json: unknown };
  try {
    result = await callApi({
      action: 'create',
      idempotencyKey: record.idempotency_key,
      payload: buildCreatePayload(payloadInput),
      // Subsanación reuses /modify upstream; the proxy branches on this.
      mode: kind === 'alta' ? 'create' : 'modify',
      rechazoPrevio: record.rechazo_previo,
    });
  } catch {
    // Unknown outcome. The key survives, so a retry collapses onto the same AEAT record.
    await recordResult(record.id, { transportFailed: true, errorMessage: 'unknown_outcome' });
    return { status: 'failed', failure: { code: 'rule', detail: 'unknown_outcome' } };
  }

  if (result.status === 409) {
    // Same key already in flight upstream: the record is being created, not lost.
    return { status: 'sending', failure: null };
  }
  if (result.status !== 200) {
    const detail =
      typeof result.json === 'object' && result.json !== null
        ? JSON.stringify(result.json).slice(0, 300)
        : `http_${result.status}`;
    await recordResult(record.id, { transportFailed: true, errorMessage: detail });
    return { status: 'failed', failure: { code: 'rule', detail } };
  }

  const parsed = parseCreateResponse(result.json);
  const { failure } = await recordResult(record.id, {
    estado: parsed.estado,
    uuid: parsed.uuid,
    huella: parsed.huella,
    url: parsed.url,
  });
  return { status: mapEstado(parsed.estado), failure };
}

interface ResultInput {
  estado?: string | null;
  uuid?: string | null;
  huella?: string | null;
  url?: string | null;
  csv?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  transportFailed?: boolean;
}

/** The only way a verdict enters the database. */
async function recordResult(
  recordId: string,
  input: ResultInput,
): Promise<{ failure: DbFailure | null }> {
  const { error } = await supabase.rpc('record_aeat_result', {
    p_record_id: recordId,
    p_estado: input.estado ?? null,
    p_uuid: input.uuid ?? null,
    p_huella: input.huella ?? null,
    p_url: input.url ?? null,
    p_csv: input.csv ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_transport_failed: input.transportFailed ?? false,
  });
  return { failure: toDbFailure(error) };
}

/**
 * Ask Verifacti for AEAT's verdict.
 *
 * For roughly a minute after a create, the status endpoint answers "Factura no encontrada".
 * That is the record still propagating, not a lost invoice, so it leaves the status untouched.
 */
export async function refreshStatus(
  invoice: InvoiceRow,
): Promise<{ status: SendStatus; failure: DbFailure | null }> {
  if (invoice.number == null || invoice.issue_date == null) {
    return { status: invoice.send_status, failure: null };
  }

  const [{ data: series }, { data: records }] = await Promise.all([
    supabase.from('invoice_series').select('code').eq('id', invoice.series_id).maybeSingle(),
    supabase
      .from('invoice_aeat_record')
      .select('*')
      .eq('invoice_id', invoice.id)
      .is('settled_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const record = records?.[0];
  if (!record) return { status: invoice.send_status, failure: null };

  let result: { status: number; json: unknown };
  try {
    result = await callApi({
      action: 'status',
      serie: series?.code ?? '',
      numero: String(invoice.number),
      fechaExpedicion: toVerifactiDate(invoice.issue_date),
    });
  } catch {
    return { status: invoice.send_status, failure: null };
  }

  // For ~60s after a create the endpoint reports the invoice as missing. That is propagation,
  // not loss, so the state is left alone.
  if (isPendingLookup(result.json) || result.status !== 200) {
    return { status: invoice.send_status, failure: null };
  }

  const raw = result.json as { estado?: unknown; huella?: unknown; csv?: unknown };
  const estado = typeof raw.estado === 'string' ? raw.estado : null;
  if (!estado) return { status: invoice.send_status, failure: null };

  const { failure } = await recordResult(record.id, {
    estado,
    huella: typeof raw.huella === 'string' ? raw.huella : null,
    csv: typeof raw.csv === 'string' ? raw.csv : null,
  });
  return { status: mapEstado(estado), failure };
}

// ---------------------------------------------------------------------------
// Lifecycle actions. Each is a thin wrapper: the rules live in the RPC.
// ---------------------------------------------------------------------------

export async function getActivity(
  invoiceId: string,
): Promise<LoadResult<Tables<'invoice_activity'>[]>> {
  const { data, error } = await supabase
    .from('invoice_activity')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  return { data: data ?? [], failure: toDbFailure(error) };
}

export async function getAeatRecords(
  invoiceId: string,
): Promise<LoadResult<Tables<'invoice_aeat_record'>[]>> {
  const { data, error } = await supabase
    .from('invoice_aeat_record')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  return { data: data ?? [], failure: toDbFailure(error) };
}

export async function cancelInvoice(invoiceId: string): Promise<DbFailure | null> {
  const { error } = await supabase.rpc('cancel_invoice', { p_invoice_id: invoiceId });
  return toDbFailure(error);
}

/** Anular + a new draft carrying the same lines. The replacement always gets its own number. */
export async function cancelAndReplace(
  invoiceId: string,
): Promise<{ id: string | null; failure: DbFailure | null }> {
  const { data, error } = await supabase.rpc('cancel_and_replace', { p_invoice_id: invoiceId });
  const row = data as unknown as InvoiceRow | null;
  return { id: row?.id ?? null, failure: toDbFailure(error) };
}

export async function createRectificativa(input: {
  invoiceId: string;
  tipo: string;
  modo: 'S' | 'I';
  seriesId: string;
}): Promise<{ id: string | null; failure: DbFailure | null }> {
  const { data, error } = await supabase.rpc('create_rectificativa', {
    p_invoice_id: input.invoiceId,
    p_tipo: input.tipo,
    p_modo: input.modo,
    p_series_id: input.seriesId,
  });
  const row = data as unknown as InvoiceRow | null;
  return { id: row?.id ?? null, failure: toDbFailure(error) };
}

export async function markPaid(invoiceId: string, paid: boolean): Promise<DbFailure | null> {
  const { error } = await supabase.rpc('mark_invoice_paid', {
    p_invoice_id: invoiceId,
    p_paid: paid,
  });
  return toDbFailure(error);
}

export async function needingAttention(): Promise<
  LoadResult<{ invoice_id: string; reason: string }[]>
> {
  const { data, error } = await supabase.rpc('invoices_needing_attention');
  return {
    data: (data ?? []) as { invoice_id: string; reason: string }[],
    failure: toDbFailure(error),
  };
}
