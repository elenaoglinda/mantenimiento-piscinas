/**
 * Invoicing — the framework-agnostic half: money formatting, Spanish tax-ID validation, and
 * the Verifacti (Veri*Factu → AEAT) request/response contract.
 *
 * Two rules shape this file:
 *
 *   1. **Money is integer cents, everywhere.** Floats are never used for amounts. Values only
 *      become decimal strings at the API boundary, where Verifacti expects `"242.00"`.
 *   2. **Nothing trusts the API.** `parseCreateResponse` is total — it never throws — so a
 *      surprising payload degrades to "we don't know the state yet" instead of crashing a
 *      request that may already have created a legal record at AEAT.
 *
 * The per-tax-rate aggregation deliberately lives in SQL (`invoice_tax_breakdown`), not here,
 * so the figures stored on the invoice and the figures sent to AEAT come from one rounding
 * implementation rather than two that can drift.
 */

/** A tax-rate group as Verifacti's `lineas` array expects it. NOT a product line. */
export interface VerifactiLinea {
  base_imponible: string;
  tipo_impositivo: string;
  cuota_repercutida: string;
}

/** One row of `invoice_tax_breakdown`, in cents. */
export interface TaxBreakdownRow {
  taxRate: number;
  baseCents: number;
  quotaCents: number;
}

export type TipoFactura = 'F1' | 'F2' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export interface CreateInvoicePayload {
  serie: string;
  numero: string;
  fecha_expedicion: string;
  tipo_factura: TipoFactura;
  descripcion: string;
  lineas: VerifactiLinea[];
  importe_total: string;
  nif?: string;
  nombre?: string;
}

/** Simplified invoices (F2) are rejected by Verifacti above this amount. */
export const F2_MAX_TOTAL_CENTS = 300_000;

/** Default Spanish VAT for pool-maintenance services. */
export const DEFAULT_TAX_RATE = 21;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** 24200 -> "242.00". Always two decimals, always a dot, never a thousands separator. */
export function centsToAmount(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00';
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * "242,00" | "242.00" | "1.234,56" -> cents. Returns null for anything unparseable, so a
 * typo becomes a validation error rather than a silently wrong invoice.
 */
export function amountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Spanish input may use '.' for thousands and ',' for decimals. If both appear, the last
  // one is the decimal separator.
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  let normalised = trimmed;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    normalised = trimmed.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    normalised = trimmed.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Formats cents for display in Spanish: 24200 -> "242,00 €". */
export function formatEuros(cents: number): string {
  return `${centsToAmount(cents).replace('.', ',')} €`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Verifacti wants DD-MM-YYYY, not ISO. Accepts 'YYYY-MM-DD' or a Date. */
export function toVerifactiDate(value: string | Date): string {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Today in Europe/Madrid as 'YYYY-MM-DD' — the only date Verifacti accepts for a new record. */
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// ---------------------------------------------------------------------------
// Spanish tax IDs
// ---------------------------------------------------------------------------

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL = 'JABCDEFGHI';

/**
 * Validates a DNI, NIE or CIF, checking the control character — not just the shape.
 * Verifacti checks the destinatario against the AEAT census and rejects the invoice if it
 * fails, so catching a bad NIF here saves a round trip and a rejected record.
 */
export function isValidNif(value: string): boolean {
  const nif = value.trim().toUpperCase().replace(/[\s-]/g, '');

  if (/^[0-9]{8}[A-Z]$/.test(nif)) {
    return nif[8] === DNI_LETTERS[Number(nif.slice(0, 8)) % 23];
  }

  if (/^[XYZ][0-9]{7}[A-Z]$/.test(nif)) {
    const digits = String('XYZ'.indexOf(nif[0])) + nif.slice(1, 8);
    return nif[8] === DNI_LETTERS[Number(digits) % 23];
  }

  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(nif)) {
    const body = nif.slice(1, 8);
    let sum = 0;
    for (let i = 0; i < body.length; i += 1) {
      const digit = Number(body[i]);
      // Odd positions (1-indexed) are doubled and their digits added.
      if (i % 2 === 0) {
        const doubled = digit * 2;
        sum += Math.floor(doubled / 10) + (doubled % 10);
      } else {
        sum += digit;
      }
    }
    const control = (10 - (sum % 10)) % 10;
    const expected = nif[8];
    return expected === String(control) || expected === CIF_CONTROL[control];
  }

  return false;
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

export function breakdownToLineas(rows: TaxBreakdownRow[]): VerifactiLinea[] {
  return rows.map((r) => ({
    base_imponible: centsToAmount(r.baseCents),
    tipo_impositivo: String(r.taxRate),
    cuota_repercutida: centsToAmount(r.quotaCents),
  }));
}

export interface BuildPayloadInput {
  seriesCode: string;
  number: number;
  issueDate: string | Date;
  tipoFactura: TipoFactura;
  descripcion: string;
  breakdown: TaxBreakdownRow[];
  totalCents: number;
  /** Destinatario. Omitted for F2 (simplificada), required for F1. */
  clientNif?: string | null;
  clientName?: string | null;
}

export function buildCreatePayload(input: BuildPayloadInput): CreateInvoicePayload {
  const payload: CreateInvoicePayload = {
    serie: input.seriesCode,
    numero: String(input.number),
    fecha_expedicion: toVerifactiDate(input.issueDate),
    tipo_factura: input.tipoFactura,
    descripcion: input.descripcion.trim().slice(0, 500),
    lineas: breakdownToLineas(input.breakdown),
    importe_total: centsToAmount(input.totalCents),
  };
  // F2 carries no destinatario; F1 identifies the customer.
  if (input.tipoFactura !== 'F2') {
    if (input.clientNif) payload.nif = input.clientNif.trim().toUpperCase();
    if (input.clientName) payload.nombre = input.clientName.trim().slice(0, 120);
  }
  return payload;
}

/** Blocking problems that would make AEAT reject the record. Empty array means "ready". */
export function validateForSending(input: BuildPayloadInput): string[] {
  const errors: string[] = [];
  if (!input.seriesCode.trim()) errors.push('missing_series');
  if (!Number.isInteger(input.number) || input.number < 1) errors.push('invalid_number');
  if (!input.descripcion.trim()) errors.push('missing_description');
  if (input.breakdown.length === 0) errors.push('no_lines');
  if (input.totalCents <= 0) errors.push('non_positive_total');

  const sum = input.breakdown.reduce((n, r) => n + r.baseCents + r.quotaCents, 0);
  if (sum !== input.totalCents) errors.push('total_mismatch');

  if (input.tipoFactura === 'F2') {
    if (input.totalCents > F2_MAX_TOTAL_CENTS) errors.push('f2_over_limit');
  } else {
    if (!input.clientNif?.trim()) errors.push('missing_client_nif');
    else if (!isValidNif(input.clientNif)) errors.push('invalid_client_nif');
    if (!input.clientName?.trim()) errors.push('missing_client_name');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

export type SendStatus = 'not_sent' | 'queued' | 'sending' | 'accepted' | 'rejected' | 'failed';

export interface CreateResponse {
  uuid: string | null;
  /** Base64 PNG of the Veri*Factu QR, to be placed on the invoice PDF. */
  qr: string | null;
  /** AEAT validation URL encoded in that QR. */
  url: string | null;
  huella: string | null;
  estado: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Total: never throws, whatever Verifacti returns. */
export function parseCreateResponse(body: unknown): CreateResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { uuid: null, qr: null, url: null, huella: null, estado: null };
  }
  const raw = body as Record<string, unknown>;
  return {
    uuid: str(raw.uuid),
    qr: str(raw.qr),
    url: str(raw.url),
    huella: str(raw.huella),
    estado: str(raw.estado),
  };
}

/**
 * Maps Verifacti's `estado` onto our send status.
 *
 * "Pendiente" means accepted by Verifacti and queued for AEAT — the record already exists and
 * must never be re-sent. Only `failed` (a transport error, where we do not know whether the
 * request landed) is eligible for retry, and then only under the same Idempotency-Key.
 */
export function mapEstado(estado: string | null): SendStatus {
  switch ((estado ?? '').trim().toLowerCase()) {
    case 'correcta':
    case 'aceptada':
    case 'aceptadaconerrores':
      return 'accepted';
    case 'incorrecta':
    case 'rechazada':
    case 'anulada':
      return 'rejected';
    case 'pendiente':
    case 'procesando':
    case 'enviando':
      return 'sending';
    default:
      return 'sending';
  }
}

/**
 * True when a status lookup means "AEAT has not answered yet", not "this invoice is lost".
 *
 * Verified against the sandbox: for roughly the first minute after a successful `create`,
 * `POST /verifactu/status` answers `{"mensaje":"Factura no encontrada"}`. Treating that as a
 * failure would mark a perfectly good invoice as broken, so it is explicitly transient.
 */
export function isPendingLookup(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const message = str((body as Record<string, unknown>).mensaje)?.toLowerCase() ?? '';
  return message.includes('no encontrada');
}

/** "2026" + 7 -> "2026/0007". Display only; AEAT receives serie and numero separately. */
export function formatInvoiceNumber(seriesCode: string, number: number | null): string {
  if (number == null) return '—';
  return `${seriesCode}/${String(number).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Fiscal state (presentation)
// ---------------------------------------------------------------------------

/**
 * The badge a user sees. Derived from the stored pair plus two facts that are deliberately NOT
 * stored — whether a rectificativa points at this invoice, and whether it is past due — because
 * a stored copy of either would eventually disagree with reality.
 */
export type FiscalState =
  | 'draft'
  | 'pending_send'
  | 'sent'
  | 'sent_with_errors'
  | 'rejected'
  | 'cancelled'
  | 'rectified';

export interface FiscalStateInput {
  status: 'draft' | 'issued' | 'void';
  sendStatus: SendStatus;
  /** Verifacti's own word: "Correcta", "AceptadaConErrores", … */
  aeatEstado?: string | null;
  /** True when some rectificativa names this invoice as its original. */
  hasRectificativa?: boolean;
}

export function fiscalState(input: FiscalStateInput): FiscalState {
  if (input.status === 'void') return 'cancelled';
  if (input.status === 'draft') return 'draft';
  // A rectified invoice is still accepted at AEAT; the badge just says it was superseded.
  if (input.hasRectificativa) return 'rectified';
  switch (input.sendStatus) {
    case 'rejected':
      return 'rejected';
    case 'accepted':
      return (input.aeatEstado ?? '').toLowerCase().includes('errores')
        ? 'sent_with_errors'
        : 'sent';
    default:
      return 'pending_send';
  }
}

/** Unpaid and past its due date. Never stored — it would need a nightly job just to stay true. */
export function isOverdue(
  dueDate: string | null,
  paymentStatus: 'pending' | 'paid',
  today: string = madridToday(),
): boolean {
  if (paymentStatus === 'paid' || !dueDate) return false;
  return dueDate < today;
}

/** The exits a rejected record may legally take. See docs/INVOICING.md §5c. */
export type RejectionRemedy = 'resend' | 'subsanacion' | 'cancel_and_replace';

/**
 * Which remedies to offer for a rejected record.
 *
 * Deliberately NOT a single "fix and resend": Verifacti restricts subsanación to changes with
 * no fiscal repercussion, so a rejection caused by a wrong amount or NIF has to go through
 * anulación plus a new invoice instead.
 */
export const REJECTION_REMEDIES: readonly RejectionRemedy[] = [
  'resend',
  'subsanacion',
  'cancel_and_replace',
];
