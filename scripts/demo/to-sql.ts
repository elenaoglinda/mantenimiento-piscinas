/**
 * Prints the demo rows as SQL, so CI can load them into a real Postgres with every migration
 * and prove they satisfy the schema: foreign keys, check constraints and triggers that the
 * in-memory tests can't see. Also prints the wipe, in the same order the seed uses.
 *
 *   npx tsx scripts/demo/to-sql.ts insert <params.json> <today>   # rows (plus stub auth users)
 *   npx tsx scripts/demo/to-sql.ts wipe                             # what --reset deletes
 *
 * params.json: `select json_agg(...)` of the national parameter_def rows (see ci.yml).
 */
import { readFileSync } from 'node:fs';
import { paramKey } from '../../packages/shared/src/service-log/params.js';
import {
  DEMO_ORG_ID,
  DEMO_ORG_NAME,
  DEMO_TABLES,
  demoId,
  generateDemo,
  type DemoParamDef,
} from './generate.js';
import { TECHNICIANS } from './run.js';
import { WIPE_ORDER } from './supabaseStore.js';

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  // An untyped array literal, so Postgres casts it to the column's type (enum[] or text[]).
  if (Array.isArray(v))
    return lit(`{${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}`);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const [cmd, paramsFile, today] = process.argv.slice(2);

if (cmd === 'wipe') {
  for (const t of WIPE_ORDER)
    console.log(`delete from public.${t} where org_id = '${DEMO_ORG_ID}';`);
  console.log(`delete from public.org where id = '${DEMO_ORG_ID}';`);
} else if (cmd === 'insert' && paramsFile && today) {
  const raw = JSON.parse(readFileSync(paramsFile, 'utf8')) as Record<string, unknown>[];
  const params: DemoParamDef[] = raw.flatMap((d) => {
    const key = paramKey(
      d as { siloe_param_id: number | null; in_siloe?: boolean | null; clave?: string | null },
    );
    return key == null
      ? []
      : [
          {
            id: String(d.id),
            key,
            minOk: d.min_ok as number | null,
            maxOk: d.max_ok as number | null,
            minWarn: d.min_warn as number | null,
            maxWarn: d.max_warn as number | null,
            closureMin: d.closure_min as number | null,
            closureMax: d.closure_max as number | null,
            warnMarginRatio: (d.warn_margin_ratio as number | null) ?? undefined,
          },
        ];
  });
  const admin = {
    id: demoId('ci-admin'),
    email: 'demo@example.com',
    fullName: 'Administración (demo)',
  };
  const techs = TECHNICIANS.map((t, i) => ({ id: demoId(`ci-tech-${i}`), ...t }));
  const { data } = generateDemo({ today, admin, technicians: [techs[0]!, techs[1]!], params });
  console.log('begin;');
  for (const u of [admin, ...techs]) {
    console.log(`insert into auth.users (id) values ('${u.id}') on conflict do nothing;`);
  }
  for (const table of DEMO_TABLES) {
    for (const row of data[table]) {
      const cols = Object.keys(row);
      console.log(
        `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => lit(row[c])).join(', ')});`,
      );
    }
  }
  console.log(`update public.org set name = ${lit(DEMO_ORG_NAME)} where id = '${DEMO_ORG_ID}';`);
  console.log('commit;');
} else {
  console.error('Uso: to-sql.ts insert <params.json> <YYYY-MM-DD> | to-sql.ts wipe');
  process.exit(1);
}
