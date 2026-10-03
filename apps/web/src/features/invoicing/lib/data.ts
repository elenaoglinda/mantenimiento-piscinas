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

async function persist(invoiceId: string, patch: Partial<InvoiceRow>): Promise<void> {
  await supabase.from('invoice').update(patch).eq('id', invoiceId);
}

/**
 * Send an issued invoice to AEAT via Verifacti.
 *
 * Returns the resulting send status. On `unknown_outcome` the invoice is left as `failed` with
 * its idempotency key intact, which is precisely the state a later retry needs.
 */
export async function sendInvoice(invoice: InvoiceWithRelations): Promise<SendStatus> {
  if (invoice.status === 'draft' || invoice.number == null || invoice.issue_date == null) {
    throw new InvoiceSendError('invalid', 'not_issued');
  }
  if (invoice.send_status === 'accepted' || invoice.send_status === 'sending') {
    // Already at AEAT. Refresh instead of sending again.
    return invoice.send_status;
  }

  const { data: breakdown } = await getTaxBreakdown(invoice.id);
  const payloadInput = {
    seriesCode: invoice.invoice_series?.code ?? '',
    number: invoice.number,
    issueDate: invoice.issue_date,
    tipoFactura: invoice.tipo_factura as TipoFactura,
    descripcion: invoice.descripcion,
    breakdown,
    totalCents: Number(invoice.total_cents),
    clientNif: invoice.client?.cif_nif ?? null,
    clientName: invoice.client?.name ?? null,
  };

  const problems = validateForSending(payloadInput);
  if (problems.length > 0) {
    await persist(invoice.id, { send_status: 'failed', last_error: problems.join(',') });
    throw new InvoiceSendError('invalid', problems.join(','));
  }

  await persist(invoice.id, {
    send_status: 'sending',
    send_attempts: invoice.send_attempts + 1,
  });

  let result: { status: number; json: unknown };
  try {
    result = await callApi({
      action: 'create',
      idempotencyKey: invoice.idempotency_key,
      payload: buildCreatePayload(payloadInput),
    });
  } catch (err) {
    const code = err instanceof InvoiceSendError ? err.code : 'failed';
    // 'unknown_outcome' deliberately does NOT reset the idempotency key.
    await persist(invoice.id, { send_status: 'failed', last_error: code });
    throw err;
  }

  if (result.status === 401) {
    await persist(invoice.id, { send_status: 'failed', last_error: 'unauthorized' });
    throw new InvoiceSendError('unauthorized');
  }
  if (result.status === 503) {
    await persist(invoice.id, { send_status: 'failed', last_error: 'unavailable' });
    throw new InvoiceSendError('unavailable');
  }
  if (result.status === 409) {
    // Same key already in flight upstream — the record is being created, not lost.
    await persist(invoice.id, { send_status: 'sending', last_error: null });
    return 'sending';
  }
  if (result.status === 422) {
    // Key reused with a different payload: a real bug, never something to paper over.
    await persist(invoice.id, { send_status: 'failed', last_error: 'idempotency_conflict' });
    throw new InvoiceSendError('conflict');
  }
  if (result.status !== 200) {
    const detail =
      typeof result.json === 'object' && result.json !== null
        ? JSON.stringify(result.json).slice(0, 300)
        : `http_${result.status}`;
    await persist(invoice.id, { send_status: 'failed', last_error: detail });
    throw new InvoiceSendError('failed', detail);
  }

  const parsed = parseCreateResponse(result.json);
  const status = mapEstado(parsed.estado);
  await persist(invoice.id, {
    send_status: status,
    verifacti_uuid: parsed.uuid,
    verifacti_huella: parsed.huella,
    aeat_url: parsed.url,
    aeat_estado: parsed.estado,
    sent_at: new Date().toISOString(),
    last_error: null,
  });
  return status;
}

/**
 * Ask Verifacti for AEAT's verdict.
 *
 * For roughly a minute after a create, the status endpoint answers "Factura no encontrada".
 * That is the record still propagating, not a lost invoice, so it leaves the status untouched.
 */
export async function refreshStatus(invoice: InvoiceRow): Promise<SendStatus> {
  if (invoice.number == null || invoice.issue_date == null) return invoice.send_status;

  const { data: series } = await supabase
    .from('invoice_series')
    .select('code')
    .eq('id', invoice.series_id)
    .maybeSingle();

  const result = await callApi({
    action: 'status',
    serie: series?.code ?? '',
    numero: String(invoice.number),
    fechaExpedicion: toVerifactiDate(invoice.issue_date),
  });

  if (isPendingLookup(result.json)) {
    await persist(invoice.id, { aeat_checked_at: new Date().toISOString() });
    return invoice.send_status;
  }
  if (result.status !== 200) return invoice.send_status;

  const raw = result.json as { estado?: unknown; huella?: unknown };
  const estado = typeof raw.estado === 'string' ? raw.estado : null;
  if (!estado) return invoice.send_status;

  const status = mapEstado(estado);
  await persist(invoice.id, {
    send_status: status,
    aeat_estado: estado,
    aeat_checked_at: new Date().toISOString(),
    verifacti_huella:
      typeof raw.huella === 'string' ? raw.huella : (invoice.verifacti_huella ?? null),
  });
  return status;
}
