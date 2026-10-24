# Redesign harness

Playwright specs that capture and check the panel against a **fake Supabase backend**, so they
need no credentials and never touch a real database. Used for the panel redesign
([`docs/redesign/PLAN.md`](../../docs/redesign/PLAN.md)); kept because they are the cheapest way
to see every page at once and to catch layout, accessibility and keyboard regressions.

Not part of CI and separate from `e2e/` (which runs against a real build with real env).

```
playwright.config.ts  builds the app against https://mock.supabase.co and serves it on :4174
routes.ts             every page, with the auth state it needs
fixtures.ts           the fake org: clients, pools, basins, reports, readings, routes, SILOÉ
                      results, invoices, team — shaped like the queries the pages make
mock.ts               read-only fake backend for screenshots (fixed fixtures)
backend.ts            stateful fake backend (inserts/updates/deletes stick) for the flow spec

capture.spec.ts       every route at 1440 / 1024 / 390 → docs/redesign/<SHOT_DIR>/
shell-states.spec.ts  collapsed rail, ⌘K palette, user menu, mobile drawer
overflow.spec.ts      fails if any page scrolls sideways at 390px
a11y.spec.ts          axe-core WCAG 2.1 A/AA on every page and on open overlays → _axe.json
keyboard.spec.ts      skip link, palette, focus traps and focus return, tables, tabs, tooltips
flow.spec.ts          client → pool → vaso → report → SILOÉ XML download, through the UI
lighthouse.spec.ts    Lighthouse accessibility per page (opt-in, LIGHTHOUSE=1) → _lighthouse.json
```

## Running

```sh
# everything for the redesign (Chromium path only needed where Playwright's own isn't installed)
SHOT_DIR=after PW_CHROMIUM=/path/to/chrome npx playwright test -c scripts/redesign/playwright.config.ts

# one or two pages while iterating
SHOT_DIR=_check ONLY=pools,pool-detail npx playwright test -c scripts/redesign/playwright.config.ts

# Lighthouse too (fetches the CLI through npx; ~7 min)
LIGHTHOUSE=1 SHOT_DIR=after npx playwright test -c scripts/redesign/playwright.config.ts lighthouse

# the "before" set from another checkout, with these same fixtures
git worktree add /tmp/main-wt origin/main && ln -s "$PWD/node_modules" /tmp/main-wt/node_modules
APP_DIR=/tmp/main-wt SHOT_DIR=before npx playwright test -c scripts/redesign/playwright.config.ts capture
```

`SHOT_DIR=before` skips the specs that only make sense for the redesign.

## Keeping the fakes honest

The fakes only answer what the pages ask. When a page starts selecting a new column or embed,
add it to `fixtures.ts`; otherwise the screenshot shows a gap that isn't real. `backend.ts`
mirrors the column defaults from `supabase/migrations` (e.g. `client.archived = false`) for the
same reason. Pages with a `pageerror` are listed in `_report.json` next to the screenshots.
