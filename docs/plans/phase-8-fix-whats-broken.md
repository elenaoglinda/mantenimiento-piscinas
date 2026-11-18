# Phase 8 — Fix what's broken (plan "Phase 0")

Source: Elena's development plan of 13 Nov 2026 (competitor review of ClorAqua, ManageMart and
VisitPro, a check of the live panel, `main` as of 4 Nov, and cloro.app). In
[`implementation-plan.md`](../implementation-plan.md) that plan's phases 0–3 are numbered
**8–11**, because 0–7 are already taken by the original build plan.

> Review mode: auto. Elena's brief is the approved spec; this plan went through the
> `reviewing-plan` checklist before any code (see "Review" at the end).

## Goal

The panel stops telling operators things that are not true: the dashboard counts real pools and
shows an error instead of zeros when a query fails, the SILOÉ badge is green only when the
export would actually have every code it needs, the region that picks the legal thresholds is a
fixed value instead of free text, and the public website only promises what the app does.

## Key findings

1. **Dashboard root cause.** `DashboardPage.tsx` embeds the client as
   `client:client_id!pool_client_id_org_id_fkey(name)`. `client_id` is a column, and the
   pool→client foreign key is composite (`client_id, org_id`), so PostgREST answers
   `PGRST200 Could not find a relationship between 'pool' and 'client_id'` and returns no rows.
   The page never reads `error`, so it renders 0 pools, 0 stale pools and "Todo en orden". The
   recent-reports query has the same mistake (`pool:pool_id!…`, `basin:basin_id!…`).
   Reproduced on PostgREST v12.2.3 over every migration in `supabase/migrations`; the
   `table!constraint` form used everywhere else returns rows. Introduced in e49653e (July).
2. **Why CI missed it.** The ui harness's fake backend (`scripts/redesign/backend.ts`,
   `mock.ts`) resolves any embed name, so an invalid embed looks fine there.
3. **Silent failures beyond the bug.** All twelve queries in the dashboard's `load()` and the
   three in its effects ignore `error`, against ONBOARDING §7 ("Every Supabase call's error goes
   through `src/lib/dbError.ts`").
4. **SILOÉ badge.** `PoolsPage.tsx:114` and `PoolDetailPage.tsx:143` look only at
   `pool.siloe_cod_p`. The export needs `basin.siloe_cod_v` for every vaso too
   (`lib/siloeExport.ts:118-132`). `basin.fecha_baja` (date the vaso was retired) exists but no
   screen uses it; a vaso is active when `fecha_baja` is null or later than today (Madrid).
5. **Comunidad Autónoma.** `pool.ccaa` is free text (`PoolFormModal.tsx:215`); the address
   autocomplete fills `cp`, `localidad` and `provincia` but not `ccaa`. `ccaaToCode()`
   (`lib/parameters.ts:17`) only matches `/catal/i`, so a pool typed "Barcelona", "CAT" or left
   empty silently gets national thresholds. `parameter_def.ccaa` uses `CT`, which is the
   ISO 3166-2:ES code for Cataluña.
6. **cloro.app** is a Lovable site (TanStack Start behind Cloudflare) built from
   `elenaoglinda/cloro-app`, not from this repo. Lovable syncs merged commits; publishing is a
   button in Lovable.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | The dashboard's data loading moves to `features/dashboard/lib/data.ts` and returns `{ data, failure }`; the page shows an `Alert` with a retry button and the stat cards show "—" when `failure` is set. Partial data is never shown as a number.                                                                                                                               | A zero is a claim ("no pools"); an unknown must look unknown. Same shape as `fetchLegalRedReadings`.                                                                                 |
| D2  | The page and `components/dashboard/*` move to `features/dashboard/` in their own commit (pure `git mv` + import fixes), before the behaviour change. `lib/dashboard.ts` **stays in `src/lib/`**: `ShellDataProvider.tsx` imports `ACTIVITY_WINDOW_DAYS` and `RoutesPage.tsx` imports `madridDateString`/`madridTime` from it, so it is cross-cutting (§7.1 rule 3).             | ONBOARDING §7.1: move old code when you are already changing it; a separate move commit keeps the real diff readable.                                                                |
| D3  | Two guards against the bug class: (a) the stateful fake backend answers `PGRST200` when an embed names a `*_id` column with a composite-FK hint, like PostgREST does; (b) a Vitest source scan fails on `<col>_id!<table>_<col>_org_id_fkey(` anywhere in `apps/web/src`.                                                                                                       | (a) makes the ui flow catch it end to end; (b) is instant and covers pages no spec visits. A real PostgREST in CI would be stronger but is a bigger change than Phase 0 needs.       |
| D4  | SILOÉ readiness is a pure function in `packages/shared/src/siloe/readiness.ts`: `siloeReadiness(pool, basins, today)` → `{ ready, missingPoolCode, basinsMissingCode: string[], noActiveBasins }`. Both badges use it; the pill says what is missing ("Falta el código de la instalación", "Faltan códigos en 2 vasos", "Sin vasos activos"), with the vaso names in a tooltip. | One rule, tested once, used by both screens. The XML depends on exactly these codes.                                                                                                 |
| D5  | Region becomes `pool.ccaa_code` (text, check constraint on the 19 ISO 3166-2:ES community codes), added beside `ccaa`. The form shows a `Select` of the 19 communities; the app writes `ccaa_code` and also the display name into `ccaa`, so the deployed app keeps reading `ccaa` correctly (expand → migrate; contract later, Phase 9 at the earliest).                       | Expand–contract on a live table. ISO codes match the existing `parameter_def.ccaa = 'CT'` rows, so no `parameter_def` row changes (which pools resolve to CT does change: see PR 4). |
| D6  | The region is derived from the **postcode** (first two digits = INE province 01–52 → one community), then from the province name, then from the old free text. The Mapbox suggestion fills it the same way. Code in `packages/shared/src/territory/` with tests for all 52 provinces.                                                                                           | Deterministic and testable; does not depend on how Mapbox labels its `region` context for Spain.                                                                                     |
| D7  | Backfill runs inside the migration, only `where ccaa_code is null`, with the same three-step precedence in SQL. Pools that resolve to nothing stay null and the pool page asks for the region. A SQL test checks the SQL mapping against the TypeScript table (all 52 prefixes).                                                                                                | Merging applies it (no hand-run SQL); idempotent; the parity test stops the two tables drifting.                                                                                     |
| D8  | `ccaaToCode()` prefers `ccaa_code` and falls back to today's `/catal/i` rule on `ccaa` text, so it behaves identically before the migration (previews run against production).                                                                                                                                                                                                  | ONBOARDING §12: previews use the production DB, so new code must work before its migration.                                                                                          |
| D9  | Website copy goes in a separate PR in `elenaoglinda/cloro-app`; the before/after copy is posted to Elena before she merges.                                                                                                                                                                                                                                                     | Her instruction; wording is a product decision.                                                                                                                                      |

## PRs (stacked, merge in this order)

Each PR touches `docs/implementation-plan.md`, so they are stacked to avoid conflicts.

### PR 1 — `docs: add the competitor-review plan as phases 8–11` (no DB changes)

- `docs/implementation-plan.md`: new sections Phase 8 (this plan), 9 (RD 742/2013 + SILOÉ
  correctness), 10 (before selling), 11 (WhatsApp agent, needs Elena's go), each item a row
  with status; blocked items marked 🔲 with the reason (company incorporation). Phase 7 rows that
  Phase 10 supersedes get a pointer.
- `docs/plans/phase-8-fix-whats-broken.md`: this file.
- `docs/ONBOARDING.md` §11: point to phases 8–11; §13: GitHub repo is now
  `elenaoglinda/mantenimiento-piscinas`; §1: cloro.app is the Lovable site in `elenaoglinda/cloro-app`.

### PR 2 — `fix(dashboard): count pools and alerts correctly, show an error instead of zeros` (no DB changes)

Commits:

1. `test(ui): fake backend rejects column-name embeds on composite keys, like PostgREST`
   - `scripts/redesign/backend.ts` `project()`: if `n.name` ends in `_id`, the name is a column
     of `table`, and `n.hint` ends in `_org_id_fkey`, throw a `PGRST200` that `respond()` turns
     into HTTP 400 `{ code: 'PGRST200', message: "Could not find a relationship between '<table>' and '<name>'" }`.
2. `test(dashboard): no embed may name a composite-key column` — `apps/web/src/lib/embeds.test.ts`
   scans `apps/web/src/**/*.{ts,tsx}` (excluding `database.types.ts`) for
   `/\b\w+_id!\w+_org_id_fkey\(/` and expects no matches. Fails on `main` (3 hits).
3. `refactor(dashboard): move the dashboard into features/dashboard` — `git mv`
   `pages/DashboardPage.tsx` → `features/dashboard/pages/DashboardPage.tsx`,
   `components/dashboard/*` → `features/dashboard/components/`; `index.ts` barrel; `App.tsx`
   imports the barrel. `lib/dashboard.ts` stays (see D2). No behaviour change.
4. `fix(dashboard): count pools and recent reports with valid embeds` — the two selects become
   `client!pool_client_id_org_id_fkey(name)`, `pool!report_pool_id_org_id_fkey(denominacion)`,
   `basin!report_basin_id_org_id_fkey(denominacion)`; the commit-2 scan now passes.
5. `fix(dashboard): show an error state instead of zeros when a query fails` —
   `features/dashboard/lib/data.ts` `loadDashboard({ today, siloeYear })` returns
   `{ data: DashboardData | null, failure: DbFailure | null }` (first failure wins via
   `toDbFailure`); the calendar and today's-stops effects return failures too. Page: `Alert`
   (tone error) with `dashboard.loadError` + `common.retry`; stat cards render `—`; the alerts
   card does not render "Todo en orden" when `failure` is set. Unit tests for `loadDashboard`
   with a stub client: one failing query → `data: null`, `failure.code` set.
6. `docs(dashboard): feature README, ONBOARDING §7/§7.1, plan status`.

- New ui spec `scripts/redesign/dashboard.spec.ts` (stateful backend): seeds 7 pools with no
  visits → "Piscinas activas" shows 7 and the alerts list 7 never-visited pools (5 shown +
  count); a forced 500 on `/rest/v1/pool` → the error alert is visible and no "0" stat. Added to
  the CI `ui` job list.

### PR 3 — `fix(pools): SILOÉ badge green only when the installation and every active vaso have codes` (no DB changes)

1. `feat(siloe): readiness check for an installation and its active vasos` —
   `packages/shared/src/siloe/readiness.ts` + tests (pool code missing; one active vaso
   uncoded — the Arkana case; retired vaso uncoded is ignored; `fecha_baja` today counts as
   retired; no active vasos → not ready; all coded → ready). Exported from the siloe barrel.
2. `fix(pools): badges say what SILOÉ codes are missing` — `PoolsPage` selects
   `basin!basin_pool_id_org_id_fkey(denominacion, siloe_cod_v, fecha_baja)`; both pages render a
   `SiloeBadge` (in `features/pools/components/`, new feature folder with README + barrel) using
   `siloeReadiness`; `StatusPill` green/amber; `Tooltip` lists vaso names. i18n keys
   `pools.siloe.ready|missingPool|missingBasins|noBasins`. Fixtures gain an uncoded vaso.
3. ui spec `scripts/redesign/siloe-badge.spec.ts` (Arkana-shaped pool shows amber "Faltan
   códigos en 1 vaso"), added to the CI `ui` job; docs + plan status.

### PR 4 — `feat(pools): Comunidad Autónoma from a fixed list, filled from the address` (DB: adds `pool.ccaa_code`)

1. `feat(territory): province and postcode to Comunidad Autónoma` —
   `packages/shared/src/territory/{ccaa.ts,index.ts,README.md,ccaa.test.ts}`: `CCAA` (19 codes +
   Spanish names), `PROVINCE_TO_CCAA` (INE 01–52), `ccaaFromPostcode`, `ccaaFromProvinceName`
   (accent/case-insensitive, Catalan/Basque/Galician co-official names), `ccaaFromText`,
   `resolveCcaa({ cp, provincia, ccaa })`. Tests: every province, Ceuta 51/Melilla 52, bad
   postcodes (`'1234'`, `'00123'`, `'53001'`) → null.
2. `feat(db): pool.ccaa_code with backfill from postcode, province and text` —
   `supabase/migrations/<ts later than every file and open PR>_pool_ccaa_code.sql`: add column
   - check constraint; SQL function `public.ccaa_from_postcode(text)` (immutable,
     `search_path` pinned); backfill `where ccaa_code is null`. Rollback drops both.
     `supabase/tests/pool_ccaa_code.test.sql`: backfill precedence, idempotence, check constraint,
     RLS across two orgs unchanged, parity of all 52 prefixes with a fixture generated from the TS
     table (`scripts/territory/emit-sql-fixture.ts`, checked by a Vitest test so it can't go stale).
     Wired into the CI `sql` job, plus rollback/re-apply. `database.types.ts` regenerated.
3. `feat(pools): pick the Comunidad Autónoma from a list, prefilled from the address` —
   `PoolFormModal` `Select` of 19; address pick and postcode edit prefill it (never overwrite a
   manual choice); saves `ccaa_code` + `ccaa` name. Pool detail shows "Falta la comunidad
   autónoma" when null. `ccaaToCode(code, text)` per D8, tests for both paths.
   The code must reach the threshold resolver: `resolveParameterDefs(rows, region)` and
   `fetchResolvedParameterDefs(region)` in `lib/parameters.ts` take `{ ccaa_code, ccaa }`, and
   their callers pass it, with `ccaa_code` added to their pool selects (`select('*')` where
   possible, so previews before the migration keep working): `pages/ReportFormPage.tsx:172`,
   `pages/ImportReportPage.tsx:116`, `features/history/lib/data.ts:124` (`buildCatalog`) and its
   pool embed at line 74.
4. ui spec for the form, CI wiring, docs (`features/pools/README.md`, ONBOARDING §9/§11.3,
   plan status).

- PR description opens with the §5.1 warning: table `pool`, column `ccaa_code` (new, nullable,
  check constraint), function `ccaa_from_postcode` (new), data backfill of `ccaa_code`.
- **Behaviour change to disclose:** pools whose text did not match `/catal/i` but resolve to `CT`
  by postcode or province (typed "Barcelona", "CAT", or empty with an 08… postcode) switch from
  national to Cataluña thresholds for new readings. The Cataluña rows are still a provisional
  scaffold (free chlorine only, ONBOARDING §11.3), confirmed in Phase 9. Stored readings keep
  their saved status; signed reports and past exports do not change. The PR gives a query to
  count pools per community after the merge.

### PR 5 — `elenaoglinda/cloro-app`: `fix(copy): only promise what the app does`

Copy changes listed in the brief, plus the FAQ claims about daily "aforo" and "más de 30
viviendas" checked against RD 742/2013 (BOE-A-2013-10580). Before/after table posted to Elena
for approval; after merge she presses Publish in Lovable.

## Testing

- TDD: each failing test lands before its fix (scan and fake-backend tests fail on `main`).
- Vitest for shared logic (readiness, territory) and dashboard data loading; SQL tests for the
  migration; Playwright ui specs with axe at 0 for every changed screen.

## Verification (each PR, before asking to merge)

```sh
npm run format && npm run typecheck && npm run lint && npm test          # all green
npx playwright test -c scripts/redesign/playwright.config.ts a11y overflow keyboard flow history service-log client-reports dashboard siloe-badge ccaa
# PR 4 only: database lifecycle locally (Postgres 16), as CI does
```

CI jobs `verify`, `e2e`, `ui checks`, `database lifecycle` all green on the PR.

## Out of scope

- Contracting `pool.ccaa` (dropping the free text) — after the expand has been live a while.
- The 30-day stale rule itself (replaced by cadence in Phase 9).
- Running PostgREST inside CI for every query (noted as a follow-up; D3 covers this bug class).
- SILOÉ `cod_ccaa` (`pool.siloe_cod_ccaa`), which is a SILOÉ-assigned code, not the region.

## Review

Independent review (fresh context): one blocker (moving `lib/dashboard.ts` would break
`ShellDataProvider` and `RoutesPage`) and three should-fixes (thread `ccaa_code` into the threshold
resolver and its callers; disclose the threshold change for pools that newly resolve to CT; the
§13 repo name). All folded in above except the last: the local remote URL still says `SaraBon`,
but GitHub reports the repository as `elenaoglinda/mantenimiento-piscinas` (transferred; it is
PR #15's base repo), so §13 is updated.

Checked against `reviewing-plan`: every path above was read; no placeholders; each PR is one
plan item; the migration follows ONBOARDING §5.1 and expand → migrate (D5, D8); the only data
change runs through the merged migration (D7).

> **Plan Review:** PROCEED WITH CHANGES — 2026-11-13
