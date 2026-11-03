import { isSiloeParameter } from '@piscinas/shared';
import { supabase } from './supabase.js';
import { toDbFailure, type DbFailure } from './dbError.js';

/**
 * Readings outside the LEGAL range (stored status "red"), for the dashboard alerts and the
 * bell. Readings of parameters outside SILOÉ (alkalinity, hardness, salt, phosphates) only have
 * a recommended range, so they never raise a legal alert. Cross-cutting (dashboard + shell),
 * hence here rather than in a feature folder.
 */
export async function fetchLegalRedReadings(): Promise<{
  data: { report_id: string }[];
  failure: DbFailure | null;
}> {
  const [red, defs] = await Promise.all([
    supabase.from('measurement').select('report_id, parameter_def_id').eq('status', 'red'),
    // select('*'): works before and after the migration that adds in_siloe.
    supabase.from('parameter_def').select('*'),
  ]);
  const notSiloe = new Set((defs.data ?? []).filter((d) => !isSiloeParameter(d)).map((d) => d.id));
  return {
    data: (red.data ?? []).filter((m) => !notSiloe.has(m.parameter_def_id)),
    failure: toDbFailure(red.error) ?? toDbFailure(defs.error),
  };
}
