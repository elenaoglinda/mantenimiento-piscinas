import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './mock';

/**
 * Interactive shell states a plain page capture can't show. Skipped for the "before" set,
 * which predates the shell.
 */
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'redesign',
  process.env.SHOT_DIR ?? 'before',
);

test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'the old layout has no sidebar states; ONLY= runs just the page captures',
);

test('shell states', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });

  // Collapsed rail, with a tooltip showing.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await mockSupabase(page, 'full');
    await page.addInitScript(() => localStorage.setItem('cloro.sidebar.collapsed', '1'));
    await page.goto('/pools', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Informes' }).first().hover();
    await expect(page.getByRole('tooltip')).toHaveText('Informes');
    await page.screenshot({ path: join(OUT, 'shell-collapsed--1440.png') });
    await ctx.close();
  }

  // ⌘K palette and the user menu, desktop.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await mockSupabase(page, 'full');
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('silo');
    await page.screenshot({ path: join(OUT, 'shell-palette--1440.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Elena Oglinda/ }).click();
    await page.screenshot({ path: join(OUT, 'shell-usermenu--1440.png') });
    await ctx.close();
  }

  // Mobile drawer open.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await mockSupabase(page, 'full');
    await page.goto('/reports', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Menú' }).click();
    await expect(page.locator('#mobile-drawer')).toBeVisible();
    await page.screenshot({ path: join(OUT, 'shell-drawer--390.png') });
    await ctx.close();
  }
});
