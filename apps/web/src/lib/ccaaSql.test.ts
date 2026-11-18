import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CCAA,
  CCAA_ALIASES,
  CCAA_CODES,
  PROVINCES,
  ccaaFromProvinceName,
  ccaaFromText,
  foldPlace,
} from '@piscinas/shared';

/**
 * The pool_ccaa_code migration backfills with its own copy of the province and name tables.
 * This keeps that copy equal to packages/shared/src/territory/ccaa.ts, so a pool gets the same
 * community from the backfill as from the form.
 */
const SQL = readFileSync(
  join(__dirname, '../../../../supabase/migrations/20261113120000_pool_ccaa_code.sql'),
  'utf8',
);

/** The `('a', 'XX')` pairs of the VALUES list in one function's body. */
function pairs(fn: string): [string, string][] {
  const start = SQL.indexOf(`create function public.${fn}(`);
  const body = SQL.slice(start, SQL.indexOf('$$;', start));
  return [...body.matchAll(/\('([^']+)', '([A-Z]{2})'\)/g)].map((m) => [m[1]!, m[2]!]);
}

describe('pool_ccaa_code migration matches the territory tables', () => {
  it('the check constraint lists exactly the 19 codes', () => {
    const check = /pool_ccaa_code_check[\s\S]*?in \(([^)]*)\)/.exec(SQL)![1]!;
    expect(check.match(/[A-Z]{2}/g)).toEqual(CCAA_CODES);
  });

  it('every province prefix maps to the same community', () => {
    const sql = Object.fromEntries(pairs('ccaa_from_postcode'));
    expect(sql).toEqual(Object.fromEntries(Object.entries(PROVINCES).map(([k, v]) => [k, v.ccaa])));
  });

  it('every province name maps to the same community', () => {
    const sql = pairs('ccaa_from_province');
    const expected = Object.values(PROVINCES).flatMap((p) =>
      p.names.map((n) => [foldPlace(n), p.ccaa] as [string, string]),
    );
    expect(new Map(sql)).toEqual(new Map(expected));
    for (const [name, code] of sql) expect(ccaaFromProvinceName(name), name).toBe(code);
  });

  it('every community name and alias maps to the same community', () => {
    const sql = pairs('ccaa_from_text');
    const expected = new Map<string, string>([
      ...CCAA_CODES.map((c) => [foldPlace(CCAA[c]), c] as [string, string]),
      ...Object.entries(CCAA_ALIASES),
    ]);
    expect(new Map(sql)).toEqual(expected);
    for (const [name, code] of sql) expect(ccaaFromText(name), name).toBe(code);
  });
});
