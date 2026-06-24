/**
 * Traffic-light evaluation engine for measured water/air parameters.
 *
 * `compliant` follows the legal range (RD 742/2013, per-CCAA overrides). `status` adds an
 * amber UX band: a configurable safety margin near the legal limits. Used identically in the
 * report form, dashboards and annual aggregation. See docs/technical-spec.md §10.
 */

export type ParameterStatus = 'green' | 'amber' | 'red' | 'unknown';

/**
 * Threshold definition for a parameter (mirrors the `parameter_def` DB row).
 * Any bound may be null (open-ended). The amber band is derived from warn bounds; if no warn
 * bounds are provided it falls back to `warnMarginRatio` of the ok range near each limit.
 */
export interface ParameterDef {
  /** Lower legal-compliant bound (inclusive). null = no lower bound. */
  minOk: number | null;
  /** Upper legal-compliant bound (inclusive). null = no upper bound. */
  maxOk: number | null;
  /** Below this → red regardless of warn band (e.g. forces basin closure). */
  closureMin?: number | null;
  /** Above this → red regardless of warn band. */
  closureMax?: number | null;
  /** Explicit lower amber threshold. Optional. */
  minWarn?: number | null;
  /** Explicit upper amber threshold. Optional. */
  maxWarn?: number | null;
  /** Fallback amber band as a fraction of the ok-range width. Default 0.1 (10%). */
  warnMarginRatio?: number;
}

export interface EvaluationResult {
  status: ParameterStatus;
  /** True when the value is within the legal compliant range. */
  compliant: boolean;
}

const DEFAULT_WARN_MARGIN = 0.1;

/**
 * Evaluate a measured value against its parameter definition.
 * Returns `unknown`/non-compliant only when value is not finite.
 */
export function evaluate(value: number | null | undefined, def: ParameterDef): EvaluationResult {
  if (value == null || !Number.isFinite(value)) {
    return { status: 'unknown', compliant: false };
  }

  const belowOk = def.minOk != null && value < def.minOk;
  const aboveOk = def.maxOk != null && value > def.maxOk;
  const compliant = !belowOk && !aboveOk;

  // Hard closure limits → always red.
  if (
    (def.closureMin != null && value < def.closureMin) ||
    (def.closureMax != null && value > def.closureMax)
  ) {
    return { status: 'red', compliant: false };
  }

  if (!compliant) {
    return { status: 'red', compliant: false };
  }

  // Compliant: decide green vs amber using warn bounds (explicit or derived margin).
  const margin = def.warnMarginRatio ?? DEFAULT_WARN_MARGIN;
  const rangeWidth = def.minOk != null && def.maxOk != null ? def.maxOk - def.minOk : null;

  const lowerWarn =
    def.minWarn ??
    (def.minOk != null && rangeWidth != null ? def.minOk + rangeWidth * margin : null);
  const upperWarn =
    def.maxWarn ??
    (def.maxOk != null && rangeWidth != null ? def.maxOk - rangeWidth * margin : null);

  const nearLower = lowerWarn != null && value < lowerWarn;
  const nearUpper = upperWarn != null && value > upperWarn;

  return { status: nearLower || nearUpper ? 'amber' : 'green', compliant: true };
}
