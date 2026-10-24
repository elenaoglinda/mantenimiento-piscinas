import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Card, Spinner } from '../components/ui/feedback.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist.js';
import { RoutesCalendar } from '../components/dashboard/RoutesCalendar.js';
import {
  ACTIVITY_WINDOW_DAYS,
  bucketRoutesByDate,
  buildChecklist,
  lastVisitByPool,
  madridDateString,
  monthGrid,
  stalePools,
  type Checklist,
  type PoolLite,
  type RouteLite,
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

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
    </Card>
  );
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
    setStale(stalePools(activePools, lastVisitByPool(visits), today).slice(0, 5));

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
  }, [profile, isCompany, today]);

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

  const nextRouteLabel = nextRouteDate
    ? new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(`${nextRouteDate}T00:00:00Z`))
    : '—';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {t('dashboard.welcome', { name: profile.user.full_name ?? '' })}
      </h1>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {showChecklist && checklist && (
            <OnboardingChecklist checklist={checklist} onDismiss={() => void dismiss()} />
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t('dashboard.statPools')} value={poolCount} />
            <StatTile label={t('dashboard.statReports')} value={reportsWindow} />
            <StatTile label={t('dashboard.statOutOfRange')} value={attention.length} />
            <StatTile label={t('dashboard.statNextVisit')} value={nextRouteLabel} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RoutesCalendar
              year={viewYear}
              month0={viewMonth}
              today={today}
              routesByDate={routesByDate}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
            />

            <div className="flex flex-col gap-6">
              <Card>
                <h2 className="mb-2 text-lg font-semibold text-text">
                  {t('dashboard.attentionTitle')}
                </h2>
                {stale.length === 0 && attention.length === 0 ? (
                  <p className="text-sm text-text-muted">{t('dashboard.attentionEmpty')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {attention.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={`/reports/${r.id}`}
                          className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-status-red/30 bg-status-red-bg/40 px-3 py-2 hover:bg-status-red-bg"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-text">
                              {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
                            </span>
                            <span className="text-xs text-status-red-text">
                              {t('dashboard.outOfRangeReading')}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                    {stale.map((s) => (
                      <li key={s.pool.id}>
                        <Link
                          to="/pools"
                          className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 hover:bg-surface-muted"
                        >
                          <span className="min-w-0">
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

              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-text">
                    {t('dashboard.recentReports')}
                  </h2>
                  <Link to="/reports" className="text-sm font-medium text-accent hover:underline">
                    {t('dashboard.viewAll')}
                  </Link>
                </div>
                {keyReports.length === 0 ? (
                  <p className="text-sm text-text-muted">{t('reports.empty')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {keyReports.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={`/reports/${r.id}`}
                          className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2 hover:bg-surface-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-text">
                              {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
                            </span>
                            <span className="text-xs text-text-muted">
                              {new Date(r.visited_at).toLocaleDateString('es-ES')}
                            </span>
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
        </>
      )}
    </div>
  );
}
