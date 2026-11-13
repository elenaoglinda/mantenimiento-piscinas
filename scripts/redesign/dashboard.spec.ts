import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { serveBackend, type Db } from './backend';
import { appUser, session } from './fixtures';
import { SUPABASE_HOST } from './target';

/**
 * The dashboard counts what is really there, and says so when it can't.
 *
 * Regression for the live panel showing "Piscinas activas 0" and "Todo en orden" next to a
 * Piscinas page with 7 unvisited pools: the dashboard's pool query used an embed PostgREST
 * rejects (PGRST200) and the page read the missing rows as "no pools". backend.ts now rejects
 * that embed like the real server, so this spec fails on the old query.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'dashboard runs on the redesign only',
);
test.setTimeout(120_000);

const NAMES = ['Arkana', 'Brisa', 'Coral', 'Delfín', 'Espuma', 'Faro', 'Gaviota'];

function seed(): Db {
  const { org, ...user } = appUser;
  const client = { id: 'c-1', org_id: org.id, name: 'Comunidad Arkana', is_self: false };
  return {
    org: [org],
    app_user: [user],
    client: [client],
    pool: NAMES.map((n, i) => ({
      id: `p-${i}`,
      org_id: org.id,
      client_id: client.id,
      denominacion: n,
      archived: false,
      created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    })),
    basin: [],
    report: [],
    measurement: [],
    parameter_def: [],
    route: [],
    route_stop: [],
  };
}

/** The big number on a dashboard stat card, found by its label. */
const statValue = (page: Page, label: string) =>
  page
    .getByRole('link', { name: new RegExp(label) })
    .locator('p')
    .first();

test('counts active pools and lists the ones never visited', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await serveBackend(page, seed(), session);
  await page.goto('/');

  await expect(statValue(page, 'Piscinas activas')).toHaveText('7');
  await expect(page.getByText('7 sin visita en 30 días')).toBeVisible();
  // The alerts card shows the first five unvisited pools, never "Todo en orden".
  await expect(page.getByText('Sin visitas registradas')).toHaveCount(5);
  await expect(page.getByText('Todo en orden. No hay avisos.')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a failed query shows an error, never zeros or "Todo en orden"', async ({ page }) => {
  await serveBackend(page, seed(), session);
  // Registered after the backend, so it answers first: the pools query fails.
  await page.route(`${SUPABASE_HOST}/rest/v1/pool?**`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: 'XX000', message: 'boom' }),
    }),
  );
  await page.goto('/');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se ha podido cargar el panel');
  await expect(statValue(page, 'Piscinas activas')).toHaveText('—');
  await expect(page.getByText('Todo en orden. No hay avisos.')).toHaveCount(0);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target} ${n.failureSummary}`)),
  ).toEqual([]);

  // Retrying after the failure clears loads the real numbers.
  await page.unroute(`${SUPABASE_HOST}/rest/v1/pool?**`);
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(statValue(page, 'Piscinas activas')).toHaveText('7');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
