import { expect, test, type Page } from '@playwright/test';
import { serveBackend, type Db, type Row } from './backend';
import { appUser, session } from './fixtures';

/**
 * Service log, end to end through the real UI against the in-memory backend (backend.ts):
 * one test per new section of the report form, each checking that what was recorded shows
 * in the report and in the pool's Historial. No credentials, no real database.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'service log runs on the redesign only',
);
test.setTimeout(120_000);

const ORG = (appUser.org as Row).id as string;

function seed(): Db {
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
  const products: [string, string, number | null][] = [
    ['Cloro granulado', 'kg', 0.5],
    ['Cloro en pastillas', 'pastillas', null],
    ['Minorador de pH', 'kg', null],
    ['Floculante', 'L', null],
    ['Sal', 'kg', null],
  ];
  return {
    org: [org],
    app_user: [user],
    parameter_def: [
      def('pd-ph', 1, 'pH', 'pH', 7.2, 8),
      def('pd-cl', 10, 'Cloro libre residual', 'mg/L', 0.5, 2),
      // Outside SILOÉ: no SILOÉ id, a clave, recommended ranges.
      {
        ...def('pd-alc', 0, 'Alcalinidad total', 'mg/L CaCO3', 80, 120),
        siloe_param_id: null,
        in_siloe: false,
        clave: 'alcalinidad_total',
      },
      {
        ...def('pd-sal', 0, 'Sal', 'g/L', 3, 5),
        siloe_param_id: null,
        in_siloe: false,
        clave: 'sal',
      },
      {
        ...def('pd-fos', 0, 'Fosfatos', 'mg/L', null, 0.1),
        siloe_param_id: null,
        in_siloe: false,
        clave: 'fosfatos',
      },
    ],
    client: [
      { id: 'c1', org_id: ORG, name: 'Comunidad Las Dunas', is_self: false, archived: false },
    ],
    pool: [
      {
        id: 'p1',
        org_id: ORG,
        client_id: 'c1',
        denominacion: 'Las Dunas · Piscina',
        archived: false,
        ccaa: null,
        agua_alimentacion: [],
        siloe_cod_p: null,
        created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
      },
    ],
    basin: [{ id: 'b1', org_id: ORG, pool_id: 'p1', denominacion: 'Vaso grande', num_orden: 1 }],
    chemical_product: products.map(([nombre, unidad, cantidad], i) => ({
      id: `chem-${i + 1}`,
      org_id: ORG,
      nombre,
      unidad,
      cantidad_habitual: cantidad,
      activo: true,
      orden: i + 1,
    })),
    report: [],
    measurement: [],
    report_chemical: [],
    task_def: [
      'Barrido / limpieza de fondo',
      'Vaciado de skimmers y prefiltro',
      'Contralavado del filtro',
      'Retirada de hojas',
    ].map((nombre, i) => ({
      id: `task-${i + 1}`,
      org_id: ORG,
      nombre,
      orden: i + 1,
      activo: true,
    })),
    report_task: [],
  };
}

async function startVisit(page: Page) {
  await page.goto('/reports/new?poolId=p1');
  await page.getByLabel('Vaso').selectOption({ label: 'Vaso grande' });
  await page.getByLabel('pH Valor').fill('7.4');
}

async function complete(page: Page) {
  await page.getByRole('button', { name: 'Marcar como completo' }).first().click();
  await expect(page).toHaveURL(/\/reports\/(?!new)[^/?]+$/);
}

test('products added: quick-pick chips, quantities, report detail and Historial', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);

  await startVisit(page);
  const chips = page.getByRole('group', { name: 'Productos' });
  // One tap adds the product with its usual quantity and puts the cursor on it.
  await chips.getByRole('button', { name: 'Cloro granulado' }).click();
  await expect(chips.getByRole('button', { name: 'Cloro granulado' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Cantidad de Cloro granulado')).toHaveValue('0,5');
  await expect(page.getByLabel('Cantidad de Cloro granulado')).toBeFocused();
  // A product without a usual quantity must get one before saving.
  await chips.getByRole('button', { name: 'Floculante' }).click();
  await page.getByRole('button', { name: 'Marcar como completo' }).first().click();
  await expect(page.getByText('Revisa las cantidades de los productos añadidos.')).toBeVisible();
  await expect(page.getByLabel('Cantidad de Floculante')).toHaveAttribute('aria-invalid', 'true');
  expect(backend.db.report).toHaveLength(0);
  await page.getByLabel('Cantidad de Floculante').fill('2,5');
  // Tapping a chip again removes it; tap back.
  await chips.getByRole('button', { name: 'Sal' }).click();
  await page.getByRole('button', { name: 'Quitar Sal' }).click();
  await complete(page);

  expect(
    (backend.db.report_chemical as Row[]).map((r) => [r.product_id, r.cantidad, r.unidad]),
  ).toEqual([
    ['chem-1', 0.5, 'kg'],
    ['chem-4', 2.5, 'L'],
  ]);
  await expect(page.getByRole('heading', { name: 'Trabajo realizado' })).toBeVisible();
  const card = page.getByRole('main');
  await expect(card).toContainText('Cloro granulado');
  await expect(card).toContainText('0,5 kg');
  await expect(card).toContainText('2,5 L');

  // Historial: an icon with the count, and the products when the row opens.
  await page.goto('/pools/p1?tab=historial');
  const row = page.getByRole('list', { name: 'Historial' }).locator(':scope > li').first();
  await expect(row).toContainText('2 productos añadidos');
  await row.getByRole('button', { expanded: false }).click();
  await expect(row).toContainText('Floculante');
  await expect(row).toContainText('2,5 L');

  expect(errors).toEqual([]);
});

test('Ajustes: admins add products and deactivate them', async ({ page }) => {
  const backend = await serveBackend(page, seed(), session);
  await page.goto('/settings');
  const list = page.getByRole('list', { name: 'Productos' });
  await expect(list.locator(':scope > li')).toHaveCount(5);

  await page.getByRole('button', { name: 'Añadir producto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Añadir producto' });
  await sheet.getByLabel('Nombre').fill('Bromo');
  await sheet.getByLabel('Unidad').selectOption('pastillas');
  await sheet.getByLabel('Cantidad habitual').fill('2');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(list.locator(':scope > li')).toHaveCount(6);
  expect((backend.db.chemical_product as Row[]).find((p) => p.nombre === 'Bromo')).toMatchObject({
    unidad: 'pastillas',
    cantidad_habitual: 2,
    org_id: ORG,
  });

  await page.getByRole('button', { name: 'Desactivar: Sal' }).click();
  await expect(page.getByRole('button', { name: 'Activar: Sal' })).toBeVisible();

  // The form offers the new product and no longer offers the deactivated one.
  await startVisit(page);
  const chips = page.getByRole('group', { name: 'Productos' });
  await expect(chips.getByRole('button', { name: 'Bromo' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Sal' })).toHaveCount(0);
});

test('tasks: checklist with notes, report detail and Historial', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);

  await startVisit(page);
  const list = page.getByRole('list', { name: 'Tareas' });
  await expect(list.locator(':scope > li')).toHaveCount(4);
  await expect(page.getByText('0 de 4 hechas')).toBeVisible();
  await page.getByLabel('Barrido / limpieza de fondo', { exact: true }).check();
  await page.getByLabel('Contralavado del filtro', { exact: true }).check();
  await page.getByRole('button', { name: 'Añadir nota a Retirada de hojas' }).click();
  await page.getByLabel('Nota de Retirada de hojas').fill('Sin hojas hoy');
  await expect(page.getByText('2 de 4 hechas')).toBeVisible();
  await complete(page);

  // Done tasks and the noted one are saved; untouched ones are not.
  expect((backend.db.report_task as Row[]).map((r) => [r.task_id, r.hecho, r.nota]).sort()).toEqual(
    [
      ['task-1', true, null],
      ['task-3', true, null],
      ['task-4', false, 'Sin hojas hoy'],
    ],
  );
  await expect(page.getByRole('main')).toContainText('Contralavado del filtro');
  await expect(page.getByRole('main')).toContainText('Sin hojas hoy');

  await page.goto('/pools/p1?tab=historial');
  const row = page.getByRole('list', { name: 'Historial' }).locator(':scope > li').first();
  await expect(row).toContainText('2 tareas hechas');
  await row.getByRole('button', { expanded: false }).click();
  await expect(row).toContainText('Barrido / limpieza de fondo, hecha');
  await expect(row).toContainText('Retirada de hojas, no hecha');

  // Editing the visit shows what was saved.
  await page.goto(`/reports/${(backend.db.report as Row[])[0].id}/edit`);
  await expect(page.getByLabel('Contralavado del filtro', { exact: true })).toBeChecked();
  await expect(
    page.getByLabel('Vaciado de skimmers y prefiltro', { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel('Nota de Retirada de hojas')).toHaveValue('Sin hojas hoy');

  expect(errors).toEqual([]);
});

test('Ajustes: admins add, reorder and deactivate tasks', async ({ page }) => {
  const backend = await serveBackend(page, seed(), session);
  await page.goto('/settings');
  const list = page.getByRole('list', { name: 'Tareas de la visita' });
  await expect(list.locator(':scope > li')).toHaveCount(4);

  await page.getByRole('button', { name: 'Añadir tarea' }).click();
  const sheet = page.getByRole('dialog', { name: 'Añadir tarea' });
  await sheet.getByLabel('Nombre').fill('Limpieza de duchas');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(list.locator(':scope > li')).toHaveCount(5);

  await page.getByRole('button', { name: 'Subir Limpieza de duchas' }).click();
  await expect(list.locator(':scope > li').nth(3)).toContainText('Limpieza de duchas');
  await page.getByRole('button', { name: 'Desactivar: Retirada de hojas' }).click();
  await expect(page.getByRole('button', { name: 'Activar: Retirada de hojas' })).toBeVisible();
  expect((backend.db.task_def as Row[]).find((t) => t.nombre === 'Retirada de hojas')?.activo).toBe(
    false,
  );

  await startVisit(page);
  await expect(page.getByLabel('Limpieza de duchas', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Retirada de hojas', { exact: true })).toHaveCount(0);
});

test('readings outside SILOÉ: own section, "recomendado" wording, never a legal alert', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);

  await startVisit(page);
  // Folded away until needed; the main table holds SILOÉ parameters only.
  await expect(page.getByLabel('Sal Valor')).toBeHidden();
  await page.getByText('Otros parámetros (no SILOÉ)').click();
  await expect(page.getByText('Recomendado: 3–5')).toBeVisible();
  await page.getByLabel('Sal Valor').fill('4.2');
  await page.getByLabel('Fosfatos Valor').fill('0.3');
  await expect(page.getByText('Fuera de lo recomendado').first()).toBeVisible();
  await complete(page);

  const saved = (backend.db.measurement as Row[]).map((m) => [m.parameter_def_id, m.value]).sort();
  expect(saved).toEqual([
    ['pd-fos', 0.3],
    ['pd-ph', 7.4],
    ['pd-sal', 4.2],
  ]);
  // The report is not "out of range": phosphates only miss a recommendation.
  await expect(page.getByText(/fuera de rango/i)).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Fuera de lo recomendado');
  await expect(page.getByRole('main')).toContainText('No SILOÉ');

  // Historial: shown with the visit, worded as recommended, no red "out of range" edge.
  await page.goto('/pools/p1?tab=historial');
  const row = page.getByRole('list', { name: 'Historial' }).locator(':scope > li').first();
  await expect(row).not.toHaveClass(/border-l-status-red/);
  await row.getByRole('button', { expanded: false }).click();
  await expect(row).toContainText('Fosfatos');
  await expect(row).toContainText('Fuera de lo recomendado');

  // Trends offer them, with a recommended (not legal) range.
  await page.getByRole('tab', { name: 'Evolución' }).click();
  await page.getByLabel('Parámetro').selectOption({ label: 'Sal' });
  await expect(page.getByText('Recomendado: 3–5 g/L')).toBeVisible();
  await expect(page.getByText('Rango recomendado')).toBeVisible();

  // No legal alert in the bell for the phosphates.
  await page.getByRole('button', { name: /Avisos/ }).click();
  await expect(page.getByText('Todo en orden')).toBeVisible();

  expect(errors).toEqual([]);
});

test('"Repetir última visita" copies technician, products and tasks — never readings', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const db = seed();
  db.app_user.push({
    id: 'user-0002',
    org_id: ORG,
    role: 'technician',
    full_name: 'Juan Pérez',
    email: 'juan@example.com',
  });
  db.report.push({
    id: 'prev-1',
    org_id: ORG,
    pool_id: 'p1',
    basin_id: 'b1',
    technician_id: 'user-0002',
    visited_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    status: 'signed',
    analysis_type: 'autocontrol',
  });
  db.measurement.push({
    id: 'm-prev',
    org_id: ORG,
    report_id: 'prev-1',
    parameter_def_id: 'pd-ph',
    value: 7.9,
    status: 'amber',
  });
  db.report_chemical.push(
    {
      id: 'rc-prev-1',
      org_id: ORG,
      report_id: 'prev-1',
      product_id: 'chem-1',
      cantidad: 0.75,
      unidad: 'kg',
    },
    {
      id: 'rc-prev-2',
      org_id: ORG,
      report_id: 'prev-1',
      product_id: 'chem-4',
      cantidad: 2,
      unidad: 'L',
    },
  );
  db.report_task.push(
    {
      id: 'rt-prev-1',
      org_id: ORG,
      report_id: 'prev-1',
      task_id: 'task-1',
      hecho: true,
      nota: 'Mucha hoja',
    },
    {
      id: 'rt-prev-2',
      org_id: ORG,
      report_id: 'prev-1',
      task_id: 'task-3',
      hecho: false,
      nota: null,
    },
  );
  const backend = await serveBackend(page, db, session);

  await page.goto('/reports/new?poolId=p1');
  await page.getByLabel('Vaso').selectOption({ label: 'Vaso grande' });
  await expect(page.getByLabel('Técnico')).toHaveValue(appUser.id as string);
  await page.getByRole('button', { name: 'Repetir última visita' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copiado de la visita' })).toContainText(
    'técnico, 2 productos añadidos, 1 tarea hecha',
  );
  await expect(page.getByText('Las lecturas no se copian: mídelas.')).toBeVisible();
  await expect(page.getByLabel('Técnico')).toHaveValue('user-0002');
  await expect(page.getByLabel('Cantidad de Cloro granulado')).toHaveValue('0,75');
  await expect(page.getByLabel('Cantidad de Floculante')).toHaveValue('2');
  await expect(page.getByLabel('Barrido / limpieza de fondo', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Contralavado del filtro', { exact: true })).not.toBeChecked();
  // The note described that visit, not this one; readings are empty.
  await expect(page.getByLabel('Nota de Barrido / limpieza de fondo')).toHaveCount(0);
  await expect(page.getByLabel('pH Valor')).toHaveValue('');

  await page.getByLabel('pH Valor').fill('7.5');
  await complete(page);
  const created = (backend.db.report as Row[]).find((r) => r.id !== 'prev-1')!;
  expect(created.technician_id).toBe('user-0002');
  expect(
    (backend.db.report_chemical as Row[]).filter((r) => r.report_id === created.id),
  ).toHaveLength(2);
  expect((backend.db.report_task as Row[]).filter((r) => r.report_id === created.id)).toHaveLength(
    1,
  );
  expect((backend.db.measurement as Row[]).filter((m) => m.report_id === created.id)).toEqual([
    expect.objectContaining({ parameter_def_id: 'pd-ph', value: 7.5 }),
  ]);
  expect(errors).toEqual([]);
});

test('route stops: a saved report marks the stop done; skip with a reason; undo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const db = seed();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  db.pool.push({ ...(db.pool[0] as Row), id: 'p2', denominacion: 'Hotel Sol · Piscina' });
  db.basin.push({ id: 'b2', org_id: ORG, pool_id: 'p2', denominacion: 'Vaso único', num_orden: 1 });
  db.route = [{ id: 'r1', org_id: ORG, technician_id: appUser.id, route_date: today }];
  db.route_stop = [
    {
      id: 's1',
      org_id: ORG,
      route_id: 'r1',
      pool_id: 'p1',
      seq: 1,
      eta: null,
      estado: 'pendiente',
      motivo: null,
      report_id: null,
    },
    {
      id: 's2',
      org_id: ORG,
      route_id: 'r1',
      pool_id: 'p2',
      seq: 2,
      eta: null,
      estado: 'pendiente',
      motivo: null,
      report_id: null,
    },
  ];
  const backend = await serveBackend(page, db, session);

  await page.goto('/routes');
  await expect(page.getByText('0 de 2 hechas')).toBeVisible();

  // Saving a report for the first pool marks its stop done.
  await startVisit(page);
  await complete(page);
  await page.goto('/routes');
  const stops = page.getByRole('listitem').filter({ hasText: 'Las Dunas · Piscina' });
  await expect(stops.first()).toContainText('Hecha');
  await expect(page.getByRole('link', { name: 'Ver informe: Las Dunas · Piscina' })).toBeVisible();
  await expect(page.getByText('1 de 2 hechas')).toBeVisible();

  // Skipping needs a reason; one tap on a usual reason is enough.
  await page.getByRole('button', { name: 'Saltar: Hotel Sol · Piscina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Saltar parada: Hotel Sol · Piscina' });
  await expect(dialog.getByRole('button', { name: 'Marcar como saltada' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Lluvia' }).click();
  await dialog.getByRole('button', { name: 'Marcar como saltada' }).click();
  const hotel = page.getByRole('listitem').filter({ hasText: 'Hotel Sol · Piscina' }).first();
  await expect(hotel).toContainText('Saltada');
  await expect(hotel).toContainText('Lluvia');
  expect((backend.db.route_stop as Row[]).find((s) => s.id === 's2')).toMatchObject({
    estado: 'saltada',
    motivo: 'Lluvia',
  });

  // The dashboard's today card shows the same.
  await page.goto('/');
  await expect(page.getByText(/1 de 2 hechas/)).toBeVisible();
  await expect(page.getByText('Saltada')).toBeVisible();

  // Undo.
  await page.goto('/routes');
  await page.getByRole('button', { name: 'Deshacer: Hotel Sol · Piscina' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Hotel Sol · Piscina' }).first(),
  ).toContainText('Pendiente');
  expect(errors).toEqual([]);
});

test('photo import: the draft takes products and tasks too, readings stay SILOÉ-only', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);
  // The extraction endpoint (Vercel function) isn't served by the harness: answer it here.
  await page.route('**/api/extract-reading', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'test-model',
        text: JSON.stringify({ readings: { ph: 7.3 } }),
      }),
    }),
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  await page.goto('/reports/import');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'parte.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Analizar parte' }).click();
  await page
    .getByRole('combobox', { name: 'Piscina', exact: true })
    .selectOption({ label: 'Las Dunas · Piscina' });
  await page
    .getByRole('combobox', { name: 'Vaso', exact: true })
    .selectOption({ label: 'Vaso grande' });
  await expect(page.getByLabel('pH Valor')).toHaveValue('7.3');
  // Readings outside SILOÉ are not part of photo import.
  await expect(page.getByLabel('Sal Valor')).toHaveCount(0);

  await page
    .getByRole('group', { name: 'Productos' })
    .getByRole('button', { name: 'Cloro granulado' })
    .click();
  await page.getByLabel('Barrido / limpieza de fondo', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar como borrador' }).click();
  await expect(page).toHaveURL(/\/reports\/(?!import)[^/?]+$/);

  const draft = (backend.db.report as Row[])[0];
  expect(draft).toMatchObject({ status: 'draft', source: 'photo_import' });
  expect(
    (backend.db.report_chemical as Row[]).map((r) => [r.report_id, r.product_id, r.cantidad]),
  ).toEqual([[draft.id, 'chem-1', 0.5]]);
  expect((backend.db.report_task as Row[]).map((r) => [r.report_id, r.task_id])).toEqual([
    [draft.id, 'task-1'],
  ]);
  await expect(page.getByRole('main')).toContainText('Cloro granulado');
  expect(errors).toEqual([]);
});
