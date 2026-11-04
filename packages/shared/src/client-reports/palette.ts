/**
 * The PDF's colours, by design-token name. A PDF can't read CSS variables, so the values are
 * copied here — and `index.test.ts` fails if any of
 * them drifts from `apps/web/src/styles/tokens.css`. Change the token, then this file.
 */
export const PDF_TOKENS = {
  '--text': '#00161c',
  '--text-muted': '#506169',
  '--border': '#dce6ea',
  '--surface-muted': '#eef4f6',
  '--primary-contrast': '#ffffff',
  '--navy-800': '#00303b',
  '--brand-700': '#006b79',
  '--status-green': '#16a34a',
  '--status-green-bg': '#dcfce7',
  '--status-green-text': '#166534',
  '--status-amber': '#d97706',
  '--status-amber-bg': '#fef3c7',
  '--status-amber-text': '#a34a07',
  '--status-red': '#dc2626',
  '--status-red-bg': '#fee2e2',
  '--status-red-text': '#b91c1c',
  '--status-unknown': '#94a3b8',
  '--status-unknown-text': '#5b677a',
  '--chart-1': '#2a78d6',
  '--chart-grid': '#e6edf0',
  '--chart-band': '#dcfce7',
} as const;

export type PdfToken = keyof typeof PDF_TOKENS;

/** RGB in 0..1, the form PDF drawing takes. */
export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function token(name: PdfToken): Rgb {
  return hexToRgb(PDF_TOKENS[name]);
}

/** Colours of a traffic light: the dot and the text next to it. */
export function statusColors(status: 'green' | 'amber' | 'red' | 'unknown'): {
  dot: Rgb;
  text: Rgb;
  bg: Rgb;
} {
  switch (status) {
    case 'green':
      return {
        dot: token('--status-green'),
        text: token('--status-green-text'),
        bg: token('--status-green-bg'),
      };
    case 'amber':
      return {
        dot: token('--status-amber'),
        text: token('--status-amber-text'),
        bg: token('--status-amber-bg'),
      };
    case 'red':
      return {
        dot: token('--status-red'),
        text: token('--status-red-text'),
        bg: token('--status-red-bg'),
      };
    default:
      return {
        dot: token('--status-unknown'),
        text: token('--status-unknown-text'),
        bg: token('--surface-muted'),
      };
  }
}
