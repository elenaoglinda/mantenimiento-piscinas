/**
 * Whether each route stop was done. A report saved for the pool marks its pending stop of the
 * same day as `hecha` (database trigger); the technician can mark `saltada` with a reason.
 */
export const STOP_ESTADOS = ['pendiente', 'hecha', 'saltada'] as const;
export type StopEstado = (typeof STOP_ESTADOS)[number];

/** A stop's state; rows read before the migration that adds it have none: pending. */
export function stopEstado(row: { estado?: StopEstado | null }): StopEstado {
  return row.estado ?? 'pendiente';
}

/** The reason a skip is saved with, or null when it's missing (a skip needs one). */
export function skipReason(text: string): string | null {
  const t = text.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, 200) : null;
}

export function stopCounts(
  stops: readonly { estado?: StopEstado | null }[],
): Record<StopEstado, number> {
  const out: Record<StopEstado, number> = { pendiente: 0, hecha: 0, saltada: 0 };
  for (const s of stops) out[stopEstado(s)] += 1;
  return out;
}
