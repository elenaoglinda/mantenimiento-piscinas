import { useEffect, useMemo, useRef, useState } from 'react';
import { niceTicks, type TrendPoint } from '@piscinas/shared';
import { formatDate, formatValue } from '../lib/format.js';

/**
 * Hand-drawn SVG line chart for one parameter: one line per vaso, the legal range shaded,
 * out-of-range points marked with a red triangle (shape AND colour). Loaded on demand
 * (React.lazy in TrendPanel), so none of this is in the main bundle.
 *
 * The SVG is decorative for assistive tech (role="img" + a summary label); the same data is
 * in the table next to it. Hovering shows a crosshair and the values at that date.
 */
export interface ChartSeries {
  id: string;
  label: string;
  /** A design token, e.g. var(--chart-1). */
  color: string;
  points: TrendPoint[];
}

const M = { top: 12, right: 12, bottom: 26, left: 40 };

export default function TrendChart({
  series,
  band,
  domain,
  from,
  to,
  unit,
  summary,
  redLabel,
}: {
  series: ChartSeries[];
  band: { min: number | null; max: number | null } | null;
  domain: [number, number];
  /** Time window, ms since epoch. */
  from: number;
  to: number;
  unit: string | null;
  /** Accessible description of the chart. */
  summary: string;
  /** Words for an out-of-range point ("Fuera de rango", or "…de lo recomendado"). */
  redLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 480 ? 200 : 240;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const [lo, hi] = domain;
  const x = (tms: number) => M.left + ((tms - from) / (to - from)) * iw;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * ih;

  const yTicks = useMemo(() => niceTicks(lo, hi, height < 220 ? 4 : 5), [lo, hi, height]);
  const xTicks = useMemo(() => {
    const n = width < 480 ? 3 : 5;
    return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
  }, [from, to, width]);

  // Hover: the nearest visit date across all series.
  const times = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b),
    [series],
  );
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best: number | null = null;
    for (const tm of times)
      if (best == null || Math.abs(x(tm) - px) < Math.abs(x(best) - px)) best = tm;
    setHover(best);
  };
  // The tooltip shows each vaso's reading closest to the hovered date (same day).
  const hovered =
    hover == null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => Math.abs(p.t - hover) < 43_200_000) }))
          .filter((h): h is { s: ChartSeries; p: TrendPoint } => !!h.p);

  const bandTop = band?.max != null ? y(Math.min(band.max, hi)) : M.top;
  const bandBottom = band?.min != null ? y(Math.max(band.min, lo)) : M.top + ih;
  const showDots = times.length <= 60;
  const suffix = unit && unit !== 'pH' ? ` ${unit}` : '';

  return (
    <div ref={box} className="relative w-full">
      <svg
        role="img"
        aria-label={summary}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {band && (band.min != null || band.max != null) && (
          <rect
            x={M.left}
            width={iw}
            y={bandTop}
            height={Math.max(0, bandBottom - bandTop)}
            fill="var(--chart-band)"
          />
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
            <text
              x={M.left - 6}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              className="fill-text-muted text-[11px] tabular-nums"
            >
              {formatValue(v)}
            </text>
          </g>
        ))}
        {xTicks.map((tm, i) => (
          <text
            key={tm}
            x={x(tm)}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-text-muted text-[11px]"
          >
            {formatDate(new Date(tm).toISOString()).replace(/ de /g, ' ')}
          </text>
        ))}

        {series.map((s) => (
          <g key={s.id}>
            {s.points.length > 1 && (
              <path
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.value)}`).join('')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {s.points.map((p) =>
              p.outOfRange ? (
                <path
                  key={`${p.reportId}-${p.t}`}
                  d={`M${x(p.t)},${y(p.value) - 6}l5.5,9.5h-11z`}
                  fill="var(--status-red)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ) : showDots || s.points.length === 1 ? (
                <circle
                  key={`${p.reportId}-${p.t}`}
                  cx={x(p.t)}
                  cy={y(p.value)}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ) : null,
            )}
          </g>
        ))}

        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={M.top}
            y2={M.top + ih}
            stroke="var(--text-muted)"
            strokeWidth={1}
          />
        )}
      </svg>

      {hovered.length > 0 && hover != null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-xs shadow-card"
          style={
            x(hover) > width / 2
              ? { right: Math.max(4, width - x(hover) + 8) }
              : { left: Math.max(4, x(hover) + 8) }
          }
        >
          <p className="mb-1 font-medium text-text">{formatDate(new Date(hover).toISOString())}</p>
          {hovered.map(({ s, p }) => (
            <p key={s.id} className="flex items-center justify-between gap-3 text-text">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">
                {formatValue(p.value)}
                {suffix}
                {p.outOfRange && (
                  <span className="ml-1 font-medium text-status-red-text">{redLabel}</span>
                )}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
