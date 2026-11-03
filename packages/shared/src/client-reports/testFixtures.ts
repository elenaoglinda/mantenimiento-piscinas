/**
 * Test data for the client-report tests (not exported from the barrel). Labels come from the
 * real Spanish locale file, so the tests render exactly what a client would read.
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { flattenLabels, type PdfLabels } from './text.js';
import type { VisitReportData } from './visit.js';
import type { MonthlyParam, MonthlySummaryData, MonthlyVisit } from './monthly.js';

export function realLabels(): PdfLabels {
  const url = new URL('../../../../apps/web/src/locales/es/common.json', import.meta.url);
  const json = JSON.parse(readFileSync(url, 'utf8')) as { clientReports: { pdf: unknown } };
  return flattenLabels(json.clientReports.pdf);
}

/** A fake font: every character is half the size wide. Makes wrapping arithmetic obvious. */
export const fakeMeasure = (text: string, size: number) => text.length * size * 0.5;

/** A valid w×h PNG filled with one colour (no image library needed). */
export function solidPng(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    for (let x = 0; x < w; x++) raw.set(rgb, row + 1 + x * 3);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

export function sampleVisit(overrides: Partial<VisitReportData> = {}): VisitReportData {
  return {
    company: { name: 'Piscinas Mediterráneo (demo)', logoRef: 'logo' },
    clientName: 'Comunidad de Propietarios Mar Azul',
    poolName: 'Residencial Mar Azul',
    poolAddress: 'Calle de la Mar, 12, 03001 Alicante',
    basinName: 'Piscina principal',
    visitedAt: '2026-11-02T09:35:00.000Z',
    status: 'signed',
    technician: 'Lucía Ferrer',
    readings: [
      { name: 'pH', unit: 'pH', value: 7.4, status: 'green', inSiloe: true, minOk: 7.2, maxOk: 8 },
      {
        name: 'Cloro libre residual',
        unit: 'mg/L',
        value: 0.3,
        status: 'red',
        inSiloe: true,
        minOk: 0.5,
        maxOk: 2,
      },
      {
        name: 'Cloro combinado residual',
        unit: 'mg/L',
        value: 0.5,
        status: 'amber',
        inSiloe: true,
        minOk: null,
        maxOk: 0.6,
      },
      {
        name: 'Temperatura del agua',
        unit: '°C',
        value: 26.5,
        status: 'green',
        inSiloe: true,
        minOk: null,
        maxOk: 36,
      },
      {
        name: 'Alcalinidad total',
        unit: 'mg/L CaCO3',
        value: 95,
        status: 'green',
        inSiloe: false,
        minOk: 80,
        maxOk: 120,
      },
      {
        name: 'Fosfatos',
        unit: 'mg/L',
        value: 0.3,
        status: 'red',
        inSiloe: false,
        minOk: null,
        maxOk: 0.1,
      },
    ],
    chemicals: [
      { name: 'Hipoclorito sódico', cantidad: 5, unidad: 'L' },
      { name: 'Minorador de pH', cantidad: 0.5, unidad: 'kg' },
    ],
    tasks: [
      { name: 'Limpieza de skimmers', hecho: true, nota: null },
      {
        name: 'Contralavado de filtros',
        hecho: true,
        nota: 'Presión del filtro alta antes del lavado.',
      },
      { name: 'Revisión de la depuradora', hecho: false, nota: null },
    ],
    incidents: [
      {
        description: 'Cloro libre por debajo del mínimo legal (0,3 mg/L).',
        correctiveAction: 'Cloración de choque y nueva medición a las 2 horas: 1,1 mg/L.',
      },
    ],
    notes: 'Agua ligeramente turbia por la mañana; mejora tras el contralavado.',
    photoRefs: ['photo:0', 'photo:1'],
    photosLeftOut: 0,
    signature: { ref: 'signature', name: 'Marta Soler', signedAt: '2026-11-02T10:05:00.000Z' },
    unavailable: [],
    ...overrides,
  };
}

const PARAMS: MonthlyParam[] = [
  { key: 1, name: 'pH', unit: 'pH', inSiloe: true, def: { minOk: 7.2, maxOk: 8 } },
  {
    key: 3,
    name: 'Temperatura del agua',
    unit: '°C',
    inSiloe: true,
    def: { minOk: null, maxOk: 36 },
  },
  {
    key: 9,
    name: 'Cloro combinado residual',
    unit: 'mg/L',
    inSiloe: true,
    def: { minOk: null, maxOk: 0.6 },
  },
  {
    key: 10,
    name: 'Cloro libre residual',
    unit: 'mg/L',
    inSiloe: true,
    def: { minOk: 0.5, maxOk: 2 },
  },
  { key: 103, name: 'Sal', unit: 'g/L', inSiloe: false, def: { minOk: 3, maxOk: 5 } },
];

/** `days` days of visits, three a week, readings drifting; deterministic. */
export function sampleMonthly(month = '2026-10', perWeek = 3): MonthlySummaryData {
  const visits = (basin: number): MonthlyVisit[] => {
    const out: MonthlyVisit[] = [];
    for (let d = 1; d <= 31; d++) {
      if (d % Math.round(7 / perWeek) !== basin % 2) continue;
      const day = `${month}-${String(d).padStart(2, '0')}`;
      if (Number.isNaN(Date.parse(`${day}T08:00:00Z`)) || !Date.parse(`${day}T08:00:00Z`)) continue;
      const iso = new Date(`${day}T08:30:00Z`);
      if (iso.toISOString().slice(0, 7) !== month) continue;
      const cl = 1 + 0.6 * Math.sin(d / 3 + basin);
      out.push({
        reportId: `r-${basin}-${d}`,
        visitedAt: iso.toISOString(),
        technician: d % 2 ? 'Lucía Ferrer' : 'Javier Martí',
        readings: [
          {
            key: 1,
            value: Math.round((7.4 + 0.25 * Math.cos(d / 4)) * 100) / 100,
            status: 'green',
          },
          { key: 10, value: Math.round(cl * 100) / 100, status: cl < 0.5 ? 'red' : 'green' },
          { key: 9, value: 0.2, status: 'green' },
          { key: 3, value: 24 + (d % 5), status: 'green' },
          { key: 103, value: 4.1, status: 'green' },
        ],
        incidents:
          cl < 0.5
            ? [{ description: 'Cloro libre bajo.', correctiveAction: 'Cloración de choque.' }]
            : [],
        chemicals: [
          { name: 'Hipoclorito sódico', cantidad: 2.5, unidad: 'L' },
          ...(d % 3 === 0 ? [{ name: 'Minorador de pH', cantidad: 0.3, unidad: 'kg' }] : []),
        ],
      });
    }
    return out;
  };
  return {
    company: { name: 'Piscinas Mediterráneo (demo)', logoRef: null },
    clientName: 'Hotel Costa Blanca',
    poolName: 'Hotel Costa Blanca',
    poolAddress: 'Avenida del Puerto, 5, Benidorm',
    month,
    params: PARAMS,
    basins: [
      { id: 'b1', name: 'Piscina exterior', visits: visits(1) },
      { id: 'b2', name: 'Spa', visits: visits(2) },
      { id: 'b3', name: 'Chapoteo', visits: [] },
    ],
    unavailable: [],
  };
}
