import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fakeClient, type FakeDb } from './fakeSupabase.js';
import { solidPng } from '../../packages/shared/src/client-reports/testFixtures.js';

const created = vi.hoisted(() => ({ calls: [] as unknown[][], db: null as FakeDb | null }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    created.calls.push(args);
    return fakeClient(created.db!);
  },
}));

import handler, { parseBody } from '../report-pdf.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const POOL = '00000000-0000-4000-8000-000000000010';
const BASIN = '00000000-0000-4000-8000-000000000020';
const REPORT = '00000000-0000-4000-8000-000000000030';
const DRAFT = '00000000-0000-4000-8000-000000000031';
const USER = '00000000-0000-4000-8000-000000000040';

const defs = [
  {
    id: 'd1',
    name_es: 'pH',
    unit: 'pH',
    siloe_param_id: 1,
    in_siloe: true,
    clave: null,
    min_ok: 7.2,
    max_ok: 8,
    min_warn: null,
    max_warn: null,
    closure_min: null,
    closure_max: null,
    warn_margin_ratio: 0.1,
  },
  {
    id: 'd10',
    name_es: 'Cloro libre residual',
    unit: 'mg/L',
    siloe_param_id: 10,
    in_siloe: true,
    clave: null,
    min_ok: 0.5,
    max_ok: 2,
    min_warn: null,
    max_warn: null,
    closure_min: null,
    closure_max: null,
    warn_margin_ratio: 0.1,
  },
  {
    id: 'd103',
    name_es: 'Sal',
    unit: 'g/L',
    siloe_param_id: null,
    in_siloe: false,
    clave: 'sal',
    min_ok: 3,
    max_ok: 5,
    min_warn: null,
    max_warn: null,
    closure_min: null,
    closure_max: null,
    warn_margin_ratio: 0.1,
  },
];

function seed(): FakeDb {
  const reports: Record<string, unknown>[] = [
    {
      id: REPORT,
      org_id: ORG,
      pool_id: POOL,
      basin_id: BASIN,
      status: 'signed',
      visited_at: '2026-10-14T08:30:00.000Z',
      technician_id: USER,
      notes: 'Todo en orden.',
      signature_path: `${ORG}/${REPORT}/signature.png`,
      signed_by_name: 'Marta Soler',
      signed_at: '2026-10-14T09:00:00.000Z',
    },
    {
      id: DRAFT,
      org_id: ORG,
      pool_id: POOL,
      basin_id: BASIN,
      status: 'draft',
      visited_at: '2026-10-15T08:30:00.000Z',
      technician_id: null,
    },
  ];
  const measurement: Record<string, unknown>[] = [
    { report_id: REPORT, parameter_def_id: 'd10', value: 0.3, status: 'red' },
    { report_id: REPORT, parameter_def_id: 'd1', value: 7.4, status: 'green' },
    { report_id: REPORT, parameter_def_id: 'd103', value: 4.2, status: 'green' },
  ];
  // 90 days of visits, three a week, for the monthly summary.
  for (let d = 0; d < 90; d++) {
    if (d % 7 !== 1 && d % 7 !== 3 && d % 7 !== 5) continue;
    const id = `00000000-0000-4000-9000-${String(d).padStart(12, '0')}`;
    const at = new Date(Date.parse('2026-08-05T08:00:00Z') + d * 86_400_000).toISOString();
    reports.push({
      id,
      org_id: ORG,
      pool_id: POOL,
      basin_id: BASIN,
      status: 'completed',
      visited_at: at,
      technician_id: USER,
    });
    measurement.push(
      { report_id: id, parameter_def_id: 'd1', value: 7.3 + (d % 5) / 10, status: 'green' },
      {
        report_id: id,
        parameter_def_id: 'd10',
        value: d % 11 === 0 ? 0.3 : 1.1,
        status: d % 11 === 0 ? 'red' : 'green',
      },
    );
  }
  return {
    tables: {
      org: [{ id: ORG, name: 'Piscinas Mediterráneo (demo)' }],
      billing_profile: [],
      app_user: [{ id: USER, full_name: 'Lucía Ferrer', email: 'lucia@example.com' }],
      client: [{ id: 'c1', name: 'Comunidad Mar Azul' }],
      pool: [
        {
          id: POOL,
          org_id: ORG,
          client_id: 'c1',
          denominacion: 'Residencial Mar Azul',
          direccion: 'Calle de la Mar, 12',
          cp: '03001',
          municipio: 'Alicante',
        },
      ],
      basin: [
        {
          id: BASIN,
          pool_id: POOL,
          denominacion: 'Piscina principal',
          num_orden: 1,
          fecha_baja: null,
        },
      ],
      report: reports,
      parameter_def: defs,
      measurement,
      incident: [
        {
          report_id: REPORT,
          description: 'Cloro bajo',
          corrective_action: 'Cloración de choque',
          created_at: '1',
        },
      ],
      attachment: [
        {
          report_id: REPORT,
          kind: 'photo',
          storage_path: `${ORG}/${REPORT}/photo-a.jpg`,
          created_at: '1',
        },
        {
          report_id: REPORT,
          kind: 'photo',
          storage_path: `${ORG}/${REPORT}/photo-b.jpg`,
          created_at: '2',
        },
      ],
      report_chemical: [
        { report_id: REPORT, product_id: 'p1', cantidad: 5, unidad: 'L', created_at: '1' },
      ],
      chemical_product: [{ id: 'p1', nombre: 'Hipoclorito sódico' }],
      report_task: [{ report_id: REPORT, task_id: 't1', hecho: true, nota: null }],
      task_def: [{ id: 't1', nombre: 'Limpieza de skimmers', orden: 1 }],
    },
    storage: new Map([
      [`${ORG}/${REPORT}/signature.png`, solidPng(200, 80, [250, 250, 250])],
      // photo-a has a thumbnail; photo-b is an original too large for the PDF.
      [`${ORG}/${REPORT}/photo-a.jpg.thumb.jpg`, solidPng(64, 48, [30, 150, 200])],
      [`${ORG}/${REPORT}/photo-b.jpg`, new Uint8Array(2_000_000)],
    ]),
    uploads: [],
  };
}

function call(body: unknown, opts: { method?: string; auth?: string | null } = {}) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const auth = opts.auth === undefined ? 'Bearer good-token' : opts.auth;
  const req = { method: opts.method ?? 'POST', headers: auth ? { authorization: auth } : {}, body };
  return Promise.resolve(
    handler(req as unknown as VercelRequest, res as unknown as VercelResponse),
  ).then(() => res as { statusCode: number; body: Record<string, unknown> });
}

beforeEach(() => {
  created.calls = [];
  created.db = seed();
  process.env.VITE_SUPABASE_URL = 'https://db.example';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { headers: Record<string, string> }) =>
      init.headers.Authorization === 'Bearer good-token'
        ? { ok: true, json: async () => ({ id: USER }) }
        : { ok: false, json: async () => ({}) },
    ),
  );
});

describe('report-pdf access', () => {
  it('answers only POST, only to a live session, only with a valid body', async () => {
    expect((await call({}, { method: 'GET' })).statusCode).toBe(405);
    expect((await call({ kind: 'visit', reportId: REPORT }, { auth: null })).statusCode).toBe(401);
    expect(
      (await call({ kind: 'visit', reportId: REPORT }, { auth: 'Bearer expired' })).statusCode,
    ).toBe(401);
    expect((await call({ kind: 'visit', reportId: 'not-a-uuid' })).statusCode).toBe(400);
    expect((await call({ kind: 'monthly', poolId: POOL, month: '2026-13' })).statusCode).toBe(400);
    expect(parseBody({ kind: 'monthly', poolId: POOL, month: '2026-10' })).toEqual({
      kind: 'monthly',
      poolId: POOL,
      month: '2026-10',
    });
  });

  it('queries as the caller: anon key plus their token, never the service-role key', async () => {
    await call({ kind: 'visit', reportId: REPORT });
    expect(created.calls).toHaveLength(1);
    const [url, key, options] = created.calls[0] as [
      string,
      string,
      { global: { headers: Record<string, string> } },
    ];
    expect(url).toBe('https://db.example');
    expect(key).toBe('anon-key');
    expect(options.global.headers.Authorization).toBe('Bearer good-token');
    expect(JSON.stringify(created.calls)).not.toContain('service-role-secret');
  });

  it('says when the server is missing its Supabase settings', async () => {
    delete process.env.VITE_SUPABASE_URL;
    expect((await call({ kind: 'visit', reportId: REPORT })).statusCode).toBe(503);
  });
});

describe('visit PDF', () => {
  it('stores a signed visit in the private bucket and returns a 30-day signed link', async () => {
    const res = await call({ kind: 'visit', reportId: REPORT });
    expect(res.statusCode).toBe(200);
    const db = created.db!;
    expect(db.uploads).toHaveLength(1);
    const path = db.uploads[0]!;
    expect(path).toMatch(new RegExp(`^${ORG}/client-reports/visits/${REPORT}/[0-9a-f]{16}\\.pdf$`));
    expect(res.body.url).toContain(path);
    expect(res.body.url).toContain(`exp=${30 * 24 * 3600}`);
    expect(res.body.fileName).toBe('Informe-Residencial-Mar-Azul-Piscina-principal-2026-10-14.pdf');
    const doc = await PDFDocument.load(db.storage.get(path)!);
    expect(doc.getPageCount()).toBe(res.body.pages);
    // photo-b is too big and has no thumbnail: left out, and the UI is told.
    expect(res.body.warnings).toEqual(['photos_left_out']);
  });

  it('reuses the stored file when nothing changed', async () => {
    const a = await call({ kind: 'visit', reportId: REPORT });
    const b = await call({ kind: 'visit', reportId: REPORT });
    expect(b.body.url).toBe(a.body.url);
    expect(created.db!.uploads).toHaveLength(1);
  });

  it('refuses drafts and reports it cannot see', async () => {
    expect((await call({ kind: 'visit', reportId: DRAFT })).statusCode).toBe(409);
    const other = '00000000-0000-4000-8000-0000000000ff';
    expect((await call({ kind: 'visit', reportId: other })).statusCode).toBe(404);
  });

  it('still works before the service-log migration, and says so', async () => {
    created.db!.missing = new Set([
      'report_chemical',
      'report_task',
      'chemical_product',
      'task_def',
    ]);
    const res = await call({ kind: 'visit', reportId: REPORT });
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings).toContain('service_log_unavailable');
  });

  it('fails loudly on any other database error', async () => {
    created.db!.broken = new Set(['measurement']);
    const res = await call({ kind: 'visit', reportId: REPORT });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('data_failed');
    expect(created.db!.uploads).toHaveLength(0);
  });

  it('a viewer can share an existing PDF but cannot create one', async () => {
    created.db!.readOnlyStorage = true;
    const denied = await call({ kind: 'visit', reportId: REPORT });
    expect(denied.statusCode).toBe(403);
    expect(denied.body.error).toBe('cannot_store');
    created.db!.readOnlyStorage = false;
    const made = await call({ kind: 'visit', reportId: REPORT });
    created.db!.readOnlyStorage = true;
    const shared = await call({ kind: 'visit', reportId: REPORT });
    expect(shared.statusCode).toBe(200);
    expect(shared.body.url).toBe(made.body.url);
  });

  it('uses the billing profile name when the org has one', async () => {
    created.db!.tables.billing_profile = [{ org_id: ORG, razon_social: 'Mediterráneo Aguas S.L.' }];
    const withProfile = await call({ kind: 'visit', reportId: REPORT });
    created.db!.tables.billing_profile = [];
    const without = await call({ kind: 'visit', reportId: REPORT });
    // Different header text → different bytes → a different stored file.
    expect(withProfile.body.url).not.toBe(without.body.url);
  });
});

describe('monthly PDF', () => {
  it('renders a month out of 90 days of visits', async () => {
    const res = await call({ kind: 'monthly', poolId: POOL, month: '2026-09' });
    expect(res.statusCode).toBe(200);
    expect(res.body.fileName).toBe('Resumen-Residencial-Mar-Azul-2026-09.pdf');
    const path = created.db!.uploads[0]!;
    expect(path.startsWith(`${ORG}/client-reports/monthly/${POOL}/2026-09/`)).toBe(true);
    const doc = await PDFDocument.load(created.db!.storage.get(path)!);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('a month without visits still renders (it says so per vaso)', async () => {
    const res = await call({ kind: 'monthly', poolId: POOL, month: '2025-01' });
    expect(res.statusCode).toBe(200);
  });

  it('404 for a pool the caller cannot see', async () => {
    const res = await call({
      kind: 'monthly',
      poolId: '00000000-0000-4000-8000-0000000000ee',
      month: '2026-09',
    });
    expect(res.statusCode).toBe(404);
  });
});
