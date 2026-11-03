/**
 * The top of the first page (logo, company, title) and the slim header on the pages after it.
 */
import { lineHeight, type Flow, type PdfPage } from './layout.js';
import { token } from './palette.js';
import { pdfSafe } from './text.js';

export interface CompanyHeader {
  /** Billing-profile razón social if the org has one, else the org name. */
  name: string;
  /** Image ref of the logo, when the org uploaded one and it could be embedded. */
  logoRef?: string | null;
}

export type ImageSize = (ref: string) => { w: number; h: number } | null;

const LOGO_MAX_H = 46;
const LOGO_MAX_W = 140;

/** First-page header; leaves the flow's cursor under it. */
export function drawTitleBlock(
  flow: Flow,
  company: CompanyHeader,
  title: string,
  subtitle: string,
  imageSize: ImageSize,
): void {
  const top = flow.y;
  let textX = flow.left;
  let blockH = 0;
  const logo = company.logoRef ? imageSize(company.logoRef) : null;
  if (logo && company.logoRef) {
    const scale = Math.min(LOGO_MAX_W / logo.w, LOGO_MAX_H / logo.h);
    const w = logo.w * scale;
    const h = logo.h * scale;
    flow.page.push({ op: 'image', x: flow.left, y: top, w, h, ref: company.logoRef });
    textX = flow.left + w + 12;
    blockH = h;
  }
  flow.text(textX, top + 11, company.name, 11, { bold: true, color: token('--text-muted') });
  flow.text(textX, top + 11 + lineHeight(11) + 12, title, 18, {
    bold: true,
    color: token('--navy-800'),
  });
  const subY = top + 11 + lineHeight(11) + 12 + lineHeight(18) - 4;
  flow.text(textX, subY, subtitle, 10, { color: token('--text-muted') });
  flow.y = Math.max(top + blockH, subY + 4) + 12;
  flow.page.push({
    op: 'rect',
    x: flow.left,
    y: flow.y,
    w: flow.width,
    h: 2,
    fill: token('--brand-700'),
  });
  flow.y += 14;
}

/** Running header for pages 2+: company and title on one line. Returns its height. */
export function runningHeader(company: string, title: string, flowWidth: number, left: number) {
  return (page: PdfPage, top: number): number => {
    page.push({
      op: 'text',
      x: left,
      y: top + 8,
      text: pdfSafe(`${company} · ${title}`),
      size: 8,
      bold: false,
      color: token('--text-muted'),
    });
    page.push({
      op: 'line',
      x1: left,
      y1: top + 14,
      x2: left + flowWidth,
      y2: top + 14,
      color: token('--border'),
      width: 0.5,
    });
    return 24;
  };
}
