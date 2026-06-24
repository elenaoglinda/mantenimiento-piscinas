import { describe, expect, it } from 'vitest';
import { aggregateParameter, type DailyMeasurement } from './aggregate.js';

describe('aggregateParameter', () => {
  // The worked pH example from the Anexo manual (range 7.2–8.0).
  const phReadings: DailyMeasurement[] = [
    { day: '2015-06-01', value: 7.2, compliant: true },
    { day: '2015-07-01', value: 6.0, compliant: false },
    { day: '2015-07-01', value: 8.0, compliant: true },
    { day: '2015-08-01', value: 7.5, compliant: true },
  ];

  it('uses daily means for vc_med (manual example → 7.23)', () => {
    const a = aggregateParameter(phReadings);
    // daily means: 7.2, (6.0+8.0)/2=7.0, 7.5 → mean 7.2333 → 7.23
    expect(a.vcMed).toBe(7.23);
  });

  it('counts total and compliant determinations', () => {
    const a = aggregateParameter(phReadings);
    expect(a.deter).toBe(4);
    expect(a.deterC).toBe(3);
  });

  it('reports min/max across all readings', () => {
    const a = aggregateParameter(phReadings);
    expect(a.vcMin).toBe(6.0);
    expect(a.vcMax).toBe(8.0);
  });

  it('counts distinct non-compliant days, not readings', () => {
    const a = aggregateParameter(phReadings);
    expect(a.diasNc).toBe(1);
  });

  it('handles an empty set', () => {
    expect(aggregateParameter([])).toEqual({
      deter: 0,
      deterC: 0,
      diasNc: 0,
      vcMed: null,
      vcMin: null,
      vcMax: null,
    });
  });
});
