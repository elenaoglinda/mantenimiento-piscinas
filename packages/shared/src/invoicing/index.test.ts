import { describe, expect, it } from 'vitest';
import {
  amountToCents,
  breakdownToLineas,
  buildCreatePayload,
  centsToAmount,
  formatEuros,
  formatInvoiceNumber,
  isPendingLookup,
  isValidNif,
  madridToday,
  mapEstado,
  parseCreateResponse,
  toVerifactiDate,
  validateForSending,
  type BuildPayloadInput,
} from './index.js';

describe('money', () => {
  it('formats cents with exactly two decimals', () => {
    expect(centsToAmount(24200)).toBe('242.00');
    expect(centsToAmount(5)).toBe('0.05');
    expect(centsToAmount(0)).toBe('0.00');
    expect(centsToAmount(-150)).toBe('-1.50');
    expect(centsToAmount(100000000)).toBe('1000000.00');
  });

  it('parses both Spanish and plain decimal input', () => {
    expect(amountToCents('242.00')).toBe(24200);
    expect(amountToCents('242,00')).toBe(24200);
    expect(amountToCents('1.234,56')).toBe(123456);
    expect(amountToCents('1,234.56')).toBe(123456);
    expect(amountToCents(' 42 ')).toBe(4200);
  });

  it('rejects junk rather than guessing', () => {
    expect(amountToCents('')).toBeNull();
    expect(amountToCents('doce euros')).toBeNull();
    expect(amountToCents('12,,5')).toBeNull();
    expect(amountToCents('NaN')).toBeNull();
  });

  it('round-trips through the float-free path', () => {
    // 0.1 + 0.2 territory: the classic float failure must not appear.
    expect(centsToAmount(amountToCents('0.10')! + amountToCents('0.20')!)).toBe('0.30');
  });

  it('formats euros for display in Spanish', () => {
    expect(formatEuros(24200)).toBe('242,00 €');
  });
});

describe('dates', () => {
  it('converts ISO to the DD-MM-YYYY Verifacti expects', () => {
    expect(toVerifactiDate('2026-09-25')).toBe('25-09-2026');
    expect(toVerifactiDate('2026-01-02')).toBe('02-01-2026');
  });

  it('returns empty string for an unusable date instead of throwing', () => {
    expect(toVerifactiDate('not a date')).toBe('');
  });

  it('resolves today in Madrid, not UTC', () => {
    // 00:30 Madrid on 1 June is still 22:30 UTC on 31 May.
    expect(madridToday(new Date('2026-05-31T22:30:00Z'))).toBe('2026-06-01');
  });
});

describe('isValidNif', () => {
  it('accepts real CIFs', () => {
    expect(isValidNif('A15022510')).toBe(true); // Verifacti's own example
    expect(isValidNif('B75777847')).toBe(true); // the shared sandbox company
  });

  it('accepts a valid DNI and NIE', () => {
    expect(isValidNif('12345678Z')).toBe(true);
    expect(isValidNif('X1234567L')).toBe(true);
  });

  it('is tolerant of spacing and case', () => {
    expect(isValidNif(' a15022510 ')).toBe(true);
    expect(isValidNif('12345678-z')).toBe(true);
  });

  it('rejects a wrong control character', () => {
    expect(isValidNif('12345678A')).toBe(false);
    expect(isValidNif('A15022511')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidNif('')).toBe(false);
    expect(isValidNif('1234')).toBe(false);
    expect(isValidNif('ÑÑÑÑÑÑÑÑÑ')).toBe(false);
  });
});

const baseInput: BuildPayloadInput = {
  seriesCode: '2026',
  number: 7,
  issueDate: '2026-09-25',
  tipoFactura: 'F1',
  descripcion: 'Mantenimiento piscina septiembre',
  breakdown: [{ taxRate: 21, baseCents: 20000, quotaCents: 4200 }],
  totalCents: 24200,
  clientNif: 'A15022510',
  clientName: 'Comunidad Las Palomas',
};

describe('buildCreatePayload', () => {
  it('produces the exact shape the API accepted in the sandbox', () => {
    expect(buildCreatePayload(baseInput)).toEqual({
      serie: '2026',
      numero: '7',
      fecha_expedicion: '25-09-2026',
      tipo_factura: 'F1',
      descripcion: 'Mantenimiento piscina septiembre',
      lineas: [{ base_imponible: '200.00', tipo_impositivo: '21', cuota_repercutida: '42.00' }],
      importe_total: '242.00',
      nif: 'A15022510',
      nombre: 'Comunidad Las Palomas',
    });
  });

  it('omits the destinatario for a simplified invoice', () => {
    const payload = buildCreatePayload({ ...baseInput, tipoFactura: 'F2' });
    expect(payload.nif).toBeUndefined();
    expect(payload.nombre).toBeUndefined();
  });

  it('emits one linea per tax rate', () => {
    expect(
      breakdownToLineas([
        { taxRate: 21, baseCents: 20000, quotaCents: 4200 },
        { taxRate: 10, baseCents: 10000, quotaCents: 1000 },
      ]),
    ).toEqual([
      { base_imponible: '200.00', tipo_impositivo: '21', cuota_repercutida: '42.00' },
      { base_imponible: '100.00', tipo_impositivo: '10', cuota_repercutida: '10.00' },
    ]);
  });
});

describe('validateForSending', () => {
  it('passes a well-formed invoice', () => {
    expect(validateForSending(baseInput)).toEqual([]);
  });

  it('catches a total that disagrees with the lines', () => {
    expect(validateForSending({ ...baseInput, totalCents: 24300 })).toContain('total_mismatch');
  });

  it('requires a valid destinatario NIF for F1', () => {
    expect(validateForSending({ ...baseInput, clientNif: null })).toContain('missing_client_nif');
    expect(validateForSending({ ...baseInput, clientNif: 'A15022511' })).toContain(
      'invalid_client_nif',
    );
  });

  it('enforces the 3.000 € ceiling on simplified invoices', () => {
    const big = {
      ...baseInput,
      tipoFactura: 'F2' as const,
      breakdown: [{ taxRate: 21, baseCents: 300000, quotaCents: 63000 }],
      totalCents: 363000,
    };
    expect(validateForSending(big)).toContain('f2_over_limit');
  });

  it('rejects an empty or zero invoice', () => {
    const empty = { ...baseInput, breakdown: [], totalCents: 0 };
    expect(validateForSending(empty)).toEqual(
      expect.arrayContaining(['no_lines', 'non_positive_total']),
    );
  });
});

describe('parseCreateResponse', () => {
  it('reads the sandbox response', () => {
    expect(
      parseCreateResponse({
        estado: 'Pendiente',
        uuid: '99c8c767-59f1-4646-b605-c1b7362ce99b',
        url: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B75777847',
        qr: 'iVBORw0KGgo=',
        huella: 'C94ACAAEFE5947B8',
      }),
    ).toEqual({
      estado: 'Pendiente',
      uuid: '99c8c767-59f1-4646-b605-c1b7362ce99b',
      url: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B75777847',
      qr: 'iVBORw0KGgo=',
      huella: 'C94ACAAEFE5947B8',
    });
  });

  it('never throws on a surprising payload', () => {
    for (const junk of [null, undefined, 'text', 42, [], { qr: 5 }]) {
      expect(() => parseCreateResponse(junk)).not.toThrow();
    }
    expect(parseCreateResponse([]).uuid).toBeNull();
  });
});

describe('mapEstado', () => {
  it('treats Correcta as accepted', () => {
    expect(mapEstado('Correcta')).toBe('accepted');
    expect(mapEstado('AceptadaConErrores')).toBe('accepted');
  });

  it('treats Incorrecta as rejected', () => {
    expect(mapEstado('Incorrecta')).toBe('rejected');
  });

  it('keeps Pendiente in flight rather than calling it a failure', () => {
    expect(mapEstado('Pendiente')).toBe('sending');
  });

  it('defaults an unknown estado to in-flight, never to failed', () => {
    // A record may already exist at AEAT; guessing "failed" would invite a duplicate send.
    expect(mapEstado('algo-nuevo')).toBe('sending');
    expect(mapEstado(null)).toBe('sending');
  });
});

describe('isPendingLookup', () => {
  it('recognises the transient not-found window after create', () => {
    expect(isPendingLookup({ mensaje: 'Factura no encontrada' })).toBe(true);
  });

  it('does not mistake a real record for a pending one', () => {
    expect(isPendingLookup({ estado: 'Correcta' })).toBe(false);
    expect(isPendingLookup(null)).toBe(false);
  });
});

describe('formatInvoiceNumber', () => {
  it('pads to four digits', () => {
    expect(formatInvoiceNumber('2026', 7)).toBe('2026/0007');
    expect(formatInvoiceNumber('2026', 12345)).toBe('2026/12345');
  });

  it('shows a dash while the invoice is still a draft', () => {
    expect(formatInvoiceNumber('2026', null)).toBe('—');
  });
});
