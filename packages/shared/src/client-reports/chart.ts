/**
 * A line chart drawn with PDF primitives: the same picture as the app's Evolución chart (legal
 * or recommended band shaded, out-of-range points as red triangles), for one vaso and one
 * parameter over a period.
 */
import { niceTicks, trendDomain, type TrendPoint } from '../history/index.js';
import type { DrawOp, Measure } from './layout.js';
import { token } from './palette.js';
import { formatNumberEs } from './format.js';
import { pdfSafe } from './text.js';

export interface ChartSpec {
  title: string;
  points: readonly TrendPoint[];
  band: { min: number | null; max: number | null } | null;
  /** Period, ms since epoch. */
  from: number;
  to: number;
  /** Tick labels for the x axis, e.g. days of the month. */
  xTicks: readonly { t: number; label: string }[];
}

const PAD = { top: 16, right: 6, bottom: 14, left: 30 };

export function chartOps(
  spec: ChartSpec,
  box: { x: number; y: number; w: number; h: number },
  measure: Measure,
): DrawOp[] {
  const ops: DrawOp[] = [];
  const muted = token('--text-muted');
  ops.push({
    op: 'text',
    x: box.x,
    y: box.y + 9,
    text: pdfSafe(spec.title),
    size: 8.5,
    bold: true,
    color: token('--text'),
  });
  const ix = box.x + PAD.left;
  const iy = box.y + PAD.top;
  const iw = box.w - PAD.left - PAD.right;
  const ih = box.h - PAD.top - PAD.bottom;
  const def = spec.band ? { minOk: spec.band.min, maxOk: spec.band.max } : undefined;
  const [lo, hi] = trendDomain([{ basinId: '', points: [...spec.points] }], def);
  const span = spec.to - spec.from || 1;
  const x = (t: number) => ix + ((t - spec.from) / span) * iw;
  const y = (v: number) => iy + (1 - (v - lo) / (hi - lo)) * ih;

  ops.push({ op: 'rect', x: ix, y: iy, w: iw, h: ih, stroke: token('--border'), lineWidth: 0.5 });
  if (spec.band && (spec.band.min != null || spec.band.max != null)) {
    const top = spec.band.max != null ? y(Math.min(spec.band.max, hi)) : iy;
    const bottom = spec.band.min != null ? y(Math.max(spec.band.min, lo)) : iy + ih;
    if (bottom > top)
      ops.push({ op: 'rect', x: ix, y: top, w: iw, h: bottom - top, fill: token('--chart-band') });
  }
  for (const v of niceTicks(lo, hi, 4)) {
    ops.push({
      op: 'line',
      x1: ix,
      y1: y(v),
      x2: ix + iw,
      y2: y(v),
      color: token('--chart-grid'),
      width: 0.5,
    });
    const text = formatNumberEs(v);
    ops.push({
      op: 'text',
      x: ix - 3 - measure(text, 6.5, false),
      y: y(v) + 2.2,
      text,
      size: 6.5,
      bold: false,
      color: muted,
    });
  }
  for (const tick of spec.xTicks) {
    const text = pdfSafe(tick.label);
    const tx = Math.min(
      Math.max(x(tick.t) - measure(text, 6.5, false) / 2, ix),
      ix + iw - measure(text, 6.5, false),
    );
    ops.push({ op: 'text', x: tx, y: iy + ih + 9, text, size: 6.5, bold: false, color: muted });
  }
  const pts = [...spec.points].sort((a, b) => a.t - b.t);
  if (pts.length > 1) {
    ops.push({
      op: 'path',
      points: pts.map((p) => [x(p.t), y(p.value)] as const),
      color: token('--chart-1'),
      width: 1.2,
    });
  }
  for (const p of pts) {
    if (p.outOfRange)
      ops.push({ op: 'triangle', x: x(p.t), y: y(p.value), r: 3.6, fill: token('--status-red') });
    else ops.push({ op: 'circle', x: x(p.t), y: y(p.value), r: 1.8, fill: token('--chart-1') });
  }
  return ops;
}
