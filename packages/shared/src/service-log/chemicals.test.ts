import { describe, expect, it } from 'vitest';
import {
  addProduct,
  chemicalRows,
  entriesFromRows,
  formatQuantity,
  parseQuantity,
  removeProduct,
  setQuantity,
  type ChemicalProduct,
} from './chemicals.js';

const cloro: ChemicalProduct = {
  id: 'p1',
  nombre: 'Cloro granulado',
  unidad: 'kg',
  cantidadHabitual: 0.5,
  activo: true,
};
const floc: ChemicalProduct = {
  id: 'p2',
  nombre: 'Floculante',
  unidad: 'L',
  cantidadHabitual: null,
  activo: true,
};

describe('quantities typed on a phone', () => {
  it('reads a decimal comma or point', () => {
    expect(parseQuantity('0,5')).toBe(0.5);
    expect(parseQuantity(' 1.25 ')).toBe(1.25);
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity(',5')).toBe(0.5);
  });
  it('rejects empty, zero, negative and junk', () => {
    for (const bad of ['', '0', '0,0', '-1', 'abc', '1,2,3', '1e3', '2 kg']) {
      expect(parseQuantity(bad)).toBeNull();
    }
  });
  it('formats in Spanish with the unit', () => {
    expect(formatQuantity(0.5, 'kg')).toBe('0,5 kg');
    expect(formatQuantity(2, 'pastillas')).toBe('2 pastillas');
    expect(formatQuantity(1, 'pastillas')).toBe('1 pastilla');
    expect(formatQuantity(1250, 'ml')).toBe('1250 ml');
  });
});

describe('quick-pick', () => {
  it('adds a product once, with its usual quantity prefilled', () => {
    const a = addProduct([], cloro);
    expect(a).toEqual([{ productId: 'p1', cantidad: '0,5', unidad: 'kg' }]);
    expect(addProduct(a, cloro)).toHaveLength(1);
    expect(addProduct(a, floc)[1]).toEqual({ productId: 'p2', cantidad: '', unidad: 'L' });
  });
  it('edits and removes', () => {
    const a = setQuantity(addProduct(addProduct([], cloro), floc), 'p2', '2');
    expect(a[1].cantidad).toBe('2');
    expect(removeProduct(a, 'p1').map((e) => e.productId)).toEqual(['p2']);
  });
  it('saves only real quantities and names the missing ones', () => {
    const entries = addProduct(addProduct([], cloro), floc);
    expect(chemicalRows(entries)).toEqual({
      rows: [{ product_id: 'p1', cantidad: 0.5, unidad: 'kg' }],
      invalid: ['p2'],
    });
  });
  it('round-trips saved rows', () => {
    expect(entriesFromRows([{ product_id: 'p1', cantidad: 1.5, unidad: 'kg' }])).toEqual([
      { productId: 'p1', cantidad: '1,5', unidad: 'kg' },
    ]);
  });
});
