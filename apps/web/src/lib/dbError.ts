import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Turns a PostgREST/Postgres error into something a technician can act on.
 *
 * This exists because the invoicing module shipped once with every `error` ignored: a failed
 * write looked identical to a successful one, and the UI cheerfully reported "guardado" while
 * discarding the typing. Silence is the worst possible failure mode for a module that writes
 * legal records, so every call now goes through here.
 *
 * The schema-cache codes matter most in practice. PostgREST answers PGRST205 for a table it
 * cannot see and PGRST202 for a missing function — which is exactly what happens when the app
 * is deployed but the migration has not been applied yet. Reporting that precisely turns a
 * baffling empty form into a one-line instruction.
 */
export type DbErrorCode =
  | 'missing_schema'
  | 'missing_function'
  | 'forbidden'
  | 'duplicate'
  | 'rule'
  | 'unknown';

export interface DbFailure {
  code: DbErrorCode;
  /** Message straight from Postgres, used where our own triggers raise in Spanish. */
  detail?: string;
}

export function toDbFailure(error: PostgrestError | null | undefined): DbFailure | null {
  if (!error) return null;
  switch (error.code) {
    // Table missing, or present but not yet in PostgREST's schema cache.
    case 'PGRST205':
    case '42P01':
      return { code: 'missing_schema' };
    // RPC missing (issue_invoice / invoice_tax_breakdown).
    case 'PGRST202':
    case '42883':
      return { code: 'missing_function' };
    case '42501':
      return { code: 'forbidden' };
    case '23505':
      return { code: 'duplicate' };
    // raise exception from our own triggers and RPCs; the text is already Spanish.
    case 'P0001':
    case 'P0002':
      return { code: 'rule', detail: error.message };
    default:
      return { code: 'unknown', detail: error.message };
  }
}
