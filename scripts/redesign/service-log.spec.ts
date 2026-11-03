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
