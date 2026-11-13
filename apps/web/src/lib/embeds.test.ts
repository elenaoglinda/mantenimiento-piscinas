import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every tenant foreign key is composite (`x_id, org_id`). PostgREST only resolves those embeds
 * by table name plus constraint hint (`client!pool_client_id_org_id_fkey(name)`). Naming the
 * column instead (`client:client_id!pool_client_id_org_id_fkey(name)`) fails with PGRST200 and
 * the request returns no rows: that bug showed "0 piscinas activas" on the live dashboard.
 *
 * Source scan, because the failure is silent at runtime wherever errors aren't read, and the
 * ui checks only cover pages they visit.
 */
const SRC = join(__dirname, '..');
const BAD_EMBED = /\b\w+_id!\w+_org_id_fkey\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const skip = name.endsWith('database.types.ts') || name === 'embeds.test.ts';
    return /\.(ts|tsx)$/.test(name) && !skip ? [path] : [];
  });
}

describe('Supabase embeds', () => {
  it('never name a composite-key column (PostgREST rejects them)', () => {
    const hits = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(BAD_EMBED)].map(
        (m) => `${relative(SRC, file)}: ${m[0]}`,
      ),
    );
    expect(hits).toEqual([]);
  });

  it('the pattern catches the form that broke the dashboard', () => {
    const broken = "select('id, client:client_id!pool_client_id_org_id_fkey(name)')";
    const fixed = "select('id, client!pool_client_id_org_id_fkey(name)')";
    expect(broken.match(BAD_EMBED)).toHaveLength(1);
    expect(fixed.match(BAD_EMBED)).toBeNull();
  });
});
