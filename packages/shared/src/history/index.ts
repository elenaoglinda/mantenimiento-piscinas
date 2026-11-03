/**
 * Service history: framework-free logic behind the pool/client history screens and the
 * Informes export. No React, no Supabase — the web app fetches rows from the history views
 * (supabase/migrations/20261103120000_service_history_views.sql) and hands them in here.
 *
 * See README.md next to this file for the decisions behind each piece.
 */
import { evaluate, type ParameterDef, type ParameterStatus } from '../evaluate.js';
import { madridToday } from '../invoicing/index.js';

// ---------------------------------------------------------------------------
// Parameters shown inline in a visit row
// ---------------------------------------------------------------------------

/**
 * SILOE `id_parametro` of the four readings a visit row shows inline, in display order:
 * pH, cloro libre, cloro combinado, temperatura del agua. Everything else is in the
 * expanded row.
 */
export const KEY_PARAM_IDS = [1, 10, 9, 3] as const;

/**
 * Parameters the trend chart offers, in the order of its selector: SILOE ids, then the
 * readings outside SILOE (keys from 101, see service-log/params.ts).
 */
export const TREND_PARAM_IDS = [1, 10, 9, 3, 2, 6, 7, 8, 101, 102, 103, 104] as const;

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

const SEVERITY: Record<ParameterStatus, number> = { unknown: 0, green: 1, amber: 2, red: 3 };

/** The most severe status of a set: red > amber > green > unknown. Empty → unknown. */
export function worstStatus(statuses: Iterable<ParameterStatus>): ParameterStatus {
  let worst: ParameterStatus = 'unknown';
  for (const s of statuses) if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  return worst;
}

/**
 * Traffic light for one reading. With the parameter's resolved definition we evaluate the
 * value now (so the colour always follows the current thresholds for the pool's region);
 * without one we fall back to the status stored when the reading was saved.
 */
export function readingStatus(
  value: number | null,
  def: ParameterDef | undefined,
  stored: ParameterStatus = 'unknown',
): ParameterStatus {
  if (value == null) return 'unknown';
  return def ? evaluate(value, def).status : stored;
}

// ---------------------------------------------------------------------------
// Days and dates (Europe/Madrid calendar)
// ---------------------------------------------------------------------------

/** Whole calendar days, in Madrid, from the instant `iso` to `now`. Never negative. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const from = madridToday(new Date(iso));
  const to = madridToday(now);
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(0, days);
}

/** Minutes Madrid is ahead of UTC at a given instant (60 in winter, 120 in summer). */
function madridOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The UTC instant of 00:00 in Madrid on calendar day `ymd` ('YYYY-MM-DD'). */
export function madridStartOfDay(ymd: string): string {
  const naive = Date.parse(`${ymd}T00:00:00Z`);
  // Two passes: the offset at the guessed instant decides the real one (DST-safe).
  let utc = naive - madridOffsetMinutes(new Date(naive)) * 60_000;
  utc = naive - madridOffsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
}

/** Calendar day after `ymd`. */
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns an inclusive Madrid date range ('YYYY-MM-DD', either end optional) into the
 * half-open UTC bounds a query needs: `visited_at >= gte and visited_at < lt`.
 * Invalid dates are ignored rather than producing a query that matches nothing.
 */
export function dateRangeBounds(
  from: string | null | undefined,
  to: string | null | undefined,
): { gte?: string; lt?: string } {
  const out: { gte?: string; lt?: string } = {};
  if (from && YMD.test(from) && !Number.isNaN(Date.parse(from))) out.gte = madridStartOfDay(from);
  if (to && YMD.test(to) && !Number.isNaN(Date.parse(to))) out.lt = madridStartOfDay(nextDay(to));
  return out;
}

// ---------------------------------------------------------------------------
// Latest state per basin
// ---------------------------------------------------------------------------

export interface LatestReadingInput {
  basinId: string;
  siloeParamId: number;
  value: number;
  visitedAt: string;
  reportId: string;
  /** Status stored with the reading, used only when no definition is available. */
  status?: ParameterStatus;
}

export interface LatestParam {
  siloeParamId: number;
  value: number;
  visitedAt: string;
  reportId: string;
  status: ParameterStatus;
}

export interface BasinState {
  basinId: string;
  /** One entry per parameter with a value, in SILOE order. Empty = never measured. */
  params: LatestParam[];
  /** Most recent of the readings above, or null. */
  lastReadingAt: string | null;
  /** Worst light across the latest values. */
  status: ParameterStatus;
}

/**
 * The "Último estado del agua" card: for each basin, the latest value of each parameter with
 * its traffic light. Rows normally come from `basin_latest_reading` (already one per basin and
 * parameter); if several rows for the same pair arrive, the newest wins, so the function is
 * also correct on raw readings. Basins listed in `basinIds` with no readings get an empty state.
 */
export function latestStateByBasin(
  readings: LatestReadingInput[],
  defs: ReadonlyMap<number, ParameterDef>,
  basinIds: readonly string[] = [],
): Map<string, BasinState> {
  const latest = new Map<string, Map<number, LatestReadingInput>>();
  for (const id of basinIds) latest.set(id, new Map());
  for (const r of readings) {
    let byParam = latest.get(r.basinId);
    if (!byParam) latest.set(r.basinId, (byParam = new Map()));
    const prev = byParam.get(r.siloeParamId);
    if (!prev || r.visitedAt > prev.visitedAt) byParam.set(r.siloeParamId, r);
  }

  const out = new Map<string, BasinState>();
  for (const [basinId, byParam] of latest) {
    const params = [...byParam.values()]
      .sort((a, b) => a.siloeParamId - b.siloeParamId)
      .map((r) => ({
        siloeParamId: r.siloeParamId,
        value: r.value,
        visitedAt: r.visitedAt,
        reportId: r.reportId,
        status: readingStatus(r.value, defs.get(r.siloeParamId), r.status),
      }));
    out.set(basinId, {
      basinId,
      params,
      lastReadingAt: params.reduce<string | null>(
        (max, p) => (max == null || p.visitedAt > max ? p.visitedAt : max),
        null,
      ),
      status: worstStatus(params.map((p) => p.status)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Readings grouped by visit (history rows, CSV)
// ---------------------------------------------------------------------------

export interface VisitReadingInput {
  reportId: string;
  siloeParamId: number;
  value: number | null;
  status?: ParameterStatus;
}

/** reportId → (siloeParamId → reading). One reading per parameter per visit. */
export function groupReadingsByVisit<T extends VisitReadingInput>(
  readings: readonly T[],
): Map<string, Map<number, T>> {
  const out = new Map<string, Map<number, T>>();
  for (const r of readings) {
    let byParam = out.get(r.reportId);
    if (!byParam) out.set(r.reportId, (byParam = new Map()));
    byParam.set(r.siloeParamId, r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trend chart
// ---------------------------------------------------------------------------

export const TREND_WINDOWS = [30, 90, 365] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export interface TrendReadingInput {
  basinId: string;
  visitedAt: string;
  value: number | null;
  reportId: string;
}

export interface TrendPoint {
  t: number;
  visitedAt: string;
  value: number;
  reportId: string;
  status: ParameterStatus;
  /** Outside the legal range (red), marked on the chart. */
  outOfRange: boolean;
}

export interface TrendSeries {
  basinId: string;
  points: TrendPoint[];
}

/**
 * One line per basin for a single parameter over the last `days` days, oldest first.
 * Empty readings are dropped; basins with nothing in the window are left out.
 */
export function buildTrend(
  readings: readonly TrendReadingInput[],
  def: ParameterDef | undefined,
  days: number,
  now: Date = new Date(),
): TrendSeries[] {
  const cutoff = now.getTime() - days * 86_400_000;
  const byBasin = new Map<string, TrendPoint[]>();
  for (const r of readings) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    const t = Date.parse(r.visitedAt);
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue;
    const status = readingStatus(r.value, def);
    const point: TrendPoint = {
      t,
      visitedAt: r.visitedAt,
      value: r.value,
      reportId: r.reportId,
      status,
      outOfRange: def ? !evaluate(r.value, def).compliant : false,
    };
    const list = byBasin.get(r.basinId);
    if (list) list.push(point);
    else byBasin.set(r.basinId, [point]);
  }
  return [...byBasin.entries()].map(([basinId, points]) => ({
    basinId,
    points: points.sort((a, b) => a.t - b.t),
  }));
}

/**
 * Y-axis range for a trend: covers every point and the legal band, with a little headroom so
 * nothing sits on the frame. A flat series gets a range of ±1 around its value.
 */
export function trendDomain(
  series: readonly TrendSeries[],
  def: Pick<ParameterDef, 'minOk' | 'maxOk'> | undefined,
): [number, number] {
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (def?.minOk != null) values.push(def.minOk);
  if (def?.maxOk != null) values.push(def.maxOk);
  if (values.length === 0) return [0, 1];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  // Readings like chlorine, turbidity and temperature are never negative.
  if (Math.min(...values) >= 0) lo = Math.max(0, lo);
  return [lo, hi];
}

/** Round, evenly spaced axis ticks inside [lo, hi] (about `count` of them). */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo) || count < 1) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// CSV for Spanish Excel
// ---------------------------------------------------------------------------

/** Byte-order mark: without it Excel reads UTF-8 as Windows-1252 and mangles "ñ" and "º". */
export const CSV_BOM = '﻿';
/** Spanish Excel splits on ";" because "," is the decimal separator. */
export const CSV_SEPARATOR = ';';

export type CsvCell = string | number | null | undefined;

/** A number as Spanish Excel reads it: decimal comma, no thousands separator. */
export function csvNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  // Up to 4 decimals, trailing zeros trimmed: 7.40 → "7,4", 0.125 → "0,125".
  return String(Number(n.toFixed(4))).replace('.', ',');
}

function csvField(cell: CsvCell): string {
  if (cell == null) return '';
  const s = typeof cell === 'number' ? csvNumber(cell) : cell;
  // Quote anything that would break the row; double inner quotes. Also quote a leading
  // = + - @ so a cell is never run as a formula when the file is opened.
  const formula = /^[=+\-@]/.test(s) && typeof cell === 'string';
  if (formula || /[";\r\n]/.test(s)) return `"${(formula ? `'${s}` : s).replace(/"/g, '""')}"`;
  return s;
}

/** Rows → CSV text (BOM, ";" separator, CRLF line ends), ready to save as a .csv file. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return CSV_BOM + rows.map((r) => r.map(csvField).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

export interface CsvVisit {
  id: string;
  visitedAt: string;
  clientName: string | null;
  poolName: string | null;
  basinName: string | null;
  technicianName: string | null;
  statusLabel: string;
  incidentCount: number;
  openIncidentCount: number;
}

export interface CsvParamColumn {
  siloeParamId: number;
  /** Header, e.g. "Cloro libre residual (mg/L)". */
  label: string;
}

export interface CsvLabels {
  date: string;
  time: string;
  client: string;
  pool: string;
  basin: string;
  technician: string;
  status: string;
  incidents: string;
  openIncidents: string;
}

/**
 * The Informes export: one row per visit, one column per parameter. Dates and times are in
 * Madrid, as DD/MM/AAAA and HH:MM, which Excel recognises. Parameters with no reading are blank.
 */
export function visitsCsv(
  visits: readonly CsvVisit[],
  readings: ReadonlyMap<string, ReadonlyMap<number, { value: number | null }>>,
  params: readonly CsvParamColumn[],
  labels: CsvLabels,
): string {
  const date = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const header: CsvCell[] = [
    labels.date,
    labels.time,
    labels.client,
    labels.pool,
    labels.basin,
    labels.technician,
    labels.status,
    ...params.map((p) => p.label),
    labels.incidents,
    labels.openIncidents,
  ];
  const body = visits.map((v): CsvCell[] => {
    const at = new Date(v.visitedAt);
    const byParam = readings.get(v.id);
    return [
      date.format(at),
      time.format(at),
      v.clientName,
      v.poolName,
      v.basinName,
      v.technicianName,
      v.statusLabel,
      ...params.map((p) => byParam?.get(p.siloeParamId)?.value ?? null),
      v.incidentCount,
      v.openIncidentCount,
    ];
  });
  return toCsv([header, ...body]);
}

// ---------------------------------------------------------------------------
// Informes filters (kept in the URL)
// ---------------------------------------------------------------------------

export interface VisitFilters {
  /** Madrid calendar day 'YYYY-MM-DD', inclusive. */
  from: string | null;
  to: string | null;
  client: string | null;
  pool: string | null;
  basin: string | null;
  technician: string | null;
  /** Only visits with at least one reading outside the legal range. */
  outOfRange: boolean;
  status: 'draft' | 'completed' | 'signed' | null;
}

export const EMPTY_VISIT_FILTERS: VisitFilters = {
  from: null,
  to: null,
  client: null,
  pool: null,
  basin: null,
  technician: null,
  outOfRange: false,
  status: null,
};

/** URL parameter for each filter. Short and Spanish-neutral so links stay readable. */
const PARAM: Record<keyof VisitFilters, string> = {
  from: 'desde',
  to: 'hasta',
  client: 'cliente',
  pool: 'piscina',
  basin: 'vaso',
  technician: 'tecnico',
  outOfRange: 'fuera',
  status: 'estado',
};

const STATUSES = new Set(['draft', 'completed', 'signed']);

/** Read filters from a URL query. Anything malformed is dropped, never guessed. */
export function parseVisitFilters(get: (key: string) => string | null): VisitFilters {
  const id = (k: keyof VisitFilters) => {
    const v = get(PARAM[k])?.trim();
    return v ? v : null;
  };
  const day = (k: 'from' | 'to') => {
    const v = id(k);
    return v && YMD.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  };
  const status = id('status');
  return {
    from: day('from'),
    to: day('to'),
    client: id('client'),
    pool: id('pool'),
    basin: id('basin'),
    technician: id('technician'),
    outOfRange: get(PARAM.outOfRange) === '1',
    status: status && STATUSES.has(status) ? (status as VisitFilters['status']) : null,
  };
}

/**
 * Write filters back into a URL query, keeping any unrelated parameters (e.g. `q`, `tab`)
 * and removing the ones that are empty, so a cleared filter leaves a clean URL.
 */
export function writeVisitFilters(
  current: URLSearchParams,
  filters: Partial<VisitFilters>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of Object.keys(filters) as (keyof VisitFilters)[]) {
    const value = filters[key];
    if (key === 'outOfRange') {
      if (value) next.set(PARAM.outOfRange, '1');
      else next.delete(PARAM.outOfRange);
    } else if (typeof value === 'string' && value) next.set(PARAM[key], value);
    else next.delete(PARAM[key]);
  }
  return next;
}

/** How many filters are active (for the "Filtros (3)" badge and "Quitar filtros"). */
export function activeFilterCount(f: VisitFilters): number {
  return (Object.keys(EMPTY_VISIT_FILTERS) as (keyof VisitFilters)[]).filter((k) =>
    k === 'outOfRange' ? f.outOfRange : f[k] != null,
  ).length;
}
