/**
 * Aggregate per-visit measurements into the SILOE annual-result figures for one parameter,
 * over one bathing season. Rule (from the Anexo manual): if a parameter is measured several
 * times on the same day, average that day first, then take the season mean from the daily
 * means. See docs/technical-spec.md §5.2.
 */

export interface DailyMeasurement {
  /** Calendar day of the reading (YYYY-MM-DD); only the day is significant. */
  day: string;
  value: number;
  compliant: boolean;
}

export interface ParamAggregate {
  /** deter — total number of determinations (samplings). */
  deter: number;
  /** deter_c — number of compliant determinations. */
  deterC: number;
  /** dias_nc — distinct days with at least one non-compliant reading. */
  diasNc: number;
  /** vc_med — mean of the daily means, 2 decimals (null if no data). */
  vcMed: number | null;
  /** vc_min / vc_max — extremes across all readings. */
  vcMin: number | null;
  vcMax: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregateParameter(measurements: DailyMeasurement[]): ParamAggregate {
  if (measurements.length === 0) {
    return { deter: 0, deterC: 0, diasNc: 0, vcMed: null, vcMin: null, vcMax: null };
  }

  const deter = measurements.length;
  const deterC = measurements.filter((m) => m.compliant).length;

  let vcMin = measurements[0].value;
  let vcMax = measurements[0].value;
  for (const m of measurements) {
    if (m.value < vcMin) vcMin = m.value;
    if (m.value > vcMax) vcMax = m.value;
  }

  // Group by day for the daily-mean rule and the non-compliant-day count.
  const byDay = new Map<string, { sum: number; count: number; anyNc: boolean }>();
  for (const m of measurements) {
    const d = byDay.get(m.day) ?? { sum: 0, count: 0, anyNc: false };
    d.sum += m.value;
    d.count += 1;
    if (!m.compliant) d.anyNc = true;
    byDay.set(m.day, d);
  }

  const dailyMeans = [...byDay.values()].map((d) => d.sum / d.count);
  const vcMed = round2(dailyMeans.reduce((a, b) => a + b, 0) / dailyMeans.length);
  const diasNc = [...byDay.values()].filter((d) => d.anyNc).length;

  return { deter, deterC, diasNc, vcMed, vcMin: round2(vcMin), vcMax: round2(vcMax) };
}
