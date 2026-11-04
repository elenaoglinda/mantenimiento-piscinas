import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { serveBackend, type Backend, type Db, type Row } from './backend';
import { appUser, session } from './fixtures';
import { SUPABASE_HOST } from './target';
import { buildPdf, parseBody } from '../../api/report-pdf';
import { fakeClient } from '../../api/_tests/fakeSupabase';
import { solidPng } from '../../packages/shared/src/client-reports/testFixtures';

/**
 * Client PDFs, end to end: the real buttons, the REAL api/report-pdf builder (layout, pdf-lib,
 * storage naming, signed link) running in this Node process against the harness's in-memory
 * database, and the browser downloading and sharing the result. Only the HTTP hop to /api and
 * the storage server are simulated. No credentials, no real database.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'client reports run on the redesign only',
);
test.setTimeout(120_000);

const ORG = (appUser.org as Row).id as string;
// The endpoint accepts only UUIDs, like the real database's ids.
const R1 = '00000000-0000-4000-8000-0000000000a1';
const R2 = '00000000-0000-4000-8000-0000000000a2';
const P1 = '00000000-0000-4000-8000-0000000000b1';
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

function seed(): Db {
  const { org, ...user } = appUser;
  const def = (
    id: string,
    siloe: number,
    name: string,
    unit: string,
    min: number,
    max: number,
  ) => ({
    id,
    siloe_param_id: siloe,
    name_es: name,
    unit,
    min_ok: min,
    max_ok: max,
    min_warn: null,
    max_warn: null,
    closure_min: null,
    closure_max: null,
    warn_margin_ratio: 0.1,
    ccaa: null,
    active: true,
    medium: 'water',
    in_siloe: true,
    clave: null,
  });
  const report = (id: string, status: string, at: string, extra: Row = {}) => ({
    id,
    org_id: ORG,
    pool_id: P1,
    basin_id: 'b1',
    status,
    visited_at: at,
    technician_id: user.id,
    analysis_type: 'autocontrol',
    punto_muestreo: null,
    notes: null,
    signature_path: null,
    signed_by_name: null,
    signed_by_dni: null,
    signed_at: null,
    location_lat: null,
    location_lng: null,
    created_at: at,
    updated_at: at,
    ...extra,
  });
  // A few visits this month and last for the monthly summary.
  const history = Array.from({ length: 12 }, (_, i) =>
    report(`h${i}`, 'completed', daysAgo(3 + i * 4)),
  );
  const reports = [
    report(R1, 'signed', daysAgo(1), {
      notes: 'Agua cristalina.',
      signature_path: `${ORG}/${R1}/signature.png`,
      signed_by_name: 'Marta Soler',
      signed_by_dni: '12345678Z',
      signed_at: daysAgo(1),
    }),
    report(R2, 'draft', daysAgo(0)),
    ...history,
  ];
  const measurement = reports.flatMap((r, i) => [
    {
      id: `m-ph-${r.id}`,
      org_id: ORG,
      report_id: r.id,
      parameter_def_id: 'pd-ph',
      value: 7.3 + (i % 4) / 10,
      status: 'green',
      lugar: 'in_situ',
    },
    {
      id: `m-cl-${r.id}`,
      org_id: ORG,
      report_id: r.id,
      parameter_def_id: 'pd-cl',
      value: i === 0 ? 0.3 : 1.2,
      status: i === 0 ? 'red' : 'green',
      lugar: 'in_situ',
    },
  ]);
  return {
    org: [org],
    app_user: [user],
    billing_profile: [],
    parameter_def: [
      def('pd-ph', 1, 'pH', 'pH', 7.2, 8),
      def('pd-cl', 10, 'Cloro libre residual', 'mg/L', 0.5, 2),
    ],
    client: [
      {
        id: 'c1',
        org_id: ORG,
        name: 'Comunidad Las Dunas',
        contact_email: 'admin@lasdunas.es',
        contact_phone: '612 34 56 78',
        is_self: false,
        archived: false,
      },
    ],
    pool: [
      {
        id: P1,
        org_id: ORG,
        client_id: 'c1',
        denominacion: 'Las Dunas · Piscina',
        direccion: 'Calle del Mar, 3',
        cp: '03540',
        municipio: 'Alicante',
        archived: false,
        ccaa: null,
        agua_alimentacion: [],
        siloe_cod_p: null,
        created_at: daysAgo(120),
      },
    ],
    basin: [
      {
        id: 'b1',
        org_id: ORG,
        pool_id: P1,
        denominacion: 'Vaso grande',
        num_orden: 1,
        fecha_baja: null,
      },
    ],
    report: reports,
    measurement,
    incident: [
      {
        id: 'i1',
        org_id: ORG,
        report_id: R1,
        description: 'Cloro libre bajo',
        corrective_action: 'Cloración de choque',
        created_at: daysAgo(1),
      },
    ],
    attachment: [
      {
        id: 'a1',
        org_id: ORG,
        report_id: R1,
        kind: 'photo',
        storage_path: `${ORG}/${R1}/photo-1.jpg`,
        created_at: daysAgo(1),
      },
    ],
    chemical_product: [
      {
        id: 'chem-1',
        org_id: ORG,
        nombre: 'Hipoclorito sódico',
        unidad: 'L',
        activo: true,
        orden: 1,
      },
    ],
    report_chemical: reports.map((r, i) => ({
      id: `rc-${i}`,
      org_id: ORG,
      report_id: r.id,
      product_id: 'chem-1',
      cantidad: 2.5,
      unidad: 'L',
      created_at: r.visited_at,
    })),
    task_def: [
      { id: 'task-1', org_id: ORG, nombre: 'Limpieza de skimmers', orden: 1, activo: true },
    ],
    report_task: [
      { id: 'rt-1', org_id: ORG, report_id: R1, task_id: 'task-1', hecho: true, nota: null },
    ],
  };
}

interface Server {
  backend: Backend;
  storage: Map<string, Uint8Array>;
  requests: Record<string, unknown>[];
}

/**
 * The backend plus: /api/report-pdf answered by the real builder, and the storage server
 * serving what it stored (signed links included).
 */
async function serve(page: Page, opts: { readOnlyStorage?: boolean } = {}): Promise<Server> {
  const backend = await serveBackend(page, seed(), session);
  const storage = new Map<string, Uint8Array>([
    [`${ORG}/${R1}/signature.png`, solidPng(200, 80, [250, 250, 250])],
    [`${ORG}/${R1}/photo-1.jpg.thumb.jpg`, solidPng(64, 48, [30, 150, 200])],
  ]);
  const requests: Record<string, unknown>[] = [];

  await page.route('**/api/report-pdf', async (route: Route) => {
    const auth = route.request().headers()['authorization'];
    expect(auth).toBe(`Bearer ${session.access_token}`);
    const raw = JSON.parse(route.request().postData() ?? '{}');
    requests.push(raw);
    const body = parseBody(raw);
    if (!body) return route.fulfill({ status: 400, json: { error: 'invalid_request' } });
    const client = fakeClient(
      { tables: backend.db, storage, uploads: [], readOnlyStorage: opts.readOnlyStorage },
      { storageBase: `${SUPABASE_HOST}/storage/v1` },
    );
    const out = await buildPdf(client as never, body);
    return route.fulfill({ status: out.status, json: out.json });
  });

  // Registered after serveBackend, so it wins for signed links.
  await page.route(`${SUPABASE_HOST}/storage/v1/object/sign/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/sign/reports/', ''));
    const bytes = storage.get(path);
    if (!bytes) return route.fulfill({ status: 400, json: { message: 'Object not found' } });
    const name = url.searchParams.get('download');
    return route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'access-control-allow-origin': '*',
        ...(name ? { 'content-disposition': `attachment; filename="${name}"` } : {}),
      },
      body: Buffer.from(bytes),
    });
  });

  // On the context, so the new WhatsApp tab is covered too: nothing reaches the real wa.me.
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }),
    );
  return { backend, storage, requests };
}

async function expectPdf(path: string) {
  const doc = await PDFDocument.load(await readFile(path));
  expect(doc.getPageCount()).toBeGreaterThan(0);
  return doc;
}

test('signed visit: download the PDF, then send it by e-mail and WhatsApp', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { storage, requests } = await serve(page);
  await page.goto(`/reports/${R1}`);

  const card = page
    .getByRole('heading', { name: 'Enviar al cliente' })
    .locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  await expect(card).toBeVisible();

  // Descargar PDF: the server builds and stores it; the browser downloads it.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^Informe-Las-Dunas-Piscina-Vaso-grande-\d{4}-\d{2}-\d{2}\.pdf$/,
  );
  const doc = await expectPdf(await download.path());
  expect(doc.getTitle()).toContain('Informe de visita');
  expect(requests).toEqual([{ kind: 'visit', reportId: R1 }]);
  const stored = [...storage.keys()].filter((k) => k.includes('/client-reports/'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatch(new RegExp(`^${ORG}/client-reports/visits/${R1}/[0-9a-f]{16}\\.pdf$`));
  await expect(page.getByText(/PDF listo \(\d+ página/)).toBeVisible();

  // Enviar por email: to the client's contact, with the 30-day link in the body.
  await page.getByRole('button', { name: 'Enviar por email' }).click();
  await expect(page).toHaveURL(new RegExp(`/reports/${R1}$`));
  const mail = await page.getByRole('link', { name: 'Abrir el correo' }).getAttribute('href');
  expect(mail).toMatch(/^mailto:admin@lasdunas\.es\?subject=/);
  const mailBody = decodeURIComponent(mail!.split('&body=')[1]!);
  expect(mailBody).toContain(`${SUPABASE_HOST}/storage/v1/object/sign/reports/${stored[0]}`);
  expect(mailBody).toContain(`exp=${30 * 24 * 3600}`);
  expect(mailBody).toContain('Las Dunas · Piscina');

  // Enviar por WhatsApp: a new tab on wa.me with the client's number and the same link.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Enviar por WhatsApp' }).click(),
  ]);
  await popup.waitForURL(/wa\.me/);
  const wa = new URL(popup.url());
  expect(wa.pathname).toBe('/34612345678');
  expect(wa.searchParams.get('text')).toContain(stored[0]);
  // The link is reused: still one PDF built, one file stored.
  expect(requests).toHaveLength(1);

  // The signed link itself opens the PDF (what the client taps on the phone).
  const link = await page.getByRole('link', { name: 'Abrir el PDF' }).getAttribute('href');
  // Fetched from the page, so it goes through the fake storage server like a real tap would.
  const fetched = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return {
      type: r.headers.get('content-type'),
      head: Array.from(new Uint8Array(await r.arrayBuffer()).slice(0, 5)),
    };
  }, link!);
  expect(fetched.type).toBe('application/pdf');
  expect(String.fromCharCode(...fetched.head)).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('drafts have no send buttons; a role that cannot store gets a clear message', async ({
  page,
}) => {
  await serve(page, { readOnlyStorage: true });
  await page.goto(`/reports/${R2}`);
  await expect(page.getByRole('heading', { name: 'Parámetros' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0);

  await page.goto(`/reports/${R1}`);
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tu rol no permite generar el PDF' }),
  ).toBeVisible();
});

test('pool page: monthly summary for a chosen month', async ({ page }) => {
  const { requests, storage } = await serve(page);
  await page.goto(`/pools/${P1}`);
  await expect(
    page.getByRole('heading', { name: 'Resumen mensual para el cliente' }),
  ).toBeVisible();

  const months = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  });
  const prev = new Date(now);
  prev.setUTCDate(1);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const label = months.format(prev);
  await page.getByRole('combobox', { name: 'Mes' }).click();
  await page.getByRole('option', { name: label.charAt(0).toUpperCase() + label.slice(1) }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF' }).click(),
  ]);
  const ym = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  expect(requests).toEqual([{ kind: 'monthly', poolId: P1, month: ym }]);
  expect(download.suggestedFilename()).toBe(`Resumen-Las-Dunas-Piscina-${ym}.pdf`);
  const doc = await expectPdf(await download.path());
  expect(doc.getTitle()).toContain('Resumen mensual');
  expect(
    [...storage.keys()].some((k) => k.startsWith(`${ORG}/client-reports/monthly/${P1}/${ym}/`)),
  ).toBe(true);
});

test('Ajustes: admins see where to upload the PDF logo', async ({ page }) => {
  await serve(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Logotipo para los PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subir logotipo' })).toBeVisible();
});
