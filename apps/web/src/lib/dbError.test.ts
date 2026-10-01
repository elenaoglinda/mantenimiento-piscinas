import { describe, expect, it } from 'vitest';
import { toDbFailure } from './dbError.js';
import type { PostgrestError } from '@supabase/supabase-js';

function err(code: string, message = 'boom'): PostgrestError {
  return { code, message, details: '', hint: '' } as PostgrestError;
}

describe('toDbFailure', () => {
  it('returns null when there is no error', () => {
    expect(toDbFailure(null)).toBeNull();
    expect(toDbFailure(undefined)).toBeNull();
  });

  it('recognises PGRST205 — the code that made the fiscal form silently fail', () => {
    // "Could not find the table 'public.billing_profile' in the schema cache": the app is
    // deployed ahead of its migration.
    expect(toDbFailure(err('PGRST205'))).toEqual({ code: 'missing_schema' });
  });

  it('recognises the Postgres-level equivalent too', () => {
    expect(toDbFailure(err('42P01'))).toEqual({ code: 'missing_schema' });
  });

  it('distinguishes a missing RPC from a missing table', () => {
    // issue_invoice / invoice_tax_breakdown fail this way, not as PGRST205.
    expect(toDbFailure(err('PGRST202'))).toEqual({ code: 'missing_function' });
    expect(toDbFailure(err('42883'))).toEqual({ code: 'missing_function' });
  });

  it('maps an RLS refusal to forbidden', () => {
    expect(toDbFailure(err('42501'))).toEqual({ code: 'forbidden' });
  });

  it('passes our own trigger messages through verbatim', () => {
    // These are raised in Spanish by invoice_guard_immutable and issue_invoice.
    const failure = toDbFailure(err('P0001', 'Una factura emitida es inmutable.'));
    expect(failure).toEqual({ code: 'rule', detail: 'Una factura emitida es inmutable.' });
  });

  it('keeps the detail for anything unrecognised rather than discarding it', () => {
    expect(toDbFailure(err('XX999', 'weird'))).toEqual({ code: 'unknown', detail: 'weird' });
  });
});
