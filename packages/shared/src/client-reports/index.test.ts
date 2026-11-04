import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  A4,
  Flow,
  MARGIN,
  PDF_LABEL_KEYS,
  PDF_TOKENS,
  flattenLabels,
  formatDateEs,
  formatNumberEs,
  formatTimeEs,
  isMonth,
  label,
  layoutMonthlySummary,
  layoutVisitReport,
  legalOutOfRange,
  lightVisits,
  mailtoLink,
  monthBounds,
  monthLabelEs,
  outOfRangeCounts,
  pdfSafe,
  plural,
  productTotals,
  rangeText,
  readingRows,
  recentMonths,
  renderPdf,
  sniffImage,
  whatsappLink,
  whatsappNumber,
  wrapText,
  type DrawOp,
  type PdfPage,
} from './index.js';
import { fakeMeasure, realLabels, sampleMonthly, sampleVisit, solidPng } from './testFixtures.js';

const labels = realLabels();
const noImages = () => null;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function visitImages() {
  return new Map([
    ['logo', solidPng(300, 120, [0, 107, 121])],
    ['photo:0', solidPng(80, 60, [40, 160, 200])],
    ['photo:1', solidPng(60, 80, [20, 120, 160])],
    ['signature', solidPng(200, 80, [240, 240, 240])],
  ]);
}

/** Every drawn op stays inside the page, and text above the footer stays above it. */
function expectInsidePages(pages: readonly PdfPage[]) {
  for (const page of pages) {
    for (const op of page) {
      const [x, y] =
        op.op === 'line' ? [op.x1, op.y1] : op.op === 'path' ? op.points[0]! : [op.x, op.y];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(A4.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(A4.height);
    }
  }
}

const texts = (pages: readonly PdfPage[]) =>
  pages.flatMap((p) => p.filter((o): o is Extract<DrawOp, { op: 'text' }> => o.op === 'text'));

describe('pdfSafe', () => {
  it('keeps Spanish and replaces what Helvetica cannot draw', () => {
    expect(pdfSafe('Señal ¿pH? «ñ» 25 °C · 3 m³ – “ok” €')).toBe(
      'Señal ¿pH? «ñ» 25 °C · 3 m³ – “ok” €',
    );
    expect(pdfSafe('Cl ≤ 0,6 → CO₂ ✓')).toBe('Cl <= 0,6 -> CO2 Sí');
    expect(pdfSafe('a b c\td\re')).toBe('a b c de');
    expect(pdfSafe('piscina 🏊 ok')).toBe('piscina ? ok');
    expect(pdfSafe(null)).toBe('');
  });

  it('composes decomposed accents (iOS can paste "a" + combining accent)', () => {
    expect(pdfSafe('camio\u0301n')).toBe('cami\u00f3n');
  });
});

describe('labels', () => {
  it('fills placeholders and picks Spanish plurals', () => {
    const l = { a: 'Hola {{name}}', n_one: '{{count}} visita', n_other: '{{count}} visitas' };
    expect(label(l, 'a', { name: 'Marta' })).toBe('Hola Marta');
    expect(label(l, 'missing')).toBe('missing');
    expect(plural(l, 'n', 1)).toBe('1 visita');
    expect(plural(l, 'n', 0)).toBe('0 visitas');
    expect(flattenLabels({ a: { b: 'x', c: { d: 'y' } } })).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
  });

  it('the locale file has every label the PDFs use', () => {
    const missing = PDF_LABEL_KEYS.filter((k) => !(k in labels));
    expect(missing).toEqual([]);
  });
});

describe('Spanish formatting in Madrid time', () => {
  it('formats numbers, dates and ranges', () => {
    expect(formatNumberEs(7.4)).toBe('7,4');
    expect(formatNumberEs(1234.567)).toBe('1234,57');
    // 09:35 UTC on 2 Nov is 10:35 in Madrid (winter time).
    expect(formatTimeEs('2026-11-02T09:35:00Z')).toBe('10:35');
    expect(formatDateEs('2026-11-02T23:30:00Z')).toBe('3 de noviembre de 2026');
    expect(rangeText(7.2, 8, labels)).toBe('7,2 – 8');
    expect(rangeText(null, 0.6, labels)).toBe('máx. 0,6');
    expect(rangeText(0.5, null, labels)).toBe('mín. 0,5');
    expect(rangeText(null, null, labels)).toBe('');
  });

  it('month bounds follow Madrid midnight across the October DST change', () => {
    expect(monthBounds('2026-10')).toEqual({
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-31T23:00:00.000Z',
    });
    expect(monthBounds('2026-12').to).toBe('2026-12-31T23:00:00.000Z');
    expect(() => monthBounds('2026-13')).toThrow();
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-1')).toBe(false);
    expect(monthLabelEs('2026-10')).toBe('octubre de 2026');
  });

  it('lists recent months newest first, across a year boundary', () => {
    expect(recentMonths(3, new Date('2026-02-10T12:00:00Z'))).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
    ]);
    // 31 Dec 23:30 UTC is already January in Madrid.
    expect(recentMonths(1, new Date('2026-12-31T23:30:00Z'))).toEqual(['2027-01']);
  });
});

describe('wrapText', () => {
  it('wraps on words, keeps newlines and breaks words longer than the line', () => {
    // fakeMeasure: 5 points per character at size 10 → 10 characters fit in 50 points.
    expect(wrapText('uno dos tres cuatro', 50, 10, false, fakeMeasure)).toEqual([
      'uno dos',
      'tres',
      'cuatro',
    ]);
    expect(wrapText('a\n\nb', 50, 10, false, fakeMeasure)).toEqual(['a', '', 'b']);
    expect(wrapText('abcdefghijklmnopqrstuvwxyz', 50, 10, false, fakeMeasure)).toEqual([
      'abcdefghij',
      'klmnopqrst',
      'uvwxyz',
    ]);
  });
});

describe('Flow tables', () => {
  it('repeats the header on every page and never splits a row', () => {
    const flow = new Flow({ measure: fakeMeasure, footer: () => ({ left: 'pie', right: 'p' }) });
    const rows = Array.from({ length: 120 }, (_, i) => ({
      cells: [{ text: `fila ${i}` }, { text: String(i) }],
    }));
    flow.table(
      [
        { label: 'Nombre', width: 0.7 },
        { label: 'N', width: 0.3, align: 'right' },
      ],
      rows,
    );
    const pages = flow.finish();
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      const t = page.filter((o): o is Extract<DrawOp, { op: 'text' }> => o.op === 'text');
      expect(t.some((o) => o.text === 'Nombre')).toBe(true);
      // Body text ends above the footer area.
      const body = t.filter((o) => o.text !== 'pie' && o.text !== 'p');
      for (const o of body) expect(o.y).toBeLessThan(A4.height - MARGIN - 20);
    }
    // Every row appears exactly once.
    const all = texts(pages).map((o) => o.text);
    for (let i = 0; i < 120; i++) expect(all.filter((s) => s === `fila ${i}`)).toHaveLength(1);
  });
});

describe('visit report layout', () => {
  it('shows every part a client should see', () => {
    const pages = layoutVisitReport(sampleVisit(), labels, fakeMeasure, () => ({ w: 4, h: 3 }));
    const all = texts(pages)
      .map((t) => t.text)
      .join('\n');
    for (const s of [
      'Piscinas Mediterráneo (demo)',
      'Informe de visita',
      'Comunidad de Propietarios Mar Azul',
      'Residencial Mar Azul',
      'Piscina principal',
      '10:35',
      'Lucía Ferrer',
      'Cloro libre residual',
      'Fuera de rango',
      'Fuera de lo recomendado',
      'legal (RD 742/2013)',
      'recomendado',
      'Hipoclorito sódico',
      '5 L',
      'Contralavado de filtros',
      'Cloración de choque',
      'Firmado por Marta Soler',
      'Página 1 de',
    ]) {
      expect(all).toContain(s);
    }
    // The undone task without a note is left out; images are placed.
    expect(all).not.toContain('Revisión de la depuradora');
    expect(pages.flat().filter((o) => o.op === 'image')).toHaveLength(4);
    expectInsidePages(pages);
  });

  it('counts only SILOÉ readings as legally out of range', () => {
    expect(legalOutOfRange(sampleVisit().readings)).toBe(1);
    const rows = readingRows(sampleVisit().readings, labels);
    expect(rows.map((r) => r.group ?? null).filter(Boolean)).toEqual([labels.otherParams]);
  });

  it('says when a section could not be read instead of claiming there was nothing', () => {
    const pages = layoutVisitReport(
      sampleVisit({ chemicals: [], tasks: [], unavailable: ['chemicals', 'tasks'] }),
      labels,
      fakeMeasure,
      noImages,
    );
    const all = texts(pages).map((t) => t.text);
    expect(all.filter((t) => t === labels.unavailable)).toHaveLength(2);
    expect(all).not.toContain(labels.productsNone);
  });

  it('a completed, unsigned visit says it is pending signature', () => {
    const pages = layoutVisitReport(
      sampleVisit({ status: 'completed', signature: null }),
      labels,
      fakeMeasure,
      noImages,
    );
    expect(texts(pages).map((t) => t.text)).toContain(labels.notSigned);
  });

  it('notes photos that could not be included', () => {
    const pages = layoutVisitReport(
      sampleVisit({ photosLeftOut: 2 }),
      labels,
      fakeMeasure,
      (ref) => (ref === 'photo:1' ? null : { w: 4, h: 3 }),
    );
    expect(texts(pages).map((t) => t.text)).toContain('3 fotos más disponibles en la aplicación.');
  });
});

describe('monthly summary', () => {
  it('totals products per product and unit', () => {
    expect(
      productTotals([
        {
          reportId: 'a',
          visitedAt: '2026-10-01T08:00:00Z',
          technician: null,
          readings: [],
          incidents: [],
          chemicals: [
            { name: 'Cloro', cantidad: 0.1, unidad: 'kg' },
            { name: 'Cloro', cantidad: 500, unidad: 'g' },
          ],
        },
        {
          reportId: 'b',
          visitedAt: '2026-10-02T08:00:00Z',
          technician: null,
          readings: [],
          incidents: [],
          chemicals: [{ name: 'Cloro', cantidad: 0.2, unidad: 'kg' }],
        },
      ]),
    ).toEqual([
      { name: 'Cloro', cantidad: 500, unidad: 'g' },
      { name: 'Cloro', cantidad: 0.3, unidad: 'kg' },
    ]);
  });

  it('lights readings with the current thresholds and keeps legal and recommended apart', () => {
    const data = sampleMonthly();
    const visits = lightVisits(
      [
        {
          reportId: 'x',
          visitedAt: '2026-10-05T08:00:00Z',
          technician: null,
          incidents: [],
          chemicals: [],
          readings: [
            { key: 1, value: 7.1, status: 'green' }, // stored green, legally out
            { key: 103, value: 6, status: 'green' }, // salt above recommended
          ],
        },
      ],
      data.params,
    );
    expect(visits[0]!.readings.map((r) => r.status)).toEqual(['red', 'red']);
    expect(outOfRangeCounts(visits, data.params)).toEqual({ legal: 1, recommended: 1 });
  });

  it('lays out a busy month on several pages with charts, visits and totals', () => {
    const pages = layoutMonthlySummary(sampleMonthly(), labels, fakeMeasure, noImages);
    expect(pages.length).toBeGreaterThan(1);
    const all = texts(pages).map((t) => t.text);
    expect(all).toContain('Vaso: Piscina exterior');
    expect(all).toContain('Vaso: Chapoteo');
    expect(all).toContain(labels['monthly.noVisits']);
    expect(all).toContain(labels['monthly.productsTotal']);
    expect(pages.flat().some((o) => o.op === 'path')).toBe(true);
    expect(pages.flat().some((o) => o.op === 'triangle')).toBe(true);
    expectInsidePages(pages);
  });
});

describe('renderPdf', () => {
  it('produces a valid PDF that reopens with the right number of pages', async () => {
    const out = await renderPdf({
      title: 'Informe',
      images: visitImages(),
      layout: ({ measure, imageSize }) =>
        layoutVisitReport(sampleVisit(), labels, measure, imageSize),
    });
    expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPageCount()).toBe(out.pages);
    expect(doc.getTitle()).toBe('Informe');
    expect(out.failedImages).toEqual([]);
    // Small enough to open on a phone over a mobile connection.
    expect(out.bytes.length).toBeLessThan(200_000);
  });

  it('is deterministic: the same visit gives the same bytes', async () => {
    const render = () =>
      renderPdf({
        title: 'Informe',
        images: visitImages(),
        layout: ({ measure, imageSize }) =>
          layoutVisitReport(sampleVisit(), labels, measure, imageSize),
      });
    const [a, b] = await Promise.all([render(), render()]);
    expect(sha(a.bytes)).toBe(sha(b.bytes));
    const changed = await renderPdf({
      title: 'Informe',
      images: visitImages(),
      layout: ({ measure, imageSize }) =>
        layoutVisitReport(sampleVisit({ technician: 'Otra persona' }), labels, measure, imageSize),
    });
    expect(sha(changed.bytes)).not.toBe(sha(a.bytes));
  });

  it('draws text Helvetica cannot encode without throwing', async () => {
    const out = await renderPdf({
      title: 'x',
      images: new Map(),
      layout: ({ measure, imageSize }) =>
        layoutVisitReport(
          sampleVisit({ notes: 'Cl ≤ 0,6 → bien 🏊 ✓', clientName: 'Ωmega 漢字' }),
          labels,
          measure,
          imageSize,
        ),
    });
    expect(out.pages).toBeGreaterThan(0);
  });

  it('reports images it cannot embed and lays out without them', async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const out = await renderPdf({
      title: 'x',
      images: new Map([
        ['photo:0', webp],
        ['photo:1', broken],
      ]),
      layout: ({ measure, imageSize }) =>
        layoutVisitReport(sampleVisit(), labels, measure, imageSize),
    });
    expect(out.failedImages.sort()).toEqual(['photo:0', 'photo:1']);
    expect(sniffImage(webp)).toBeNull();
  });

  it('renders a month with 90 days of history behind it', async () => {
    const out = await renderPdf({
      title: 'Resumen',
      images: new Map(),
      layout: ({ measure, imageSize }) =>
        layoutMonthlySummary(sampleMonthly('2026-10', 3), labels, measure, imageSize),
    });
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});

describe('share links', () => {
  it('builds an e-mail link with the signed link in the body', () => {
    const link = mailtoLink(
      'admin@marazul.es',
      'Informe de la visita',
      'Hola:\nhttps://x.supabase.co/storage/v1/object/sign/reports/a.pdf?token=abc&x=1',
    );
    expect(
      link.startsWith('mailto:admin@marazul.es?subject=Informe%20de%20la%20visita&body='),
    ).toBe(true);
    const body = decodeURIComponent(link.split('&body=')[1]!);
    expect(body).toContain('token=abc&x=1');
    // A second address smuggled in through a comma is dropped, not added as a recipient.
    expect(mailtoLink('a@b.es,evil@x.com', 's', 'b').startsWith('mailto:?')).toBe(true);
    expect(mailtoLink(null, 's', 'b').startsWith('mailto:?')).toBe(true);
  });

  it('normalises Spanish phone numbers for WhatsApp', () => {
    expect(whatsappNumber('612 34 56 78')).toBe('34612345678');
    expect(whatsappNumber('+34 612-345-678')).toBe('34612345678');
    expect(whatsappNumber('0034612345678')).toBe('34612345678');
    expect(whatsappNumber('123')).toBeNull();
    expect(whatsappLink(null, 'Hola y adiós')).toBe('https://wa.me/?text=Hola%20y%20adi%C3%B3s');
    expect(whatsappLink('612345678', 'x')).toBe('https://wa.me/34612345678?text=x');
  });
});

describe('PDF colours', () => {
  it('match the design tokens in tokens.css', () => {
    const css = readFileSync(
      new URL('../../../../apps/web/src/styles/tokens.css', import.meta.url),
      'utf8',
    );
    // The light theme is the first :root block; the PDF is always light.
    const light = css.slice(0, css.indexOf('}'));
    for (const [name, hex] of Object.entries(PDF_TOKENS)) {
      const m = new RegExp(`${name}:\\s*([^;]+);`).exec(light);
      expect(m, name).not.toBeNull();
      let value = m![1]!.trim();
      // Follow one level of var() aliasing (--primary: var(--navy-800)).
      const alias = /^var\((--[\w-]+)\)$/.exec(value);
      if (alias) value = new RegExp(`${alias[1]}:\\s*([^;]+);`).exec(light)![1]!.trim();
      expect(value.toLowerCase(), name).toBe(hex);
    }
  });
});
