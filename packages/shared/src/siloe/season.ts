/**
 * From one season's visits and readings to the per-basin figures stored in annual_result /
 * annual_result_param — the step between the database and the SILOE XML.
 *
 * Moved here unchanged from apps/web/src/lib/siloeExport.ts so it can be tested without a
 * database: season.test.ts pins the resulting XML byte for byte, and proves that readings
 * of parameters outside SILOE (alkalinity, hardness, salt, phosphates…) never reach it.
 */
import { aggregateParameter, type DailyMeasurement } from './aggregate.js';
import { PARAMETROS_BY_ID } from './catalogs.js';

export interface SeasonReport {
  id: string;
  basin_id: string;
  visited_at: string;
  punto_muestreo: number | null;
}

export interface SeasonMeasurement {
  report_id: string;
  value: number | null;
  compliant: boolean | null;
  lugar: 'in_situ' | 'lab';
  /** The reading's parameter. Only rows with a SILOE id and `in_siloe !== false` count. */
  parameter_def: { siloe_param_id: number | null; in_siloe?: boolean | null } | null;
}

interface ParamAcc {
  lugars: number[];
  days: DailyMeasurement[];
}
interface BasinAcc {
  puntos: number[];
  dates: string[];
  params: Map<number, ParamAcc>;
}

export interface SeasonParamRow {
  siloe_param_id: number;
  id_lugar: number;
  id_metodo: number;
  deter: number;
  deter_c: number;
  dias_nc: number;
  vc_med: number | null;
  vc_min: number | null;
  vc_max: number | null;
}

export interface SeasonBasin {
  fecha_apertura: string;
  fecha_cierre: string;
  dias_apertura: number;
  n_rutina: number;
  punto_muestreo: number;
  params: SeasonParamRow[];
}

function mode(nums: number[], fallback: number): number {
  if (nums.length === 0) return fallback;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** True for a reading that belongs in the SILOE annual results. */
export function isSiloeReading(m: SeasonMeasurement): boolean {
  const def = m.parameter_def;
  return def != null && def.siloe_param_id != null && def.in_siloe !== false;
}

/**
 * Group a season's readings by basin and SILOE parameter and compute the annual figures.
 * Basins appear in the order their first reading does, as before.
 */
export function summarizeSeason(
  reports: readonly SeasonReport[],
  measurements: readonly SeasonMeasurement[],
): Map<string, SeasonBasin> {
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const byBasin = new Map<string, BasinAcc>();

  for (const m of measurements) {
    const rep = reportMap.get(m.report_id);
    if (!rep || !isSiloeReading(m) || m.value == null) continue;
    const siloeParam = m.parameter_def!.siloe_param_id!;
    const day = rep.visited_at.slice(0, 10);
    const acc: BasinAcc = byBasin.get(rep.basin_id) ?? { puntos: [], dates: [], params: new Map() };
    acc.puntos.push(rep.punto_muestreo ?? 2);
    acc.dates.push(day);
    const pacc: ParamAcc = acc.params.get(siloeParam) ?? { lugars: [], days: [] };
    pacc.lugars.push(m.lugar === 'lab' ? 2 : 1);
    pacc.days.push({ day, value: Number(m.value), compliant: !!m.compliant });
    acc.params.set(siloeParam, pacc);
    byBasin.set(rep.basin_id, acc);
  }

  const out = new Map<string, SeasonBasin>();
  for (const [basinId, acc] of byBasin) {
    const sortedDates = [...new Set(acc.dates)].sort();
    const fechaApertura = sortedDates[0];
    const fechaCierre = sortedDates[sortedDates.length - 1];
    const dias =
      Math.round((new Date(fechaCierre).getTime() - new Date(fechaApertura).getTime()) / 86400000) +
      1;
    out.set(basinId, {
      fecha_apertura: fechaApertura,
      fecha_cierre: fechaCierre,
      dias_apertura: dias,
      n_rutina: sortedDates.length,
      punto_muestreo: mode(acc.puntos, 2),
      params: [...acc.params.entries()].map(([siloeParam, pacc]) => {
        const agg = aggregateParameter(pacc.days);
        const def = PARAMETROS_BY_ID.get(siloeParam);
        return {
          siloe_param_id: siloeParam,
          id_lugar: mode(pacc.lugars, 1),
          id_metodo: def?.allowedMetodo[0] ?? 14,
          deter: agg.deter,
          deter_c: agg.deterC,
          dias_nc: agg.diasNc,
          vc_med: agg.vcMed,
          vc_min: agg.vcMin,
          vc_max: agg.vcMax,
        };
      }),
    });
  }
  return out;
}
