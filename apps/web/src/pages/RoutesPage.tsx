import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { supabase } from '../lib/supabase.js';
import { googleMapsLink, optimizeRoute, routeMapUrl, type LatLng } from '../lib/routing.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
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

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: poolData }, { data: routeData }] = await Promise.all([
      supabase
        .from('pool')
        .select('id, denominacion, lat, lng')
        .eq('archived', false)
        .order('denominacion'),
      supabase.from('route').select('*').order('route_date', { ascending: false }).limit(10),
    ]);
    setPools((poolData ?? []).filter((p): p is PoolPoint => p.lat != null && p.lng != null));
    setHistory(routeData ?? []);
    setLoading(false);
  }, []);

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

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('routes.title')}</h1>
        <p className="text-sm text-text-muted">{t('routes.subtitle')}</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      {pools.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('routes.noPoolsWithCoords')}</p>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-text-muted">{t('routes.selectPools')}</h2>
          <div className="flex flex-col gap-2">
            {pools.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.denominacion}
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" type="button" onClick={captureStart}>
              {t('routes.useMyLocation')}
            </Button>
            {start && <span className="text-sm text-text-muted">{t('routes.locationSet')}</span>}
            {canWrite && (
              <Button onClick={optimize} loading={busy} disabled={selected.size < 2}>
                {t('routes.optimize')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {plan && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-text">{t('routes.stopsTitle')}</h2>
            <div className="flex gap-3 text-sm text-text-muted">
              <span>
                {t('routes.totalDistance')}: {fmtDistance(plan.distance)}
              </span>
              <span>
                {t('routes.totalDuration')}: {fmtDuration(plan.duration)}
              </span>
            </div>
          </div>

          <img
            src={routeMapUrl(plan.orderedPoints)}
            alt={t('routes.title')}
            className="mb-4 w-full rounded-[var(--radius-md)] border border-border"
          />

          <ol className="flex flex-col gap-2">
            {plan.stops.map((s, i) => (
              <li
                key={s.pool.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-contrast">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-text">{s.pool.denominacion}</p>
                    <p className="text-sm text-text-muted">
                      {t('routes.eta')}:{' '}
                      {s.eta.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {s.legS > 0 && ` · ${fmtDuration(s.legS)} ${t('routes.drive')}`}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/reports/new?poolId=${s.pool.id}`}
                  className="shrink-0 text-sm font-medium text-accent hover:underline"
                >
                  {t('routes.startVisit')}
                </Link>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <a href={googleMapsLink(plan.orderedPoints)} target="_blank" rel="noreferrer">
              <Button variant="secondary">{t('routes.openInMaps')}</Button>
            </a>
            {canWrite && (
              <Button onClick={savePlan} loading={busy}>
                {t('routes.save')}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-text">{t('routes.history')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">{t('routes.historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span className="text-text">
                  {new Date(r.route_date).toLocaleDateString('es-ES')}
                </span>
                <span className="text-text-muted">
                  {r.distance_m != null ? fmtDistance(r.distance_m) : ''}{' '}
                  {r.duration_s != null ? `· ${fmtDuration(r.duration_s)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
