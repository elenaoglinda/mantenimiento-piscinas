import { describe, expect, it } from 'vitest';
import { parseExtraction, type ReadingExtraction } from '@piscinas/shared';
import { mapExtractionToDefs } from './photoImport.js';
import type { ParameterDefRow } from './parameters.js';

/** Minimal parameter_def row; only the fields the mapper reads matter. */
function def(id: string, siloeParamId: number): ParameterDefRow {
  return {
    id,
    siloe_param_id: siloeParamId,
    ccaa: null,
    name_es: `param-${siloeParamId}`,
    unit: null,
    medium: 'water',
    min_ok: null,
    max_ok: null,
    min_warn: null,
    max_warn: null,
    closure_min: null,
    closure_max: null,
    warn_margin_ratio: 0.1,
    frequency: null,
    mandatory: true,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as ParameterDefRow;
}

function extractionFrom(payload: Record<string, unknown>): ReadingExtraction {
  const parsed = parseExtraction(JSON.stringify(payload));
  if (!parsed.ok) throw new Error('fixture should parse');
  return parsed.data;
}

const defs = [
  def('def-ph', 1), // pH
  def('def-temp', 3), // Temperatura del agua
  def('def-libre', 10), // Cloro libre residual
  def('def-ecoli', 11), // E. coli (lab)
];

describe('mapExtractionToDefs', () => {
  it('maps readings onto parameter_def rows by SILOE id', () => {
    const extraction = extractionFrom({
      readings: { ph: 7.4, cloro_libre_mg_l: 1.2 },
      extraction_confidence: 'high',
    });

    const { values } = mapExtractionToDefs(defs, extraction);
    expect(values['def-ph']).toEqual({ value: '7.4', lugar: 'in_situ' });
    expect(values['def-libre']).toEqual({ value: '1.2', lugar: 'in_situ' });
  });

  it('omits parameters the extractor did not read, leaving those inputs empty', () => {
    const extraction = extractionFrom({ readings: { ph: 7.4 }, extraction_confidence: 'high' });
    const { values } = mapExtractionToDefs(defs, extraction);
    expect(Object.keys(values)).toEqual(['def-ph']);
    expect(values['def-temp']).toBeUndefined();
  });

  it('defaults laboratory parameters to lugar="lab"', () => {
    const extraction = extractionFrom({
      readings: { e_coli_ufc_100ml: 0 },
      extraction_confidence: 'medium',
    });
    const { values } = mapExtractionToDefs(defs, extraction);
    expect(values['def-ecoli']).toEqual({ value: '0', lugar: 'lab' });
  });

  it('keeps a zero reading rather than dropping it as falsy', () => {
    const extraction = extractionFrom({
      readings: { cloro_libre_mg_l: 0 },
      extraction_confidence: 'low',
    });
    const { values } = mapExtractionToDefs(defs, extraction);
    expect(values['def-libre']).toEqual({ value: '0', lugar: 'in_situ' });
  });

  it('translates low-confidence field keys into parameter_def ids for the UI badges', () => {
    const extraction = extractionFrom({
      readings: { ph: 7.4, cloro_libre_mg_l: 1.2 },
      low_confidence_fields: ['ph'],
      extraction_confidence: 'medium',
    });
    const { lowConfidenceDefIds } = mapExtractionToDefs(defs, extraction);
    expect(lowConfidenceDefIds.has('def-ph')).toBe(true);
    expect(lowConfidenceDefIds.has('def-libre')).toBe(false);
  });

  it('flags a low-confidence parameter even when its value was unreadable', () => {
    const extraction = extractionFrom({
      readings: { ph: null },
      low_confidence_fields: ['ph'],
      extraction_confidence: 'low',
    });
    const { values, lowConfidenceDefIds } = mapExtractionToDefs(defs, extraction);
    expect(values['def-ph']).toBeUndefined();
    expect(lowConfidenceDefIds.has('def-ph')).toBe(true);
  });

  it('ignores readings with no matching parameter_def for this pool', () => {
    const extraction = extractionFrom({
      readings: { ph: 7.4, legionella_ufc_l: 50 },
      extraction_confidence: 'high',
    });
    // `defs` has no SILOE id 12, so Legionella has nowhere to go.
    const { values } = mapExtractionToDefs(defs, extraction);
    expect(Object.keys(values)).toEqual(['def-ph']);
  });

  it('returns empty results for an extraction with nothing usable', () => {
    const extraction = extractionFrom({ readings: {}, extraction_confidence: 'low' });
    const { values, lowConfidenceDefIds } = mapExtractionToDefs(defs, extraction);
    expect(values).toEqual({});
    expect(lowConfidenceDefIds.size).toBe(0);
  });
});
