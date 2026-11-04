import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { mockSupabase } from './mock';
import { ROUTES } from './routes';

/**
 * Captures every route of the panel at three widths, against a fake Supabase backend.
 * Output: docs/redesign/<SHOT_DIR>/<route>--<width>.png plus _report.json listing any page
 * errors, so a crash shows up as data rather than as a blank screenshot nobody notices.
 */
const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'redesign', process.env.SHOT_DIR ?? 'before');

test('capture every route at every width', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const report: { route: string; width: number; errors: string[]; finalUrl: string }[] = [];

  // ONLY=inicio,pools captures a subset while iterating on a page.
  const only = process.env.ONLY?.split(',');
  for (const r of ROUTES.filter((x) => !only || only.includes(x.slug))) {
    for (const { w, h } of WIDTHS) {
      const context = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });

      await mockSupabase(page, r.auth);
      await page.goto(r.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${r.slug}--${w}.png`), fullPage: true });

      report.push({ route: r.path, width: w, errors, finalUrl: new URL(page.url()).pathname });
      await context.close();
    }
  }
  writeFileSync(join(OUT, '_report.json'), JSON.stringify(report, null, 2) + '\n');
});
