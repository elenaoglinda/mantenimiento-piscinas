import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase.js', () => ({ supabase: {} }));

const { ccaaToCode, poolRegion, resolveParameterDefs } = await import('./parameters.js');
type Row = Parameters<typeof resolveParameterDefs>[0][number];

const row = (siloe_param_id: number, ccaa: string | null, min_ok: number): Row =>
  ({ id: `${siloe_param_id}-${ccaa}`, siloe_param_id, ccaa, min_ok, active: true }) as Row;

describe('poolRegion', () => {
  it('prefers the community code, then the old text', () => {
    expect(poolRegion({ ccaa_code: 'CT', ccaa: 'Madrid' })).toBe('CT');
    expect(poolRegion({ ccaa_code: null, ccaa: 'Cataluña' })).toBe('Cataluña');
    // Before the migration the column isn't there at all.
    expect(poolRegion({ ccaa: 'Cataluña' })).toBe('Cataluña');
    expect(poolRegion({ ccaa_code: null, ccaa: null })).toBeNull();
    expect(poolRegion(null)).toBeNull();
  });
});

describe('ccaaToCode', () => {
  it('passes community codes through', () => {
    expect(ccaaToCode('CT')).toBe('CT');
    expect(ccaaToCode('AN')).toBe('AN');
  });

  it('keeps the old free-text rule for pools without a code', () => {
    expect(ccaaToCode('Cataluña')).toBe('CT');
    expect(ccaaToCode('catalunya')).toBe('CT');
    expect(ccaaToCode('Madrid')).toBeNull();
    expect(ccaaToCode('')).toBeNull();
    expect(ccaaToCode(null)).toBeNull();
  });
});

describe('resolveParameterDefs', () => {
  const rows = [row(1, null, 0.5), row(1, 'CT', 1), row(2, null, 7.2)];

  it('a pool coded CT gets the Cataluña override', () => {
    const defs = resolveParameterDefs(rows, poolRegion({ ccaa_code: 'CT', ccaa: null }));
    expect(defs.map((d) => d.min_ok)).toEqual([1, 7.2]);
  });

  it('a pool coded elsewhere, or not at all, gets the national values', () => {
    expect(resolveParameterDefs(rows, 'AN').map((d) => d.min_ok)).toEqual([0.5, 7.2]);
    expect(resolveParameterDefs(rows, null).map((d) => d.min_ok)).toEqual([0.5, 7.2]);
  });
});
