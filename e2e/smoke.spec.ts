import { expect, test } from '@playwright/test';

test('app loads and shows the Phase 0 landing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Base del proyecto lista' })).toBeVisible();
  await expect(page.getByText('pH 7.6')).toBeVisible();
});
