/**
 * The visit report a pool company sends its own client after a visit: who, where, when, every
 * reading with its traffic light and range, products, tasks, incidents, photos and signature.
 */
import { A4, Flow, MARGIN, lineHeight, type PdfPage, type TableRow } from './layout.js';
import { drawTitleBlock, runningHeader, type CompanyHeader, type ImageSize } from './header.js';
import { statusColors, token } from './palette.js';
import { formatDateEs, formatNumberEs, formatTimeEs, rangeText } from './format.js';
import { label, pdfSafe, plural, type PdfLabels } from './text.js';
import type { ParameterStatus } from '../evaluate.js';

export interface PdfReading {
  name: string;
  unit: string | null;
  value: number | null;
  status: ParameterStatus;
  /** false for readings outside SILOÉ: their range is recommended, not legal. */
  inSiloe: boolean;
  minOk: number | null;
  maxOk: number | null;
}

export interface PdfChemical {
  name: string;
  cantidad: number;
  unidad: string;
}

export interface PdfTask {
  name: string;
  hecho: boolean;
  nota: string | null;
}

export interface PdfIncident {
  description: string;
  correctiveAction: string | null;
}

export interface VisitReportData {
  company: CompanyHeader;
  clientName: string | null;
  poolName: string;
  poolAddress: string | null;
  basinName: string;
  visitedAt: string;
  status: 'draft' | 'completed' | 'signed';
  technician: string | null;
  readings: PdfReading[];
  chemicals: PdfChemical[];
  tasks: PdfTask[];
  incidents: PdfIncident[];
  notes: string | null;
  /** Image refs of the photos, in order. */
  photoRefs: string[];
  /** Photos that exist but could not be put in the PDF (too large, unsupported format). */
  photosLeftOut: number;
  signature: { ref: string | null; name: string | null; signedAt: string | null } | null;
  /** Sections whose data couldn't be read (shown as such, never as "none"). */
  unavailable: ('chemicals' | 'tasks')[];
}

export function formatUnitValue(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = formatNumberEs(value, 3);
  return unit && unit !== 'pH' ? `${n} ${unit}` : n;
}

function statusLabel(r: Pick<PdfReading, 'status' | 'inSiloe'>, labels: PdfLabels): string {
  return label(labels, `${r.inSiloe ? 'status' : 'recommended'}.${r.status}`);
}

/** Table rows for the readings: SILOÉ first, then a group row and the others. */
export function readingRows(readings: readonly PdfReading[], labels: PdfLabels): TableRow[] {
  const toRow = (r: PdfReading): TableRow => {
    const c = statusColors(r.status);
    const range = rangeText(r.minOk, r.maxOk, labels);
    return {
      fill: r.status === 'red' ? c.bg : undefined,
      cells: [
        { text: r.name, sub: r.unit && r.unit !== 'pH' ? r.unit : undefined },
        {
          text: formatUnitValue(r.value, null),
          bold: true,
          color: r.status === 'red' ? c.text : undefined,
        },
        {
          text: range || label(labels, 'noRange'),
          sub: range ? label(labels, r.inSiloe ? 'rangeLegal' : 'rangeRecommended') : undefined,
        },
        { text: statusLabel(r, labels), dot: c.dot, color: c.text, bold: r.status === 'red' },
      ],
    };
  };
  const siloe = readings.filter((r) => r.inSiloe).map(toRow);
  const extra = readings.filter((r) => !r.inSiloe).map(toRow);
  return extra.length
    ? [...siloe, { cells: [], group: label(labels, 'otherParams') }, ...extra]
    : siloe;
}

export function legalOutOfRange(readings: readonly PdfReading[]): number {
  return readings.filter((r) => r.inSiloe && r.status === 'red').length;
}

export function visitTitle(
  data: Pick<VisitReportData, 'poolName' | 'basinName' | 'visitedAt'>,
  labels: PdfLabels,
) {
  return `${label(labels, 'visit.title')} · ${data.poolName} · ${formatDateEs(data.visitedAt)}`;
}

/** Lays out the visit report. Pure: same data, same pages. */
export function layoutVisitReport(
  data: VisitReportData,
  labels: PdfLabels,
  measure: Flow['measure'],
  imageSize: ImageSize,
): PdfPage[] {
  const title = label(labels, 'visit.title');
  const flow = new Flow({
    measure,
    runningHeader: runningHeader(
      data.company.name,
      `${title} · ${data.poolName}`,
      A4.width - 2 * MARGIN,
      MARGIN,
    ),
    footer: (i, n) => ({
      left: label(labels, 'footer', { company: data.company.name }),
      right: label(labels, 'page', { page: i + 1, pages: n }),
    }),
  });

  drawTitleBlock(
    flow,
    data.company,
    title,
    `${formatDateEs(data.visitedAt)} · ${formatTimeEs(data.visitedAt)}`,
    imageSize,
  );

  flow.keyValues([
    [label(labels, 'client'), data.clientName ?? '—'],
    [label(labels, 'pool'), data.poolName],
    [label(labels, 'basin'), data.basinName],
    [label(labels, 'dateTime'), `${formatDateEs(data.visitedAt)}, ${formatTimeEs(data.visitedAt)}`],
    [label(labels, 'technician'), data.technician ?? label(labels, 'noTechnician')],
    [label(labels, 'address'), data.poolAddress ?? '—'],
  ]);

  // Readings
  flow.heading(label(labels, 'readings'));
  const red = legalOutOfRange(data.readings);
  if (data.readings.length === 0) {
    flow.paragraph(label(labels, 'readingsNone'), { color: token('--text-muted') });
  } else {
    const c = statusColors(red > 0 ? 'red' : 'green');
    const summary = red > 0 ? plural(labels, 'outOfRange', red) : label(labels, 'allInRange');
    flow.block(lineHeight(10) + 8, (x, y, w) => [
      { op: 'rect', x, y, w, h: lineHeight(10) + 4, fill: c.bg },
      { op: 'circle', x: x + 9, y: y + 2 + lineHeight(10) / 2, r: 3.5, fill: c.dot },
      {
        op: 'text',
        x: x + 18,
        y: y + 2 + 10 * 0.85,
        text: pdfSafe(summary),
        size: 10,
        bold: true,
        color: c.text,
      },
    ]);
    flow.table(
      [
        { label: label(labels, 'parameter'), width: 0.36 },
        { label: label(labels, 'value'), width: 0.14, align: 'right' },
        { label: label(labels, 'range'), width: 0.24 },
        { label: label(labels, 'state'), width: 0.26 },
      ],
      readingRows(data.readings, labels),
    );
  }

  // Products
  flow.heading(label(labels, 'products'));
  if (data.unavailable.includes('chemicals')) {
    flow.paragraph(label(labels, 'unavailable'), { color: token('--text-muted') });
  } else if (data.chemicals.length === 0) {
    flow.paragraph(label(labels, 'productsNone'), { color: token('--text-muted') });
  } else {
    flow.table(
      [
        { label: label(labels, 'product'), width: 0.7 },
        { label: label(labels, 'quantity'), width: 0.3, align: 'right' },
      ],
      data.chemicals.map((c) => ({
        cells: [{ text: c.name }, { text: formatUnitValue(c.cantidad, c.unidad), bold: true }],
      })),
    );
  }

  // Tasks
  flow.heading(label(labels, 'tasks'));
  const tasks = data.tasks.filter((t) => t.hecho || t.nota);
  if (data.unavailable.includes('tasks')) {
    flow.paragraph(label(labels, 'unavailable'), { color: token('--text-muted') });
  } else if (tasks.length === 0) {
    flow.paragraph(label(labels, 'tasksNone'), { color: token('--text-muted') });
  } else {
    flow.table(
      [
        { label: label(labels, 'task'), width: 0.7 },
        { label: label(labels, 'state'), width: 0.3 },
      ],
      tasks.map((t) => ({
        cells: [
          { text: t.name, sub: t.nota ?? undefined },
          {
            text: label(labels, t.hecho ? 'taskDone' : 'taskNotDone'),
            dot: t.hecho ? token('--status-green') : token('--status-unknown'),
          },
        ],
      })),
    );
  }

  // Incidents
  flow.heading(label(labels, 'incidents'));
  if (data.incidents.length === 0) {
    flow.paragraph(label(labels, 'incidentsNone'), { color: token('--text-muted') });
  } else {
    for (const inc of data.incidents) {
      flow.ensure(lineHeight(10) * 2 + 6);
      flow.paragraph(inc.description, { bold: true });
      flow.paragraph(
        `${label(labels, 'correctiveAction')}: ${inc.correctiveAction ?? label(labels, 'noCorrectiveAction')}`,
        { color: token('--text-muted'), indent: 10 },
      );
      flow.space(4);
    }
  }

  if (data.notes?.trim()) {
    flow.heading(label(labels, 'notes'));
    flow.paragraph(data.notes.trim());
  }

  // Photos
  if (data.photoRefs.length || data.photosLeftOut) {
    flow.heading(label(labels, 'photos'));
    const shown = flow.imageGrid(data.photoRefs, imageSize);
    const leftOut = data.photosLeftOut + (data.photoRefs.length - shown);
    if (leftOut > 0) {
      flow.paragraph(plural(labels, 'photosLeftOut', leftOut), {
        size: 8.5,
        color: token('--text-muted'),
      });
    }
  }

  // Signature
  flow.heading(label(labels, 'signature'));
  if (data.status === 'signed' && data.signature) {
    const sig = data.signature;
    const size = sig.ref ? imageSize(sig.ref) : null;
    if (size && sig.ref) {
      const scale = Math.min(200 / size.w, 80 / size.h);
      const w = size.w * scale;
      const h = size.h * scale;
      const ref = sig.ref;
      flow.block(h + 8, (x, y) => [
        { op: 'rect', x, y, w: w + 8, h: h + 4, stroke: token('--border'), lineWidth: 0.5 },
        { op: 'image', x: x + 4, y: y + 2, w, h, ref },
      ]);
    }
    const when = sig.signedAt
      ? label(labels, 'signedAt', {
          date: formatDateEs(sig.signedAt),
          time: formatTimeEs(sig.signedAt),
        })
      : '';
    flow.paragraph(
      `${label(labels, 'signedBy', { name: sig.name ?? '—' })}${when ? ` ${when}` : ''}`,
    );
  } else {
    flow.paragraph(label(labels, 'notSigned'), { color: token('--text-muted') });
  }

  flow.space(8);
  flow.paragraph(label(labels, 'legend'), { size: 7.5, color: token('--text-muted') });

  return flow.finish();
}
