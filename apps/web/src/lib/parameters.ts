import { supabase } from './supabase.js';
import { paramKey, type ParameterDef } from '@piscinas/shared';
import type { Tables } from './database.types.js';

export type ParameterDefRow = Tables<'parameter_def'>;

/**
 * SILOE parameters analysed in a laboratory rather than in situ (E. coli, Legionella,
 * P. aeruginosa). Measurements for these default to `lugar = 'lab'`.
 */
export const LAB_PARAM_IDS = new Set([11, 12, 13]);

/**
 * Map a free-text CCAA (as typed on the pool) to the code used in parameter_def overrides.
 * v1 launches with Cataluña only; extend as more regions are seeded. See spec §13.3.
 */
export function ccaaToCode(ccaa: string | null | undefined): string | null {
  if (!ccaa) return null;
  if (/catal/i.test(ccaa)) return 'CT';
  return null;
}

/** Adapt a DB threshold row to the shared traffic-light evaluator input. */
export function toEvaluatorDef(row: ParameterDefRow): ParameterDef {
  return {
    minOk: row.min_ok,
    maxOk: row.max_ok,
    minWarn: row.min_warn,
    maxWarn: row.max_warn,
    closureMin: row.closure_min,
    closureMax: row.closure_max,
    warnMarginRatio: row.warn_margin_ratio,
  };
}

/**
 * Pick, from all `parameter_def` rows, the active definition of each parameter for a pool's
 * region, preferring a CCAA-specific override over the national RD 742/2013 default.
 * Parameters are grouped by `paramKey` (the SILOE id, or 101+ for readings outside SILOE) and
 * ordered by it, so forms list the SILOE parameters in canonical order, then the others.
 */
export function resolveParameterDefs(
  rows: readonly ParameterDefRow[],
  ccaa: string | null | undefined,
): ParameterDefRow[] {
  const code = ccaaToCode(ccaa);
  const byParam = new Map<number, ParameterDefRow>();
  for (const row of rows) {
    const key = paramKey(row);
    if (!row.active || key == null) continue;
    const existing = byParam.get(key);
    if (!existing) {
      byParam.set(key, row);
      continue;
    }
    // Prefer the row whose ccaa matches the region code over the national (null) default.
    if (row.ccaa === code && existing.ccaa !== code) {
      byParam.set(key, row);
    }
  }
  return [...byParam.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/** True for a SILOE parameter analysed in a laboratory (defaults its lugar to 'lab'). */
export function isLabParameter(row: Pick<ParameterDefRow, 'siloe_param_id'>): boolean {
  return row.siloe_param_id != null && LAB_PARAM_IDS.has(row.siloe_param_id);
}

/** Fetch and resolve the active parameter definitions for a pool's region. */
export async function fetchResolvedParameterDefs(
  ccaa: string | null | undefined,
): Promise<ParameterDefRow[]> {
  const { data, error } = await supabase.from('parameter_def').select('*').eq('active', true);
  if (error || !data) return [];
  return resolveParameterDefs(data, ccaa);
}
