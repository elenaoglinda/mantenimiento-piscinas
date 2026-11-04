import { isExtraParamKey, readingStatus, type ParameterStatus } from '@piscinas/shared';
import type { ParamCatalog, Visit } from './data.js';

/** A visit's reading lit with the pool's current thresholds (stored status as a fallback). */
export function visitReadingStatus(
  visit: Visit,
  siloeParamId: number,
  catalog: ParamCatalog,
): ParameterStatus {
  const r = visit.readings.find((m) => m.siloeParamId === siloeParamId);
  return readingStatus(
    r?.value ?? null,
    catalog.evaluatorDefs(visit.ccaa).get(siloeParamId),
    r?.status,
  );
}

/**
 * True when any SILOE reading of the visit is outside the legal range. Readings outside SILOE
 * (recommended ranges only) never make a visit "fuera de rango".
 */
export function visitOutOfRange(visit: Visit, catalog: ParamCatalog): boolean {
  return visit.readings.some(
    (r) =>
      r.siloeParamId != null &&
      !isExtraParamKey(r.siloeParamId) &&
      visitReadingStatus(visit, r.siloeParamId, catalog) === 'red',
  );
}
