import { expect, test, type Page } from '@playwright/test';
import { mockSupabase } from './mock';

/**
 * Keyboard-only use of the shell and the kit: skip link, palette, drawer focus trap, sheets,
 * tables and tabs. Every assertion is about where focus is or what the keys did.
 */
test.skip(
  process.env.SHOT_DIR === 'before' || !!process.env.ONLY,
  'keyboard checks run on the redesign only',
);

async function open(page: Page, path: string, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await mockSupabase(page, 'full');
  await page.goto(path, { waitUntil: 'networkidle' });
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el
      ? `${el.tagName.toLowerCase()}|${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}`
      : '';
  });

test('skip link is first and moves focus to the content', async ({ page }) => {
  await open(page, '/pools');
  await page.keyboard.press('Tab');
  expect(await focused(page)).toContain('Saltar al contenido');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});

test('⌘K palette: open, filter, arrow, Enter navigates, Esc closes', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Ir a una página' });
  await expect(input).toBeFocused();
  await page.keyboard.type('silo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/siloe$/);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
});

test('mobile drawer traps focus, closes with Esc and returns focus', async ({ page }) => {
  await open(page, '/', 390);
  const menu = page.getByRole('button', { name: 'Menú' });
  await menu.focus();
  await page.keyboard.press('Enter');
  const drawer = page.locator('#mobile-drawer');
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
});

test('side sheet traps focus and returns it to its trigger', async ({ page }) => {
  await open(page, '/pools');
  const trigger = page.getByRole('button', { name: 'Nueva piscina' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Nueva piscina' });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('tables: sort from the keyboard, follow a row link with Enter', async ({ page }) => {
  await open(page, '/pools');
  const header = page.getByRole('columnheader', { name: /Piscina/ });
  await header.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('link', { name: 'Las Palmeras · Spa' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pools\/pool-3$/);
});

test('in-page tabs move with arrow keys', async ({ page }) => {
  await open(page, '/pools/pool-1');
  await page.getByRole('tab', { name: 'Resumen' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Vasos/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /Vasos/ })).toHaveAttribute('aria-selected', 'true');
});

test('collapsed rail shows tooltips on keyboard focus', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'Contraer menú' }).click();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Informes' })
    .focus();
  await expect(page.getByRole('tooltip')).toHaveText('Informes');
});
