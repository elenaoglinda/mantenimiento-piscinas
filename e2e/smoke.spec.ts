import { expect, test } from '@playwright/test';

test('unauthenticated visit lands on the login screen', async ({ page }) => {
  await page.goto('/');
  // Unauthenticated users are redirected to /login.
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});
