import { expect, test } from '@playwright/test';
import { mockSupabase } from './mock';
import { ROUTES } from './routes';

/**
 * No page may scroll sideways on a phone. Measures every route at 390px and names the widest
 * offenders, so a regression points straight at the element.
 */
test.skip(process.env.SHOT_DIR === 'before', 'the old layout is the baseline, not under test');

test('no horizontal scroll at 390px', async ({ browser }) => {
  const only = process.env.ONLY?.split(',');
  const failures: string[] = [];
  for (const r of ROUTES.filter((x) => !only || only.includes(x.slug))) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await mockSupabase(page, r.auth);
    await page.goto(r.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const width = document.documentElement.scrollWidth;
      const culprits = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const box = el.getBoundingClientRect();
          const parent = el.parentElement?.getBoundingClientRect();
          return box.width > 0 && box.right > 391 && (!parent || parent.right <= 391);
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
      return { width, culprits };
    });
    if (result.width > 390)
      failures.push(`${r.path}: ${result.width}px ${result.culprits.join(' | ')}`);
    await context.close();
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
