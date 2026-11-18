import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { serveBackend, type Db, type Row } from './backend';
import { appUser, session } from './fixtures';

/**
 * The SILOÉ badge is green only when the annual export would work: the installation and every
 * active vaso have codes. Regression for Pool Arkana showing green with an uncoded vaso.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'the SILOÉ badge runs on the redesign only',
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
  const pool = (id: string, denominacion: string, siloe_cod_p: string | null): Row => ({
    id,
    org_id: org.id,
    client_id: client.id,
    denominacion,
    pool_type: 'tipo_2',
    agua_alimentacion: [],
    archived: false,
    siloe_cod_p,
    created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  });
  const basin = (
    id: string,
    pool_id: string,
    denominacion: string,
    siloe_cod_v: string | null,
    fecha_baja: string | null = null,
  ): Row => ({
    id,
    org_id: org.id,
    pool_id,
    denominacion,
    num_orden: Number(id.slice(-1)),
    siloe_cod_v,
    fecha_baja,
    tipo_vaso: ['recreativo'],
    treatment: [],
  });
  return {
    org: [org],
    app_user: [user],
    client: [client],
    pool: [
      pool('p-1', 'Arkana', 'P-1'),
      pool('p-2', 'Brisa', 'P-2'),
      pool('p-3', 'Coral', null),
      pool('p-4', 'Delfín', 'P-4'),
    ],
    basin: [
      basin('b-1', 'p-1', 'Vaso principal', 'V-1'),
      basin('b-2', 'p-1', 'Chapoteo', null),
      basin('b-3', 'p-2', 'Vaso único', 'V-3'),
      // Dropped in 2020: SILOÉ no longer expects its results.
      basin('b-4', 'p-2', 'Vaso antiguo', null, '2020-01-01'),
      basin('b-5', 'p-3', 'Vaso único', 'V-5'),
    ],
    report: [],
    measurement: [],
    parameter_def: [],
    route: [],
    route_stop: [],
  };
}

test('the pools list says which SILOÉ codes are missing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await serveBackend(page, seed(), session);
  await page.goto('/pools');

  const row = (name: string) => page.getByRole('row').filter({ hasText: name });
  await expect(row('Arkana')).toContainText('Falta el código de 1 vaso');
  await expect(row('Brisa')).toContainText('Códigos SILOÉ completos');
  await expect(row('Coral')).toContainText('Falta el código de la instalación');
  await expect(row('Delfín')).toContainText('Sin vasos activos');

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target} ${n.failureSummary}`)),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('the pool page header is amber while a vaso has no code', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await serveBackend(page, seed(), session);
  await page.goto('/pools/p-1');
  await expect(page.getByText('Falta el código de 1 vaso')).toBeVisible();
  await expect(page.getByText('Códigos SILOÉ completos')).toHaveCount(0);
  expect(errors).toEqual([]);
});
