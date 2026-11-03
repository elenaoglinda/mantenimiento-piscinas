import type { TFunction } from 'i18next';

/** Readings as Spanish users write them: decimal comma, at most two decimals. */
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export function formatValue(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : number.format(value);
}

// Visits happen in Spain: always show Madrid time, whatever the device's timezone.
const TZ = 'Europe/Madrid';
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const shortDateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

/** "hoy", "ayer", "hace 5 días". */
export function formatDaysAgo(t: TFunction, days: number): string {
  if (days === 0) return t('history.today');
  if (days === 1) return t('history.yesterday');
  return t('history.daysAgo', { count: days });
}

/**
 * Short parameter name for compact rows ("Cl libre"), falling back to the catalogue name.
 * Only the inline parameters have short names; everything else uses parameter_def.name_es.
 */
export function paramLabel(t: TFunction, siloeParamId: number, fallback?: string | null): string {
  return t(`history.paramShort.${siloeParamId}`, { defaultValue: fallback ?? `#${siloeParamId}` });
}
