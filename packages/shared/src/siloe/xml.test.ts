import { describe, expect, it } from 'vitest';
import {
  buildAnnualResultsXml,
  formatSpanishDate,
  validateAnnualResults,
  type XmlMuestreo,
} from './xml.js';

const valid: XmlMuestreo = {
  codSeguridad: '12345678',
  annio: '2025',
  laboratorio: '123',
  mvasos: [
    {
      codV: '100',
      cInicial: 2,
      cRutina: 4,
      cPeriodico: 4,
      idPm: 2,
      idTipoAnalisis: 1,
      fechaA: '15/05/2025',
      fechaC: '15/09/2025',
      numDiasAp: 120,
      parametros: [
        {
          idParametro: 1,
          diasNc: 1,
          deter: 5,
          deterC: 4,
          idLugar: 1,
          idMetodo: 2,
          vcMed: 7.5,
          vcMin: 7.2,
          vcMax: 8.0,
        },
      ],
    },
  ],
};

describe('formatSpanishDate', () => {
  it('formats as dd/mm/yyyy', () => {
    expect(formatSpanishDate(new Date(2025, 4, 9))).toBe('09/05/2025');
  });
});

describe('buildAnnualResultsXml', () => {
  it('produces the expected element structure', () => {
    const xml = buildAnnualResultsXml([valid]);
    expect(xml).toContain('<muestreos');
    expect(xml).toContain('<cod_seguridad>12345678</cod_seguridad>');
    expect(xml).toContain('<id_parametro>1</id_parametro>');
    expect(xml).toContain('<vc_med>7.5</vc_med>');
    expect(xml).toContain('<numdiasAp>120</numdiasAp>');
    expect(xml).toContain('</muestreos>');
  });

  it('escapes special characters', () => {
    const xml = buildAnnualResultsXml([{ ...valid, observaciones: 'a & b < c' }]);
    expect(xml).toContain('<observaciones>a &amp; b &lt; c</observaciones>');
  });
});

describe('validateAnnualResults', () => {
  it('passes a valid document (current year 2026 → data year 2025)', () => {
    expect(validateAnnualResults([valid], { currentYear: 2026 })).toHaveLength(0);
  });

  it('flags wrong year, deter_c>deter, and vc_max<vc_min', () => {
    const bad: XmlMuestreo = {
      ...valid,
      annio: '2026',
      mvasos: [
        {
          ...valid.mvasos[0],
          parametros: [
            {
              idParametro: 1,
              diasNc: 0,
              deter: 2,
              deterC: 5,
              idLugar: 1,
              idMetodo: 2,
              vcMed: 7,
              vcMin: 8,
              vcMax: 6,
            },
          ],
        },
      ],
    };
    const codes = validateAnnualResults([bad], { currentYear: 2026 }).map((e) => e.code);
    expect(codes).toContain('201'); // wrong year
    expect(codes).toContain('236'); // deter_c > deter
    expect(codes).toContain('206'); // vc_max < vc_min
  });

  it('flags a missing laboratory code', () => {
    const codes = validateAnnualResults([{ ...valid, laboratorio: '' }], { currentYear: 2026 }).map(
      (e) => e.code,
    );
    expect(codes).toContain('207');
  });
});
