/**
 * Monthly summary per pool: for each vaso, the trend of the key readings, every visit of the
 * month with its key readings, how many readings were out of range, the incidents, and the
 * total of each product used.
 */
import { KEY_PARAM_IDS, buildTrend, readingStatus, worstStatus } from '../history/index.js';
import type { ParameterDef, ParameterStatus } from '../evaluate.js';
import { A4, Flow, MARGIN, lineHeight, type PdfPage, type TableRow } from './layout.js';
import { drawTitleBlock, runningHeader, type CompanyHeader, type ImageSize } from './header.js';
import { chartOps } from './chart.js';
import { statusColors, token } from './palette.js';
import {
  formatDateEs,
  formatNumberEs,
  formatShortDateEs,
  madridYmd,
  monthBounds,
  monthLabelEs,
} from './format.js';
import { formatUnitValue, type PdfChemical, type PdfIncident } from './visit.js';
import { label, plural, type PdfLabels } from './text.js';

export interface MonthlyParam {
  /** paramKey(): SILOÉ id, or 101+ for readings outside SILOÉ. */
  key: number;
  name: string;
  unit: string | null;
  inSiloe: boolean;
  def: ParameterDef | null;
}

export interface MonthlyReading {
  key: number;
  value: number | null;
  status: ParameterStatus;
}

export interface MonthlyVisit {
  reportId: string;
  visitedAt: string;
  technician: string | null;
  readings: MonthlyReading[];
  incidents: PdfIncident[];
  chemicals: PdfChemical[];
}

export interface MonthlyBasin {
  id: string;
  name: string;
  visits: MonthlyVisit[];
}

export interface MonthlySummaryData {
  company: CompanyHeader;
  clientName: string | null;
  poolName: string;
  poolAddress: string | null;
  /** 'YYYY-MM' */
  month: string;
  params: MonthlyParam[];
  basins: MonthlyBasin[];
  unavailable: 'chemicals'[];
}

/** Total of each product over the visits, by product name and unit, largest first. */
export function productTotals(visits: readonly MonthlyVisit[]): PdfChemical[] {
  const totals = new Map<string, PdfChemical>();
  for (const v of visits) {
    for (const c of v.chemicals) {
      const k = `${c.name}\u0000${c.unidad}`;
      const t = totals.get(k);
      if (t) t.cantidad = Math.round((t.cantidad + c.cantidad) * 1000) / 1000;
      else totals.set(k, { ...c });
    }
  }
  return [...totals.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'es') || a.unidad.localeCompare(b.unidad),
  );
}

/** Readings out of the legal range (SILOÉ) and out of the recommended range (the others). */
export function outOfRangeCounts(
  visits: readonly MonthlyVisit[],
  params: readonly MonthlyParam[],
): { legal: number; recommended: number } {
  const inSiloe = new Map(params.map((p) => [p.key, p.inSiloe]));
  let legal = 0;
  let recommended = 0;
  for (const v of visits) {
    for (const r of v.readings) {
      if (r.status !== 'red') continue;
      if (inSiloe.get(r.key) === false) recommended++;
      else legal++;
    }
  }
  return { legal, recommended };
}

/**
 * Re-lights every reading with the parameter's current definition, as the app's Historial
 * does; the stored status is only the fallback for a parameter without one.
 */
export function lightVisits(
  visits: readonly MonthlyVisit[],
  params: readonly MonthlyParam[],
): MonthlyVisit[] {
  const defs = new Map(params.map((p) => [p.key, p.def]));
  return visits.map((v) => ({
    ...v,
    readings: v.readings.map((r) => ({
      ...r,
      status: readingStatus(r.value, defs.get(r.key) ?? undefined, r.status),
    })),
  }));
}

function readingOf(v: MonthlyVisit, key: number) {
  return v.readings.find((r) => r.key === key) ?? null;
}

/** Key parameters shown in charts and the visits table, in the app's order, if defined. */
export function keyParams(params: readonly MonthlyParam[]): MonthlyParam[] {
  return KEY_PARAM_IDS.map((k) => params.find((p) => p.key === k)).filter(
    (p): p is MonthlyParam => !!p,
  );
}

export function monthlyTitle(month: string, labels: PdfLabels): string {
  return `${label(labels, 'monthly.title')} · ${monthLabelEs(month)}`;
}

export function layoutMonthlySummary(
  data: MonthlySummaryData,
  labels: PdfLabels,
  measure: Flow['measure'],
  imageSize: ImageSize,
): PdfPage[] {
  const title = label(labels, 'monthly.title');
  const flow = new Flow({
    measure,
    runningHeader: runningHeader(
      data.company.name,
      `${title} · ${data.poolName} · ${monthLabelEs(data.month)}`,
      A4.width - 2 * MARGIN,
      MARGIN,
    ),
    footer: (i, n) => ({
      left: label(labels, 'footer', { company: data.company.name }),
      right: label(labels, 'page', { page: i + 1, pages: n }),
    }),
  });
  const { from, to } = monthBounds(data.month);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const lastDay = new Date(toMs - 1).toISOString();
  const basins = data.basins.map((b) => ({ ...b, visits: lightVisits(b.visits, data.params) }));
  const allVisits = basins.flatMap((b) => b.visits);

  drawTitleBlock(flow, data.company, title, monthLabelEs(data.month), imageSize);
  flow.keyValues([
    [label(labels, 'client'), data.clientName ?? '—'],
    [label(labels, 'pool'), data.poolName],
    [
      label(labels, 'monthly.period'),
      label(labels, 'monthly.periodRange', { from: formatDateEs(from), to: formatDateEs(lastDay) }),
    ],
    [label(labels, 'address'), data.poolAddress ?? '—'],
    [label(labels, 'monthly.visits'), String(allVisits.length)],
    [label(labels, 'monthly.outOfRange'), String(outOfRangeCounts(allVisits, data.params).legal)],
  ]);

  const params = keyParams(data.params);
  // Day-of-month ticks: 1, 8, 15, 22, 29 (as many as the month has).
  const xTicks = [1, 8, 15, 22, 29]
    .map((d) => ({
      d,
      iso: new Date(
        Date.parse(monthBounds(data.month).from) + (d - 1) * 86_400_000 + 43_200_000,
      ).toISOString(),
    }))
    .filter(({ iso }) => madridYmd(iso).startsWith(data.month))
    .map(({ d, iso }) => ({ t: Date.parse(iso), label: String(d) }));

  for (const basin of basins) {
    flow.heading(label(labels, 'monthly.basin', { name: basin.name }));
    const visits = [...basin.visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
    if (visits.length === 0) {
      flow.paragraph(label(labels, 'monthly.noVisits'), { color: token('--text-muted') });
      continue;
    }
    const counts = outOfRangeCounts(visits, data.params);
    const incidentCount = visits.reduce((n, v) => n + v.incidents.length, 0);
    flow.paragraph(
      [
        plural(labels, 'monthly.visitsCount', visits.length),
        plural(labels, 'outOfRange', counts.legal),
        counts.recommended ? plural(labels, 'monthly.outOfRecommended', counts.recommended) : null,
        plural(labels, 'monthly.incidentsCount', incidentCount),
      ]
        .filter(Boolean)
        .join(' · '),
      { bold: true, color: counts.legal ? statusColors('red').text : token('--text') },
    );
    flow.space(4);

    // Charts, two per row.
    const charted = params.filter((p) => visits.some((v) => readingOf(v, p.key)?.value != null));
    const gap = 14;
    const chartW = (flow.width - gap) / 2;
    const chartH = 118;
    for (let i = 0; i < charted.length; i += 2) {
      flow.block(chartH + 10, (x, y) =>
        charted.slice(i, i + 2).flatMap((p, j) => {
          const series = buildTrend(
            visits.map((v) => ({
              basinId: basin.id,
              visitedAt: v.visitedAt,
              value: readingOf(v, p.key)?.value ?? null,
              reportId: v.reportId,
            })),
            p.def ?? undefined,
            (toMs - fromMs) / 86_400_000,
            new Date(toMs - 1),
          );
          const unit = p.unit && p.unit !== 'pH' ? ` (${p.unit})` : '';
          return chartOps(
            {
              title: `${p.name}${unit}`,
              points: series[0]?.points ?? [],
              band: p.def ? { min: p.def.minOk, max: p.def.maxOk } : null,
              from: fromMs,
              to: toMs,
              xTicks,
            },
            { x: x + j * (chartW + gap), y, w: chartW, h: chartH },
            measure,
          );
        }),
      );
    }

    // Visits table.
    const restW = 0.84 / Math.max(params.length + 1, 1);
    const rows: TableRow[] = visits.map((v) => {
      const statuses = v.readings
        .filter((r) => data.params.find((p) => p.key === r.key)?.inSiloe !== false)
        .map((r) => r.status);
      const worst = worstStatus(statuses);
      return {
        cells: [
          { text: `${formatShortDateEs(v.visitedAt)}` },
          ...params.map((p) => {
            const r = readingOf(v, p.key);
            const red = r?.status === 'red';
            return {
              text: r?.value != null ? formatNumberEs(r.value, 2) : '—',
              bold: red,
              color: red ? statusColors('red').text : undefined,
            };
          }),
          {
            text: label(labels, `status.${worst}`),
            dot: statusColors(worst).dot,
            color: statusColors(worst).text,
          },
        ],
      };
    });
    flow.table(
      [
        { label: label(labels, 'monthly.date'), width: 0.16 },
        ...params.map((p) => ({
          label: label(labels, `monthly.short.${p.key}`),
          width: restW,
          align: 'right' as const,
        })),
        { label: label(labels, 'state'), width: restW },
      ],
      rows,
    );

    // Incidents of the month.
    const incidents = visits.flatMap((v) => v.incidents.map((i) => ({ ...i, at: v.visitedAt })));
    if (incidents.length) {
      flow.space(4);
      flow.paragraph(label(labels, 'incidents'), { bold: true, color: token('--navy-800') });
      for (const inc of incidents) {
        flow.ensure(lineHeight(9.5) * 2 + 4);
        flow.paragraph(`${formatShortDateEs(inc.at)} · ${inc.description}`, { size: 9.5 });
        flow.paragraph(
          `${label(labels, 'correctiveAction')}: ${inc.correctiveAction ?? label(labels, 'noCorrectiveAction')}`,
          { size: 9, color: token('--text-muted'), indent: 10 },
        );
      }
    }

    // Products used.
    flow.space(4);
    flow.paragraph(label(labels, 'monthly.productsTotal'), {
      bold: true,
      color: token('--navy-800'),
    });
    const totals = productTotals(visits);
    if (data.unavailable.includes('chemicals')) {
      flow.paragraph(label(labels, 'unavailable'), { size: 9, color: token('--text-muted') });
    } else if (totals.length === 0) {
      flow.paragraph(label(labels, 'productsNone'), { size: 9, color: token('--text-muted') });
    } else {
      flow.table(
        [
          { label: label(labels, 'product'), width: 0.7 },
          { label: label(labels, 'monthly.total'), width: 0.3, align: 'right' },
        ],
        totals.map((c) => ({
          cells: [{ text: c.name }, { text: formatUnitValue(c.cantidad, c.unidad), bold: true }],
        })),
      );
    }
  }

  flow.space(8);
  flow.paragraph(label(labels, 'legend'), { size: 7.5, color: token('--text-muted') });
  return flow.finish();
}
