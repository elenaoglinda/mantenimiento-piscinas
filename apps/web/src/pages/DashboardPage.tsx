import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import {
  CalendarCheck,
  ClipboardList,
  FileUp,
  Route,
  ShieldCheck,
  TriangleAlert,
  Waves,
} from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { ProgressBar } from '../components/ui/ProgressBar.js';
import { SkeletonText } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist.js';
import { RoutesCalendar } from '../components/dashboard/RoutesCalendar.js';
import {
  ACTIVITY_WINDOW_DAYS,
  bucketRoutesByDate,
  buildChecklist,
  lastVisitByPool,
  madridDateString,
  madridTime,
  monthGrid,
  stalePools,
  type Checklist,
  type PoolLite,
  type RouteLite,
  type RouteStopLite,
  type StalePool,
} from '../lib/dashboard.js';
import type { Enums } from '../lib/database.types.js';

interface RecentReport {
  id: string;
  visited_at: string;
  status: Enums<'report_status'>;
  pool: { denominacion: string } | null;
  basin: { denominacion: string } | null;
}

interface PoolInfo extends PoolLite {
  archived: boolean;
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { profile, reloadProfile } = useAuth();
  const isCompany = profile?.org.type === 'company';
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const today = madridDateString();

  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [reportsWindow, setReportsWindow] = useState(0);
  const [nextRouteDate, setNextRouteDate] = useState<string | null>(null);
  const [poolCount, setPoolCount] = useState(0);
  const [keyReports, setKeyReports] = useState<RecentReport[]>([]);
  const [attention, setAttention] = useState<RecentReport[]>([]);
  const [stale, setStale] = useState<StalePool[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [reportsToday, setReportsToday] = useState(0);
  const [todayStops, setTodayStops] = useState<RouteStopLite[] | null>(null);
  // SILOÉ annual results are filed for the previous year, the same default the SILOÉ page uses.
  const siloeYear = Number(today.slice(0, 4)) - 1;
  const [siloe, setSiloe] = useState<{ ready: number; basins: number; exportedAt: string | null }>({
    ready: 0,
    basins: 0,
    exportedAt: null,
  });

  // Pool name/client lookup for the calendar (includes archived, referenced by old stops).
  const [poolMap, setPoolMap] = useState<Map<string, PoolInfo>>(new Map());

  // Calendar month state (0-based month) + the routes fetched for that month.
  const now = new Date();
  const [viewYear, setViewYear] = useState(Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [routesByDate, setRoutesByDate] = useState<Map<string, RouteLite[]>>(new Map());

  const load = useCallback(async () => {
    if (!profile) return;
    const windowCutoff = Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000;

    const [
      { count: clientCount },
      { data: poolData },
      { count: basinCount },
      { data: visitData },
      { data: recentData },
      { data: redData },
      { count: memberCount },
      { count: routeCount },
      { count: exportCount },
      { data: nextRoute },
      { data: siloeRows },
      { data: siloeExport },
    ] = await Promise.all([
      supabase.from('client').select('id', { count: 'exact', head: true }).eq('archived', false),
      supabase
        .from('pool')
        .select(
          'id, denominacion, created_at, archived, client:client_id!pool_client_id_org_id_fkey(name)',
        )
        .order('denominacion'),
      supabase.from('basin').select('id', { count: 'exact', head: true }),
      supabase
        .from('report')
        .select('pool_id, visited_at')
        .order('visited_at', { ascending: false }),
      supabase
        .from('report')
        .select(
          'id, visited_at, status, pool:pool_id!report_pool_id_org_id_fkey(denominacion), basin:basin_id!report_basin_id_org_id_fkey(denominacion)',
        )
        .order('visited_at', { ascending: false })
        .limit(100),
      supabase.from('measurement').select('report_id').eq('status', 'red'),
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

    const pools: PoolInfo[] = (
      (poolData ?? []) as unknown as Array<{
        id: string;
        denominacion: string;
        created_at: string;
        archived: boolean;
        client: { name: string } | null;
      }>
    ).map((p) => ({
      id: p.id,
      denominacion: p.denominacion,
      created_at: p.created_at,
      archived: p.archived,
      clientName: p.client?.name ?? null,
    }));
    setPoolMap(new Map(pools.map((p) => [p.id, p])));

    const activePools = pools.filter((p) => !p.archived);
    setPoolCount(activePools.length);

    const visits = (visitData ?? []) as { pool_id: string; visited_at: string }[];
    setReportsWindow(visits.filter((r) => Date.parse(r.visited_at) >= windowCutoff).length);
    const allStale = stalePools(activePools, lastVisitByPool(visits), today);
    setStale(allStale.slice(0, 5));
    setStaleCount(allStale.length);
    setReportsToday(
      visits.filter((r) => madridDateString(new Date(r.visited_at)) === today).length,
    );
    setSiloe({
      ready: new Set(((siloeRows ?? []) as { basin_id: string }[]).map((r) => r.basin_id)).size,
      basins: basinCount ?? 0,
      exportedAt: (siloeExport?.[0] as { created_at: string } | undefined)?.created_at ?? null,
    });

    const recent = (recentData ?? []) as unknown as RecentReport[];
    setKeyReports(recent.slice(0, 5));
    const redReportIds = new Set(
      ((redData ?? []) as { report_id: string }[]).map((m) => m.report_id),
    );
    setAttention(
      recent
        .filter((r) => redReportIds.has(r.id) && Date.parse(r.visited_at) >= windowCutoff)
        .slice(0, 5),
    );

    setNextRouteDate(nextRoute?.[0]?.route_date ?? null);

    setChecklist(
      buildChecklist({
        isCompany: !!isCompany,
        clientCount: clientCount ?? 0,
        poolCount: activePools.length,
        basinCount: basinCount ?? 0,
        reportCount: visits.length,
        exportCount: exportCount ?? 0,
        routeCount: routeCount ?? 0,
        memberCount: memberCount ?? 0,
      }),
    );
    setLoading(false);
  }, [profile, isCompany, today, siloeYear]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch the viewed month's planned routes and assemble calendar entries from the pool map.
  useEffect(() => {
    if (loading) return;
    let active = true;
    void (async () => {
      // Bound by the visible grid's real first/last dates (covers adjacent-month cells and
      // avoids invalid literals like YYYY-02-31).
      const grid = monthGrid(viewYear, viewMonth, today);
      const gridStart = grid[0].date;
      const gridEnd = grid[grid.length - 1].date;
      const { data: routeData } = await supabase
        .from('route')
        .select('id, route_date')
        .gte('route_date', gridStart)
        .lte('route_date', gridEnd);
      const routes = (routeData ?? []) as { id: string; route_date: string }[];
      if (routes.length === 0) {
        if (active) setRoutesByDate(new Map());
        return;
      }
      const { data: stopData } = await supabase
        .from('route_stop')
        .select('route_id, pool_id, seq, eta')
        .in(
          'route_id',
          routes.map((r) => r.id),
        );
      const stops = (stopData ?? []) as {
        route_id: string;
        pool_id: string;
        seq: number;
        eta: string | null;
      }[];
      const byRoute = new Map<string, typeof stops>();
      for (const s of stops) {
        const list = byRoute.get(s.route_id);
        if (list) list.push(s);
        else byRoute.set(s.route_id, [s]);
      }
      const assembled: RouteLite[] = routes.map((r) => ({
        id: r.id,
        route_date: r.route_date,
        stops: (byRoute.get(r.id) ?? []).map((s) => ({
          seq: s.seq,
          eta: s.eta,
          poolName: poolMap.get(s.pool_id)?.denominacion ?? '—',
          clientName: poolMap.get(s.pool_id)?.clientName ?? null,
        })),
      }));
      if (active) setRoutesByDate(bucketRoutesByDate(assembled));
    })();
    return () => {
      active = false;
    };
  }, [loading, viewYear, viewMonth, poolMap, today]);

  // Today's stops, independent of the month the calendar is showing.
  useEffect(() => {
    if (loading) return;
    let active = true;
    void (async () => {
      const { data: routeData } = await supabase.from('route').select('id').eq('route_date', today);
      const ids = ((routeData ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) {
        if (active) setTodayStops([]);
        return;
      }
      const { data: stopData } = await supabase
        .from('route_stop')
        .select('pool_id, seq, eta')
        .in('route_id', ids);
      const stops = ((stopData ?? []) as { pool_id: string; seq: number; eta: string | null }[])
        .map((st) => ({
          seq: st.seq,
          eta: st.eta,
          poolName: poolMap.get(st.pool_id)?.denominacion ?? '—',
          clientName: poolMap.get(st.pool_id)?.clientName ?? null,
        }))
        .sort((a, b) => a.seq - b.seq);
      if (active) setTodayStops(stops);
    })();
    return () => {
      active = false;
    };
  }, [loading, poolMap, today]);

  function shiftMonth(delta: number) {
    const next = viewMonth + delta;
    if (next < 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else if (next > 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(next);
    }
  }

  async function dismiss() {
    setDismissed(true);
    // Persist for the org (admin-only UPDATE policy). Non-admins just hide it locally.
    if (profile?.user.role === 'admin') {
      await supabase
        .from('org')
        .update({ onboarding_dismissed_at: new Date().toISOString() })
        .eq('id', profile.org.id);
      void reloadProfile();
    }
  }

  const showChecklist = useMemo(
    () =>
      canWrite &&
      !dismissed &&
      !profile?.org.onboarding_dismissed_at &&
      checklist != null &&
      !checklist.allDone,
    [canWrite, dismissed, profile, checklist],
  );

  if (!profile) return null;

  const dateLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, { ...opts, timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const nextRouteLabel = nextRouteDate
    ? dateLabel(nextRouteDate, { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  const todayLabel = dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title={t('dashboard.welcome', { name: profile.user.full_name ?? '' })}
        description={<span className="inline-block first-letter:uppercase">{todayLabel}</span>}
        actions={
          canWrite && (
            <Button asChild variant="secondary">
              <Link to="/reports/import">
                <FileUp aria-hidden size={16} />
                {t('shell.commands.importReport')}
              </Link>
            </Button>
          )
        }
      />

      {showChecklist && checklist && (
        <OnboardingChecklist checklist={checklist} onDismiss={() => void dismiss()} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.statPools')}
          value={poolCount}
          icon={<Waves size={16} />}
          to="/pools"
          loading={loading}
          hint={
            staleCount > 0
              ? t('dashboard.statPoolsStale', { count: staleCount })
              : t('dashboard.statPoolsFresh')
          }
        />
        <StatCard
          label={t('dashboard.statVisitsToday')}
          value={todayStops?.length ?? 0}
          icon={<CalendarCheck size={16} />}
          to="/routes"
          loading={loading || todayStops === null}
          hint={t('dashboard.statReportsToday', { count: reportsToday })}
        />
        <StatCard
          label={t('dashboard.statOutOfRangeReadings')}
          value={attention.length}
          icon={<TriangleAlert size={16} />}
          to="/reports"
          loading={loading}
          tone={attention.length > 0 ? 'alert' : 'default'}
          hint={t('dashboard.outOfRangeOf', { count: reportsWindow, days: ACTIVITY_WINDOW_DAYS })}
        />
        <StatCard
          label={t('dashboard.statSiloe', { year: siloeYear })}
          value={`${siloe.ready} / ${siloe.basins}`}
          icon={<ShieldCheck size={16} />}
          to="/siloe"
          loading={loading}
          hint={
            siloe.exportedAt
              ? t('dashboard.siloeExported', {
                  date: new Date(siloe.exportedAt).toLocaleDateString('es-ES'),
                })
              : t('dashboard.siloeHint')
          }
        >
          <ProgressBar
            value={siloe.ready}
            max={siloe.basins}
            tone={siloe.exportedAt ? 'green' : 'accent'}
            label={t('dashboard.siloeProgress', { year: siloeYear })}
          />
        </StatCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('dashboard.todayRoute')}
            description={
              todayStops && todayStops.length > 0
                ? t('dashboard.stops', { count: todayStops.length })
                : undefined
            }
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/routes">{t('dashboard.openRoutes')}</Link>
              </Button>
            }
          />
          {loading || todayStops === null ? (
            <SkeletonText />
          ) : todayStops.length === 0 ? (
            <EmptyState
              compact
              icon={<Route size={20} />}
              title={t('dashboard.todayRouteEmpty')}
              description={
                nextRouteLabel
                  ? t('dashboard.nextRoute', { date: nextRouteLabel })
                  : t('dashboard.todayRouteEmptyHint')
              }
              action={
                canWrite && (
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/routes">{t('checklist.steps.planRoute.title')}</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ol className="flex flex-col">
              {todayStops.map((stop) => (
                <li
                  key={stop.seq}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-navy-800"
                  >
                    {stop.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{stop.poolName}</p>
                    {stop.clientName && (
                      <p className="truncate text-xs text-text-muted">{stop.clientName}</p>
                    )}
                  </div>
                  {stop.eta && (
                    <time className="shrink-0 text-sm text-text-muted" dateTime={stop.eta}>
                      {madridTime(stop.eta)}
                    </time>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title={t('dashboard.alertsTitle')} />
          {loading ? (
            <SkeletonText />
          ) : stale.length === 0 && attention.length === 0 ? (
            <EmptyState
              compact
              icon={<ShieldCheck size={20} />}
              title={t('dashboard.attentionEmpty')}
              description={t('dashboard.attentionEmptyHint')}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/reports/${r.id}`}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-status-red/30 bg-status-red-bg/50 px-3 py-2 transition-colors hover:bg-status-red-bg"
                  >
                    <TriangleAlert
                      aria-hidden
                      size={16}
                      className="shrink-0 text-status-red-text"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">
                        {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
                      </span>
                      <span className="text-xs text-status-red-text">
                        {t('dashboard.outOfRangeReading')} ·{' '}
                        {new Date(r.visited_at).toLocaleDateString('es-ES')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {stale.map((s) => (
                <li key={s.pool.id}>
                  <Link
                    to={`/pools/${s.pool.id}`}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <CalendarCheck
                      aria-hidden
                      size={16}
                      className="shrink-0 text-status-amber-text"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">
                        {s.pool.denominacion}
                      </span>
                      <span className="text-xs text-text-muted">
                        {s.neverVisited
                          ? t('dashboard.neverVisited')
                          : t('dashboard.overdueBy', { days: s.daysSince })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RoutesCalendar
          year={viewYear}
          month0={viewMonth}
          today={today}
          routesByDate={routesByDate}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />

        <Card>
          <CardHeader
            title={t('dashboard.recentReports')}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/reports">{t('dashboard.viewAll')}</Link>
              </Button>
            }
          />
          {loading ? (
            <SkeletonText lines={5} />
          ) : keyReports.length === 0 ? (
            <EmptyState
              compact
              icon={<ClipboardList size={20} />}
              title={t('reports.empty')}
              action={
                canWrite && (
                  <Button asChild size="sm">
                    <Link to="/reports/new">{t('shell.newReport')}</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul className="flex flex-col">
              {keyReports.map((r) => (
                <li key={r.id} className="border-b border-border last:border-0">
                  <Link
                    to={`/reports/${r.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">
                        {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
                      </span>
                      <time className="text-xs text-text-muted" dateTime={r.visited_at}>
                        {new Date(r.visited_at).toLocaleDateString('es-ES')}
                      </time>
                    </span>
                    <ReportStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
