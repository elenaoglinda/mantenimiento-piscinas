/**
 * A small top-to-bottom page layout for the client PDFs. It knows nothing about pdf-lib: it
 * turns headings, paragraphs, tables and images into positioned drawing operations on A4 pages,
 * breaking pages where needed (table headers repeat, rows never split). `render.ts` draws the
 * result. Keeping the two apart is what makes pagination and wrapping unit-testable.
 *
 * Coordinates are PDF points with the origin at the TOP-left and y growing downwards; text `y`
 * is the baseline. The renderer flips them.
 */
import { pdfSafe } from './text.js';
import { token, type Rgb } from './palette.js';

export const A4 = { width: 595.28, height: 841.89 } as const;
export const MARGIN = 40;
const FOOTER_SPACE = 28;

/** Width of `text` at `size` points in the regular or bold font. */
export type Measure = (text: string, size: number, bold: boolean) => number;

export type DrawOp =
  | { op: 'text'; x: number; y: number; text: string; size: number; bold: boolean; color: Rgb }
  | {
      op: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: Rgb;
      stroke?: Rgb;
      lineWidth?: number;
    }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: Rgb; width: number }
  | { op: 'path'; points: readonly (readonly [number, number])[]; color: Rgb; width: number }
  | { op: 'circle'; x: number; y: number; r: number; fill: Rgb }
  | { op: 'triangle'; x: number; y: number; r: number; fill: Rgb }
  | { op: 'image'; x: number; y: number; w: number; h: number; ref: string };

export type PdfPage = DrawOp[];

export function lineHeight(size: number): number {
  return Math.round(size * 1.35 * 100) / 100;
}

/**
 * Greedy word wrap. Explicit newlines are kept; a word longer than the line is broken by
 * characters, so nothing ever runs off the page (a long e-mail address, a pasted URL).
 */
export function wrapText(
  text: string,
  width: number,
  size: number,
  bold: boolean,
  measure: Measure,
): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    const words = para.split(/ +/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // The word alone doesn't fit: break it.
      let rest = word;
      while (measure(rest, size, bold) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut), size, bold) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

export interface TableColumn {
  label: string;
  /** Fraction of the content width; the fractions of a table add up to 1. */
  width: number;
  align?: 'left' | 'right';
}

export interface TableCell {
  text: string;
  bold?: boolean;
  color?: Rgb;
  /** A traffic-light dot drawn before the text. */
  dot?: Rgb;
  /** Smaller second line, muted (e.g. "No SILOÉ"). */
  sub?: string;
}

export interface TableRow {
  cells: TableCell[];
  /** A full-width group heading row instead of cells. */
  group?: string;
  fill?: Rgb;
}

export interface FlowOptions {
  measure: Measure;
  /** Draws the running header on every page after the first; returns the height it took. */
  runningHeader?: (page: PdfPage, top: number) => number;
  /** Footer text for page `index` (0-based) of `count`. */
  footer: (index: number, count: number) => { left: string; right: string };
}

const CELL_PAD_X = 5;
const CELL_PAD_Y = 4;
const TABLE_SIZE = 9;

export class Flow {
  readonly pages: PdfPage[] = [];
  readonly left = MARGIN;
  readonly width = A4.width - 2 * MARGIN;
  readonly bottom = A4.height - MARGIN - FOOTER_SPACE;
  y = MARGIN;
  private readonly opts: FlowOptions;

  constructor(opts: FlowOptions) {
    this.opts = opts;
    this.pages.push([]);
  }

  get page(): PdfPage {
    return this.pages[this.pages.length - 1]!;
  }

  get measure(): Measure {
    return this.opts.measure;
  }

  newPage(): void {
    this.pages.push([]);
    this.y = MARGIN;
    if (this.opts.runningHeader) this.y += this.opts.runningHeader(this.page, this.y);
  }

  /** Make room for `h` points, starting a new page if the current one can't take them. */
  ensure(h: number): void {
    if (this.y + h > this.bottom && this.y > MARGIN + 1) this.newPage();
  }

  space(h: number): void {
    this.y += h;
  }

  text(
    x: number,
    baseline: number,
    text: string,
    size: number,
    opts: { bold?: boolean; color?: Rgb } = {},
  ): void {
    const safe = pdfSafe(text);
    if (!safe) return;
    this.page.push({
      op: 'text',
      x,
      y: baseline,
      text: safe,
      size,
      bold: !!opts.bold,
      color: opts.color ?? token('--text'),
    });
  }

  heading(text: string, size = 13): void {
    // Keep a heading with at least two lines of what follows.
    this.ensure(lineHeight(size) + 6 + lineHeight(10) * 2);
    this.space(6);
    this.text(this.left, this.y + size * 0.8, text, size, {
      bold: true,
      color: token('--navy-800'),
    });
    this.y += lineHeight(size);
    this.page.push({
      op: 'line',
      x1: this.left,
      y1: this.y,
      x2: this.left + this.width,
      y2: this.y,
      color: token('--border'),
      width: 0.75,
    });
    this.y += 6;
  }

  paragraph(
    text: string,
    opts: { size?: number; bold?: boolean; color?: Rgb; indent?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = lineHeight(size);
    for (const line of wrapText(text, this.width - indent, size, !!opts.bold, this.measure)) {
      this.ensure(lh);
      this.text(this.left + indent, this.y + size * 0.8, line, size, opts);
      this.y += lh;
    }
  }

  /** Label/value pairs in `cols` columns; the label small and muted, the value below it. */
  keyValues(pairs: readonly (readonly [string, string])[], cols = 2): void {
    const colW = this.width / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols);
      const wrapped = row.map(([, v]) => wrapText(v || '—', colW - 10, 10, true, this.measure));
      const h = lineHeight(8) + Math.max(...wrapped.map((w) => w.length)) * lineHeight(10) + 6;
      this.ensure(h);
      row.forEach(([k], j) => {
        const x = this.left + j * colW;
        this.text(x, this.y + 8 * 0.8, k, 8, { color: token('--text-muted') });
        wrapped[j]!.forEach((line, n) =>
          this.text(x, this.y + lineHeight(8) + n * lineHeight(10) + 8, line, 10, { bold: true }),
        );
      });
      this.y += h;
    }
  }

  /** A table; rows never split across pages, and the header repeats on each new page. */
  table(columns: readonly TableColumn[], rows: readonly TableRow[]): void {
    const widths = columns.map((c) => c.width * this.width);
    const headerH = lineHeight(8) + CELL_PAD_Y * 2;
    const drawHeader = () => {
      this.page.push({
        op: 'rect',
        x: this.left,
        y: this.y,
        w: this.width,
        h: headerH,
        fill: token('--surface-muted'),
      });
      let x = this.left;
      columns.forEach((c, i) => {
        const w = widths[i]!;
        const tw = this.measure(pdfSafe(c.label), 8, true);
        const tx = c.align === 'right' ? x + w - CELL_PAD_X - tw : x + CELL_PAD_X;
        this.text(tx, this.y + CELL_PAD_Y + 8 * 0.8, c.label, 8, {
          bold: true,
          color: token('--text-muted'),
        });
        x += w;
      });
      this.y += headerH;
    };

    const layoutRow = (row: TableRow) => {
      if (row.group != null) {
        return { h: lineHeight(TABLE_SIZE) + CELL_PAD_Y * 2, cells: [] as string[][] };
      }
      const cells = row.cells.map((cell, i) => {
        const inner = widths[i]! - CELL_PAD_X * 2 - (cell.dot ? 10 : 0);
        return wrapText(cell.text || '—', inner, TABLE_SIZE, !!cell.bold, this.measure);
      });
      const subs = row.cells.map((cell, i) =>
        cell.sub ? wrapText(cell.sub, widths[i]! - CELL_PAD_X * 2, 7.5, false, this.measure) : [],
      );
      const h =
        Math.max(
          ...cells.map(
            (c, i) => c.length * lineHeight(TABLE_SIZE) + subs[i]!.length * lineHeight(7.5),
          ),
        ) +
        CELL_PAD_Y * 2;
      return { h, cells, subs };
    };

    this.ensure(headerH + lineHeight(TABLE_SIZE) + CELL_PAD_Y * 2);
    drawHeader();
    for (const row of rows) {
      const laid = layoutRow(row);
      if (this.y + laid.h > this.bottom) {
        this.newPage();
        drawHeader();
      }
      const top = this.y;
      if (row.fill) {
        this.page.push({
          op: 'rect',
          x: this.left,
          y: top,
          w: this.width,
          h: laid.h,
          fill: row.fill,
        });
      }
      if (row.group != null) {
        this.text(
          this.left + CELL_PAD_X,
          top + CELL_PAD_Y + TABLE_SIZE * 0.8,
          row.group,
          TABLE_SIZE,
          {
            bold: true,
            color: token('--navy-800'),
          },
        );
      } else {
        let x = this.left;
        row.cells.forEach((cell, i) => {
          const w = widths[i]!;
          const lines = laid.cells[i]!;
          const align = columns[i]!.align;
          lines.forEach((line, n) => {
            const baseline = top + CELL_PAD_Y + n * lineHeight(TABLE_SIZE) + TABLE_SIZE * 0.8;
            const tw = this.measure(line, TABLE_SIZE, !!cell.bold);
            let tx = align === 'right' ? x + w - CELL_PAD_X - tw : x + CELL_PAD_X;
            if (cell.dot && n === 0) {
              const dotX = align === 'right' ? tx - 7 : x + CELL_PAD_X + 3;
              this.page.push({ op: 'circle', x: dotX, y: baseline - 3, r: 3, fill: cell.dot });
            }
            if (cell.dot && align !== 'right') tx += 10;
            this.text(tx, baseline, line, TABLE_SIZE, { bold: cell.bold, color: cell.color });
          });
          const subTop = top + CELL_PAD_Y + lines.length * lineHeight(TABLE_SIZE);
          (laid.subs?.[i] ?? []).forEach((line, n) => {
            this.text(x + CELL_PAD_X, subTop + n * lineHeight(7.5) + 7.5 * 0.8, line, 7.5, {
              color: token('--text-muted'),
            });
          });
          x += w;
        });
      }
      this.y += laid.h;
      this.page.push({
        op: 'line',
        x1: this.left,
        y1: this.y,
        x2: this.left + this.width,
        y2: this.y,
        color: token('--border'),
        width: 0.5,
      });
    }
    this.y += 4;
  }

  /**
   * Images in a grid of `cols` columns, each scaled to fit its cell (aspect kept) and centred.
   * `size` gives the pixel size of an embedded image, or null when it couldn't be embedded.
   */
  imageGrid(
    refs: readonly string[],
    size: (ref: string) => { w: number; h: number } | null,
    opts: { cols?: number; cellH?: number; gap?: number } = {},
  ): number {
    const cols = opts.cols ?? 3;
    const gap = opts.gap ?? 8;
    const cellH = opts.cellH ?? 130;
    const cellW = (this.width - gap * (cols - 1)) / cols;
    const usable = refs.filter((r) => size(r));
    for (let i = 0; i < usable.length; i += cols) {
      this.ensure(cellH + gap);
      usable.slice(i, i + cols).forEach((ref, j) => {
        const s = size(ref)!;
        const scale = Math.min(cellW / s.w, cellH / s.h);
        const w = s.w * scale;
        const h = s.h * scale;
        const x = this.left + j * (cellW + gap) + (cellW - w) / 2;
        this.page.push({
          op: 'rect',
          x: this.left + j * (cellW + gap),
          y: this.y,
          w: cellW,
          h: cellH,
          fill: token('--surface-muted'),
        });
        this.page.push({ op: 'image', x, y: this.y + (cellH - h) / 2, w, h, ref });
      });
      this.y += cellH + gap;
    }
    return usable.length;
  }

  /** A fixed-height block drawn by `draw(x, y, width)`, kept on one page. */
  block(h: number, draw: (x: number, y: number, width: number) => DrawOp[]): void {
    this.ensure(h);
    this.page.push(...draw(this.left, this.y, this.width));
    this.y += h;
  }

  /** Adds the footer to every page and returns them. */
  finish(): PdfPage[] {
    const count = this.pages.length;
    this.pages.forEach((page, i) => {
      const { left, right } = this.opts.footer(i, count);
      const y = A4.height - MARGIN + 4;
      page.push({
        op: 'line',
        x1: this.left,
        y1: y - 14,
        x2: this.left + this.width,
        y2: y - 14,
        color: token('--border'),
        width: 0.5,
      });
      const l = pdfSafe(left);
      const r = pdfSafe(right);
      const rw = this.measure(r, 7.5, false);
      const maxLeft = this.width - rw - 12;
      const leftLine = wrapText(l, maxLeft, 7.5, false, this.measure)[0] ?? '';
      page.push({
        op: 'text',
        x: this.left,
        y,
        text: leftLine,
        size: 7.5,
        bold: false,
        color: token('--text-muted'),
      });
      page.push({
        op: 'text',
        x: this.left + this.width - rw,
        y,
        text: r,
        size: 7.5,
        bold: false,
        color: token('--text-muted'),
      });
    });
    return this.pages;
  }
}
