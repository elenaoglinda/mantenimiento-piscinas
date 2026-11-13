/**
 * Whether an installation has every code the SILOÉ annual-results XML needs: the
 * installation's `cod_seguridad` (pool.siloe_cod_p) and the `cod_v` of each vaso that is still
 * active (basin.siloe_cod_v). See xml.ts and apps/web/src/lib/siloeExport.ts, which put exactly
 * these two codes in the file.
 *
 * Retired vasos (`fecha_baja` on or before today) don't count. Blank codes count as missing.
 */

export interface ReadinessPool {
  siloe_cod_p: string | null;
}

export interface ReadinessBasin {
  denominacion: string;
  siloe_cod_v: string | null;
  /** Date the vaso was retired, 'YYYY-MM-DD'; null while it is in use. */
  fecha_baja: string | null;
}

export interface SiloeReadiness {
  /** True only when the installation and every active vaso have a code. */
  ready: boolean;
  missingPoolCode: boolean;
  /** Names of the active vasos without a code, in the order given. */
  basinsMissingCode: string[];
  /** No active vaso at all: nothing to report yet. */
  noActiveBasins: boolean;
}

const hasCode = (code: string | null) => code != null && code.trim() !== '';

/** A vaso is active until its `fecha_baja`; on that day it is already retired. */
export function isActiveBasin(basin: Pick<ReadinessBasin, 'fecha_baja'>, today: string): boolean {
  return basin.fecha_baja == null || basin.fecha_baja > today;
}

/** `today` is a 'YYYY-MM-DD' date in Europe/Madrid. */
export function siloeReadiness(
  pool: ReadinessPool,
  basins: readonly ReadinessBasin[],
  today: string,
): SiloeReadiness {
  const active = basins.filter((b) => isActiveBasin(b, today));
  const missingPoolCode = !hasCode(pool.siloe_cod_p);
  const basinsMissingCode = active
    .filter((b) => !hasCode(b.siloe_cod_v))
    .map((b) => b.denominacion);
  const noActiveBasins = active.length === 0;
  return {
    ready: !missingPoolCode && basinsMissingCode.length === 0 && !noActiveBasins,
    missingPoolCode,
    basinsMissingCode,
    noActiveBasins,
  };
}
