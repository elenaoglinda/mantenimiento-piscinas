import { describe, expect, it } from 'vitest';
import { skipReason, stopCounts, stopEstado } from './stops.js';

describe('route stops', () => {
  it('treats a stop without a state as pending', () => {
    expect(stopEstado({})).toBe('pendiente');
    expect(stopEstado({ estado: null })).toBe('pendiente');
    expect(stopEstado({ estado: 'hecha' })).toBe('hecha');
  });
  it('needs a real reason to skip', () => {
    expect(skipReason('   ')).toBeNull();
    expect(skipReason('  Cliente   ausente ')).toBe('Cliente ausente');
    expect(skipReason('x'.repeat(300))).toHaveLength(200);
  });
  it('counts states', () => {
    expect(
      stopCounts([{ estado: 'hecha' }, {}, { estado: 'saltada' }, { estado: 'hecha' }]),
    ).toEqual({
      pendiente: 1,
      hecha: 2,
      saltada: 1,
    });
  });
});
