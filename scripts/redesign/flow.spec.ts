import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { serveBackend, type Db } from './backend';
import { appUser, session } from './fixtures';

/**
 * The definition-of-done journey, through the real UI: create a client, a pool and a basin,
 * record a report, then generate and download the SILOÉ XML. Runs against the in-memory backend
 * in backend.ts, so it needs no credentials and never touches a real database.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'flow runs on the redesign only',
);

const lastYear = new Date().getFullYear() - 1;

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
  });
  return {
    org: [org],
    app_user: [user],
    parameter_def: [
      def('pd-ph', 1, 'pH', null, 7.2, 8),
      def('pd-cl', 10, 'Cloro libre residual', 'mg/L', 0.5, 2),
    ],
  };
}

test('client → pool → vaso → report → SILOÉ export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);

  // 1. Client
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Nuevo cliente' }).first().click();
  const clientSheet = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await clientSheet.getByLabel('Nombre').fill('Comunidad Las Dunas');
  await clientSheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('link', { name: 'Comunidad Las Dunas' })).toBeVisible();

  // 2. Pool (with its SILOÉ installation code)
  await page.goto('/pools');
  await page.getByRole('button', { name: 'Nueva piscina' }).first().click();
  const poolSheet = page.getByRole('dialog', { name: 'Nueva piscina' });
  await poolSheet.getByLabel('Cliente').selectOption({ label: 'Comunidad Las Dunas' });
  await poolSheet.getByLabel('Nombre de la instalación').fill('Las Dunas · Piscina');
  await poolSheet.getByLabel('Código SILOÉ (instalación)').fill('P-29069-777');
  await poolSheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Las Dunas · Piscina' })).toBeVisible();

  // 3. Basin
  await page.getByRole('tab', { name: /Vasos/ }).click();
  await page.getByRole('button', { name: 'Nuevo vaso' }).first().click();
  const basinDialog = page.getByRole('dialog', { name: 'Nuevo vaso' });
  await basinDialog.getByLabel('Nombre del vaso').fill('Vaso grande');
  await basinDialog.getByLabel('Código SILOÉ (vaso)').fill('V-777-01');
  await basinDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Vaso grande' })).toBeVisible();

  expect(backend.db.basin[0].siloe_cod_v).toBe('V-777-01');

  // 4. Report, from the pool's own "Nuevo informe" (pool pre-selected), dated last season.
  await page.getByRole('link', { name: 'Nuevo informe' }).last().click();
  await expect(page.getByRole('combobox', { name: 'Piscina' })).toHaveText(/Las Dunas · Piscina/);
  await page.getByLabel('Vaso').selectOption({ label: 'Vaso grande' });
  await page.getByLabel('Fecha y hora de la visita').fill(`${lastYear}-07-15T10:00`);
  await page.getByLabel('pH Valor').fill('7.5');
  await page.getByLabel('Cloro libre residual Valor').fill('1.1');
  // Live summary reflects what was typed.
  await expect(page.getByRole('complementary', { name: 'Resumen' })).toContainText('2 de 2');
  await page.getByRole('button', { name: 'Marcar como completo' }).first().click();
  // Saved: we land on the report itself, marked Completo, with the readings.
  await expect(page).toHaveURL(/\/reports\/[^/]+$/);
  await expect(page.getByText('Completo', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '7.5', exact: true })).toBeVisible();
  expect(backend.db.measurement).toHaveLength(2);

  // 5. SILOÉ: generate last season's results, add the lab code, download the XML.
  await page.goto('/siloe');
  await page.getByRole('button', { name: 'Generar resultados anuales' }).click();
  await expect(page.getByText('Vaso grande')).toBeVisible();
  await page.getByLabel('Código de laboratorio').fill('LAB-0001');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar XML' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`siloe-resultados-${lastYear}-autocontrol.xml`);
  const xml = readFileSync(await download.path(), 'utf8');
  expect(xml).toContain('P-29069-777');
  expect(xml).toContain('V-777-01');
  await expect(page.getByText('XML generado y descargado.')).toBeVisible();
  expect(backend.db.xml_export).toHaveLength(1);

  expect(errors).toEqual([]);
});
