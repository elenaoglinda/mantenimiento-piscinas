import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { serveBackend, type Db, type Row } from './backend';
import { appUser, session } from './fixtures';

/**
 * Service history, end to end through the real UI against the in-memory backend (backend.ts):
 * no credentials, no real database.
 *
 * 1. Create a client, a pool, a vaso and three visits through the screens, then check every
 *    history screen: last state, Historial, Evolución, the client page, Informes filters and
 *    CSV, and the dashboard alert / bell / ⌘K links.
 * 2. A pool with 35 visits: full history, trend and last state without opening a report.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'history runs on the redesign only',
);

// The harness default is 10 minutes (for screenshot runs); a stuck step here should fail fast.
test.setTimeout(120_000);

const DAY = 86_400_000;
/** 'YYYY-MM-DD' of n days ago, in the browser's (and this process's) local time. */
const ymd = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function baseSeed(): Db {
  const { org, ...user } = appUser;
  const def = (
    id: string,
    siloe: number,
    name: string,
    unit: string | null,
    min: number | null,
    max: number | null,
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
  });
  return {
    org: [org],
    app_user: [user],
    parameter_def: [
      def('pd-ph', 1, 'pH', 'pH', 7.2, 8),
      def('pd-cl', 10, 'Cloro libre residual', 'mg/L', 0.5, 2),
    ],
  };
}

function trackReportOpens(page: Page): string[] {
  const opened: string[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && /\/reports\/[^/?]+$/.test(new URL(f.url()).pathname))
      opened.push(f.url());
  });
  return opened;
}

async function addVisit(
  page: Page,
  poolId: string,
  v: { daysAgo: number; ph: string; cl: string; incident?: string },
) {
  await page.goto(`/reports/new?poolId=${poolId}`);
  await page.getByLabel('Vaso').selectOption({ label: 'Vaso grande' });
  await page.getByLabel('Fecha y hora de la visita').fill(`${ymd(v.daysAgo)}T10:00`);
  await page.getByLabel('pH Valor').fill(v.ph);
  await page.getByLabel('Cloro libre residual Valor').fill(v.cl);
  if (v.incident) {
    await page.getByRole('button', { name: 'Añadir incidencia' }).click();
    await page.getByLabel('Descripción').fill(v.incident);
  }
  await page.getByRole('button', { name: 'Marcar como completo' }).first().click();
  // Saved: the app moves on to the report itself (not /reports/new).
  await expect(page).toHaveURL(/\/reports\/(?!new)[^/?]+$/);
  await expect(page.getByText('Completo', { exact: true })).toBeVisible();
}

test('client → pool → vaso → three visits → every history screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, baseSeed(), session);

  // Client, pool and vaso, through the UI.
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Nuevo cliente' }).first().click();
  const clientSheet = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await clientSheet.getByLabel('Nombre').fill('Comunidad Las Dunas');
  await clientSheet.getByLabel('Teléfono de contacto').fill('600 123 456');
  await clientSheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('link', { name: 'Comunidad Las Dunas' })).toBeVisible();

  await page.goto('/pools');
  await page.getByRole('button', { name: 'Nueva piscina' }).first().click();
  const poolSheet = page.getByRole('dialog', { name: 'Nueva piscina' });
  await poolSheet.getByLabel('Cliente').selectOption({ label: 'Comunidad Las Dunas' });
  await poolSheet.getByLabel('Nombre de la instalación').fill('Las Dunas · Piscina');
  await poolSheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Las Dunas · Piscina' })).toBeVisible();
  const poolId = new URL(page.url()).pathname.split('/').pop()!;

  // Before any visit, the vaso's card says so.
  await page.getByRole('tab', { name: /Vasos/ }).click();
  await page.getByRole('button', { name: 'Nuevo vaso' }).first().click();
  const basinDialog = page.getByRole('dialog', { name: 'Nuevo vaso' });
  await basinDialog.getByLabel('Nombre del vaso').fill('Vaso grande');
  await basinDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Vaso grande' })).toBeVisible();
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(page.getByText('Este vaso aún no tiene lecturas')).toBeVisible();

  // Three visits; the middle one has free chlorine out of range and an open incident.
  await addVisit(page, poolId, { daysAgo: 3, ph: '7.5', cl: '1.0' });
  await addVisit(page, poolId, { daysAgo: 2, ph: '7.6', cl: '3.5', incident: 'Skimmer roto' });
  await addVisit(page, poolId, { daysAgo: 1, ph: '7.4', cl: '1.2' });
  expect(backend.db.report).toHaveLength(3);

  const opened = trackReportOpens(page);

  // 1. Último estado del agua: latest values, days since the visit, the open incident.
  await page.goto(`/pools/${poolId}`);
  const card = page.getByRole('region', { name: 'Vaso grande' });
  await expect(card).toContainText('7,4');
  await expect(card).toContainText('1,2');
  await expect(card).toContainText('ayer');
  await expect(card).toContainText('Todo en rango');
  await expect(card).toContainText('1 incidencia abierta');
  await expect(card.getByRole('link', { name: 'Skimmer roto' })).toBeVisible();

  // 2. Historial: three rows, newest first, the red value marked in words; expand; filter.
  await page.getByRole('tab', { name: /Historial/ }).click();
  const rows = page.getByRole('list', { name: 'Historial' }).locator(':scope > li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('7,4');
  await expect(rows.nth(1)).toContainText('Fuera de rango');
  await expect(rows.nth(1)).toContainText('1 incidencia, 1 abierta');
  await rows.nth(1).getByRole('button', { expanded: false }).click();
  await expect(rows.nth(1).getByText('Skimmer roto')).toBeVisible();
  await expect(rows.nth(1).getByRole('link', { name: 'Abrir informe' })).toBeVisible();
  await page.getByLabel('Desde').fill(ymd(2));
  await expect(rows).toHaveCount(2);
  await expect(page).toHaveURL(/desde=/);
  await page.getByRole('button', { name: 'Quitar filtros' }).first().click();
  await expect(rows).toHaveCount(3);

  // 3. Evolución: the chart and its table; the chlorine spike is counted.
  await page.getByRole('tab', { name: 'Evolución' }).click();
  await expect(page.getByRole('img', { name: /Evolución de pH/ })).toBeVisible();
  await page.getByText('Ver los datos en una tabla').click();
  await expect(page.getByRole('table', { name: 'pH por visita' }).getByRole('row')).toHaveCount(4);
  await page.getByLabel('Parámetro').selectOption({ label: 'Cloro libre residual' });
  await expect(page.getByText('1 lectura fuera de rango')).toBeVisible();

  // 4. Client page: from the Clientes row; contact, pool, open incident, every visit.
  await page.goto('/clients');
  await page.getByRole('link', { name: 'Comunidad Las Dunas' }).click();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);
  const clientUrl = page.url();
  await expect(page.getByRole('heading', { level: 1, name: 'Comunidad Las Dunas' })).toBeVisible();
  await expect(page).toHaveTitle('Cloro · Comunidad Las Dunas');
  await expect(page.getByRole('link', { name: '600 123 456' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Las Dunas · Piscina/ })).toContainText('ayer');
  await expect(page.getByRole('link', { name: /Skimmer roto/ })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Todas las visitas' }).locator(':scope > li'),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar cliente' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // 5. Informes: filters in the URL, and the CSV for Spanish Excel.
  await page.goto('/reports');
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Comunidad Las Dunas' });
  // The URL update is a router transition, so the box ticks a moment after the click.
  await page.getByLabel('Solo fuera de rango').click();
  await expect(page.getByLabel('Solo fuera de rango')).toBeChecked();
  await expect(page).toHaveURL(/cliente=.*fuera=1|fuera=1.*cliente=/);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2); // header + 1 visit
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^visitas-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const [header, row, ...rest] = csv.slice(1).trim().split('\r\n');
  expect(header).toBe(
    'Fecha;Hora;Cliente;Piscina;Vaso;Técnico;Estado;pH;Cloro libre residual (mg/L);Incidencias;Incidencias abiertas',
  );
  expect(row).toContain(';Comunidad Las Dunas;Las Dunas · Piscina;Vaso grande;');
  expect(row).toContain(';7,6;3,5;1;1');
  expect(rest).toEqual([]);

  // 6. The dashboard alert and the bell open the visit inside Historial.
  const redVisit = (backend.db.report as Row[]).find((r) =>
    (backend.db.measurement as Row[]).some((m) => m.report_id === r.id && m.status === 'red'),
  )!;
  await page.goto('/');
  await page
    .getByRole('link', { name: /Las Dunas · Piscina · Vaso grande/ })
    .first()
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/pools/${poolId}\\?tab=historial&visita=${redVisit.id}$`),
  );
  await expect(page.getByRole('button', { expanded: true })).toContainText('Fuera de rango');
  await page.getByRole('button', { name: /Avisos/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /Las Dunas/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`visita=${redVisit.id}$`));

  // ⌘K finds the client and opens its page.
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('combobox', { name: 'Ir a una página' });
  await expect(palette).toBeFocused();
  // fill() sets the whole query at once: typed keystrokes could be lost while the dialog was
  // still settling (CI once saw only "s"). Then wait for the client lookup before choosing.
  const clientLookup = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/client?') && r.url().includes('Dunas'),
  );
  await palette.fill('Dunas');
  await expect(palette).toHaveValue('Dunas');
  await clientLookup;
  await page.getByRole('option', { name: 'Comunidad Las Dunas' }).click();
  await expect(page).toHaveURL(clientUrl);

  expect(opened, 'no report had to be opened').toEqual([]);
  expect(errors).toEqual([]);
});

test('a pool with 35 visits: full history, trend and last state, no report opened', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const db = baseSeed();
  const org = (db.org[0] as Row).id as string;
  db.client = [{ id: 'c1', org_id: org, name: 'Hotel Sol', is_self: false, archived: false }];
  db.pool = [
    {
      id: 'p1',
      org_id: org,
      client_id: 'c1',
      denominacion: 'Hotel Sol · Piscina',
      archived: false,
      ccaa: null,
      agua_alimentacion: [],
      siloe_cod_p: null,
    },
  ];
  db.basin = [
    { id: 'b1', org_id: org, pool_id: 'p1', denominacion: 'Vaso adultos', num_orden: 1 },
    { id: 'b2', org_id: org, pool_id: 'p1', denominacion: 'Vaso infantil', num_orden: 2 },
  ];
  db.report = [];
  db.measurement = [];
  for (let i = 0; i < 35; i++) {
    const id = `r${i}`;
    db.report.push({
      id,
      org_id: org,
      pool_id: 'p1',
      basin_id: i % 2 ? 'b2' : 'b1',
      technician_id: (db.app_user[0] as Row).id,
      visited_at: new Date(Date.now() - (i + 1) * DAY).toISOString(),
      status: 'signed',
      analysis_type: 'autocontrol',
    });
    db.measurement.push(
      {
        id: `${id}-ph`,
        org_id: org,
        report_id: id,
        parameter_def_id: 'pd-ph',
        value: 7.3 + (i % 5) / 10,
        status: 'green',
      },
      {
        id: `${id}-cl`,
        org_id: org,
        report_id: id,
        parameter_def_id: 'pd-cl',
        value: 1 + (i % 3) / 10,
        status: 'green',
      },
    );
  }
  await serveBackend(page, db, session);
  const opened = trackReportOpens(page);

  await page.goto('/pools/p1');
  await expect(page.getByRole('region', { name: 'Vaso adultos' })).toContainText('7,3'); // r0
  await expect(page.getByRole('region', { name: 'Vaso infantil' })).toContainText('7,4'); // r1
  await expect(page.getByRole('region', { name: 'Vaso adultos' })).toContainText('ayer');

  await page.getByRole('tab', { name: /Historial/ }).click();
  const rows = page.getByRole('list', { name: 'Historial' }).locator(':scope > li');
  await expect(rows).toHaveCount(30);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect(rows).toHaveCount(35);
  await expect(page.getByText('35 visitas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Evolución' }).click();
  await expect(page.getByRole('img', { name: /Evolución de pH/ })).toBeVisible();
  await page.getByText('Ver los datos en una tabla').click();
  // 35 visits on 35 different days, two vasos as two columns.
  const table = page.getByRole('table', { name: 'pH por visita' });
  await expect(table.getByRole('row')).toHaveCount(36);
  await expect(table.getByRole('columnheader')).toHaveText([
    'Fecha',
    'Vaso adultos',
    'Vaso infantil',
  ]);

  expect(opened).toEqual([]);
  expect(errors).toEqual([]);
});
