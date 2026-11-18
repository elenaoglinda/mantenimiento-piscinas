import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { serveBackend, type Db, type Row } from './backend';
import { appUser, session } from './fixtures';
import { SUPABASE_HOST } from './target';

/**
 * The Comunidad Autónoma is picked from the 19 communities and prefilled from the postcode, so
 * a pool in Barcelona gets Cataluña's thresholds without anyone typing "Cataluña". A manual
 * choice is never overwritten by the address.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'the community select runs on the redesign only',
);
test.setTimeout(120_000);

function seed(): Db {
  const { org, ...user } = appUser;
  const client = {
    id: 'c-1',
    org_id: org.id,
    name: 'Comunidad del Mar',
    is_self: false,
    archived: false,
  };
  const pool: Row = {
    id: 'p-1',
    org_id: org.id,
    client_id: client.id,
    denominacion: 'Sin región',
    pool_type: 'tipo_2',
    agua_alimentacion: [],
    archived: false,
    cp: null,
    provincia: null,
    ccaa: null,
    ccaa_code: null,
    created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  };
  return {
    org: [org],
    app_user: [user],
    client: [client],
    pool: [pool],
    basin: [],
    report: [],
    measurement: [],
    parameter_def: [],
    route: [],
    route_stop: [],
  };
}

test('the postcode fills the community; a manual choice sticks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = await serveBackend(page, seed(), session);
  await page.goto('/pools');
  await page.getByRole('button', { name: 'Nueva piscina' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nueva piscina' });
  const ccaa = sheet.getByLabel('Comunidad Autónoma');

  await expect(ccaa).toHaveValue('');
  await sheet.getByLabel('Código postal').fill('08001');
  await expect(ccaa).toHaveValue('CT');
  await expect(ccaa.locator('option:checked')).toHaveText('Cataluña');

  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target} ${n.failureSummary}`)),
  ).toEqual([]);

  await ccaa.selectOption({ label: 'Comunidad de Madrid' });
  await sheet.getByLabel('Código postal').fill('29001');
  await expect(ccaa).toHaveValue('MD');

  await sheet.getByLabel('Cliente').selectOption({ label: 'Comunidad del Mar' });
  await sheet.getByLabel('Nombre de la instalación').fill('Piscina Nueva');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Piscina Nueva' })).toBeVisible();
  const saved = backend.db.pool.find((p) => p.denominacion === 'Piscina Nueva')!;
  expect(saved.ccaa_code).toBe('MD');
  expect(saved.ccaa).toBe('Comunidad de Madrid');
  await expect(page.getByText('Comunidad de Madrid')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pool without a community says so', async ({ page }) => {
  await serveBackend(page, seed(), session);
  await page.goto('/pools/p-1');
  await expect(page.getByText('Sin indicar: elígela al editar la piscina')).toBeVisible();
});

test('before the migration, saving still works and keeps the name', async ({ page }) => {
  const backend = await serveBackend(page, seed(), session);
  let refused = 0;
  // Registered after the backend, so it answers first, like PostgREST without the column.
  await page.route(`${SUPABASE_HOST}/rest/v1/pool?**`, async (route) => {
    const body = route.request().postData() ?? '';
    if (route.request().method() === 'PATCH' && body.includes('ccaa_code')) {
      refused++;
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          code: 'PGRST204',
          message: "Could not find the 'ccaa_code' column of 'pool' in the schema cache",
        }),
      });
    }
    return route.fallback();
  });
  await page.goto('/pools/p-1');
  await page.getByRole('button', { name: 'Editar' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Editar piscina' });
  await sheet.getByLabel('Código postal').fill('43001');
  await expect(sheet.getByLabel('Comunidad Autónoma')).toHaveValue('CT');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(sheet).toBeHidden();
  expect(refused).toBe(1);
  const pool = backend.db.pool.find((p) => p.id === 'p-1')!;
  expect(pool.ccaa).toBe('Cataluña');
  expect(pool.cp).toBe('43001');
});
