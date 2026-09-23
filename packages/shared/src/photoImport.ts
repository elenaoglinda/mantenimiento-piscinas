/**
 * Photo import — extracting water-quality readings from a photographed paper parte.
 *
 * Framework-agnostic and pure: the prompt is built from the same parameter catalogue the
 * result is mapped back onto, and `parseExtraction` is total (never throws) so the UI can
 * always render something. The network call itself lives in `/api/extract-reading`; this
 * module owns the contract and the validation of whatever comes back.
 *
 * Scope is deliberately WATER ONLY (SILOE ids 1-13). The air parameters (14-16) are not part
 * of the annual-results export, so they are not extracted.
 *
 * Nothing here trusts the model: every field is validated, unknown keys are dropped, and any
 * value that is not a finite number becomes null so a technician fills it in by hand.
 */

/** A water parameter we ask the extractor to read, tied to its SILOE id in `parameter_def`. */
export interface WaterExtractionField {
  /** `parameter_def.siloe_param_id` — the join key back onto the app's thresholds. */
  siloeParamId: number;
  /** Stable JSON key used in the extractor contract (never translated, never reordered). */
  key: string;
  /** Spanish label as seeded in `parameter_def.name_es`, shown to the model for recognition. */
  nameEs: string;
  /** Unit hint given to the model; null where the parameter is unitless. */
  unit: string | null;
}

/**
 * The 13 water parameters of RD 742/2013 as seeded in `parameter_def`.
 * Order follows SILOE id order, which is also the order the report form renders.
 */
export const WATER_EXTRACTION_FIELDS: readonly WaterExtractionField[] = [
  { siloeParamId: 1, key: 'ph', nameEs: 'pH', unit: 'pH' },
  { siloeParamId: 2, key: 'redox_mv', nameEs: 'Potencial REDOX', unit: 'mV' },
  { siloeParamId: 3, key: 'temperatura_agua_c', nameEs: 'Temperatura del agua', unit: '°C' },
  {
    siloeParamId: 4,
    key: 'tiempo_recirculacion_horas',
    nameEs: 'Tiempo de recirculación',
    unit: 'horas',
  },
  { siloeParamId: 5, key: 'transparencia', nameEs: 'Transparencia', unit: null },
  { siloeParamId: 6, key: 'turbidez_unf', nameEs: 'Turbidez', unit: 'UNF' },
  { siloeParamId: 7, key: 'acido_isocianurico_mg_l', nameEs: 'Ácido isocianúrico', unit: 'mg/L' },
  { siloeParamId: 8, key: 'bromo_total_mg_l', nameEs: 'Bromo total', unit: 'mg/L' },
  {
    siloeParamId: 9,
    key: 'cloro_combinado_mg_l',
    nameEs: 'Cloro combinado residual',
    unit: 'mg/L',
  },
  { siloeParamId: 10, key: 'cloro_libre_mg_l', nameEs: 'Cloro libre residual', unit: 'mg/L' },
  { siloeParamId: 11, key: 'e_coli_ufc_100ml', nameEs: 'E. coli', unit: 'UFC/100ml' },
  { siloeParamId: 12, key: 'legionella_ufc_l', nameEs: 'Legionella sp', unit: 'UFC/L' },
  { siloeParamId: 13, key: 'p_aeruginosa_ufc_100ml', nameEs: 'P. aeruginosa', unit: 'UFC/100ml' },
];

export type ExtractionConfidence = 'high' | 'medium' | 'low';
export type DateConfidence = 'full' | 'partial';

/** Non-reading fields the extractor may flag as uncertain, alongside the parameter keys. */
export const NON_READING_FIELD_KEYS = ['date', 'pool_name'] as const;

/** A validated, normalised extraction result. Every reading key is always present. */
export interface ReadingExtraction {
  /** Visit date as 'YYYY-MM-DD', or null when absent/illegible/malformed. */
  date: string | null;
  dateConfidence: DateConfidence | null;
  /** Pool name as written on the form — a hint for the technician, never auto-matched. */
  poolNameHint: string | null;
  /** Parameter key -> value. Null means "not on the form, or unreadable". */
  readings: Record<string, number | null>;
  /** Free text the model read as incidents / chemicals added, for the notes field. */
  notesSuggestion: string | null;
  extractionConfidence: ExtractionConfidence;
  /** Field keys the model was unsure about; the UI highlights these for verification. */
  lowConfidenceFields: string[];
}

export type ParseExtractionResult =
  | { ok: true; data: ReadingExtraction }
  | { ok: false; error: 'not_json' | 'not_an_object' };

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];
const DATE_CONFIDENCES: readonly string[] = ['full', 'partial'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Guards against a runaway model response bloating a DB row or the UI. */
const MAX_TEXT_LEN = 2000;

/** The system prompt, generated from the catalogue so it can never drift out of sync. */
export function buildExtractionSystemPrompt(): string {
  const fieldLines = WATER_EXTRACTION_FIELDS.map(
    (f) => `- "${f.key}": ${f.nameEs}${f.unit ? ` (${f.unit})` : ''}`,
  ).join('\n');

  return `Eres un asistente de extracción de datos para una plataforma española de mantenimiento de piscinas (RD 742/2013).

Tu tarea es leer una foto de un parte de control de piscina, manuscrito o impreso, y extraer las lecturas de calidad del agua.

Los rótulos pueden aparecer en español, catalán o abreviados. Extrae ÚNICAMENTE estos parámetros de agua, usando exactamente estas claves JSON:
${fieldLines}

Reglas:
- Devuelve SOLO un objeto JSON válido. Sin explicación, sin preámbulo, sin markdown.
- Todos los valores de "readings" deben ser números decimales o null. Nunca texto.
- Si un valor no aparece, es ilegible o no estás seguro de la cifra, devuelve null. No adivines.
- Usa punto decimal (7.4), no coma.
- "date": fecha de la visita en formato YYYY-MM-DD, o null. Si sólo es parcialmente legible, haz tu mejor estimación e indica "date_confidence": "partial"; si es totalmente clara, "full".
- "pool_name_hint": el nombre de la piscina o comunidad tal como aparece escrito, o null.
- "notes_suggestion": texto libre de incidencias o productos químicos añadidos que aparezca en el parte, o null.
- "extraction_confidence": "high", "medium" o "low" según la legibilidad general de la foto.
- "low_confidence_fields": array con las claves de los campos de los que no estés seguro (por ejemplo ["ph", "date"]). Array vacío si estás seguro de todo.

Formato exacto de respuesta:
{"date": "YYYY-MM-DD"|null, "date_confidence": "full"|"partial"|null, "pool_name_hint": string|null, "readings": { ...todas las claves anteriores... }, "notes_suggestion": string|null, "extraction_confidence": "high"|"medium"|"low", "low_confidence_fields": [string]}`;
}

export const EXTRACTION_USER_PROMPT =
  'Extrae las lecturas de calidad del agua de esta foto del parte de piscina.';

/** Strip ```json fences some models add despite being told not to. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

function asCleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LEN);
}

/** Only finite numbers survive; strings (even numeric ones) are rejected as unverified. */
function asReading(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Validate and normalise whatever the extractor returned. Total: never throws, and always
 * yields every reading key so callers can iterate the catalogue without null-checking shape.
 */
export function parseExtraction(rawText: string): ParseExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    return { ok: false, error: 'not_json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'not_an_object' };
  }

  const raw = parsed as Record<string, unknown>;
  const rawReadings =
    typeof raw.readings === 'object' && raw.readings !== null && !Array.isArray(raw.readings)
      ? (raw.readings as Record<string, unknown>)
      : {};

  // Build from the catalogue, so unknown keys the model invented are dropped.
  const readings: Record<string, number | null> = {};
  for (const field of WATER_EXTRACTION_FIELDS) {
    readings[field.key] = asReading(rawReadings[field.key]);
  }

  const dateValue = asCleanString(raw.date);
  const date = dateValue && ISO_DATE.test(dateValue) ? dateValue : null;

  const rawDateConfidence = asCleanString(raw.date_confidence);
  const dateConfidence =
    date && rawDateConfidence && DATE_CONFIDENCES.includes(rawDateConfidence)
      ? (rawDateConfidence as DateConfidence)
      : null;

  const rawConfidence = asCleanString(raw.extraction_confidence);
  // Default to the most cautious value when the model omits or mangles it.
  const extractionConfidence: ExtractionConfidence =
    rawConfidence && CONFIDENCES.includes(rawConfidence)
      ? (rawConfidence as ExtractionConfidence)
      : 'low';

  const knownKeys = new Set<string>([
    ...WATER_EXTRACTION_FIELDS.map((f) => f.key),
    ...NON_READING_FIELD_KEYS,
  ]);
  const lowConfidenceFields = Array.isArray(raw.low_confidence_fields)
    ? [...new Set(raw.low_confidence_fields.filter((k): k is string => typeof k === 'string'))]
        .filter((k) => knownKeys.has(k))
        .sort()
    : [];

  return {
    ok: true,
    data: {
      date,
      dateConfidence,
      poolNameHint: asCleanString(raw.pool_name_hint),
      readings,
      notesSuggestion: asCleanString(raw.notes_suggestion),
      extractionConfidence,
      lowConfidenceFields,
    },
  };
}

/** True when the extractor found no usable reading at all — the UI warns instead of prefilling. */
export function hasAnyReading(extraction: ReadingExtraction): boolean {
  return Object.values(extraction.readings).some((v) => v !== null);
}
