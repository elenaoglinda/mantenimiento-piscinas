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
