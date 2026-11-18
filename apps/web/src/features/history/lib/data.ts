import type { PostgrestError } from '@supabase/supabase-js';
import {
  dateRangeBounds,
  isExtraParamKey,
  paramKey,
  type ParameterDef,
  type ParameterStatus,
  type VisitFilters,
} from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import {
  poolRegion,
  resolveParameterDefs,
  toEvaluatorDef,
  type ParameterDefRow,
} from '../../../lib/parameters.js';
import type { Enums } from '../../../lib/database.types.js';

/**
 * Data access for the history screens. Reads only, on the existing visit tables (report,
 * measurement, incident, attachment) — no view or RPC, so it works on a preview deployment
 * and in production the moment it ships. Every call returns `{ data, failure }`; a failure is
 * never swallowed (see lib/dbError.ts).
 */

export interface LoadResult<T> {
  data: T;
  failure: DbFailure | null;
}

/** Supabase returns at most this many top-level rows per request (the project's max_rows). */
const PAGE_LIMIT = 1000;

export interface Reading {
  parameterDefId: string;
  siloeParamId: number | null;
  value: number | null;
  status: ParameterStatus;
}

export interface Incident {
  id: string;
  description: string;
  correctiveAction: string | null;
  /** No corrective action written down yet. See README → "Open incidents". */
  open: boolean;
}

export interface Visit {
  id: string;
  visitedAt: string;
  status: Enums<'report_status'>;
  analysisType: Enums<'analysis_type'>;
  signedAt: string | null;
  poolId: string;
  poolName: string | null;
  clientId: string | null;
  clientName: string | null;
  clientIsSelf: boolean;
  /** The pool's region for thresholds (`poolRegion`): community code, else the old text. */
  ccaa: string | null;
  basinId: string;
  basinName: string | null;
  technicianId: string | null;
  technicianName: string | null;
  readings: Reading[];
  incidents: Incident[];
  photoCount: number;
  labPdfCount: number;
}

// Composite foreign keys need the constraint name (docs/ONBOARDING.md §12).
const VISIT_SELECT =
  'id, visited_at, status, analysis_type, signed_at, pool_id, basin_id, technician_id, ' +
  'pool!report_pool_id_org_id_fkey(*, client!pool_client_id_org_id_fkey(name, is_self)), ' +
  'basin!report_basin_id_org_id_fkey(denominacion), ' +
  'technician:app_user!report_technician_id_fkey(full_name, email), ' +
  'measurement!measurement_report_id_org_id_fkey(value, status, parameter_def_id), ' +
  'incident!incident_report_id_org_id_fkey(id, description, corrective_action), ' +
  'attachment!attachment_report_id_org_id_fkey(kind)';

interface RawVisit {
  id: string;
  visited_at: string;
  status: Enums<'report_status'>;
  analysis_type: Enums<'analysis_type'>;
  signed_at: string | null;
  pool_id: string;
  basin_id: string;
  technician_id: string | null;
  pool: {
    denominacion: string;
    client_id: string;
    ccaa: string | null;
    /** Absent before the pool_ccaa_code migration. */
    ccaa_code?: string | null;
    client: { name: string; is_self: boolean } | null;
  } | null;
  basin: { denominacion: string } | null;
  technician: { full_name: string | null; email: string | null } | null;
  measurement: { value: number | null; status: ParameterStatus; parameter_def_id: string }[] | null;
  incident: { id: string; description: string; corrective_action: string | null }[] | null;
  attachment: { kind: Enums<'attachment_kind'> }[] | null;
}

/** Parameter definitions, loaded once per screen: names, units, thresholds. */
export interface ParamCatalog {
  rows: ParameterDefRow[];
  /**
   * parameter_def.id → parameter key, for every row (inactive ones too: old readings use
   * them). The key is the SILOE id, or 101+ for readings outside SILOE (`paramKey` in
   * @piscinas/shared). Everything named `siloeParamId` in this feature holds such a key.
   */
  siloeIdByDefId: Map<string, number>;
  /** The definitions that apply in a region, by parameter key. */
  forRegion(ccaa: string | null | undefined): Map<number, ParameterDefRow>;
  /** Same, as evaluator input for the traffic light. */
  evaluatorDefs(ccaa: string | null | undefined): Map<number, ParameterDef>;
}

export function buildCatalog(rows: ParameterDefRow[]): ParamCatalog {
  const cache = new Map<string, Map<number, ParameterDefRow>>();
  const forRegion = (ccaa: string | null | undefined) => {
    const key = ccaa ?? '';
    let hit = cache.get(key);
    if (!hit) {
      hit = new Map(resolveParameterDefs(rows, ccaa).map((r) => [paramKey(r)!, r]));
      cache.set(key, hit);
    }
    return hit;
  };
  return {
    rows,
    siloeIdByDefId: new Map(
      rows.flatMap((r) => {
        const key = paramKey(r);
        return key == null ? [] : [[r.id, key] as const];
      }),
    ),
    forRegion,
    evaluatorDefs: (ccaa) =>
      new Map([...forRegion(ccaa)].map(([id, row]) => [id, toEvaluatorDef(row)])),
  };
}

export async function fetchParamCatalog(): Promise<LoadResult<ParamCatalog>> {
  const { data, error } = await supabase.from('parameter_def').select('*');
  return { data: buildCatalog(data ?? []), failure: toDbFailure(error) };
}

function isOpen(correctiveAction: string | null): boolean {
  return !correctiveAction || correctiveAction.trim() === '';
}

export function toVisit(raw: RawVisit, catalog: ParamCatalog): Visit {
  const technician = raw.technician;
  return {
    id: raw.id,
    visitedAt: raw.visited_at,
    status: raw.status,
    analysisType: raw.analysis_type,
    signedAt: raw.signed_at,
    poolId: raw.pool_id,
    poolName: raw.pool?.denominacion ?? null,
    clientId: raw.pool?.client_id ?? null,
    clientName: raw.pool?.client?.name ?? null,
    clientIsSelf: raw.pool?.client?.is_self ?? false,
    ccaa: poolRegion(raw.pool),
    basinId: raw.basin_id,
    basinName: raw.basin?.denominacion ?? null,
    technicianId: raw.technician_id,
    technicianName: technician?.full_name?.trim() || technician?.email || null,
    readings: (raw.measurement ?? []).map((m) => ({
      parameterDefId: m.parameter_def_id,
      siloeParamId: catalog.siloeIdByDefId.get(m.parameter_def_id) ?? null,
      value: m.value,
      status: m.status,
    })),
    incidents: (raw.incident ?? []).map((i) => ({
      id: i.id,
      description: i.description,
      correctiveAction: i.corrective_action,
      open: isOpen(i.corrective_action),
    })),
    photoCount: (raw.attachment ?? []).filter((a) => a.kind === 'photo').length,
    labPdfCount: (raw.attachment ?? []).filter((a) => a.kind === 'lab_pdf').length,
  };
}

// ---------------------------------------------------------------------------
// Visit lists (pool Historial, client timeline, Informes)
// ---------------------------------------------------------------------------

/** What a list shows. Filters come from the URL (Informes) or the tab (Historial). */
export interface VisitScope extends Partial<VisitFilters> {
  /** Restrict to these pools, e.g. a client's pools. An empty list matches nothing. */
  poolIds?: string[];
}

function applyScope<
  Q extends {
    eq: (c: string, v: string) => Q;
    in: (c: string, v: string[]) => Q;
    gte: (c: string, v: string) => Q;
    lt: (c: string, v: string) => Q;
  },
>(query: Q, scope: VisitScope): Q {
  let q = query;
  if (scope.pool) q = q.eq('pool_id', scope.pool);
  if (scope.poolIds) q = q.in('pool_id', scope.poolIds);
  if (scope.basin) q = q.eq('basin_id', scope.basin);
  if (scope.technician) q = q.eq('technician_id', scope.technician);
  if (scope.status) q = q.eq('status', scope.status);
  const { gte, lt } = dateRangeBounds(scope.from, scope.to);
  if (gte) q = q.gte('visited_at', gte);
  if (lt) q = q.lt('visited_at', lt);
  return q;
}

/** True when the scope can't match anything (no pools to look in). */
function emptyScope(scope: VisitScope): boolean {
  return scope.poolIds !== undefined && scope.poolIds.length === 0;
}

/** One page of visits, newest first. `hasMore` is true when another page may exist. */
export async function fetchVisitPage(
  scope: VisitScope,
  catalog: ParamCatalog,
  offset: number,
  limit: number,
): Promise<LoadResult<{ visits: Visit[]; hasMore: boolean }>> {
  if (emptyScope(scope)) return { data: { visits: [], hasMore: false }, failure: null };
  if (scope.outOfRange) return fetchOutOfRangePage(scope, catalog, offset, limit);
  // Ask for one extra row to know whether "Cargar más" has anything to load.
  const { data, error } = await applyScope(
    supabase.from('report').select(VISIT_SELECT).order('visited_at', { ascending: false }),
    scope,
  ).range(offset, offset + limit);
  const rows = (data ?? []) as unknown as RawVisit[];
  return {
    data: {
      visits: rows.slice(0, limit).map((r) => toVisit(r, catalog)),
      hasMore: rows.length > limit,
    },
    failure: toDbFailure(error),
  };
}

/**
 * Visits with at least one reading outside the legal range (stored status "red", the same rule
 * the dashboard and the bell use). PostgREST can't filter a report by its children without
 * also trimming the embedded readings, so: list the red readings' visits (small, with just the
 * fields the filters need), filter and order them here, then fetch full rows for one page.
 * The id list is cached per scope so "Cargar más" doesn't repeat the first query.
 */
const outOfRangeIds = /* @__PURE__ */ new Map<string, Promise<LoadResult<string[]>>>();

async function listOutOfRangeIds(
  scope: VisitScope,
  catalog: ParamCatalog,
): Promise<LoadResult<string[]>> {
  const key = JSON.stringify(scope);
  const cached = outOfRangeIds.get(key);
  if (cached) return cached;
  const promise = (async (): Promise<LoadResult<string[]>> => {
    type Row = {
      report_id: string;
      parameter_def_id: string;
      report: {
        visited_at: string;
        pool_id: string;
        basin_id: string;
        technician_id: string | null;
        status: Enums<'report_status'>;
      } | null;
    };
    const { data, failure } = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('measurement')
        .select(
          'report_id, parameter_def_id, report!measurement_report_id_org_id_fkey(visited_at, pool_id, basin_id, technician_id, status)',
        )
        .eq('status', 'red')
        .range(from, to),
    );
    const { gte, lt } = dateRangeBounds(scope.from, scope.to);
    const pools = scope.poolIds ? new Set(scope.poolIds) : null;
    const byId = new Map<string, string>();
    for (const m of data) {
      const r = m.report;
      if (!r) continue;
      // Legal "fuera de rango" only: readings outside SILOE have a recommended range.
      const key = catalog.siloeIdByDefId.get(m.parameter_def_id);
      if (key == null || isExtraParamKey(key)) continue;
      if (scope.pool && r.pool_id !== scope.pool) continue;
      if (pools && !pools.has(r.pool_id)) continue;
      if (scope.basin && r.basin_id !== scope.basin) continue;
      if (scope.technician && r.technician_id !== scope.technician) continue;
      if (scope.status && r.status !== scope.status) continue;
      const t = Date.parse(r.visited_at);
      if (gte && t < Date.parse(gte)) continue;
      if (lt && t >= Date.parse(lt)) continue;
      byId.set(m.report_id, r.visited_at);
    }
    const ids = [...byId.entries()]
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .map(([id]) => id);
    return { data: ids, failure };
  })();
  outOfRangeIds.set(key, promise);
  // Don't keep a failed lookup: the next attempt should ask again.
  void promise.then((r) => r.failure && outOfRangeIds.delete(key));
  return promise;
}

/** Forget cached out-of-range lookups (after the user reloads or edits a visit). */
export function clearVisitCaches() {
  outOfRangeIds.clear();
}

async function fetchVisitsByIds(
  ids: string[],
  catalog: ParamCatalog,
): Promise<LoadResult<Visit[]>> {
  if (ids.length === 0) return { data: [], failure: null };
  const { data, error } = await supabase
    .from('report')
    .select(VISIT_SELECT)
    .in('id', ids)
    .order('visited_at', { ascending: false });
  return {
    data: ((data ?? []) as unknown as RawVisit[]).map((r) => toVisit(r, catalog)),
    failure: toDbFailure(error),
  };
}

async function fetchOutOfRangePage(
  scope: VisitScope,
  catalog: ParamCatalog,
  offset: number,
  limit: number,
): Promise<LoadResult<{ visits: Visit[]; hasMore: boolean }>> {
  const ids = await listOutOfRangeIds(scope, catalog);
  if (ids.failure) return { data: { visits: [], hasMore: false }, failure: ids.failure };
  const page = await fetchVisitsByIds(ids.data.slice(offset, offset + limit), catalog);
  return {
    data: { visits: page.data, hasMore: ids.data.length > offset + limit },
    failure: page.failure,
  };
}

/** One visit, for deep links (?visita=…) that point past the loaded pages. */
export async function fetchVisit(
  id: string,
  catalog: ParamCatalog,
): Promise<LoadResult<Visit | null>> {
  const { data, failure } = await fetchVisitsByIds([id], catalog);
  return { data: data[0] ?? null, failure };
}

/**
 * Every visit in scope, for the CSV export. Pages through the results so an export is never
 * silently cut at the server's row limit.
 */
export async function fetchAllVisits(
  scope: VisitScope,
  catalog: ParamCatalog,
): Promise<LoadResult<Visit[]>> {
  if (emptyScope(scope)) return { data: [], failure: null };
  if (scope.outOfRange) {
    const ids = await listOutOfRangeIds(scope, catalog);
    if (ids.failure) return { data: [], failure: ids.failure };
    const out: Visit[] = [];
    // Chunked so the id list never makes the request URL too long.
    for (let i = 0; i < ids.data.length; i += 100) {
      const chunk = await fetchVisitsByIds(ids.data.slice(i, i + 100), catalog);
      if (chunk.failure) return { data: out, failure: chunk.failure };
      out.push(...chunk.data);
    }
    return { data: out, failure: null };
  }
  const { data, failure } = await fetchAllRows<RawVisit>(
    (from, to) =>
      applyScope(
        supabase.from('report').select(VISIT_SELECT).order('visited_at', { ascending: false }),
        scope,
      ).range(from, to) as unknown as PromiseLike<{
        data: RawVisit[] | null;
        error: PostgrestError | null;
      }>,
    500,
  );
  return { data: data.map((r) => toVisit(r, catalog)), failure };
}

/** Page through a query until a short page comes back. */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  size = PAGE_LIMIT,
): Promise<LoadResult<T[]>> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, failure: toDbFailure(error) };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return { data: out, failure: null };
  }
}

// ---------------------------------------------------------------------------
// Latest state and trends
// ---------------------------------------------------------------------------

/**
 * How many recent visits per pool feed the "Último estado del agua" card and the open
 * incidents. Generous for a current-state view (two vasos visited daily = over three months),
 * and bounded so a pool with years of history stays fast.
 */
export const RECENT_VISITS = 200;

export interface RecentReading {
  reportId: string;
  basinId: string;
  poolId: string;
  visitedAt: string;
  siloeParamId: number;
  value: number;
  status: ParameterStatus;
}

export interface OpenIncident extends Incident {
  reportId: string;
  poolId: string;
  basinId: string;
  visitedAt: string;
}

export interface RecentActivity {
  readings: RecentReading[];
  openIncidents: OpenIncident[];
  /** Latest visit per pool (any vaso). */
  lastVisitByPool: Map<string, string>;
  /** Latest visit per vaso. */
  lastVisitByBasin: Map<string, string>;
}

const RECENT_SELECT =
  'id, visited_at, pool_id, basin_id, ' +
  'measurement!measurement_report_id_org_id_fkey(value, status, parameter_def_id), ' +
  'incident!incident_report_id_org_id_fkey(id, description, corrective_action)';

/** Recent readings and open incidents for one or more pools (one query per pool, in parallel). */
export async function fetchRecentActivity(
  poolIds: string[],
  catalog: ParamCatalog,
): Promise<LoadResult<RecentActivity>> {
  type Row = {
    id: string;
    visited_at: string;
    pool_id: string;
    basin_id: string;
    measurement:
      | { value: number | null; status: ParameterStatus; parameter_def_id: string }[]
      | null;
    incident: { id: string; description: string; corrective_action: string | null }[] | null;
  };
  const results = await Promise.all(
    poolIds.map((id) =>
      supabase
        .from('report')
        .select(RECENT_SELECT)
        .eq('pool_id', id)
        .order('visited_at', { ascending: false })
        .limit(RECENT_VISITS),
    ),
  );
  const activity: RecentActivity = {
    readings: [],
    openIncidents: [],
    lastVisitByPool: new Map(),
    lastVisitByBasin: new Map(),
  };
  let failure: DbFailure | null = null;
  for (const { data, error } of results) {
    failure ??= toDbFailure(error);
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!activity.lastVisitByPool.has(r.pool_id))
        activity.lastVisitByPool.set(r.pool_id, r.visited_at);
      if (!activity.lastVisitByBasin.has(r.basin_id))
        activity.lastVisitByBasin.set(r.basin_id, r.visited_at);
      for (const m of r.measurement ?? []) {
        const siloeParamId = catalog.siloeIdByDefId.get(m.parameter_def_id);
        if (m.value == null || siloeParamId == null) continue;
        activity.readings.push({
          reportId: r.id,
          basinId: r.basin_id,
          poolId: r.pool_id,
          visitedAt: r.visited_at,
          siloeParamId,
          value: m.value,
          status: m.status,
        });
      }
      for (const i of r.incident ?? []) {
        if (!isOpen(i.corrective_action)) continue;
        activity.openIncidents.push({
          id: i.id,
          description: i.description,
          correctiveAction: i.corrective_action,
          open: true,
          reportId: r.id,
          poolId: r.pool_id,
          basinId: r.basin_id,
          visitedAt: r.visited_at,
        });
      }
    }
  }
  return { data: activity, failure };
}

export interface TrendReading {
  reportId: string;
  basinId: string;
  visitedAt: string;
  siloeParamId: number;
  value: number | null;
}

/** Every reading of a pool in the last `days` days, oldest first, for the trend chart. */
export async function fetchTrendReadings(
  poolId: string,
  days: number,
  catalog: ParamCatalog,
): Promise<LoadResult<TrendReading[]>> {
  type Row = {
    id: string;
    basin_id: string;
    visited_at: string;
    measurement: { value: number | null; parameter_def_id: string }[] | null;
  };
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, failure } = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('report')
      .select(
        'id, basin_id, visited_at, measurement!measurement_report_id_org_id_fkey(value, parameter_def_id)',
      )
      .eq('pool_id', poolId)
      .gte('visited_at', cutoff)
      .order('visited_at', { ascending: true })
      .range(from, to),
  );
  const out: TrendReading[] = [];
  for (const r of data) {
    for (const m of r.measurement ?? []) {
      const siloeParamId = catalog.siloeIdByDefId.get(m.parameter_def_id);
      if (siloeParamId == null) continue;
      out.push({
        reportId: r.id,
        basinId: r.basin_id,
        visitedAt: r.visited_at,
        siloeParamId,
        value: m.value,
      });
    }
  }
  return { data: out, failure };
}

// ---------------------------------------------------------------------------
// Lookups for filters
// ---------------------------------------------------------------------------

export interface Option {
  id: string;
  label: string;
  /** Secondary text, e.g. the client of a pool. */
  detail?: string;
  /** Pools: their client. */
  clientId?: string;
}

/** Clients, pools, vasos and technicians for the Informes filters. */
export async function fetchFilterOptions(): Promise<
  LoadResult<{ clients: Option[]; pools: Option[]; technicians: Option[] }>
> {
  const [clients, pools, users] = await Promise.all([
    supabase.from('client').select('id, name, is_self').eq('archived', false).order('name'),
    supabase
      .from('pool')
      .select('id, denominacion, client_id, client!pool_client_id_org_id_fkey(name)')
      .order('denominacion'),
    supabase.from('app_user').select('id, full_name, email').order('full_name'),
  ]);
  type P = { id: string; denominacion: string; client_id: string; client: { name: string } | null };
  return {
    data: {
      clients: (clients.data ?? [])
        .filter((c) => !c.is_self)
        .map((c) => ({ id: c.id, label: c.name })),
      pools: ((pools.data ?? []) as unknown as P[]).map((p) => ({
        id: p.id,
        label: p.denominacion,
        detail: p.client?.name,
        clientId: p.client_id,
      })),
      technicians: (users.data ?? []).map((u) => ({
        id: u.id,
        label: u.full_name?.trim() || u.email || '—',
      })),
    },
    failure: toDbFailure(clients.error) ?? toDbFailure(pools.error) ?? toDbFailure(users.error),
  };
}
