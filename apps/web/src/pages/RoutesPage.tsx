import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { supabase } from '../lib/supabase.js';
import { googleMapsLink, optimizeRoute, routeMapUrl, type LatLng } from '../lib/routing.js';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LocateFixed,
  MapPin,
  Route as RouteIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Input } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Select } from '../components/ui/Select.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs.js';
import { TextField } from '../components/ui/TextField.js';
import { cn, focusRing, fold } from '../components/ui/utils.js';
import { madridDateString, madridTime } from '../lib/dashboard.js';
import type { Tables } from '../lib/database.types.js';

interface PoolPoint {
  id: string;
  denominacion: string;
  lat: number;
  lng: number;
}
interface Stop {
  pool: PoolPoint;
  eta: Date;
  legS: number;
}
interface Plan {
  stops: Stop[];
  orderedPoints: LatLng[];
  distance: number;
  duration: number;
}

interface AgendaStop {
  seq: number;
  eta: string | null;
  poolId: string;
}
interface AgendaRoute {
  id: string;
  date: string;
  technicianId: string | null;
  distance: number | null;
  duration: number | null;
  stops: AgendaStop[];
}
interface PoolInfo {
  denominacion: string;
  lat: number | null;
  lng: number | null;
}

/** 'YYYY-MM-DD' ± days, in calendar terms (no timezone drift). */
function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** Monday of the week containing `d`. */
function weekStart(d: string): string {
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}
const dayFmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDuration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function RoutesPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [pools, setPools] = useState<PoolPoint[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [start, setStart] = useState<LatLng | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [history, setHistory] = useState<Tables<'route'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Agenda (read-only): which routes are planned for the chosen day or week.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'plan' ? 'plan' : 'agenda';
  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(madridDateString());
  const [technician, setTechnician] = useState('all');
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [poolInfo, setPoolInfo] = useState<Map<string, PoolInfo>>(new Map());
  const [agenda, setAgenda] = useState<AgendaRoute[] | null>(null);
  const [poolQuery, setPoolQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: poolData }, { data: routeData }, { data: userData }] = await Promise.all([
      supabase
        .from('pool')
        .select('id, denominacion, lat, lng')
        .eq('archived', false)
        .order('denominacion'),
      supabase.from('route').select('*').order('route_date', { ascending: false }).limit(10),
      supabase.from('app_user').select('id, full_name, email'),
    ]);
    setPools((poolData ?? []).filter((p): p is PoolPoint => p.lat != null && p.lng != null));
    setPoolInfo(
      new Map(
        (poolData ?? []).map((p) => [
          p.id,
          { denominacion: p.denominacion, lat: p.lat, lng: p.lng },
        ]),
      ),
    );
    setTechnicians(
      ((userData ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
        (u) => ({ id: u.id, name: u.full_name ?? u.email ?? '—' }),
      ),
    );
    setHistory(routeData ?? []);
    setLoading(false);
  }, []);

  const range = useMemo(() => {
    const from = view === 'day' ? anchor : weekStart(anchor);
    return { from, to: view === 'day' ? anchor : addDays(from, 6) };
  }, [view, anchor]);

  useEffect(() => {
    let active = true;
    setAgenda(null);
    void (async () => {
      const { data: routeData } = await supabase
        .from('route')
        .select('id, route_date, technician_id, distance_m, duration_s')
        .gte('route_date', range.from)
        .lte('route_date', range.to)
        .order('route_date');
      const routes = (routeData ?? []) as Pick<
        Tables<'route'>,
        'id' | 'route_date' | 'technician_id' | 'distance_m' | 'duration_s'
      >[];
      let stops: { route_id: string; pool_id: string; seq: number; eta: string | null }[] = [];
      if (routes.length > 0) {
        const { data: stopData } = await supabase
          .from('route_stop')
          .select('route_id, pool_id, seq, eta')
          .in(
            'route_id',
            routes.map((r) => r.id),
          );
        stops = (stopData ?? []) as typeof stops;
      }
      if (!active) return;
      setAgenda(
        routes.map((r) => ({
          id: r.id,
          date: r.route_date,
          technicianId: r.technician_id,
          distance: r.distance_m,
          duration: r.duration_s,
          stops: stops
            .filter((st) => st.route_id === r.id)
            .sort((a, b) => a.seq - b.seq)
            .map((st) => ({ seq: st.seq, eta: st.eta, poolId: st.pool_id })),
        })),
      );
    })();
    return () => {
      active = false;
    };
    // `history` changes after a plan is saved, so the agenda picks the new route up too.
  }, [range, history]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function captureStart() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t('routes.locationError'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError(t('routes.locationError')),
    );
  }

  async function optimize() {
    const chosen = pools.filter((p) => selected.has(p.id));
    if (chosen.length < 2) {
      setError(t('routes.needTwoPools'));
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    setPlan(null);

    const hasStart = !!start;
    const points: LatLng[] = hasStart ? [start, ...chosen] : chosen;
    const outcome = await optimizeRoute(points);
    setBusy(false);
    if (!outcome.ok) {
      setError(
        outcome.reason === 'unavailable' ? t('routes.unavailable') : t('common.genericError'),
      );
      return;
    }

    const { order, legs, distance, duration } = outcome.result;
    const startEpoch = new Date(`${date}T${startTime}`).getTime();
    let cum = 0;
    const stops: Stop[] = [];
    const orderedPoints: LatLng[] = [];
    order.forEach((inputIdx, p) => {
      if (p > 0) cum += legs[p - 1] ?? 0;
      const point = points[inputIdx];
      orderedPoints.push(point);
      const isStart = hasStart && inputIdx === 0;
      if (!isStart) {
        const pool = chosen[hasStart ? inputIdx - 1 : inputIdx];
        stops.push({
          pool,
          eta: new Date(startEpoch + cum * 1000),
          legS: p > 0 ? (legs[p - 1] ?? 0) : 0,
        });
      }
    });
    setPlan({ stops, orderedPoints, distance, duration });
  }

  async function savePlan() {
    if (!profile || !plan) return;
    setBusy(true);
    const { data: route } = await supabase
      .from('route')
      .insert({
        org_id: profile.org.id,
        technician_id: profile.user.id,
        route_date: date,
        start_lat: start?.lat ?? null,
        start_lng: start?.lng ?? null,
        distance_m: Math.round(plan.distance),
        duration_s: Math.round(plan.duration),
      })
      .select('id')
      .single();
    if (route) {
      await supabase.from('route_stop').insert(
        plan.stops.map((s, i) => ({
          org_id: profile.org.id,
          route_id: route.id,
          pool_id: s.pool.id,
          seq: i + 1,
          eta: s.eta.toISOString(),
          leg_s: s.legS,
        })),
      );
    }
    setBusy(false);
    setInfo(t('routes.saved'));
    void load();
  }

  const visibleRoutes = (agenda ?? []).filter(
    (r) => technician === 'all' || r.technicianId === technician,
  );
  const techName = (id: string | null) => technicians.find((u) => u.id === id)?.name ?? null;
  const shiftRange = (dir: -1 | 1) => setAnchor((a) => addDays(a, dir * (view === 'day' ? 1 : 7)));
  const rangeLabel =
    view === 'day'
      ? dayFmt(range.from, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${dayFmt(range.from, { day: 'numeric', month: 'short' })} – ${dayFmt(range.to, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`;
  // One day, one route with located pools: that's what the static map can draw.
  const mapPoints =
    view === 'day' && visibleRoutes.length === 1
      ? visibleRoutes[0].stops
          .map((st) => poolInfo.get(st.poolId))
          .filter((p): p is PoolInfo & LatLng => p?.lat != null && p?.lng != null)
          .map((p) => ({ lat: p.lat, lng: p.lng }))
      : [];
  const shownPools = pools.filter((p) => fold(p.denominacion).includes(fold(poolQuery.trim())));

  if (loading) return <RoutesSkeleton />;

  return (
    <div>
      <PageHeader title={t('routes.title')} description={t('routes.subtitle')} />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {info && (
        <Alert tone="success" className="mb-4">
          {info}
        </Alert>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'plan' ? { tab: 'plan' } : {}, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="agenda">{t('routes.tabs.agenda')}</TabsTrigger>
          <TabsTrigger value="plan">{t('routes.tabs.plan')}</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div
              role="group"
              aria-label={t('routes.viewLabel')}
              className="inline-flex self-start rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
            >
              {(['day', 'week'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                    focusRing,
                    view === v ? 'bg-accent-soft text-navy-800' : 'text-text-muted hover:text-text',
                  )}
                >
                  {t(`routes.${v}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('routes.previous')}
                onClick={() => shiftRange(-1)}
              >
                <ChevronLeft aria-hidden size={16} />
              </Button>
              <span
                aria-live="polite"
                className="inline-block min-w-48 text-center text-sm font-medium text-text first-letter:uppercase"
              >
                {rangeLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('routes.next')}
                onClick={() => shiftRange(1)}
              >
                <ChevronRight aria-hidden size={16} />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAnchor(madridDateString())}>
                {t('routes.today')}
              </Button>
            </div>
            <div className="lg:ml-auto lg:w-60">
              <Select
                label={t('routes.technician')}
                value={technician}
                onValueChange={setTechnician}
                options={[
                  { value: 'all', label: t('routes.allTechnicians') },
                  ...technicians.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              {agenda === null ? (
                <Card>
                  <SkeletonText lines={5} />
                </Card>
              ) : visibleRoutes.length === 0 ? (
                <Card padded={false}>
                  <EmptyState
                    icon={<RouteIcon size={22} />}
                    title={t('routes.agendaEmpty')}
                    description={t('routes.agendaEmptyHint')}
                    action={
                      canWrite && (
                        <Button
                          onClick={() => {
                            if (view === 'day') setDate(anchor);
                            setParams({ tab: 'plan' }, { replace: true });
                          }}
                        >
                          {t('checklist.steps.planRoute.title')}
                        </Button>
                      )
                    }
                  />
                </Card>
              ) : (
                visibleRoutes.map((r) => (
                  <Card key={r.id}>
                    <CardHeader
                      title={
                        <span className="inline-block first-letter:uppercase">
                          {dayFmt(r.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                      }
                      description={[
                        techName(r.technicianId),
                        t('dashboard.stops', { count: r.stops.length }),
                        r.distance != null ? fmtDistance(r.distance) : null,
                        r.duration != null ? fmtDuration(r.duration) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                    <ol className="flex flex-col">
                      {r.stops.map((st) => (
                        <li
                          key={st.seq}
                          className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
                        >
                          <span
                            aria-hidden
                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-navy-800"
                          >
                            {st.seq}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                            {poolInfo.get(st.poolId)?.denominacion ?? '—'}
                          </span>
                          {st.eta && (
                            <time
                              className="text-sm text-text-muted tabular-nums"
                              dateTime={st.eta}
                            >
                              {madridTime(st.eta)}
                            </time>
                          )}
                          {canWrite && (
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/reports/new?poolId=${st.poolId}`}>
                                {t('routes.startVisit')}
                              </Link>
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </Card>
                ))
              )}
            </div>

            <RouteMap points={mapPoints} />
          </div>

          <Card>
            <CardHeader title={t('routes.history')} />
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">{t('routes.historyEmpty')}</p>
            ) : (
              <ul className="flex flex-col text-sm">
                {history.map((r) => (
                  <li
                    key={r.id}
                    className="flex justify-between gap-3 border-b border-border py-2 last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setView('day');
                        setAnchor(r.route_date);
                      }}
                      className={cn('text-left text-accent hover:underline', focusRing)}
                    >
                      {new Date(r.route_date).toLocaleDateString('es-ES')}
                    </button>
                    <span className="text-text-muted tabular-nums">
                      {r.distance_m != null ? fmtDistance(r.distance_m) : ''}{' '}
                      {r.duration_s != null ? `· ${fmtDuration(r.duration_s)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="plan">
          {pools.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<MapPin size={22} />}
                title={t('routes.noCoordsTitle')}
                description={t('routes.noPoolsWithCoords')}
                action={
                  <Button asChild variant="secondary">
                    <Link to="/pools">{t('nav.pools')}</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <Card className="flex flex-col gap-4 self-start">
                <CardHeader
                  className="mb-0"
                  title={t('routes.selectPools')}
                  description={t('routes.selectedCount', { count: selected.size })}
                />
                <div className="relative">
                  <Search
                    aria-hidden
                    size={16}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
                  />
                  <Input
                    type="search"
                    value={poolQuery}
                    onChange={(e) => setPoolQuery(e.target.value)}
                    placeholder={t('routes.searchPools')}
                    aria-label={t('routes.searchPools')}
                    className="pl-9"
                  />
                </div>
                <div className="flex max-h-72 flex-col overflow-y-auto rounded-[var(--radius-md)] border border-border">
                  {shownPools.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-sm text-text last:border-0 hover:bg-surface-muted/60"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      {p.denominacion}
                    </label>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <TextField
                    label={t('routes.date')}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <TextField
                    label={t('routes.startTime')}
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" type="button" onClick={captureStart}>
                    <LocateFixed aria-hidden size={16} />
                    {t('routes.useMyLocation')}
                  </Button>
                  {start && (
                    <span role="status" className="text-sm text-text-muted">
                      {t('routes.locationSet')}
                    </span>
                  )}
                </div>
                {canWrite && (
                  <Button onClick={optimize} loading={busy} disabled={selected.size < 2}>
                    {!busy && <Sparkles aria-hidden size={16} />}
                    {t('routes.optimize')}
                  </Button>
                )}
              </Card>

              {plan ? (
                <Card className="min-w-0">
                  <CardHeader
                    title={t('routes.stopsTitle')}
                    description={`${t('routes.totalDistance')}: ${fmtDistance(plan.distance)} · ${t(
                      'routes.totalDuration',
                    )}: ${fmtDuration(plan.duration)}`}
                  />

                  <RouteMap points={plan.orderedPoints} bare />

                  <ol className="mt-4 flex flex-col">
                    {plan.stops.map((s, i) => (
                      <li
                        key={s.pool.id}
                        className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-contrast">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text">{s.pool.denominacion}</p>
                            <p className="text-xs text-text-muted">
                              {t('routes.eta')}:{' '}
                              {s.eta.toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {s.legS > 0 && ` · ${fmtDuration(s.legS)} ${t('routes.drive')}`}
                            </p>
                          </div>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/reports/new?poolId=${s.pool.id}`}>
                            {t('routes.startVisit')}
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button asChild variant="secondary">
                      <a href={googleMapsLink(plan.orderedPoints)} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden size={16} />
                        {t('routes.openInMaps')}
                      </a>
                    </Button>
                    {canWrite && (
                      <Button onClick={savePlan} loading={busy}>
                        {t('routes.save')}
                      </Button>
                    )}
                  </div>
                </Card>
              ) : (
                <Card padded={false} className="self-start">
                  <EmptyState
                    icon={<RouteIcon size={22} />}
                    title={t('routes.planEmptyTitle')}
                    description={t('routes.planEmptyHint')}
                  />
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Static route map from the existing /api/route-map proxy, or a placeholder when there's
 * nothing to draw or the map service isn't configured.
 */
function RouteMap({ points, bare = false }: { points: LatLng[]; bare?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const key = points.map((p) => `${p.lat},${p.lng}`).join(';');
  useEffect(() => setFailed(false), [key]);

  const canDraw = points.length >= 2 && !failed;
  const body = canDraw ? (
    <img
      src={routeMapUrl(points)}
      alt={t('routes.mapTitle')}
      onError={() => setFailed(true)}
      className="w-full rounded-[var(--radius-md)] border border-border bg-surface-muted"
    />
  ) : (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border bg-[linear-gradient(135deg,var(--brand-50),var(--surface-muted))] p-6 text-center">
      <span
        aria-hidden
        className="inline-flex size-12 items-center justify-center rounded-full bg-surface text-accent shadow-card"
      >
        <MapPin size={22} />
      </span>
      <p className="text-sm font-medium text-text">{t('routes.mapTitle')}</p>
      <p className="max-w-xs text-xs text-text-muted">
        {failed ? t('routes.mapUnavailable') : t('routes.mapPlaceholder')}
      </p>
    </div>
  );
  if (bare) return body;
  return (
    <Card className="self-start">
      <CardHeader title={t('routes.mapTitle')} />
      {body}
    </Card>
  );
}

function RoutesSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <Skeleton className="mb-6 h-10 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SkeletonText lines={5} />
        </Card>
        <Skeleton className="aspect-[4/3] w-full" />
      </div>
    </div>
  );
}
