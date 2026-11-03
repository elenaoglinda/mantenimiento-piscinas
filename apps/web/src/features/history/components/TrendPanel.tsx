import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import {
  buildTrend,
  TREND_PARAM_IDS,
  TREND_WINDOWS,
  trendDomain,
  type TrendWindow,
} from '@piscinas/shared';
import { Card } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Field, NativeSelect } from '../../../components/ui/Input.js';
import { HScroll } from '../../../components/ui/HScroll.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchTrendReadings, type TrendReading } from '../lib/data.js';
import { formatDate, formatTime, formatValue } from '../lib/format.js';
import { useParamCatalog } from '../lib/useParamCatalog.js';
import type { ChartSeries } from './TrendChart.js';
import { FailureAlert } from './FailureAlert.js';

// The SVG chart is its own chunk: nobody downloads it until this panel is on screen.
const TrendChart = lazy(() => import('./TrendChart.js'));

/** Fixed series order (styles/tokens.css → Charts). At most three lines at once. */
const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
const MAX_SERIES = SERIES_COLORS.length;

interface BasinRef {
  id: string;
  denominacion: string;
}

/**
 * "Evolución": one parameter over 30 / 90 / 365 days, a line per vaso, the legal range from
 * parameter_def shaded, out-of-range points marked — and the same numbers as a table.
 */
export function TrendPanel({
  poolId,
  ccaa,
  basins,
}: {
  poolId: string;
  ccaa: string | null;
  basins: BasinRef[];
}) {
  const { t } = useTranslation();
  const { catalog, failure: catalogFailure } = useParamCatalog();
  const [paramId, setParamId] = useState<number>(TREND_PARAM_IDS[0]);
  const [days, setDays] = useState<TrendWindow>(90);
  // Colours follow the vaso, never its rank: a vaso keeps its colour whatever is shown.
  const colorOf = useMemo(
    () => new Map(basins.map((b, i) => [b.id, SERIES_COLORS[i % MAX_SERIES]])),
    [basins],
  );
  // More than three vasos: show one group of up to three at a time.
  const groups = useMemo(() => {
    const out: BasinRef[][] = [];
    for (let i = 0; i < basins.length; i += MAX_SERIES) out.push(basins.slice(i, i + MAX_SERIES));
    return out;
  }, [basins]);
  const [group, setGroup] = useState(0);
  const shown = useMemo(() => groups[group] ?? [], [groups, group]);

  const [cache, setCache] = useState<Map<number, TrendReading[]>>(new Map());
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const readings = cache.get(days) ?? null;

  useEffect(() => {
    if (!catalog || cache.has(days)) return;
    let active = true;
    void fetchTrendReadings(poolId, days, catalog).then((r) => {
      if (!active) return;
      setFailure(r.failure);
      if (!r.failure) setCache((c) => new Map(c).set(days, r.data));
    });
    return () => {
      active = false;
    };
  }, [poolId, days, catalog, cache]);

  const defRow = catalog?.forRegion(ccaa).get(paramId);
  const def = catalog?.evaluatorDefs(ccaa).get(paramId);
  const now = useMemo(() => new Date(), [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const series: ChartSeries[] = useMemo(() => {
    if (!readings) return [];
    const trend = buildTrend(
      readings.filter((r) => r.siloeParamId === paramId),
      def,
      days,
      now,
    );
    return shown
      .map((b) => ({
        id: b.id,
        label: b.denominacion,
        color: colorOf.get(b.id)!,
        points: trend.find((s) => s.basinId === b.id)?.points ?? [],
      }))
      .filter((s) => s.points.length > 0);
  }, [readings, paramId, def, days, now, shown, colorOf]);

  const outOfRange = series.reduce((n, s) => n + s.points.filter((p) => p.outOfRange).length, 0);
  const paramName = defRow?.name_es ?? `#${paramId}`;
  const unit = defRow?.unit && defRow.unit !== 'pH' ? defRow.unit : null;
  const range = rangeText(defRow?.min_ok ?? null, defRow?.max_ok ?? null, unit);

  if (catalogFailure || failure) return <FailureAlert failure={catalogFailure ?? failure} />;

  const options = catalog
    ? TREND_PARAM_IDS.filter((id) => catalog.forRegion(ccaa).has(id))
    : TREND_PARAM_IDS;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <Field label={t('history.trend.parameter')} className="w-full sm:w-60">
            <NativeSelect value={paramId} onChange={(e) => setParamId(Number(e.target.value))}>
              {options.map((id) => (
                <option key={id} value={id}>
                  {catalog?.forRegion(ccaa).get(id)?.name_es ?? `#${id}`}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {groups.length > 1 && (
            <Field label={t('reports.basin')} className="w-full sm:w-60">
              <NativeSelect value={group} onChange={(e) => setGroup(Number(e.target.value))}>
                {groups.map((g, i) => (
                  <option key={g[0].id} value={i}>
                    {g.map((b) => b.denominacion).join(', ')}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <div
          role="group"
          aria-label={t('history.trend.window')}
          className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
        >
          {TREND_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={days === w}
              onClick={() => setDays(w)}
              className={cn(
                'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                focusRing,
                days === w ? 'bg-accent-soft text-navy-800' : 'text-text-muted hover:text-text',
              )}
            >
              {t('history.trend.days', { count: w })}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-text">
          {paramName}
          {unit && <span className="font-normal text-text-muted"> ({unit})</span>}
        </h3>
        {range && (
          <p className="text-sm text-text-muted">{t('history.trend.legalRange', { range })}</p>
        )}
      </div>

      {!readings ? (
        <Skeleton className="h-60 w-full" />
      ) : series.length === 0 ? (
        <EmptyState
          compact
          icon={<LineChart size={20} />}
          title={t('history.trend.emptyTitle')}
          description={t('history.trend.emptyHint', { count: days })}
        />
      ) : (
        <>
          <Legend series={series} hasBand={!!range} outOfRange={outOfRange} />
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <TrendChart
              series={series}
              band={range ? { min: defRow?.min_ok ?? null, max: defRow?.max_ok ?? null } : null}
              domain={trendDomain(
                series.map((s) => ({ basinId: s.id, points: s.points })),
                def,
              )}
              from={now.getTime() - days * 86_400_000}
              to={now.getTime()}
              unit={unit}
              summary={t('history.trend.summary', {
                param: paramName,
                count: days,
                basins: series.map((s) => s.label).join(', '),
                out: outOfRange,
              })}
            />
          </Suspense>
          <details className="mt-4 group">
            <summary
              className={cn(
                'cursor-pointer text-sm font-medium text-accent underline-offset-4 hover:underline',
                focusRing,
              )}
            >
              {t('history.trend.showTable')}
            </summary>
            <TrendTable series={series} unit={unit} paramName={paramName} />
          </details>
        </>
      )}
    </Card>
  );
}

function rangeText(min: number | null, max: number | null, unit: string | null) {
  const u = unit ? ` ${unit}` : '';
  if (min != null && max != null) return `${formatValue(min)}–${formatValue(max)}${u}`;
  if (max != null) return `≤ ${formatValue(max)}${u}`;
  if (min != null) return `≥ ${formatValue(min)}${u}`;
  return null;
}

function Legend({
  series,
  hasBand,
  outOfRange,
}: {
  series: ChartSeries[];
  hasBand: boolean;
  outOfRange: number;
}) {
  const { t } = useTranslation();
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
      {hasBand && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-[var(--chart-band)]" />
          {t('history.trend.band')}
        </li>
      )}
      {outOfRange > 0 && (
        <li className="flex items-center gap-1.5">
          <svg aria-hidden width="12" height="11" viewBox="0 0 12 11">
            <path d="M6,0.5l5.5,9.5h-11z" fill="var(--status-red)" />
          </svg>
          {t('history.trend.outOfRange', { count: outOfRange })}
        </li>
      )}
    </ul>
  );
}

/** The chart's data as a table: one row per visit date, one column per vaso. */
function TrendTable({
  series,
  unit,
  paramName,
}: {
  series: ChartSeries[];
  unit: string | null;
  paramName: string;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const byTime = new Map<number, Map<string, ChartSeries['points'][number]>>();
    for (const s of series)
      for (const p of s.points) {
        let row = byTime.get(p.t);
        if (!row) byTime.set(p.t, (row = new Map()));
        row.set(s.id, p);
      }
    return [...byTime.entries()].sort((a, b) => b[0] - a[0]);
  }, [series]);

  return (
    <HScroll label={t('history.trend.tableCaption', { param: paramName })} className="mt-3">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {t('history.trend.tableCaption', { param: paramName })}
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('history.trend.date')}
            </th>
            {series.map((s) => (
              <th key={s.id} scope="col" className="py-2 pr-4 text-right font-medium">
                {s.label}
                {unit ? ` (${unit})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([tm, bySeries]) => {
            const iso = new Date(tm).toISOString();
            return (
              <tr key={tm} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="py-1.5 pr-4 text-left font-normal text-text tabular-nums"
                >
                  {formatDate(iso)} · {formatTime(iso)}
                </th>
                {series.map((s) => {
                  const p = bySeries.get(s.id);
                  return (
                    <td key={s.id} className="py-1.5 pr-4 text-right tabular-nums">
                      {p ? (
                        <span className={p.outOfRange ? 'font-semibold text-status-red-text' : ''}>
                          {formatValue(p.value)}
                          {p.outOfRange && (
                            <span className="ml-1 text-xs font-medium">{t('status.red')}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </HScroll>
  );
}
