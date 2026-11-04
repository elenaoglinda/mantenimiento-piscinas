/**
 * Text helpers for the client PDFs: make any string drawable with the PDF standard fonts, and
 * fill the Spanish label templates that come from the app's locale file.
 */

/**
 * The PDF uses the standard Helvetica fonts (no font file to ship, so the function stays
 * small). They can only draw WinAnsi (Windows-1252): all of Spanish, but not "≤", "→", "₂"
 * or emoji. pdf-lib throws on anything else, so every string goes through here first.
 */
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

const REPLACEMENTS: Readonly<Record<string, string>> = {
  '≤': '<=',
  '≥': '>=',
  '→': '->',
  '←': '<-',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '✓': 'Sí',
  '✔': 'Sí',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '­': '',
  '\t': ' ',
  '\r': '',
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

function drawable(cp: number): boolean {
  if (cp === 0x0a) return true; // newline: kept for wrapping, never drawn
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa1 && cp <= 0xff) return true;
  return WIN_ANSI_EXTRA.has(cp);
}

/** `s` with every character the standard fonts can't draw replaced or dropped. */
export function pdfSafe(s: string | null | undefined): string {
  if (!s) return '';
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const rep = REPLACEMENTS[ch];
    if (rep !== undefined) {
      out += rep;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    if (drawable(cp)) out += ch;
    else if (cp < 0x20)
      continue; // control characters
    else out += '?';
  }
  return out;
}

/** Labels for the PDFs, flattened from `clientReports.pdf` in the locale file. */
export type PdfLabels = Readonly<Record<string, string>>;

/**
 * The label `key` with `{{var}}` placeholders filled. A missing key comes out as the key itself,
 * so a gap is visible in the PDF rather than an empty space (and a web test checks they exist).
 */
export function label(
  labels: PdfLabels,
  key: string,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  const template = labels[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{{${name}}}`,
  );
}

/** `key_one` or `key_other` (Spanish has only these two), with `{{count}}` filled. */
export function plural(
  labels: PdfLabels,
  key: string,
  count: number,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  return label(labels, `${key}_${count === 1 ? 'one' : 'other'}`, { count, ...vars });
}

/** Nested locale object → `a.b.c` keys, the shape `label()` reads. */
export function flattenLabels(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') out[key] = v;
      else Object.assign(out, flattenLabels(v, key));
    }
  }
  return out;
}
