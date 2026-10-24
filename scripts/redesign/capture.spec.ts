import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type Page, type Route } from '@playwright/test';
import { appUser, session, tables } from './fixtures';

/**
 * Captures every route of the panel at three widths, against a fake Supabase backend.
 * Output: docs/redesign/<SHOT_DIR>/<route>--<width>.png plus _report.json listing any page
 * errors, so a crash shows up as data rather than as a blank screenshot nobody notices.
 */
type AuthMode = 'none' | 'no-profile' | 'full';

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

const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'redesign', process.env.SHOT_DIR ?? 'before');

// Supabase exposes Content-Range cross-origin; without this every `count` query reads as 0.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range, content-profile',
};

function json(route: Route, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS, ...extra },
    body: JSON.stringify(body),
  });
}

async function mockSupabase(page: Page, auth: AuthMode) {
  await page.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }
    if (path.startsWith('/auth/v1/user')) return json(route, session.user);
    if (path.startsWith('/auth/v1/token')) return json(route, session);
    if (path.startsWith('/auth/v1/')) return json(route, {});
    if (path.startsWith('/rest/v1/rpc/')) return json(route, []);

    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      let rows: Record<string, unknown>[] =
        table === 'app_user' ? (auth === 'full' ? [appUser] : []) : (tables[table] ?? []);

      // Honour simple equality filters (id=eq.x, archived=eq.false) so detail pages resolve.
      for (const [k, v] of url.searchParams) {
        if (!v.startsWith('eq.')) continue;
        const want = v.slice(3);
        rows = rows.filter((r) => r[k] === undefined || String(r[k]) === want);
      }

      const range = {
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      };
      if (req.method() === 'HEAD') {
        return route.fulfill({ status: 200, headers: { ...CORS, ...range } });
      }
      if (req.method() !== 'GET') return json(route, rows[0] ?? {}, 201);
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        return rows[0]
          ? json(route, rows[0])
          : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
      }
      return json(route, rows, 200, range);
    }
    return json(route, []);
  });

  if (auth !== 'none') {
    await page.addInitScript((s) => {
      window.localStorage.setItem('sb-mock-auth-token', JSON.stringify(s));
    }, session);
  }
}

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
