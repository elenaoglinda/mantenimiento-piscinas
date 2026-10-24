import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { mockSupabase, type AuthMode } from './mock';

/**
 * Captures every route of the panel at three widths, against a fake Supabase backend.
 * Output: docs/redesign/<SHOT_DIR>/<route>--<width>.png plus _report.json listing any page
 * errors, so a crash shows up as data rather than as a blank screenshot nobody notices.
 */
const ROUTES: { slug: string; path: string; auth: AuthMode }[] = [
  { slug: 'login', path: '/login', auth: 'none' },
  { slug: 'signup', path: '/signup', auth: 'none' },
  { slug: 'invite', path: '/invite/demo-token', auth: 'none' },
  { slug: 'onboarding', path: '/onboarding', auth: 'no-profile' },
  { slug: 'inicio', path: '/', auth: 'full' },
  { slug: 'pools', path: '/pools', auth: 'full' },
  { slug: 'pool-detail', path: '/pools/pool-1', auth: 'full' },
  { slug: 'reports', path: '/reports', auth: 'full' },
  { slug: 'report-new', path: '/reports/new', auth: 'full' },
  { slug: 'report-import', path: '/reports/import', auth: 'full' },
  { slug: 'report-detail', path: '/reports/rep-1', auth: 'full' },
  { slug: 'report-edit', path: '/reports/rep-1/edit', auth: 'full' },
  { slug: 'routes', path: '/routes', auth: 'full' },
  { slug: 'siloe', path: '/siloe', auth: 'full' },
  { slug: 'invoices', path: '/invoices', auth: 'full' },
  { slug: 'invoices-resumen', path: '/invoices/resumen', auth: 'full' },
  { slug: 'invoices-settings', path: '/invoices/settings', auth: 'full' },
  { slug: 'invoice-detail', path: '/invoices/demo', auth: 'full' },
  { slug: 'clients', path: '/clients', auth: 'full' },
  { slug: 'team', path: '/team', auth: 'full' },
];

// Added by the redesign; the "before" build doesn't have it.
if (process.env.SHOT_DIR !== 'before') {
  ROUTES.push({ slug: 'design', path: '/design', auth: 'none' });
}

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

  for (const r of ROUTES) {
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
