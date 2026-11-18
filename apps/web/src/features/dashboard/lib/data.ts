import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import { fetchLegalRedReadings } from '../../../lib/legalAlerts.js';
import type { PoolLite } from '../../../lib/dashboard.js';
import type { Enums } from '../../../lib/database.types.js';

/**
 * The dashboard's data access. Every query's error is read: one failed query makes the whole
 * load fail (`data: null`), because a dashboard built from partial results states things that
 * aren't true ("0 piscinas activas", "Todo en orden"). The page shows the failure instead.
 */

export interface PoolInfo extends PoolLite {
  archived: boolean;
}

export interface RecentReport {
  id: string;
  pool_id: string;
  visited_at: string;
  status: Enums<'report_status'>;
  pool: { denominacion: string } | null;
  basin: { denominacion: string } | null;
}

export interface DashboardData {
  /** Every pool, archived included (old route stops reference them). */
  pools: PoolInfo[];
  clientCount: number;
  basinCount: number;
  /** Every report's pool and date, newest first. */
  visits: { pool_id: string; visited_at: string }[];
  /** The 100 newest reports with their pool and vaso names. */
  recent: RecentReport[];
  /** Reports with a reading outside the legal range. */
  redReportIds: Set<string>;
  memberCount: number;
  routeCount: number;
  exportCount: number;
  nextRouteDate: string | null;
  /** Vasos with an annual SILOÉ result for `siloeYear`. */
  siloeReadyBasins: number;
  siloeExportedAt: string | null;
}

export interface Loaded<T> {
  data: T | null;
  failure: DbFailure | null;
}

/** First failure among the results, in query order. */
function firstFailure(results: { error: unknown }[]): DbFailure | null {
  for (const r of results) {
    const f = toDbFailure(r.error as Parameters<typeof toDbFailure>[0]);
    if (f) return f;
  }
  return null;
}

export async function loadDashboard({
  today,
  siloeYear,
}: {
  today: string;
  siloeYear: number;
}): Promise<Loaded<DashboardData>> {
  const [
    clients,
    pools,
    basins,
    visits,
    recent,
    red,
    members,
    routes,
    exports,
    nextRoute,
    siloeRows,
    siloeExport,
  ] = await Promise.all([
    supabase.from('client').select('id', { count: 'exact', head: true }).eq('archived', false),
    supabase
      .from('pool')
      .select('id, denominacion, created_at, archived, client!pool_client_id_org_id_fkey(name)')
      .order('denominacion'),
    supabase.from('basin').select('id', { count: 'exact', head: true }),
    supabase.from('report').select('pool_id, visited_at').order('visited_at', { ascending: false }),
    supabase
      .from('report')
      .select(
        'id, pool_id, visited_at, status, pool!report_pool_id_org_id_fkey(denominacion), basin!report_basin_id_org_id_fkey(denominacion)',
      )
      .order('visited_at', { ascending: false })
      .limit(100),
    fetchLegalRedReadings(),
    supabase.from('app_user').select('id', { count: 'exact', head: true }),
    supabase.from('route').select('id', { count: 'exact', head: true }),
    supabase.from('xml_export').select('id', { count: 'exact', head: true }),
    supabase
      .from('route')
      .select('route_date')
      .gte('route_date', today)
      .order('route_date', { ascending: true })
      .limit(1),
    supabase.from('annual_result').select('basin_id').eq('year', siloeYear),
    supabase
      .from('xml_export')
      .select('created_at')
      .eq('kind', 'resultado_anual')
      .eq('period_year', siloeYear)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const failure =
    firstFailure([clients, pools, basins, visits, recent]) ??
    red.failure ??
    firstFailure([members, routes, exports, nextRoute, siloeRows, siloeExport]);
  if (failure) return { data: null, failure };

  const poolRows = (pools.data ?? []) as unknown as Array<{
    id: string;
    denominacion: string;
    created_at: string;
    archived: boolean;
    client: { name: string } | null;
  }>;

  return {
    failure: null,
    data: {
      pools: poolRows.map((p) => ({
        id: p.id,
        denominacion: p.denominacion,
        created_at: p.created_at,
        archived: p.archived,
        clientName: p.client?.name ?? null,
      })),
      clientCount: clients.count ?? 0,
      basinCount: basins.count ?? 0,
      visits: (visits.data ?? []) as { pool_id: string; visited_at: string }[],
      recent: (recent.data ?? []) as unknown as RecentReport[],
      redReportIds: new Set(red.data.map((m) => m.report_id)),
      memberCount: members.count ?? 0,
      routeCount: routes.count ?? 0,
      exportCount: exports.count ?? 0,
      nextRouteDate:
        (nextRoute.data?.[0] as { route_date: string } | undefined)?.route_date ?? null,
      siloeReadyBasins: new Set((siloeRows.data ?? []).map((r) => r.basin_id)).size,
      siloeExportedAt:
        (siloeExport.data?.[0] as { created_at: string } | undefined)?.created_at ?? null,
    },
  };
}

export interface StopRow {
  route_id: string;
  pool_id: string;
  seq: number;
  eta: string | null;
  /** Service log: absent before its migration (= pending). */
  estado?: 'pendiente' | 'hecha' | 'saltada' | null;
  motivo?: string | null;
}

/** Planned routes between two dates (inclusive) and their stops. */
export async function loadRoutesBetween(
  from: string,
  to: string,
): Promise<Loaded<{ routes: { id: string; route_date: string }[]; stops: StopRow[] }>> {
  const routes = await supabase
    .from('route')
    .select('id, route_date')
    .gte('route_date', from)
    .lte('route_date', to);
  const routeFailure = toDbFailure(routes.error);
  if (routeFailure) return { data: null, failure: routeFailure };
  const routeRows = routes.data ?? [];
  if (routeRows.length === 0) return { data: { routes: [], stops: [] }, failure: null };

  const stops = await supabase
    .from('route_stop')
    // select('*'): includes estado/motivo once the service-log migration adds them.
    .select('*')
    .in(
      'route_id',
      routeRows.map((r) => r.id),
    );
  const stopFailure = toDbFailure(stops.error);
  if (stopFailure) return { data: null, failure: stopFailure };
  return {
    data: { routes: routeRows, stops: (stops.data ?? []) as StopRow[] },
    failure: null,
  };
}
