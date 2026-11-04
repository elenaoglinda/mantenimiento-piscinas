import type { BrowserContext, Page, Route } from '@playwright/test';
import { appUser, session, tables, teamMembers } from './fixtures';
import { AUTH_STORAGE_KEY, SUPABASE_HOST } from './target';

/** Fake Supabase backend shared by the capture specs. See AUDIT.md for why each rule exists. */
export type AuthMode = 'none' | 'no-profile' | 'full';

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

/** Works on a page, or on a whole context (so tabs opened by other tools — Lighthouse — match). */
export async function mockSupabase(page: Page | BrowserContext, auth: AuthMode) {
  await page.route(`${SUPABASE_HOST}/**`, async (route) => {
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
        table === 'app_user'
          ? auth === 'full'
            ? [appUser, ...teamMembers]
            : []
          : (tables[table] ?? []);

      // Honour simple equality filters (id=eq.x, archived=eq.false) so detail pages resolve.
      for (const [k, v] of url.searchParams) {
        if (v.startsWith('eq.')) {
          const want = v.slice(3);
          rows = rows.filter((r) => r[k] === undefined || String(r[k]) === want);
        } else if (v.startsWith('in.')) {
          const set = v
            .slice(3)
            .replace(/^\(|\)$/g, '')
            .split(',')
            .map((x) => x.replace(/^"|"$/g, ''));
          rows = rows.filter((r) => r[k] === undefined || set.includes(String(r[k])));
        } else if (v.startsWith('gte.') || v.startsWith('lte.')) {
          const bound = v.slice(4);
          rows = rows.filter(
            (r) =>
              r[k] === undefined || (v[0] === 'g' ? String(r[k]) >= bound : String(r[k]) <= bound),
          );
        } else if (v.startsWith('ilike.')) {
          // %term% → case-insensitive contains (what ⌘K search sends).
          const want = v.slice(6).replace(/%/g, '').toLowerCase();
          rows = rows.filter((r) =>
            String(r[k] ?? '')
              .toLowerCase()
              .includes(want),
          );
        }
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
    await page.addInitScript(({ key, s }) => window.localStorage.setItem(key, JSON.stringify(s)), {
      key: AUTH_STORAGE_KEY,
      s: session,
    });
  }
}
