import { describe, expect, it } from 'vitest';
import {
  WATER_EXTRACTION_FIELDS,
  buildExtractionSystemPrompt,
  hasAnyReading,
  parseExtraction,
} from './photoImport.js';

/** A realistic, fully-populated extractor response. */
const validResponse = JSON.stringify({
  date: '2026-07-07',
  date_confidence: 'full',
  pool_name_hint: 'Piscina Comunidad Les Flors',
  readings: {
    ph: 7.5,
    cloro_libre_mg_l: 1.4,
    cloro_combinado_mg_l: 0.2,
    temperatura_agua_c: 26,
    turbidez_unf: 0.3,
  },
  notes_suggestion: 'Añadido hipoclorito 2L',
  extraction_confidence: 'high',
  low_confidence_fields: [],
});

describe('WATER_EXTRACTION_FIELDS', () => {
  it('covers exactly the 13 water parameters (SILOE ids 1-13), no air params', () => {
    expect(WATER_EXTRACTION_FIELDS).toHaveLength(13);
    expect(WATER_EXTRACTION_FIELDS.map((f) => f.siloeParamId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('has unique, stable JSON keys', () => {
    const keys = WATER_EXTRACTION_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildExtractionSystemPrompt', () => {
  it('lists every parameter key and Spanish label so the prompt cannot drift', () => {
    const prompt = buildExtractionSystemPrompt();
    for (const field of WATER_EXTRACTION_FIELDS) {
      expect(prompt).toContain(`"${field.key}"`);
      expect(prompt).toContain(field.nameEs);
    }
  });

  it('does not ask for air parameters', () => {
    const prompt = buildExtractionSystemPrompt();
    expect(prompt).not.toContain('CO2');
    expect(prompt).not.toContain('Humedad');
  });
});

describe('parseExtraction', () => {
  it('parses a valid response and normalises every field', () => {
    const result = parseExtraction(validResponse);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.date).toBe('2026-07-07');
    expect(result.data.dateConfidence).toBe('full');
    expect(result.data.poolNameHint).toBe('Piscina Comunidad Les Flors');
    expect(result.data.readings.ph).toBe(7.5);
    expect(result.data.readings.cloro_libre_mg_l).toBe(1.4);
    expect(result.data.notesSuggestion).toBe('Añadido hipoclorito 2L');
    expect(result.data.extractionConfidence).toBe('high');
  });

  it('always returns every catalogue key, null for ones not on the form', () => {
    const result = parseExtraction(validResponse);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const field of WATER_EXTRACTION_FIELDS) {
      expect(result.data.readings).toHaveProperty(field.key);
    }
    // Present in the catalogue but absent from the response above.
    expect(result.data.readings.legionella_ufc_l).toBeNull();
  });

  it('strips markdown code fences the model may add anyway', () => {
    const fenced = '```json\n' + validResponse + '\n```';
    const result = parseExtraction(fenced);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readings.ph).toBe(7.5);
  });

  it('rejects non-JSON and non-object payloads instead of throwing', () => {
    expect(parseExtraction('No pude leer la foto, lo siento.')).toEqual({
      ok: false,
      error: 'not_json',
    });
    expect(parseExtraction('[1,2,3]')).toEqual({ ok: false, error: 'not_an_object' });
    expect(parseExtraction('"just a string"')).toEqual({ ok: false, error: 'not_an_object' });
  });

  it('nulls any reading that is not a finite number — never guesses from text', () => {
    const raw = JSON.stringify({
      readings: { ph: '7.5', cloro_libre_mg_l: null, turbidez_unf: 'ilegible', redox_mv: 650 },
      extraction_confidence: 'medium',
    });
    const result = parseExtraction(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A numeric *string* is not trusted — the technician must type it.
    expect(result.data.readings.ph).toBeNull();
    expect(result.data.readings.turbidez_unf).toBeNull();
    expect(result.data.readings.redox_mv).toBe(650);
  });

  it('drops reading keys that are not in the catalogue', () => {
    const raw = JSON.stringify({
      readings: { ph: 7.2, co2_ppm: 400, made_up_field: 1 },
      extraction_confidence: 'high',
    });
    const result = parseExtraction(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readings.ph).toBe(7.2);
    expect(result.data.readings).not.toHaveProperty('co2_ppm');
    expect(result.data.readings).not.toHaveProperty('made_up_field');
  });

  it('falls back to the most cautious confidence when missing or invalid', () => {
    const missing = parseExtraction(JSON.stringify({ readings: {} }));
    expect(missing.ok && missing.data.extractionConfidence).toBe('low');
    const invalid = parseExtraction(JSON.stringify({ extraction_confidence: 'excellent' }));
    expect(invalid.ok && invalid.data.extractionConfidence).toBe('low');
  });

  it('rejects malformed dates and clears the date confidence with them', () => {
    const raw = JSON.stringify({ date: '07/07/2026', date_confidence: 'full', readings: {} });
    const result = parseExtraction(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.date).toBeNull();
    expect(result.data.dateConfidence).toBeNull();
  });

  it('keeps a partial date but flags it', () => {
    const raw = JSON.stringify({ date: '2026-07-01', date_confidence: 'partial', readings: {} });
    const result = parseExtraction(raw);
    expect(result.ok && result.data.dateConfidence).toBe('partial');
  });

  it('filters low_confidence_fields to known keys and de-duplicates', () => {
    const raw = JSON.stringify({
      readings: {},
      low_confidence_fields: ['ph', 'ph', 'date', 'nonsense_field', 42, 'pool_name'],
    });
    const result = parseExtraction(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lowConfidenceFields).toEqual(['date', 'ph', 'pool_name']);
  });

  it('tolerates a missing readings object entirely', () => {
    const result = parseExtraction(JSON.stringify({ extraction_confidence: 'low' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.readings)).toHaveLength(13);
    expect(hasAnyReading(result.data)).toBe(false);
  });
});

describe('hasAnyReading', () => {
  it('distinguishes a usable extraction from an empty one', () => {
    const withValues = parseExtraction(validResponse);
    expect(withValues.ok && hasAnyReading(withValues.data)).toBe(true);

    const empty = parseExtraction(JSON.stringify({ readings: { ph: null } }));
    expect(empty.ok && hasAnyReading(empty.data)).toBe(false);
  });
});
