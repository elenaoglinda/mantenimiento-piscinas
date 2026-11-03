import { describe, expect, it } from 'vitest';
import { isExtraParamKey, isSiloeParameter, paramKey } from './params.js';

describe('parameters inside and outside SILOE', () => {
  it('keys SILOE parameters by their SILOE id', () => {
    expect(paramKey({ siloe_param_id: 10, in_siloe: true })).toBe(10);
    // Rows read before the in_siloe column existed are SILOE parameters.
    expect(paramKey({ siloe_param_id: 1 })).toBe(1);
    expect(isSiloeParameter({ siloe_param_id: 1 })).toBe(true);
  });
  it('keys the others from 101, and never as SILOE', () => {
    const sal = { siloe_param_id: null, in_siloe: false, clave: 'sal' };
    expect(paramKey(sal)).toBe(103);
    expect(isSiloeParameter(sal)).toBe(false);
    expect(isExtraParamKey(103)).toBe(true);
    expect(isExtraParamKey(16)).toBe(false);
    expect(paramKey({ siloe_param_id: null, in_siloe: false, clave: 'alcalinidad_total' })).toBe(
      101,
    );
    expect(paramKey({ siloe_param_id: null, in_siloe: false, clave: 'fosfatos' })).toBe(104);
  });
  it('ignores an unknown parameter outside SILOE, and a SILOE id flagged out', () => {
    expect(paramKey({ siloe_param_id: null, in_siloe: false, clave: 'cobre' })).toBeNull();
    expect(paramKey({ siloe_param_id: 7, in_siloe: false, clave: null })).toBeNull();
    expect(isSiloeParameter({ siloe_param_id: 7, in_siloe: false })).toBe(false);
  });
});
