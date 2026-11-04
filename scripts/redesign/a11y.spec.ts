import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './mock';
import { ROUTES } from './routes';

/**
 * axe-core (WCAG 2.0/2.1 A + AA) on every page, at desktop and phone widths. Fails on any
 * violation and writes the full list to docs/redesign/<SHOT_DIR>/_axe.json.
 */
test.skip(process.env.SHOT_DIR === 'before', 'the old layout is the baseline, not under test');

const HERE = dirname(fileURLToPath(import.meta.url));

test('axe: no WCAG A/AA violations', async ({ browser }) => {
  const only = process.env.ONLY?.split(',');
  const found: { route: string; width: number; id: string; impact: string; nodes: string[] }[] = [];
  for (const r of ROUTES.filter((x) => !only || only.includes(x.slug))) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await mockSupabase(page, r.auth);
      await page.goto(r.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      for (const v of result.violations) {
        found.push({
          route: r.path,
          width,
          id: v.id,
          impact: v.impact ?? 'unknown',
          nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
        });
      }
      await context.close();
    }
  }
  const out = join(HERE, '..', '..', 'docs', 'redesign', process.env.SHOT_DIR ?? 'after');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, '_axe.json'), JSON.stringify(found, null, 2) + '\n');
  expect(found, JSON.stringify(found, null, 2)).toEqual([]);
});

test('axe: overlays in their open state', async ({ browser }) => {
  const states: {
    name: string;
    path: string;
    width: number;
    open: (page: import('@playwright/test').Page) => Promise<void>;
  }[] = [
    {
      name: 'pool sheet',
      path: '/pools',
      width: 1440,
      open: (p) => p.getByRole('button', { name: 'Nueva piscina' }).first().click(),
    },
    {
      name: '⌘K palette',
      path: '/',
      width: 1440,
      open: (p) => p.keyboard.press('Control+k'),
    },
    {
      name: 'user menu',
      path: '/',
      width: 1440,
      open: (p) => p.getByRole('button', { name: /Elena Oglinda/ }).click(),
    },
    {
      name: 'mobile drawer',
      path: '/',
      width: 390,
      open: (p) => p.getByRole('button', { name: 'Menú' }).click(),
    },
    {
      // A Clientes row opens the client page; editing is its "Editar" button.
      name: 'client edit sheet',
      path: '/clients/cli-2',
      width: 1440,
      open: (p) => p.getByRole('button', { name: 'Editar' }).click(),
    },
  ];
  const found: string[] = [];
  for (const s of states) {
    const context = await browser.newContext({ viewport: { width: s.width, height: 900 } });
    const page = await context.newPage();
    await mockSupabase(page, 'full');
    await page.goto(s.path, { waitUntil: 'networkidle' });
    await s.open(page);
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    for (const v of result.violations) {
      found.push(`${s.name}: ${v.id} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    }
    await context.close();
  }
  expect(found, found.join('\n')).toEqual([]);
});
