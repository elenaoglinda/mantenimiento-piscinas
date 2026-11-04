import {
  isSiloeParameter,
  hasAnyReading,
  parseExtraction,
  WATER_EXTRACTION_FIELDS,
  type ReadingExtraction,
} from '@piscinas/shared';
import { supabase } from './supabase.js';
import { isLabParameter, type ParameterDefRow } from './parameters.js';
import type { Enums } from './database.types.js';

/**
 * Client side of photo import: shrink the photo, send it to /api/extract-reading, and map the
 * validated result onto the pool's resolved `parameter_def` rows.
 *
 * Extraction never writes anything. It only prefills a form the technician must review — the
 * save path is the ordinary RLS-governed report insert.
 */

export type PhotoImportErrorCode =
  | 'unauthorized'
  | 'unavailable'
  | 'too_large'
  | 'unreadable'
  | 'failed';

export class PhotoImportError extends Error {
  constructor(readonly code: PhotoImportErrorCode) {
    super(code);
    this.name = 'PhotoImportError';
  }
}

/** Long edge cap: plenty for a handwritten A4 parte, and keeps cost/latency down. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export interface PreparedImage {
  base64: string;
  mediaType: string;
}

/**
 * Downscale to JPEG via canvas. Falls back to the original bytes when the browser cannot
 * decode the file (e.g. HEIC on some platforms) — the API then rejects unsupported types.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' };
  } catch {
    return { base64: await fileToBase64(file), mediaType: file.type || 'image/jpeg' };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export interface PhotoExtractionOutcome {
  extraction: ReadingExtraction;
  /** Model id reported by the endpoint, stored as provenance on the report. */
  model: string;
}

/** Send a photo for extraction. Throws PhotoImportError so the UI can message precisely. */
export async function extractFromPhoto(file: File): Promise<PhotoExtractionOutcome> {
  const { base64, mediaType } = await prepareImage(file);
  if (!base64) throw new PhotoImportError('failed');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new PhotoImportError('unauthorized');

  let resp: Response;
  try {
    resp = await fetch('/api/extract-reading', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: base64, mediaType }),
    });
  } catch {
    throw new PhotoImportError('failed');
  }

  if (!resp.ok) {
    if (resp.status === 401) throw new PhotoImportError('unauthorized');
    if (resp.status === 413) throw new PhotoImportError('too_large');
    if (resp.status === 503) throw new PhotoImportError('unavailable');
    throw new PhotoImportError('failed');
  }

  const payload = (await resp.json()) as { text?: string; model?: string };
  const parsed = parseExtraction(payload.text ?? '');
  if (!parsed.ok) throw new PhotoImportError('unreadable');
  if (!hasAnyReading(parsed.data)) throw new PhotoImportError('unreadable');

  return { extraction: parsed.data, model: payload.model ?? 'unknown' };
}

export interface MeasurementInput {
  value: string;
  lugar: Enums<'measurement_lugar'>;
}

export interface MappedExtraction {
  /** `parameter_def.id` -> prefilled input. Only parameters the extractor actually read. */
  values: Record<string, MeasurementInput>;
  /** `parameter_def.id`s the extractor flagged as uncertain, for verification badges. */
  lowConfidenceDefIds: Set<string>;
}

/**
 * Join extracted readings onto the pool's resolved parameter definitions via `siloe_param_id`.
 * Pure — the whole reason the extraction contract is keyed by SILOE id rather than free text.
 * Parameters the extractor did not read are simply absent, leaving their inputs empty.
 */
export function mapExtractionToDefs(
  defs: ParameterDefRow[],
  extraction: ReadingExtraction,
): MappedExtraction {
  // Only SILOE parameters: the extraction prompt never asks for the others.
  const defsBySiloeId = new Map(
    defs.filter(isSiloeParameter).map((d) => [d.siloe_param_id as number, d]),
  );
  const values: Record<string, MeasurementInput> = {};
  const lowConfidenceDefIds = new Set<string>();

  for (const field of WATER_EXTRACTION_FIELDS) {
    const def = defsBySiloeId.get(field.siloeParamId);
    if (!def) continue;

    const reading = extraction.readings[field.key];
    if (reading !== null && reading !== undefined) {
      values[def.id] = {
        value: String(reading),
        lugar: isLabParameter(def) ? 'lab' : 'in_situ',
      };
    }
    if (extraction.lowConfidenceFields.includes(field.key)) {
      lowConfidenceDefIds.add(def.id);
    }
  }

  return { values, lowConfidenceDefIds };
}
