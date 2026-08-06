import { expect, test } from '@playwright/test';

test('unauthenticated visit lands on the login screen', async ({ page }) => {
  await page.goto('/');
  // Unauthenticated users are redirected to /login.
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // The page must never scroll sideways on a phone.
  async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  }

  test('login renders without horizontal overflow on a phone', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('sign-up renders without horizontal overflow on a phone', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
