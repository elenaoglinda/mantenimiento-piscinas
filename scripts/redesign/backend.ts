import type { Page, Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, SUPABASE_HOST } from './target';

/**
 * A small in-memory stand-in for Supabase's REST API, enough for the end-to-end flow spec to
 * create a client, a pool, a basin and a report through the real UI and export SILOÉ.
 *
 * Unlike mock.ts (fixed fixtures for screenshots) this one keeps state: inserts, upserts,
 * updates and deletes change what later reads return. It implements the PostgREST subset the
 * app uses — eq/neq/gt/gte/lt/lte/in/is filters, order, limit, single-object responses, HEAD
 * counts, and embedded resources resolved by `<table>_id` foreign keys.
 */
export type Row = Record<string, unknown>;
export type Db = Record<string, Row[]>;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range, content-profile',
};

/** Column defaults from supabase/migrations, so inserted rows read back like real ones. */
const DEFAULTS: Record<string, Row> = {
  client: { is_self: false, archived: false },
  pool: { archived: false, agua_alimentacion: [] },
  basin: { tipo_vaso: [] },
  treatment: { details: {} },
  report: { status: 'draft' },
  chemical_product: { activo: true, orden: 0, cantidad_habitual: null },
  annual_result: { n_iniciales: 0, n_rutina: 0, n_periodicos: 0, punto_muestreo: 2 },
};

let seq = 0;
const newId = (table: string) => `${table}-${++seq}`;

// ── select parsing ────────────────────────────────────────────────────────────

interface Node {
  /** Key the value is returned under. */
  key: string;
  /** Column, or relation name for embeds. */
  name: string;
  /** Foreign-key hint after "!", e.g. report_technician_id_fkey. */
  hint?: string;
  children?: Node[];
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(s: string): Node[] {
  return splitTop(s).map((part) => {
    const open = part.indexOf('(');
    let head = open >= 0 ? part.slice(0, open) : part;
    const inner = open >= 0 ? part.slice(open + 1, part.lastIndexOf(')')) : null;
    let key: string | null = null;
    if (head.includes(':')) [key, head] = head.split(':') as [string, string];
    const [name, ...hints] = head.split('!').map((x) => x.trim());
    return {
      key: (key ?? name).trim(),
      name,
      hint: hints.find((h) => h.endsWith('_fkey')),
      children: inner !== null ? parseSelect(inner) : undefined,
    };
  });
}

/** Which table an embed name points at: `org_id` → org, `invoice_series` → invoice_series. */
function embedTable(db: Db, name: string): string {
  if (db[name]) return name;
  if (name.endsWith('_id') && db[name.slice(0, -3)]) return name.slice(0, -3);
  return name;
}

function project(db: Db, table: string, row: Row, nodes: Node[]): Row {
  const out: Row = {};
  for (const n of nodes) {
    if (n.name === '*' && !n.children) {
      Object.assign(out, row);
      continue;
    }
    if (!n.children) {
      out[n.key] = row[n.name];
      continue;
    }
    const target = embedTable(db, n.name);
    const rows = db[target] ?? [];
    // Many-to-one when this row holds the foreign key; otherwise one-to-many. A constraint hint
    // names the column: report_technician_id_fkey → technician_id on report.
    const hinted = n.hint?.replace(new RegExp(`^${table}_`), '').replace(/(_org_id)?_fkey$/, '');
    const fkCandidates = [
      ...(hinted ? [hinted] : []),
      n.name.endsWith('_id') ? n.name : `${target}_id`,
      `${target.replace(/^invoice_/, '')}_id`,
    ];
    const fk = fkCandidates.find((c) => c in row);
    if (fk) {
      const hit = rows.find((r) => r.id === row[fk]);
      out[n.key] = hit ? project(db, target, hit, n.children) : null;
    } else {
      const back = `${table}_id`;
      out[n.key] = rows
        .filter((r) => r[back] === row.id)
        .map((r) => project(db, target, r, n.children!));
    }
  }
  return out;
}

// ── filters ───────────────────────────────────────────────────────────────────

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);

function cmp(a: unknown, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (a !== null && a !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(b);
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (RESERVED.has(k) || k.includes('.')) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const v = raw.slice(dot + 1);
    const val = row[k];
    const ok =
      op === 'eq'
        ? String(val) === v
        : op === 'neq'
          ? String(val) !== v
          : op === 'gt'
            ? cmp(val, v) > 0
            : op === 'gte'
              ? cmp(val, v) >= 0
              : op === 'lt'
                ? cmp(val, v) < 0
                : op === 'lte'
                  ? cmp(val, v) <= 0
                  : op === 'in'
                    ? v
                        .replace(/^\(|\)$/g, '')
                        .split(',')
                        .map((x) => x.replace(/^"|"$/g, ''))
                        .includes(String(val))
                    : op === 'is'
                      ? v === 'null'
                        ? val == null
                        : String(val) === v
                      : true;
    if (!ok) return false;
  }
  return true;
}

// ── server ────────────────────────────────────────────────────────────────────

export interface Backend {
  db: Db;
  /** Every write the app made, for assertions: `{ method, table, body }`. */
  writes: { method: string; table: string; body: unknown }[];
}

export async function serveBackend(page: Page, db: Db, session: Row): Promise<Backend> {
  const backend: Backend = { db, writes: [] };

  await page.route(`${SUPABASE_HOST}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { ...CORS, ...extra },
        body: JSON.stringify(body),
      });

    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }
    if (path.startsWith('/auth/v1/user')) return json(session.user);
    if (path.startsWith('/auth/v1/token')) return json(session);
    if (path.startsWith('/auth/v1/')) return json({});
    if (path.startsWith('/storage/v1/')) return json({ Key: path });
    if (path.startsWith('/rest/v1/rpc/')) return json([]);
    if (!path.startsWith('/rest/v1/')) return json([]);

    const table = path.slice('/rest/v1/'.length);
    db[table] ??= [];
    const nodes = parseSelect(url.searchParams.get('select') ?? '*');
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    let total: number | null = null;
    const respond = (rows: Row[], status = 200) => {
      const shaped = rows.map((r) => project(db, table, r, nodes));
      if (single) {
        return shaped[0]
          ? json(shaped[0], status)
          : json({ code: 'PGRST116', message: 'no rows' }, 406);
      }
      const all = total ?? shaped.length;
      return json(shaped, status, {
        'content-range': shaped.length ? `0-${shaped.length - 1}/${all}` : `*/${all}`,
      });
    };

    const method = req.method();
    if (method === 'GET' || method === 'HEAD') {
      let rows = db[table].filter((r) => matches(r, url.searchParams));
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split(',')[0].split('.');
        rows = [...rows].sort((a, b) => cmp(a[col], String(b[col])) * (dir === 'desc' ? -1 : 1));
      }
      // count=exact reports the total before paging, like PostgREST's Content-Range.
      total = rows.length;
      const offset = Number(url.searchParams.get('offset')) || 0;
      const limit = Number(url.searchParams.get('limit'));
      if (offset || limit) rows = rows.slice(offset, limit ? offset + limit : undefined);
      if (method === 'HEAD') {
        return route.fulfill({
          status: 200,
          headers: {
            ...CORS,
            'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
          },
        });
      }
      return respond(rows);
    }

    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    backend.writes.push({ method, table, body });
    const now = new Date().toISOString();

    if (method === 'POST') {
      const items: Row[] = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get('on_conflict')?.split(',');
      const saved = items.map((item) => {
        const existing = conflict
          ? db[table].find((r) => conflict.every((c) => String(r[c]) === String(item[c])))
          : undefined;
        if (existing) return Object.assign(existing, item, { updated_at: now });
        const row = {
          id: newId(table),
          created_at: now,
          updated_at: now,
          ...DEFAULTS[table],
          ...item,
        };
        db[table].push(row);
        return row;
      });
      return respond(saved, 201);
    }
    if (method === 'PATCH') {
      const hit = db[table].filter((r) => matches(r, url.searchParams));
      hit.forEach((r) => Object.assign(r, body, { updated_at: now }));
      return respond(hit);
    }
    if (method === 'DELETE') {
      const keep = db[table].filter((r) => !matches(r, url.searchParams));
      const gone = db[table].filter((r) => matches(r, url.searchParams));
      db[table] = keep;
      return respond(gone);
    }
    return json({}, 405);
  });

  await page.addInitScript(({ key, s }) => window.localStorage.setItem(key, JSON.stringify(s)), {
    key: AUTH_STORAGE_KEY,
    s: session,
  });

  return backend;
}
