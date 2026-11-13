import { describe, expect, it } from 'vitest';
import { isActiveBasin, siloeReadiness, type ReadinessBasin } from './readiness.js';

const TODAY = '2026-11-13';
const vaso = (denominacion: string, code: string | null, fecha_baja: string | null = null) =>
  ({ denominacion, siloe_cod_v: code, fecha_baja }) satisfies ReadinessBasin;

describe('siloeReadiness', () => {
  it('is ready when the installation and every active vaso have codes', () => {
    const r = siloeReadiness(
      { siloe_cod_p: 'P-1' },
      [vaso('Grande', 'V-1'), vaso('Chapoteo', 'V-2')],
      TODAY,
    );
    expect(r).toEqual({
      ready: true,
      missingPoolCode: false,
      basinsMissingCode: [],
      noActiveBasins: false,
    });
  });

  it('is not ready when one active vaso has no code, even with the installation code (Arkana)', () => {
    const r = siloeReadiness(
      { siloe_cod_p: 'P-1' },
      [vaso('Grande', 'V-1'), vaso('Spa', null)],
      TODAY,
    );
    expect(r.ready).toBe(false);
    expect(r.missingPoolCode).toBe(false);
    expect(r.basinsMissingCode).toEqual(['Spa']);
  });

  it('is not ready without the installation code', () => {
    const r = siloeReadiness({ siloe_cod_p: null }, [vaso('Grande', 'V-1')], TODAY);
    expect(r.ready).toBe(false);
    expect(r.missingPoolCode).toBe(true);
    expect(r.basinsMissingCode).toEqual([]);
  });

  it('treats blank codes as missing', () => {
    const r = siloeReadiness({ siloe_cod_p: '  ' }, [vaso('Grande', '')], TODAY);
    expect(r.missingPoolCode).toBe(true);
    expect(r.basinsMissingCode).toEqual(['Grande']);
  });

  it('ignores retired vasos, including one retired today', () => {
    const r = siloeReadiness(
      { siloe_cod_p: 'P-1' },
      [vaso('Grande', 'V-1'), vaso('Antiguo', null, '2025-06-01'), vaso('Hoy', null, TODAY)],
      TODAY,
    );
    expect(r.ready).toBe(true);
  });

  it('counts a vaso retired in the future as active', () => {
    const r = siloeReadiness({ siloe_cod_p: 'P-1' }, [vaso('Temporal', null, '2026-11-14')], TODAY);
    expect(r.basinsMissingCode).toEqual(['Temporal']);
  });

  it('is not ready with no active vasos: there is nothing to report', () => {
    const r = siloeReadiness({ siloe_cod_p: 'P-1' }, [vaso('Antiguo', 'V-1', '2020-01-01')], TODAY);
    expect(r).toEqual({
      ready: false,
      missingPoolCode: false,
      basinsMissingCode: [],
      noActiveBasins: true,
    });
  });
});

describe('isActiveBasin', () => {
  it('is active the day before fecha_baja and retired on it', () => {
    expect(isActiveBasin({ fecha_baja: '2026-11-14' }, TODAY)).toBe(true);
    expect(isActiveBasin({ fecha_baja: TODAY }, TODAY)).toBe(false);
    expect(isActiveBasin({ fecha_baja: null }, TODAY)).toBe(true);
  });
});
