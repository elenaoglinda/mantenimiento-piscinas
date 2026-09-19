import { supabase } from './supabase.js';
import type { ParameterDef } from '@piscinas/shared';
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
 * Resolve the active parameter definitions for a pool's region: one row per SILOE parameter,
 * preferring a CCAA-specific override over the national RD 742/2013 default. Ordered by
 * siloe_param_id so the form renders parameters in the canonical SILOE order.
 */
export async function fetchResolvedParameterDefs(
  ccaa: string | null | undefined,
): Promise<ParameterDefRow[]> {
  const code = ccaaToCode(ccaa);
  const { data, error } = await supabase.from('parameter_def').select('*').eq('active', true);
  if (error || !data) return [];

  const byParam = new Map<number, ParameterDefRow>();
  for (const row of data) {
    const existing = byParam.get(row.siloe_param_id);
    if (!existing) {
      byParam.set(row.siloe_param_id, row);
      continue;
    }
    // Prefer the row whose ccaa matches the region code over the national (null) default.
    if (row.ccaa === code && existing.ccaa !== code) {
      byParam.set(row.siloe_param_id, row);
    }
  }
  return [...byParam.values()].sort((a, b) => a.siloe_param_id - b.siloe_param_id);
}
