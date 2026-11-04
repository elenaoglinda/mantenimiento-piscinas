import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import { mockSupabase } from './mock';
import { ROUTES } from './routes';

/**
 * Lighthouse accessibility score for every page (target ≥ 95). Lighthouse drives a Chromium that
 * Playwright launched, and the fake Supabase backend is attached to the whole browser context,
 * so the tab Lighthouse opens gets the same data as the screenshots.
 *
 * Opt-in — it fetches the Lighthouse CLI through npx and takes a few minutes:
 *   LIGHTHOUSE=1 SHOT_DIR=after npx playwright test -c scripts/redesign/playwright.config.ts lighthouse
 */
test.skip(!process.env.LIGHTHOUSE, 'set LIGHTHOUSE=1 to run');

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9333;
const LIGHTHOUSE = 'lighthouse@13.4.0';
// Async on purpose: a blocking spawn would stall Playwright, which must attach to Lighthouse's tab.
const run = promisify(execFile);

test('Lighthouse accessibility ≥ 95 on every page', async () => {
  test.setTimeout(1_200_000);
  const scores: { route: string; finalUrl: string; score: number; failing: string[] }[] = [];

  const only = process.env.ONLY?.split(',');
  for (const r of ROUTES.filter((x) => !only || only.includes(x.slug))) {
    // A fresh browser per page: the stored session (or its absence) and the mock rules are set
    // on the context before Lighthouse opens its tab.
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'lh-')), {
      executablePath: process.env.PW_CHROMIUM,
      args: [`--remote-debugging-port=${PORT}`],
    });
    try {
      await mockSupabase(context, r.auth);
      const out = join(mkdtempSync(join(tmpdir(), 'lhr-')), 'report.json');
      await run(
        'npx',
        [
          '-y',
          LIGHTHOUSE,
          `http://localhost:4174${r.path}`,
          `--port=${PORT}`,
          '--only-categories=accessibility',
          '--disable-storage-reset',
          '--throttling-method=provided',
          '--output=json',
          `--output-path=${out}`,
          '--quiet',
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      const lhr = JSON.parse(readFileSync(out, 'utf8'));
      const cat = lhr.categories.accessibility;
      scores.push({
        route: r.path,
        // Where Lighthouse ended up: proves logged-in pages weren't bounced to /login.
        finalUrl: new URL(lhr.finalDisplayedUrl).pathname,
        score: Math.round(cat.score * 100),
        failing: cat.auditRefs
          .filter(
            (a: { id: string; weight: number }) => a.weight > 0 && lhr.audits[a.id].score === 0,
          )
          .map((a: { id: string }) => a.id),
      });
    } finally {
      await context.close();
    }
  }

  const dir = join(HERE, '..', '..', 'docs', 'redesign', process.env.SHOT_DIR ?? 'after');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '_lighthouse.json'), JSON.stringify(scores, null, 2) + '\n');
  const low = scores.filter((s) => s.score < 95);
  expect(low, JSON.stringify(low, null, 2)).toEqual([]);
});
