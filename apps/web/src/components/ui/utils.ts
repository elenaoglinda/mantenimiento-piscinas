import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join class names and let later Tailwind classes win over earlier ones, so a caller's
 * `className="px-2"` replaces a component's default `px-4` instead of fighting it.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Shared focus style: a visible ring for keyboard users only. */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Accent- and case-insensitive, so "silo" finds "SILOÉ" and "facturacion" finds "Facturación". */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** cmdk filter using `fold`: 1 when the item's value or keywords contain the query. */
export function foldFilter(value: string, search: string, keywords: string[] = []): number {
  const q = fold(search.trim());
  if (!q) return 1;
  return [value, ...keywords].some((v) => fold(v).includes(q)) ? 1 : 0;
}

/** "Elena Oglinda" → "EO". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** `YYYY-MM-DD` ⇄ local `Date`, without the UTC shift `new Date('2026-10-24')` would apply. */
export function parseISODate(s: string | undefined | null): Date | undefined {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
