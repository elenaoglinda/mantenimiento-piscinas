import { describe, expect, it } from 'vitest';
import { evaluate, type ParameterDef } from './evaluate.js';

// pH per RD 742/2013: ok 7.2–8.0, closure <6.0 or >9.0.
const pH: ParameterDef = {
  minOk: 7.2,
  maxOk: 8.0,
  closureMin: 6.0,
  closureMax: 9.0,
  warnMarginRatio: 0.15,
};

describe('evaluate', () => {
  it('returns unknown for missing/invalid values', () => {
    expect(evaluate(null, pH)).toEqual({ status: 'unknown', compliant: false });
    expect(evaluate(undefined, pH)).toEqual({ status: 'unknown', compliant: false });
    expect(evaluate(Number.NaN, pH)).toEqual({ status: 'unknown', compliant: false });
  });

  it('is green well inside the range', () => {
    expect(evaluate(7.6, pH)).toEqual({ status: 'green', compliant: true });
  });

  it('is amber near a legal bound but still compliant', () => {
    // range width 0.8, margin 0.15 -> lowerWarn 7.32, upperWarn 7.88
    expect(evaluate(7.25, pH)).toEqual({ status: 'amber', compliant: true });
    expect(evaluate(7.95, pH)).toEqual({ status: 'amber', compliant: true });
  });

  it('is red and non-compliant outside the legal range', () => {
    expect(evaluate(7.0, pH)).toEqual({ status: 'red', compliant: false });
    expect(evaluate(8.5, pH)).toEqual({ status: 'red', compliant: false });
  });

  it('respects hard closure limits', () => {
    expect(evaluate(5.5, pH)).toEqual({ status: 'red', compliant: false });
    expect(evaluate(9.5, pH)).toEqual({ status: 'red', compliant: false });
  });

  it('handles open-ended (max-only) parameters like combined chlorine', () => {
    const combinedCl: ParameterDef = { minOk: null, maxOk: 0.6 };
    expect(evaluate(0.3, combinedCl).compliant).toBe(true);
    expect(evaluate(0.9, combinedCl)).toEqual({ status: 'red', compliant: false });
  });
});
