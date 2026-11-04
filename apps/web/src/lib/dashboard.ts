/**
 * Pure helpers for the dashboard home (Feature 2). Kept framework-free and unit-tested.
 *
 * Calendar model (Option A): "upcoming maintenance" is derived from planned `route` rows.
 * Entries are bucketed by `route.route_date` (a pure DATE — no timezone), and `route_stop.eta`
 * (a timestamptz) is only ever used for the arrival-time label. "Today" and any day math are
 * computed in Europe/Madrid so the day boundary matches the operators' local calendar.
 */

export const APP_TIME_ZONE = 'Europe/Madrid';
/** A pool with no report in this many days is flagged as overdue for a visit. */
export const STALE_THRESHOLD_DAYS = 30;
/** Activity window for the "reports / out-of-range readings" summary tiles. */
export const ACTIVITY_WINDOW_DAYS = 30;

const YMD = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;

/** Current (or given) instant as a 'YYYY-MM-DD' calendar date in Europe/Madrid. */
export function madridDateString(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, ...YMD }).format(d);
}

/** Format an ISO timestamp to 'HH:mm' in Europe/Madrid (for route-stop ETAs). */
export function madridTime(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Whole days from date-string `a` to `b` (b − a). Both are 'YYYY-MM-DD'. */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

export interface RouteStopLite {
  seq: number;
  eta: string | null;
  poolName: string;
  clientName?: string | null;
  /** Service log: whether the stop was done (absent before its migration = pending). */
  estado?: 'pendiente' | 'hecha' | 'saltada' | null;
  motivo?: string | null;
}
export interface RouteLite {
  id: string;
  route_date: string; // 'YYYY-MM-DD'
  stops: RouteStopLite[];
}

/** Group planned routes by their `route_date`. The date column is the bucket key as-is. */
export function bucketRoutesByDate(routes: RouteLite[]): Map<string, RouteLite[]> {
  const map = new Map<string, RouteLite[]>();
  for (const r of routes) {
    const list = map.get(r.route_date);
    if (list) list.push(r);
    else map.set(r.route_date, [r]);
  }
  return map;
}

export interface CalendarDay {
  date: string; // 'YYYY-MM-DD'
  inMonth: boolean;
  isToday: boolean;
}

/**
 * A 6-row (42-cell) Monday-first month grid, including the leading/trailing days of the
 * adjacent months so the grid is always rectangular. `today` is a Madrid date string.
 */
export function monthGrid(year: number, month0: number, today: string): CalendarDay[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
  const start = new Date(first);
  start.setUTCDate(1 - mondayOffset);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, inMonth: d.getUTCMonth() === month0, isToday: date === today });
  }
  return days;
}

export interface PoolLite {
  id: string;
  denominacion: string;
  created_at: string;
  clientName?: string | null;
}

export interface StalePool {
  pool: PoolLite;
  lastVisit: string | null; // Madrid date of the most recent report, or null if never
  daysSince: number;
  neverVisited: boolean;
}

/**
 * Pools overdue for a visit: no report (or a report older than the threshold). Recency is
 * measured against the pool's last report; never-visited pools count from their creation
 * date so brand-new pools don't flag immediately. Most-overdue first.
 */
export function stalePools(
  pools: PoolLite[],
  lastVisitByPool: Map<string, string>,
  today: string,
  thresholdDays: number = STALE_THRESHOLD_DAYS,
): StalePool[] {
  return pools
    .map((pool): StalePool => {
      const lastIso = lastVisitByPool.get(pool.id) ?? null;
      const lastVisit = lastIso ? madridDateString(new Date(lastIso)) : null;
      const anchor = lastVisit ?? madridDateString(new Date(pool.created_at));
      return {
        pool,
        lastVisit,
        daysSince: daysBetween(anchor, today),
        neverVisited: lastVisit === null,
      };
    })
    .filter((s) => s.daysSince > thresholdDays)
    .sort((a, b) => b.daysSince - a.daysSince);
}

/** Reduce reports (any order) to the most recent visit ISO timestamp per pool. */
export function lastVisitByPool(
  reports: { pool_id: string; visited_at: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of reports) {
    const prev = map.get(r.pool_id);
    if (!prev || r.visited_at > prev) map.set(r.pool_id, r.visited_at);
  }
  return map;
}

export interface ChecklistInput {
  isCompany: boolean;
  clientCount: number;
  poolCount: number;
  basinCount: number;
  reportCount: number;
  exportCount: number;
  routeCount: number;
  memberCount: number;
}

export interface ChecklistStep {
  key: string; // i18n suffix under `checklist.steps`
  done: boolean;
  to: string; // route the action button links to
}

export interface Checklist {
  primary: ChecklistStep[];
  secondary: ChecklistStep[];
  doneCount: number;
  total: number;
  allDone: boolean;
}

/** Build the onboarding checklist steps + progress from current org data. */
export function buildChecklist(input: ChecklistInput): Checklist {
  const primary: ChecklistStep[] = [
    // Owners get an implicit self-client, so their first step is the pool.
    ...(input.isCompany ? [{ key: 'addClient', done: input.clientCount > 0, to: '/clients' }] : []),
    { key: 'addPool', done: input.poolCount > 0, to: '/pools' },
    { key: 'addBasin', done: input.basinCount > 0, to: '/pools' },
    { key: 'createReport', done: input.reportCount > 0, to: '/reports/new' },
    { key: 'exportSiloe', done: input.exportCount > 0, to: '/siloe' },
  ];
  const secondary: ChecklistStep[] = [
    { key: 'inviteTeam', done: input.memberCount > 1, to: '/team' },
    { key: 'planRoute', done: input.routeCount > 0, to: '/routes' },
  ];
  const doneCount = primary.filter((s) => s.done).length;
  return {
    primary,
    secondary,
    doneCount,
    total: primary.length,
    allDone: doneCount === primary.length,
  };
}
