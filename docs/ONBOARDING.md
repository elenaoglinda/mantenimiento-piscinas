# Developer Onboarding & Architecture

Everything you need to make changes to the **Mantenimiento de Piscinas** app. Read this first;
it explains how the system is wired, the decisions behind it, and how to work in the repo.

Companion docs (in this folder):

- [`technical-spec.md`](./technical-spec.md) — product/domain spec + **Appendix A** (the SILOE
  annual-results XML contract: XSD element names, catalog codes, validation rules). Read Appendix
  A before touching anything SILOE-related.
- [`implementation-plan.md`](./implementation-plan.md) — the phased build plan with per-task
  status (what's done, skipped, or pending external input).

---

## 1. What the app is (30-second version)

A Spanish, mobile-first web app for **public-pool operators** (and pool-maintenance companies) to
record legally-required water-quality checks (**RD 742/2013**) and export the XML that the Ministry
of Health platform **SILOÉ** accepts. It's the digital replacement for the paper pool logbook plus a
SILOE XML generator. Two customer types: **owners** (their own pools) and **companies** (many
clients' pools). Everything is **multi-tenant** and **Spanish-only** (i18n-ready).

**Live:** production runs at **https://panel.cloro.app** and **https://mantenimiento-piscinas.vercel.app**
(same deployment; `panel.cloro.app` is the custom domain).

---

## 2. Tech stack & why

| Layer         | Choice                                                        | Why                                                                                                                                    |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | **React 19 + TypeScript + Vite**                              | Fast, standard SPA tooling.                                                                                                            |
| Styling       | **Tailwind v4** with a **design-token** layer                 | Palette is swappable from one file (client asked for this).                                                                            |
| i18n          | **react-i18next**, `es-ES` only                               | All UI strings externalized so languages can be added with no component changes.                                                       |
| Backend data  | **Supabase** (Postgres + RLS + Auth + Storage), **eu-west-1** | Managed Postgres with row-level security does the multi-tenant heavy lifting; EU region for GDPR.                                      |
| Serverless    | **Vercel functions** in `/api` (Node)                         | Only for tasks needing a **server-side secret** (Mapbox token) — geocoding, routing, static maps.                                      |
| Hosting/CI/CD | **Vercel** (Git integration)                                  | `git push` → auto build + deploy.                                                                                                      |
| Shared logic  | **`packages/shared`** (pure TS, unit-tested)                  | Domain logic reused by the app (and testable in isolation): traffic-light engine, SILOE aggregation + XML builder/validator, catalogs. |

**No native app.** It's a plain web app. (A PWA/offline phase was planned but **skipped** — see §11.)

---

## 3. Repository layout (npm workspaces monorepo)

```
apps/web/            The React PWA (Vite). This is the deployed frontend.
  src/
    pages/           One component per route (see §7 for the route map).
    components/      Shared components; components/ui/ = the token-based UI kit.
    auth/            AuthProvider + context + route guards.
    lib/             supabase client, generated DB types, and data/service helpers.
    locales/es/      i18n strings (common.json) — the ONLY place for user-facing text.
    styles/          tokens.css (the design tokens) + index.css (Tailwind + @theme mapping).
api/                 Vercel serverless functions (health, geocoding, routing, static map).
packages/shared/     Framework-agnostic domain logic + unit tests (Vitest).
supabase/            config.toml + migrations/ (SQL, timestamp-prefixed, applied in order).
e2e/                 Playwright smoke test.
docs/                This file + technical-spec.md + implementation-plan.md.
.github/workflows/   CI (lint + typecheck + unit tests + e2e).
```

Package names: `@piscinas/web`, `@piscinas/shared`. The web app imports shared code as
`@piscinas/shared` (a real workspace dependency).

---

## 4. Local development

```bash
nvm use                                   # Node 20+
npm install                               # installs all workspaces
cp apps/web/.env.example apps/web/.env     # then fill in the two values below
npm run dev                               # http://localhost:5173
```

`apps/web/.env` (browser env — only `VITE_`-prefixed vars are exposed to the client):

```
VITE_SUPABASE_URL=https://ekbzksquvduudpoeuxkz.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key from Supabase → Settings → API>
```

**Root scripts** (run from repo root; each also works per-workspace):

| Command                           | What it does                                           |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Web dev server                                         |
| `npm run build`                   | Build all workspaces                                   |
| `npm run typecheck`               | `tsc --noEmit` for web + shared, and typechecks `api/` |
| `npm run lint`                    | ESLint 9 (flat config)                                 |
| `npm run format` / `format:check` | Prettier write / verify                                |
| `npm test`                        | Vitest (web + shared)                                  |
| `npm run e2e`                     | Playwright                                             |

**Before every commit:** `npm run format && npm run typecheck && npm run lint && npm test` must be
green. CI runs all of these on push, and Prettier is enforced (`format:check` fails CI otherwise).

**Note on the `/api` functions locally:** `npm run dev` runs Vite only, so the `/api/*` endpoints
(geocoding, routing) are NOT available locally — the address autocomplete and route optimizer will
report "not configured" and you fall back to manual entry. To exercise them locally, use
`vercel dev` (needs `MAPBOX_TOKEN` in a root `.env`). They always work in deployed environments.

---

## 5. Supabase (data, auth, storage)

**Project:** `Mantenimiento Piscina`, ref **`ekbzksquvduudpoeuxkz`**, region `eu-west-1`, Postgres 17.

### 5.1 Migrations

SQL migrations live in `supabase/migrations/`, timestamp-prefixed and applied in filename order.
They were applied to the remote DB via the **Supabase MCP** during development (the CLI was never
`supabase link`-ed). Two ways to apply a new migration:

- **Preferred, reproducible:** add a new `supabase/migrations/<timestamp>_name.sql` file AND apply
  it to the project. If you have the CLI linked (`supabase login` + `supabase link --project-ref
ekbzksquvduudpoeuxkz`), use `supabase db push`. Otherwise apply the same SQL through the Supabase
  dashboard SQL editor or the MCP.
- **Always keep the migration file in git** so the schema history is the source of truth.

After any schema change, **regenerate the TS types**: `apps/web/src/lib/database.types.ts` is the
generated Supabase types file. Regenerate with `supabase gen types typescript --linked` (or the MCP
`generate_typescript_types`) and run `npm run format`. The `Relationships` arrays in that file are
**load-bearing** — supabase-js uses them to type embedded selects (`select('*, basin(...)')`), so
don't hand-trim them.

### 5.2 Multi-tenancy & RLS (the most important design decision)

Every tenant table has an **`org_id`** column and **Row-Level Security** enabled. The tenant is the
`org`. Isolation is enforced entirely in the database, not in app code.

- Two SECURITY DEFINER helpers resolve the caller's context from their JWT:
  `public.current_org_id()` and `public.current_user_role()`. Policies read these. (We chose a
  helper function over a JWT custom claim — simpler, no access-token hook, and it can't be spoofed
  because the function bypasses RLS to look the user up.)
- **Write gating:** `current_user_can_write()` = role in (`admin`,`technician`); `viewer` is
  read-only. Insert/update/delete policies check it.
- **Org-tree integrity via composite FKs:** child rows reference parents by **`(id, org_id)`**
  composite foreign keys (e.g. `pool → client(id, org_id)`, `basin → pool`, `report → basin`). This
  makes it structurally impossible for a child to point at a parent in another org.
- **Signed reports are immutable:** the `report` UPDATE policy excludes rows already `signed`
  (so the completed→signed transition is allowed but nothing after), and child writes go through
  `report_is_editable()`. Verified with SQL tests during the build.
- Helper functions are hardened: `search_path` pinned, `EXECUTE` revoked from `anon`. When you add
  a SECURITY DEFINER function, do the same or `get_advisors(security)` will flag it.

**When adding a new tenant table**, copy the pattern from an existing migration: `org_id` column +
`unique (id, org_id)` if it will be a parent + composite FK to its parent + `enable row level
security` + the four standard policies (select by org; insert/update/delete by org + can_write) +
grants to `authenticated`. See `20260624130000_core_domain.sql` for the canonical template (it even
generates the policies in a `do` loop).

### 5.3 Auth

- Email/password + magic link + **Google OAuth** (via Supabase). Sign-up → email confirmation →
  onboarding wizard → `provision_account()` RPC atomically creates the `org` + the first `app_user`
  (admin). Owner orgs also auto-get a "self" `client` via an `org` insert trigger.
- **Auth redirect config lives in the Supabase dashboard**, not in code. The app passes
  `redirectTo: window.location.origin`, but Supabase only honors origins in its **Redirect URLs**
  allow-list and otherwise falls back to the **Site URL**. After adding `panel.cloro.app` we had to
  set Site URL = `https://panel.cloro.app` and allow-list `https://panel.cloro.app/**`,
  `https://mantenimiento-piscinas.vercel.app/**`, `http://localhost:5173/**`. **If auth ever
  redirects to `localhost:3000`, it's this setting.** Google's OAuth client redirect URI stays the
  Supabase callback `https://ekbzksquvduudpoeuxkz.supabase.co/auth/v1/callback`.
- **Seeing sign-ups:** Supabase → Authentication → Users (all sign-ups) and Table Editor →
  `app_user`/`org` (onboarded). You cannot see other orgs from inside the app (RLS).

### 5.4 Storage

One **private** bucket, `reports`, holds signatures, report photos/lab-PDFs, and generated XML
copies. Objects are keyed by `"<org_id>/..."` and storage RLS scopes access to the caller's org by
the first path segment. Files are read via short-lived signed URLs.

---

## 6. Vercel (hosting & deploys)

- **Project:** `sarabons-projects/mantenimiento-piscinas`, account `sarabongartz@gmail.com`.
- **Deploy flow:** GitHub integration — **push to `main` auto-deploys to Production.** No manual
  `vercel deploy` needed. CI must pass; commits must be authored with a **GitHub-recognized email**
  (we use the noreply/real verified email — Vercel blocks deploys whose commit email isn't tied to a
  GitHub account).
- **Frontend config:** `vercel.json` sets the Vite build + SPA rewrite (everything except `/api/*`
  → `index.html`).
- **Environment variables** (Vercel → Settings → Environment Variables):
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — client (safe; RLS governs access).
  - `MAPBOX_TOKEN` — **server-side only** (no `VITE_` prefix), used by the `/api` functions.
  - `ANTHROPIC_API_KEY` — **server-side only**, used by `api/extract-reading.ts` (photo import).
  - `VERIFACTI_API_KEY` — **server-side only**, used by `api/verifacti.ts` (Veri\*Factu invoicing).
    The key prefix decides the environment (`vf_test_` / `vf_prod_`), so a key in the wrong
    Vercel scope files real invoices with the AEAT. Preview/Development only for now.
    See `docs/INVOICING.md`.
    Without it that endpoint returns 503 and the UI tells the technician to enter the parte by
    hand, so the rest of the app is unaffected if it is missing.
  - Known quirk: the Vercel CLI won't add **Preview**-scoped vars without a branch; Production +
    Development are set. Add Preview vars in the dashboard if you start using PR previews.
- **Custom domain:** `panel.cloro.app` is attached to the project; DNS is configured host-side.

### `/api` functions (why they exist)

Only for work that needs a **server-side secret kept off the client**:

- `api/geocode`… (removed) → replaced by `api/address-suggest.ts` (address autocomplete).
- `api/route-optimize.ts` — Mapbox Optimization (optimal visit order + ETAs).
- `api/route-map.ts` — Mapbox Static Images proxy (returns a PNG so the token never reaches the browser).
- `api/extract-reading.ts` — Claude vision proxy for photo import (see §14). Unlike the Mapbox
  proxies it **requires a valid Supabase session**, because each call costs money; it also refuses
  a caller-supplied prompt so it can't be used as a general-purpose LLM proxy.
- `api/health.ts` — trivial health check.

`api/extract-reading.ts` is the first `/api` file to import from `@piscinas/shared` (for the
extraction prompt, so prompt and parameter catalogue can't drift apart). Worth a smoke test on
the first deploy that includes it.

Everything else (including **SILOE XML generation**) runs **client-side** — XML has no secrets, so
it's a pure `packages/shared` function invoked in the browser and downloaded. A server endpoint
could wrap the same builder later for direct SILOE upload.

---

## 7. Frontend structure & routing

Routing is in `apps/web/src/App.tsx`. Guards live in `apps/web/src/auth/guards.tsx`:

- `PublicOnly` (login/signup, redirects if already authed) → `LoginPage`, `SignupPage`
- `RequireAuth` → `OnboardingPage`, then `RequireOnboarded` →
  - `AppShell` (nav + layout) wraps the authed pages:
    - `/` `DashboardPage` · `/pools` `PoolsPage` · `/pools/:poolId` `PoolDetailPage`
    - `/reports` `ReportsPage` · `/reports/new` & `/reports/:id/edit` `ReportFormPage` · `/reports/:id` `ReportDetailPage`
    - `/routes` `RoutesPage` · `/siloe` `SiloeExportPage` · `/clients` `ClientsPage` (company-only nav) · `/team` `TeamPage`
    - `/clients/:clientId` `ClientDetailPage` (service history: contact, pools, every visit) — from
      `features/history`, which also supplies the pool page's Resumen state cards, Historial and
      Evolución tabs and the Informes filters/CSV. See `apps/web/src/features/history/README.md`.

**Auth state:** `AuthProvider` (`src/auth/AuthProvider.tsx`) exposes `{ session, profile, loading,
reloadProfile, signOut }` via `useAuth()`. `profile` is `{ user: app_user, org }` and is `null`
when authed-but-not-onboarded (guards send those users to `/onboarding`).

**UI kit** (`components/ui/`): `Button`, `TextField`, `SelectField`/`TextareaField` (`fields.tsx`),
`Modal`, `Card`/`Alert`/`Spinner` (`feedback.tsx`), `StatusChip`, `GoogleButton`. Use these instead
of raw elements so styling stays consistent.

**Data access:** most pages call `supabase` (`src/lib/supabase.ts`) directly with typed queries; RLS
does authorization. Cross-cutting/service logic sits in `src/lib/` (`parameters.ts` = threshold
resolver + `evaluate()` adapter, `siloeExport.ts` = aggregation + XML assembly, `routing.ts` =
optimizer client).

### 7.1 Feature folders (the convention for anything new)

Older code is organised by _kind_ — every page in `pages/`, every component in `components/`.
That worked while the app was one domain. It stopped working once features grew their own
pages, components, data access and shared logic: a single feature was spread across five
directories, and nothing said which files belonged together.

**Anything new goes in one folder per feature.** `invoicing` is the reference:

```
apps/web/src/features/invoicing/
  README.md        what it does, how it connects, what will bite you
  index.ts         the public surface — outside code imports from here, nothing deeper
  pages/           route components
  components/      components used only by this feature
  lib/             this feature's data access and orchestration

packages/shared/src/invoicing/
  README.md
  index.ts         framework-free logic, re-exported by the package barrel
  index.test.ts
```

Rules:

1. **Import the barrel, not the internals.** `import { InvoicesPage } from './features/invoicing/index.js'`.
   If a rename inside the folder does not change `index.ts`, nothing outside can break.
2. **Every feature folder has a README.** Not a file listing — what the feature does, what it
   connects to, and the decisions a newcomer would otherwise undo. Both invoicing READMEs
   explain _why_ money is integer cents and _why_ `mapEstado` never defaults to `failed`,
   because both look like over-engineering until you know the reason.
3. **Cross-cutting infrastructure stays in `src/lib/`.** `dbError.ts` is the test: the
   no-silent-failures rule applies to every feature, so a second feature must never have to
   import from `features/invoicing/` to get it. If two features would share it, it is not
   feature code.
4. **Migrations stay in `supabase/migrations/`.** They are applied in filename order across the
   whole database, so they cannot be scattered per feature. The feature README links to its own.
5. **Shared logic mirrors the same name** under `packages/shared/src/<feature>/`.

Existing non-feature code (`pages/`, `components/`) is left alone. Move it only when you are
already changing it — a migration for its own sake buys nothing and makes review harder.

---

---

## 8. Domain logic in `packages/shared` (unit-tested — start here for SILOE/thresholds)

- `evaluate.ts` — the **traffic-light** engine: `evaluate(value, def) → {status, compliant}` with
  green/amber/red/unknown. `compliant` = legal RD 742/2013 range; amber = a configurable UX safety
  band near limits. Thresholds come from the DB `parameter_def` table (national defaults + CCAA
  overrides), adapted via `lib/parameters.ts`.
- `siloe/catalogs.ts` — the SILOE annual-results code tables (parameters, LUGAR, METODO, TIPO_PM,
  etc.) mirrored in the DB `siloe_catalog` table (keep both in sync).
- `siloe/aggregate.ts` — turns per-visit measurements into the annual per-parameter figures
  (daily-mean rule, deter/deter_c, días_nc, vc_med/min/max). Matches the manual's worked pH example.
- `siloe/xml.ts` — `buildAnnualResultsXml()` (follows the **XSD element names/order** exactly) +
  `validateAnnualResults()` (mirrors SILOE's documented `COD_ERROR` rules, Spanish messages) +
  `formatSpanishDate()`. Validation is **rule-based**, not native XSD-binary, to keep the build
  robust — the builder still follows the XSD structure.

If you change SILOE behavior, update the tests next to these files (`*.test.ts`) — they encode the
manual's expectations.

---

## 9. Data model (tables at a glance)

Tenant tables (all `org_id` + RLS): `org`, `app_user`; `client` → `pool` → `basin` → `treatment`;
`report` → (`measurement`, `incident`, `attachment`, `report_chemical`, `report_task`);
org catalogues `chemical_product` and `task_def` (service log, see
`apps/web/src/features/service-log/README.md`); `annual_result` → (`annual_result_param`,
`annual_result_period`); `route` → `route_stop`; `xml_export`. Reference tables (read-only to
clients): `siloe_catalog`, `parameter_def`. Full column detail is in the migration files and the
generated `database.types.ts`.

Key relationships: a **report** is one visit to one **basin** (pool→basin). Measurements attach to a
report and reference a `parameter_def`. **annual_result** is the SILOE per-basin/season aggregate
(one per basin+year+analysis_type) built from completed/signed reports.

---

## 10. Conventions & recipes

- **All user-facing text** goes through i18n keys in `apps/web/src/locales/es/common.json`. Never
  hardcode Spanish strings in components.
- **All colors** reference design tokens (`styles/tokens.css`, mapped into Tailwind via `@theme` in
  `index.css`). Use `bg-primary`, `text-status-red`, etc. — never hex values in components. To
  re-skin, edit `tokens.css` only.
- **Naming:** DB columns and SILOE-facing fields use the Spanish/SILOE names (`denominacion`,
  `punto_muestreo`, `cod_v`); TS/React code is English. This is intentional so the SILOE mapping
  stays obvious.
- **Adding a feature end-to-end (typical recipe):**
  1. Migration: new table(s) with `org_id` + RLS + composite FKs (copy an existing migration).
     Apply it and keep the file in git.
  2. Regenerate `database.types.ts`; `npm run format`.
  3. Page in `src/pages/` + route in `App.tsx` + nav entry in `components/AppShell.tsx`.
  4. i18n strings in `common.json`.
  5. Pure/reusable logic → `packages/shared` (with a test) or `src/lib/`.
  6. `npm run typecheck && lint && test`, commit, push (auto-deploys).
- **Everything is SILOE- or RD 742/2013-driven.** `piscina`, `vaso`, `tratamiento`,
  `punto de muestreo` are SILOE requirements; `incidencia` is required by the RD autocontrol
  logbook. Don't remove these. GPS, the owner signature, and free-text notes are the app's own
  additions.

---

## 11. Current status & what's pending

Built and live: **Phases 0–3, 5, 6** (foundations, auth/tenancy, core domain, reporting, SILOE
export, routing). See `implementation-plan.md` for the per-task table.

**Skipped:** Phase 4 (offline/PWA + sync). The "route available offline" and "report offline" bits
depend on it.

**Not yet built:** Phase 7 (in-app + email notifications, dashboards, accessibility pass, broader
E2E, user docs).

**Pending external inputs** (flagged in `technical-spec.md` §13):

1. **SILOE pool-registration catalogs** (`Anexo Carga xml piscinas`) — needed to build the
   _pool-registration_ XML and to map `tipo_vaso`/`sistema`/`sustancia` to SILOE numeric ids. The
   _annual-results_ export (the deadline-driven one) is fully implemented.
2. **SILOE laboratory code(s)** — a required field in the annual-results XML; currently a manual
   input on the export screen.
3. **Exact Cataluña thresholds** — `parameter_def` is seeded with RD 742/2013 national defaults +
   a Cataluña scaffold (only free chlorine overridden, marked provisional). Confirm and seed the
   real Catalan values. The resolver maps a pool's free-text CCAA to a code in `lib/parameters.ts`
   (`ccaaToCode`), currently only recognizing Cataluña → `CT`.
4. **Google OAuth**: credentials are configured in Supabase; if it breaks, check the Supabase
   Site URL / Redirect URLs (see §5.3).

---

## 12. Gotchas (things that will bite you)

- **Auth redirect → `localhost:3000`**: Supabase Site URL / Redirect URLs, not code (§5.3).
- **`database.types.ts` is generated** — regenerate after migrations; keep `Relationships` intact.
- **Embedded selects with composite FKs** need the FK-constraint name to disambiguate, e.g.
  `select('*, client!pool_client_id_org_id_fkey(name)')` — plain `client(...)` won't type-resolve.
- **Mapbox optimization** only supports open routes with both ends fixed; we use a **round trip**
  from the start. Don't switch to `roundtrip=false` without also fixing `destination`.
- **`/api` isn't available under `npm run dev`** — use `vercel dev` to test geocoding/routing locally.
- **CI enforces Prettier** — run `npm run format` before committing or `format:check` fails.
- **Commit email must be GitHub-recognized** or Vercel refuses the deploy.
- **SECURITY DEFINER functions** must pin `search_path` and revoke `anon` EXECUTE (run
  `get_advisors(security)` after DB changes).

---

## 14. Photo import (digitising paper partes)

`/reports/import` turns a photographed paper _parte_ into a **draft** report.

- **Flow:** pick/shoot a photo → `extractFromPhoto()` downscales it (long edge 1600px, JPEG) and
  POSTs it to `api/extract-reading` → Claude reads the water readings → the technician verifies
  every value → saved as a **draft**, never completed or signed.
- **Contract:** `packages/shared/src/photoImport.ts` owns it. The system prompt is _generated
  from_ `WATER_EXTRACTION_FIELDS`, the same catalogue used to map results back onto
  `parameter_def` via `siloe_param_id` — so the prompt cannot drift from the schema. Scope is
  **water only** (SILOE ids 1–13); air parameters aren't in the annual-results export.
- **Trust nothing:** `parseExtraction()` is total, drops unknown keys, and nulls any reading that
  isn't a finite number (a numeric _string_ is rejected — the technician types it). It's the
  most-tested part of the feature; start there.
- **Provenance (why it matters):** extracted readings feed the SILOE XML filed with the Ministry
  of Health, so imported reports carry `report.source = 'photo_import'` and `report.extraction_meta`
  (model + raw normalised payload), and the original photo is stored as a normal `attachment`
  (`kind='photo'`). An audit can trace any figure back to the paper it came from.
- **Automation bias:** values are prefilled but low-confidence fields are highlighted in amber,
  and nothing is ever auto-completed or auto-signed — completion/signature stay in the normal
  report flow.

---

## 13. Access / accounts a new dev will need

- **GitHub:** repo `SaraBon/mantenimiento-piscinas` (you have this).
- **Supabase:** invite to the `Mantenimiento Piscina` project (for dashboard, SQL editor, auth
  config, migrations, type generation).
- **Vercel:** invite to `sarabons-projects/mantenimiento-piscinas` (for env vars, domains, deploy
  logs).
- **Mapbox:** an account/token if regenerating `MAPBOX_TOKEN`.
- **Google Cloud:** access to the OAuth client if touching Google SSO.

The two Supabase invites + the repo are enough to run and change everything code-side.
