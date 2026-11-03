/**
 * Spanish formatting for the client PDFs. Everything is in Madrid time: the PDF is generated on
 * a server in UTC, but a visit at 09:30 must read 09:30.
 */
import { madridStartOfDay } from '../history/index.js';
import { label, type PdfLabels } from './text.js';

const TZ = 'Europe/Madrid';

const dateFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDateFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
});
const timeFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const monthFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});
const ymdFmt = /* @__PURE__ */ new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "3 de noviembre de 2026" */
export function formatDateEs(iso: string): string {
  return dateFmt.format(new Date(iso));
}
/** "03/11" */
export function formatShortDateEs(iso: string): string {
  return shortDateFmt.format(new Date(iso));
}
/** "09:30" */
export function formatTimeEs(iso: string): string {
  return timeFmt.format(new Date(iso));
}
/** Madrid calendar day of an instant, 'YYYY-MM-DD'. */
export function madridYmd(iso: string): string {
  return ymdFmt.format(new Date(iso));
}

/** Decimal comma, at most `maxDecimals` decimals, no grouping surprises ("1234,5"). */
export function formatNumberEs(v: number, maxDecimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
  }).format(v);
}

/** The legal or recommended range as text: "7,2 – 8", "máx. 0,6", "mín. 0,5" or "". */
export function rangeText(
  min: number | null | undefined,
  max: number | null | undefined,
  labels: PdfLabels,
): string {
  const lo = min != null && Number.isFinite(min) ? formatNumberEs(min) : null;
  const hi = max != null && Number.isFinite(max) ? formatNumberEs(max) : null;
  if (lo != null && hi != null) return label(labels, 'rangeBetween', { min: lo, max: hi });
  if (lo != null) return label(labels, 'rangeMin', { min: lo });
  if (hi != null) return label(labels, 'rangeMax', { max: hi });
  return '';
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** True for 'YYYY-MM'. */
export function isMonth(s: unknown): s is string {
  return typeof s === 'string' && MONTH.test(s);
}

/**
 * Half-open UTC bounds of a Madrid calendar month: `visited_at >= from and visited_at < to`.
 * DST-safe (built on madridStartOfDay).
 */
export function monthBounds(month: string): { from: string; to: string } {
  const m = MONTH.exec(month);
  if (!m) throw new Error(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return { from: madridStartOfDay(`${month}-01`), to: madridStartOfDay(`${next}-01`) };
}

/** "octubre de 2026" */
export function monthLabelEs(month: string): string {
  return monthFmt.format(new Date(`${month}-15T12:00:00Z`));
}

/** The `count` months up to and including the one containing `now`, newest first. */
export function recentMonths(count: number, now: Date = new Date()): string[] {
  const [y, m] = madridYmd(now.toISOString()).split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}
