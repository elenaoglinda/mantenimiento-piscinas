import { describe, expect, it } from 'vitest';
import {
  CCAA,
  CCAA_CODES,
  PROVINCES,
  ccaaFromPostcode,
  ccaaFromProvinceName,
  ccaaFromText,
  isCcaaCode,
  resolveCcaa,
} from './ccaa.js';

describe('Comunidades Autónomas', () => {
  it('lists the 17 communities and the two autonomous cities', () => {
    expect(CCAA_CODES).toHaveLength(19);
    expect(CCAA.CT).toBe('Cataluña');
  });

  it('every province 01–52 belongs to one community, and every community has a province', () => {
    const codes = Object.keys(PROVINCES).sort();
    expect(codes).toEqual(Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(new Set(Object.values(PROVINCES).map((p) => p.ccaa))).toEqual(new Set(CCAA_CODES));
  });

  it('isCcaaCode accepts only the 19 codes', () => {
    expect(isCcaaCode('CT')).toBe(true);
    expect(isCcaaCode('ct')).toBe(false);
    expect(isCcaaCode('ES')).toBe(false);
    expect(isCcaaCode(null)).toBe(false);
  });
});

describe('ccaaFromPostcode', () => {
  it.each(Object.entries(PROVINCES))('postcode %s001 → its community', (prov, { ccaa }) => {
    expect(ccaaFromPostcode(`${prov}001`)).toBe(ccaa);
  });

  it.each([
    ['08001', 'CT'],
    ['29602', 'AN'],
    ['51001', 'CE'],
    ['52001', 'ML'],
    [' 28013 ', 'MD'],
  ])('%s → %s', (cp, code) => {
    expect(ccaaFromPostcode(cp)).toBe(code);
  });

  it.each(['1234', '00123', '53001', '080011', 'ABCDE', '', null, undefined])('%s → null', (cp) => {
    expect(ccaaFromPostcode(cp)).toBeNull();
  });
});

describe('ccaaFromProvinceName', () => {
  it.each([
    ['Barcelona', 'CT'],
    ['barcelona', 'CT'],
    ['Lleida', 'CT'],
    ['Lérida', 'CT'],
    ['Girona', 'CT'],
    ['Málaga', 'AN'],
    ['malaga', 'AN'],
    ['A Coruña', 'GA'],
    ['Araba/Álava', 'PV'],
    ['Bizkaia', 'PV'],
    ['València', 'VC'],
    ['Illes Balears', 'IB'],
    ['Provincia de Sevilla', 'AN'],
    ['Santa Cruz de Tenerife', 'CN'],
  ])('%s → %s', (name, code) => {
    expect(ccaaFromProvinceName(name)).toBe(code);
  });

  it('every listed name resolves to its province community', () => {
    for (const { ccaa, names } of Object.values(PROVINCES)) {
      for (const n of names) expect(ccaaFromProvinceName(n), n).toBe(ccaa);
    }
  });

  it('unknown names → null', () => {
    expect(ccaaFromProvinceName('Marbella')).toBeNull();
    expect(ccaaFromProvinceName('')).toBeNull();
  });
});

describe('ccaaFromText (the old free-text field)', () => {
  it.each([
    ['Cataluña', 'CT'],
    ['Catalunya', 'CT'],
    ['CAT', 'CT'],
    ['CT', 'CT'],
    ['Barcelona', 'CT'],
    ['Andalucía', 'AN'],
    ['andalucia', 'AN'],
    ['Comunidad de Madrid', 'MD'],
    ['Madrid', 'MD'],
    ['Comunitat Valenciana', 'VC'],
    ['Comunidad Valenciana', 'VC'],
    ['Región de Murcia', 'MC'],
    ['País Vasco', 'PV'],
    ['Euskadi', 'PV'],
    ['Castilla y León', 'CL'],
    ['Castilla-La Mancha', 'CM'],
    ['Principado de Asturias', 'AS'],
    ['Comunidad Foral de Navarra', 'NC'],
  ])('%s → %s', (text, code) => {
    expect(ccaaFromText(text)).toBe(code);
  });

  it('every community name resolves to itself', () => {
    for (const code of CCAA_CODES) expect(ccaaFromText(CCAA[code])).toBe(code);
  });

  it.each(['España', 'xx', '', null])('%s → null', (text) => {
    expect(ccaaFromText(text)).toBeNull();
  });
});

describe('resolveCcaa', () => {
  it('the postcode wins over the province and the text', () => {
    expect(resolveCcaa({ cp: '08001', provincia: 'Málaga', ccaa: 'Madrid' })).toBe('CT');
  });

  it('then the province, then the text', () => {
    expect(resolveCcaa({ cp: null, provincia: 'Girona', ccaa: 'Madrid' })).toBe('CT');
    expect(resolveCcaa({ cp: '123', provincia: null, ccaa: 'Cataluña' })).toBe('CT');
  });

  it('a pool typed "Barcelona" with no address now resolves to Cataluña', () => {
    expect(resolveCcaa({ ccaa: 'Barcelona' })).toBe('CT');
  });

  it('nothing to go on → null', () => {
    expect(resolveCcaa({})).toBeNull();
    expect(resolveCcaa({ cp: '', provincia: '', ccaa: '' })).toBeNull();
  });
});
