/**
 * Draws laid-out pages with pdf-lib. Standard Helvetica only (no font files), images embedded
 * as given. Deterministic: no creation date, no random ids, so the same visit gives the same
 * bytes — the API names the stored file after their hash and never stores a duplicate.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { A4, type Measure, type PdfPage } from './layout.js';
import type { Rgb } from './palette.js';

export type ImageKind = 'png' | 'jpeg';

/** PNG or JPEG by magic bytes; anything else (WebP, HEIC, a PDF) is null. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  return null;
}

export interface RenderInput {
  title: string;
  /** Image bytes by ref. Refs that fail to embed are reported, and laid out as missing. */
  images: ReadonlyMap<string, Uint8Array>;
  layout: (ctx: {
    measure: Measure;
    imageSize: (ref: string) => { w: number; h: number } | null;
  }) => PdfPage[];
}

export interface RenderResult {
  bytes: Uint8Array;
  pages: number;
  /** Refs that were given but could not be embedded. */
  failedImages: string[];
}

const color = (c: Rgb) => rgb(c[0], c[1], c[2]);

export async function renderPdf(input: RenderInput): Promise<RenderResult> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(input.title, { showInWindowTitleBar: true });
  doc.setLanguage('es-ES');
  doc.setCreator('Cloro');
  doc.setProducer('Cloro');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = (b: boolean): PDFFont => (b ? bold : regular);

  const embedded = new Map<string, PDFImage>();
  const failedImages: string[] = [];
  for (const [ref, bytes] of input.images) {
    const kind = sniffImage(bytes);
    try {
      if (kind === 'png') embedded.set(ref, await doc.embedPng(bytes));
      else if (kind === 'jpeg') embedded.set(ref, await doc.embedJpg(bytes));
      else failedImages.push(ref);
    } catch {
      failedImages.push(ref);
    }
  }

  const pages = input.layout({
    measure: (text, size, b) => font(b).widthOfTextAtSize(text, size),
    imageSize: (ref) => {
      const img = embedded.get(ref);
      return img ? { w: img.width, h: img.height } : null;
    },
  });

  const H = A4.height;
  for (const ops of pages) {
    const page = doc.addPage([A4.width, A4.height]);
    for (const op of ops) {
      switch (op.op) {
        case 'text':
          page.drawText(op.text, {
            x: op.x,
            y: H - op.y,
            size: op.size,
            font: font(op.bold),
            color: color(op.color),
          });
          break;
        case 'rect':
          page.drawRectangle({
            x: op.x,
            y: H - op.y - op.h,
            width: op.w,
            height: op.h,
            color: op.fill ? color(op.fill) : undefined,
            borderColor: op.stroke ? color(op.stroke) : undefined,
            borderWidth: op.stroke ? (op.lineWidth ?? 0.5) : 0,
          });
          break;
        case 'line':
          page.drawLine({
            start: { x: op.x1, y: H - op.y1 },
            end: { x: op.x2, y: H - op.y2 },
            thickness: op.width,
            color: color(op.color),
          });
          break;
        case 'path': {
          if (op.points.length < 2) break;
          const d = op.points
            .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`)
            .join(' ');
          // SVG paths are y-down from (x, y) — the layout's own coordinates when placed at (0, H).
          page.drawSvgPath(d, { x: 0, y: H, borderColor: color(op.color), borderWidth: op.width });
          break;
        }
        case 'circle':
          page.drawCircle({ x: op.x, y: H - op.y, size: op.r, color: color(op.fill) });
          break;
        case 'triangle': {
          const { x, y, r } = op;
          const d = `M${x.toFixed(2)} ${(y - r).toFixed(2)} L${(x + r).toFixed(2)} ${(y + r * 0.8).toFixed(2)} L${(x - r).toFixed(2)} ${(y + r * 0.8).toFixed(2)} Z`;
          page.drawSvgPath(d, { x: 0, y: H, color: color(op.fill) });
          break;
        }
        case 'image': {
          const img = embedded.get(op.ref);
          if (img) page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
          break;
        }
      }
    }
  }

  const bytes = await doc.save();
  return { bytes, pages: pages.length, failedImages };
}
