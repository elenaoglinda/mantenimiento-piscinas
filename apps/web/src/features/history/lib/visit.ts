import { readingStatus, type ParameterStatus } from '@piscinas/shared';
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

/** True when any reading of the visit is outside the legal range. */
export function visitOutOfRange(visit: Visit, catalog: ParamCatalog): boolean {
  return visit.readings.some(
    (r) => r.siloeParamId != null && visitReadingStatus(visit, r.siloeParamId, catalog) === 'red',
  );
}
