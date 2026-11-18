# Developer Onboarding & Architecture

Everything you need to make changes to the **Mantenimiento de Piscinas** app. Read this first;
it explains how the system is wired, the decisions behind it, and how to work in the repo.

Companion docs (in this folder):

- [`technical-spec.md`](./technical-spec.md) — product/domain spec + **Appendix A** (the SILOE
  annual-results XML contract: XSD element names, catalog codes, validation rules). Read Appendix
  A before touching anything SILOE-related.
- [`implementation-plan.md`](./implementation-plan.md) — the phased build plan with per-task
  status (what's done, skipped, or pending external input).
- [`INVOICING.md`](./INVOICING.md) — invoicing and Veri\*Factu (read before touching invoices).
- [`DEMO.md`](./DEMO.md) — the 10-minute sales demo (in Spanish), on the demo org that
  [`scripts/demo-seed.ts`](../scripts/demo/README.md) creates.

---

## 1. What the app is (30-second version)

A Spanish, mobile-first web app for **public-pool operators** (and pool-maintenance companies) to
record legally-required water-quality checks (**RD 742/2013**) and export the XML that the Ministry
of Health platform **SILOÉ** accepts. It's the digital replacement for the paper pool logbook plus a
SILOE XML generator. Two customer types: **owners** (their own pools) and **companies** (many
clients' pools). Everything is **multi-tenant** and **Spanish-only** (i18n-ready).

**Live:** production runs at **https://panel.cloro.app** and **https://mantenimiento-piscinas.vercel.app**
(same deployment; `panel.cloro.app` is the custom domain).

The public website **https://cloro.app** is a different project: a Lovable site (TanStack Start,
served through Cloudflare) whose code is in **`elenaoglinda/cloro-app`**. Its copy must only
promise what this app does. A PR merged there syncs into Lovable; it goes live when someone
presses Publish in Lovable.

---

## 2. Tech stack & why

| Layer         | Choice                                                                                               | Why                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | **React 19 + TypeScript + Vite**                                                                     | Fast, standard SPA tooling.                                                                                                             |
| Styling       | **Tailwind v4** with a **design-token** layer                                                        | Palette is swappable from one file (client asked for this).                                                                             |
| i18n          | **react-i18next**, `es-ES` only                                                                      | All UI strings externalized so languages can be added with no component changes.                                                        |
| Backend data  | **Supabase** (Postgres + RLS + Auth + Storage), **eu-west-1**                                        | Managed Postgres with row-level security does the multi-tenant heavy lifting; EU region for GDPR.                                       |
| Serverless    | **Vercel functions** in `/api` (Node), region **dub1** (Dublin, next to the database; `vercel.json`) | Only for work that needs a **server-side secret or library**: Mapbox, Claude (photo import), Veri\*Factu, the client PDFs (§6).         |
| Hosting/CI/CD | **Vercel** (Git integration)                                                                         | `git push` → auto build + deploy.                                                                                                       |
| Shared logic  | **`packages/shared`** (pure TS, unit-tested)                                                         | Domain logic reused by the app and `/api`: traffic lights, SILOE aggregation + XML, history, service log, invoicing, client-PDF layout. |

**No native app.** It's a plain web app. (A PWA/offline phase was planned but **skipped** — see §11.)

---

## 3. Repository layout (npm workspaces monorepo)

```
apps/web/              The React app (Vite). This is the deployed frontend.
  src/
    features/          One folder per feature (§7.1) — anything new goes here:
      app-shell/       sidebar, top bar, ⌘K palette, bell, nav table (nav.ts)
      history/         Historial, Evolución, client page, CSV, water-state cards
      service-log/     products, tasks, readings outside SILOÉ, route-stop states
      invoicing/       invoices, Veri*Factu (docs/INVOICING.md)
      client-reports/  visit PDF + monthly summary buttons, logo, photo thumbnails
      design/          internal /design gallery (previews only)
    pages/             Older route components (left in place until they are changed).
    components/        Older shared components; components/ui/ = the token-based UI kit.
    auth/              AuthProvider + context + route guards.
    lib/               supabase client, generated DB types, dbError.ts, cross-cutting helpers.
    locales/es/        i18n strings (common.json) — the ONLY place for user-facing text
                       (including the PDFs' text, under clientReports.pdf).
    styles/            tokens.css (the design tokens) + index.css (Tailwind + @theme mapping).
api/                   Vercel functions (§6). api/_lib/ = their helpers, api/_tests/ = their tests
                       (underscore folders are not deployed as functions).
packages/shared/       Framework-free domain logic + unit tests (Vitest). One folder per feature.
supabase/
  migrations/          SQL, timestamp-prefixed, applied in filename order.
  rollback/            <same name>.down.sql for each migration since team invitations.
  tests/               SQL tests run by CI's "database lifecycle" job (+ local stubs).
  seed.sql             small local demo org for `supabase db reset` (§4).
scripts/
  demo-seed.ts, demo/  the sales demo org (scripts/demo/README.md).
  check-api.cjs        builds every /api function the way Vercel does and loads it (CI).
  redesign/            Playwright UI checks against a fake backend: axe, keyboard, phone
                       width, flows (CI "ui checks" job). See its README.
e2e/                   Playwright smoke test (CI "e2e" job).
docs/                  This file, the spec, the plan, INVOICING.md, DEMO.md, redesign/.
.github/workflows/     CI: verify (format, lint, typecheck, unit tests, /api load check), e2e,
                       ui checks, database lifecycle.
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
(geocoding, routing, photo import, client PDFs) are NOT available locally — the address
autocomplete and route optimizer report "not configured", and the PDF buttons say they can't reach
the PDF server. To exercise them locally, use `vercel dev` (with the variables of §6 in a root
`.env`). They always work in deployed environments.

**Local database with data:** `supabase start` then `supabase db reset` applies the migrations and
`supabase/seed.sql`: a small "Piscinas Mediterráneo (demo)" org. Sign in with
`demo@cloro.local` / `demo-local` (local only; the seed refuses to run on a database that already
has an org). The full 90-day demo is `scripts/demo-seed.ts` (scripts/demo/README.md).

---

## 5. Supabase (data, auth, storage)

**Project:** `Mantenimiento Piscina`, ref **`ekbzksquvduudpoeuxkz`**, region `eu-west-1`, Postgres 17.

### 5.1 Migrations

SQL migrations live in `supabase/migrations/`, timestamp-prefixed and applied in filename order.
The early ones were applied by hand during development. Now the **Supabase GitHub integration
applies new migration files to production when a PR is merged into `main`** — so a migration is
reviewed like code, and **never applied to production by hand** from a branch.

For every new migration:

- A new timestamped file, later than every existing one (including open PRs').
- A matching `supabase/rollback/<same name>.down.sql`.
- SQL tests in `supabase/tests/` for RLS across two orgs and anything immutable, wired into CI's
  "database lifecycle" job (which applies every migration to Postgres 16, runs the tests and
  checks rollbacks).
- A warning at the top of the PR listing the tables and columns it adds, because merging is what
  changes production.

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

One **private** bucket, `reports`, holds signatures, report photos/lab-PDFs, generated XML
copies, the client PDFs and the org's logo. Objects are keyed by `"<org_id>/..."` and storage RLS
scopes access to the caller's org by the first path segment; writing needs the admin or
technician role. Files are read via signed URLs (short-lived in the app; 30 days for the client
PDF links). Paths in use:

- `<org>/<report>/photo-…`, `…/signature.png`, lab PDFs — attachments; a photo's PDF thumbnail is
  `<photo path>.thumb.jpg`.
- `<org>/client-reports/visits/<report>/<hash>.pdf`, `<org>/client-reports/monthly/<pool>/<YYYY-MM>/<hash>.pdf`.
- `<org>/branding/logo` — the logo on the PDFs (Ajustes).

The bucket has **no update policy**: files are write-once. Replace by delete + upload, or name a
file after its content (the client PDFs use the hash of their bytes).

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
  - `api/report-pdf.ts` needs no secret of its own: it uses `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_ANON_KEY` (also read server-side) plus the caller's token.
  - Known quirk: the Vercel CLI won't add **Preview**-scoped vars without a branch; Production +
    Development are set. Add Preview vars in the dashboard if you start using PR previews.
- **Custom domain:** `panel.cloro.app` is attached to the project; DNS is configured host-side.

### `/api` functions (why they exist)

Only for work that needs a **server-side secret or a heavy library** kept off the client:

| Function                 | What                                                                                                | Auth                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `api/address-suggest.ts` | Mapbox address autocomplete                                                                         | none (proxy only)                                         |
| `api/route-optimize.ts`  | Mapbox Optimization: visit order + ETAs                                                             | none (proxy only)                                         |
| `api/route-map.ts`       | Mapbox Static Images proxy (PNG, so the token never reaches the browser)                            | none (proxy only)                                         |
| `api/extract-reading.ts` | Claude vision proxy for photo import (§14); refuses caller-supplied prompts                         | **Supabase session** (costs money)                        |
| `api/verifacti.ts`       | Veri\*Factu invoicing calls (docs/INVOICING.md)                                                     | **Supabase session**                                      |
| `api/report-pdf.ts`      | Client PDFs: the visit report and the monthly summary; stores them and returns a 30-day signed link | **Supabase session**, queries **with the caller's token** |
| `api/health.ts`          | Trivial health check                                                                                | none                                                      |

Rules for a new function:

- **Anything that costs money or reads client data requires a valid Supabase session** and does
  its queries **as the caller** (anon key + their JWT, see `api/_lib/caller.ts`), so RLS applies.
  **Never the service-role key in a request path.**
- **Import shared code by relative path** (`../packages/shared/src/x.js`), not
  `@piscinas/shared`: that package's entry points at TypeScript source, which Vercel compiles to
  `.js` while Node keeps resolving the `.ts` entry, so the function crashes on load
  (`FUNCTION_INVOCATION_FAILED`). This is what broke photo import in production until PR #15.
  `scripts/check-api.cjs` (run in CI) builds every function with Vercel's own builder, loads it
  and reports its size against the 250 MB limit. A type-only import is fine (erased at build).
- Helpers go in `api/_lib/`, tests in `api/_tests/` (run by `npm test`); underscore folders are not
  deployed as functions. A `*.test.ts` directly in `api/` would become a function.

Everything else (including **SILOE XML generation**) runs **client-side** — XML has no secrets, so
it's a pure `packages/shared` function invoked in the browser and downloaded. The client PDFs are
server-side because pdf-lib would add hundreds of KB to the app and the signed link needs the file
in storage anyway.

---

## 7. Frontend structure & routing

Routing is in `apps/web/src/App.tsx`. Guards live in `apps/web/src/auth/guards.tsx`:

- `/invite/:token` `InvitePage` (public), `/design` (internal gallery, previews only)
- `PublicOnly` (login/signup, redirects if already authed) → `LoginPage`, `SignupPage`
- `RequireAuth` → `OnboardingPage`, then `RequireOnboarded` →
  - `AppShell` (`features/app-shell`: sidebar, top bar, ⌘K, bell) wraps the authed pages:
    - `/` `DashboardPage` (from `features/dashboard`) · `/pools` `PoolsPage` · `/pools/:poolId` `PoolDetailPage` (tabs
      Resumen, Vasos, Historial, Evolución, SILOÉ; the monthly summary card is on Resumen)
    - `/reports` `ReportsPage` · `/reports/new` & `/reports/:id/edit` `ReportFormPage` ·
      `/reports/import` `ImportReportPage` (photo import) · `/reports/:id` `ReportDetailPage`
      (with "Enviar al cliente")
    - `/routes` `RoutesPage` · `/siloe` `SiloeExportPage` · `/clients` `ClientsPage` ·
      `/clients/:clientId` `ClientDetailPage` (from `features/history`)
    - `/invoices`, `/invoices/resumen`, `/invoices/settings`, `/invoices/:invoiceId` (from
      `features/invoicing`)
    - `/team` `TeamPage` · `/settings` `SettingsPage` (org, logo, products, tasks) · `/ayuda`
      `HelpPage`

**Auth state:** `AuthProvider` (`src/auth/AuthProvider.tsx`) exposes `{ session, profile, loading,
reloadProfile, signOut }` via `useAuth()`. `profile` is `{ user: app_user, org }` and is `null`
when authed-but-not-onboarded (guards send those users to `/onboarding`).

**UI kit** (`components/ui/`, see its README and the `/design` gallery on previews): `Button`,
`Card`/`CardHeader`, `Alert`/`Spinner` (`feedback.tsx`), `TextField`, `Input`,
`SelectField`/`TextareaField` (`fields.tsx`), `Select`, `Combobox`, `DatePicker`, `Dialog`/`Modal`,
`Tabs`, `DataTable`, `HScroll`, `EmptyState`, `PageHeader`, `Breadcrumb`, `StatCard`, `StatusChip`,
`StatusPill`, `ParamChip`, `ProgressBar`, `Skeleton`, `Toast`, `Tooltip`, `Popover`, `Avatar`,
`CopyLinkField`, `GoogleButton`. Use these instead of raw elements; **no new UI library**.

**Data access:** pages and feature `lib/` files call `supabase` (`src/lib/supabase.ts`) with typed
queries; RLS does authorization. **Every Supabase call's error goes through `src/lib/dbError.ts`**
(no silent failures; `missing_schema` explains a migration not applied yet). Cross-cutting/service logic sits in `src/lib/` (`parameters.ts` = threshold
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

Feature folders today: `app-shell`, `dashboard`, `history`, `service-log`, `invoicing`,
`client-reports`, `design`; shared counterparts in `packages/shared/src/{history,service-log,invoicing,client-reports,siloe}`.

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

- `siloe/season.ts` — groups a season's readings per vaso for the XML; a golden test pins the
  XML **byte for byte** (`season.test.ts`).
- `history/`, `service-log/`, `invoicing/`, `client-reports/` — each feature's pure logic, with a
  README. `client-reports` is imported by `/api` by relative path (§6); only its `share.ts` is
  in the package barrel, so pdf-lib never reaches the browser.

If you change SILOE behavior, update the tests next to these files (`*.test.ts`) — they encode the
manual's expectations.

---

## 9. Data model (tables at a glance)

Tenant tables (all `org_id` + RLS, composite `(id, org_id)` foreign keys):

- **Tenancy:** `org`, `app_user`, `invitation`.
- **Installations:** `client` → `pool` → `basin` (vaso) → `treatment`. `pool.ccaa_code` is the
  Comunidad Autónoma (ISO code, `CT` = Cataluña) that picks regional thresholds; `pool.ccaa`
  (old free text) still gets the community's name until the contract step drops it.
- **Visits:** `report` (one visit to one vaso) → `measurement`, `incident`, `attachment`,
  `report_chemical` (products added), `report_task` (tasks done). Children of a report follow
  `report_is_editable()`: once signed, nothing about the visit can change.
- **Org catalogues (service log):** `chemical_product`, `task_def` (8 defaults each, seeded by
  `seed_org_catalogues()` from `provision_account()`). See `features/service-log/README.md`.
- **Routes:** `route` → `route_stop` (`estado` pendiente/hecha/saltada, `motivo`, `report_id`;
  the `report_marks_route_stop` trigger marks a stop hecha when that pool's report is saved).
- **SILOÉ:** `annual_result` → (`annual_result_param`, `annual_result_period`); `xml_export`.
- **Invoicing:** `billing_profile`, `invoice_series`, `invoice` → `invoice_line`,
  `invoice_aeat_record`, `invoice_activity` (docs/INVOICING.md).

Reference tables (read-only to clients): `siloe_catalog`, `parameter_def` (national RD 742/2013
rows + CCAA overrides; `in_siloe` false + `clave` for the four readings outside SILOÉ:
alcalinidad total, dureza cálcica, sal, fosfatos, which have recommended ranges, not legal ones).

Files are in storage, not tables (§5.4): client PDFs, logo, photo thumbnails.

Full column detail is in the migration files and the generated `database.types.ts`.

Key relationships: a **report** is one visit to one **basin** (pool→basin). Measurements attach to a
report and reference a `parameter_def`. **annual_result** is the SILOE per-basin/season aggregate
(one per basin+year+analysis_type) built from completed/signed reports, SILOÉ parameters only.

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
  1. If it needs data: a migration with `org_id` + RLS + composite FKs + `updated_at` trigger
     (copy an existing one), its rollback file and SQL tests (§5.1). Don't apply it by hand;
     merging applies it.
  2. Regenerate `database.types.ts` (keep the `Relationships` arrays); `npm run format`.
  3. A feature folder `apps/web/src/features/<name>/` with README + `index.ts` (§7.1): pages,
     components, `lib/` data access through `dbError`.
  4. Route in `App.tsx`; sidebar entry in **`features/app-shell/nav.ts`** (`NAV_GROUPS`, plus
     `SUB_PAGES` for sub-routes) — sidebar, breadcrumb, ⌘K and page titles all read it.
  5. i18n strings in `common.json`; colours only through tokens; components from `components/ui`.
  6. Pure logic → `packages/shared/src/<name>/` with tests.
  7. UI checks: a spec in `scripts/redesign/` for new screens or buttons (and add it to the CI
     `ui` job); axe must stay at 0.
  8. `npm run format && npm run typecheck && npm run lint && npm test`, commit, push, PR.
- **Everything is SILOE- or RD 742/2013-driven.** `piscina`, `vaso`, `tratamiento`,
  `punto de muestreo` are SILOE requirements; `incidencia` is required by the RD autocontrol
  logbook. Don't remove these. GPS, the owner signature, and free-text notes are the app's own
  additions.

---

## 11. Current status & what's pending

Built and live: **Phases 0–3, 5, 6** (foundations, auth/tenancy, core domain, reporting, SILOE
export, routing) and invoicing (docs/INVOICING.md). See `implementation-plan.md` for the
per-task table.

**Next: Phases 8–11** (competitor review, Nov 2026), in `implementation-plan.md`: 8 fixes what's
broken, 9 makes RD 742/2013 and SILOÉ exactly right, 10 is what's needed before selling, 11 (the
WhatsApp agent) waits for Elena's go. Each phase has a plan in `docs/plans/`.

In review (PRs into each other, merge in order): the panel redesign (#11), the role fix (#12),
service history (#13: Historial, Evolución, client page, CSV, dashboard alerts), the service log
(#14: products, tasks, readings outside SILOÉ, route-stop states; **adds tables**), and client
reports + demo data (#15: visit PDF, monthly summary, send by e-mail/WhatsApp, demo org).

**Skipped:** Phase 4 (offline/PWA + sync). The "route available offline" and "report offline" bits
depend on it.

**Partly done from Phase 7:** dashboard alerts and the in-app bell, the accessibility pass (axe at
0 in CI), broader UI tests, the demo guide. **Not yet:** e-mail notifications; sending the client
PDF from the server (today the technician's own mail app / WhatsApp sends the link).

**Pending external inputs** (flagged in `technical-spec.md` §13):

1. **SILOE pool-registration catalogs** (`Anexo Carga xml piscinas`) — needed to build the
   _pool-registration_ XML and to map `tipo_vaso`/`sistema`/`sustancia` to SILOE numeric ids. The
   _annual-results_ export (the deadline-driven one) is fully implemented.
2. **SILOE laboratory code(s)** — a required field in the annual-results XML; currently a manual
   input on the export screen.
3. **Exact Cataluña thresholds** — `parameter_def` is seeded with RD 742/2013 national defaults +
   a Cataluña scaffold (only free chlorine overridden, marked provisional). Confirm and seed the
   real Catalan values. The resolver uses `pool.ccaa_code` (picked from a list, prefilled from the
   postcode; `packages/shared/src/territory/`) and falls back to the old free text (`/catal/i` →
   `CT`) via `poolRegion` + `ccaaToCode` in `lib/parameters.ts`.
4. **Google OAuth**: credentials are configured in Supabase; if it breaks, check the Supabase
   Site URL / Redirect URLs (see §5.3).

---

## 12. Gotchas (things that will bite you)

- **Auth redirect → `localhost:3000`**: Supabase Site URL / Redirect URLs, not code (§5.3).
- **`database.types.ts` is generated** — regenerate after migrations; keep `Relationships` intact.
- **Embedded selects with composite FKs** need the FK-constraint name to disambiguate, e.g.
  `select('*, client!pool_client_id_org_id_fkey(name)')` — plain `client(...)` won't type-resolve.
  Name the **table**, never the column: `client:client_id!pool_client_id_org_id_fkey(name)` is
  rejected by PostgREST (PGRST200) and returns no rows. That made the live dashboard show 0 pools
  until November 2026; `lib/embeds.test.ts` now fails on it and the ui fake backend rejects it.
- **Mapbox optimization** only supports open routes with both ends fixed; we use a **round trip**
  from the start. Don't switch to `roundtrip=false` without also fixing `destination`.
- **`/api` isn't available under `npm run dev`** — use `vercel dev` to test geocoding/routing locally.
- **CI enforces Prettier** — run `npm run format` before committing or `format:check` fails.
- **Commit email must be GitHub-recognized** or Vercel refuses the deploy.
- **SECURITY DEFINER functions** must pin `search_path` and revoke `anon` EXECUTE (run
  `get_advisors(security)` after DB changes).
- **`/api` must not import `@piscinas/shared`** at runtime — relative paths only (§6);
  `scripts/check-api.cjs` catches it.
- **The `reports` bucket is write-once** (no update policy): `upload(..., { upsert: true })`
  fails when the file exists. Delete first or use content-named paths (§5.4).
- **Previews use the production database.** A preview of a PR with a migration runs against a
  schema without it: new features must degrade (`missing_schema` → a notice) rather than crash.
- **Root-level tests** (`api/_tests`, `scripts/demo`) use `vitest.root.config.ts`, deliberately not
  named `vitest.config.ts` (the workspaces would pick it up by searching upwards).
- **Demo data** only ever goes into an org whose name ends in "(demo)"; the seed script refuses
  anything else (scripts/demo/README.md).

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

- **GitHub:** repo `elenaoglinda/mantenimiento-piscinas` (transferred from
  `SaraBon/mantenimiento-piscinas`, whose URLs still redirect). The website is `elenaoglinda/cloro-app`.
- **Supabase:** invite to the `Mantenimiento Piscina` project (for dashboard, SQL editor, auth
  config, migrations, type generation).
- **Vercel:** invite to `sarabons-projects/mantenimiento-piscinas` (for env vars, domains, deploy
  logs).
- **Mapbox:** an account/token if regenerating `MAPBOX_TOKEN`.
- **Google Cloud:** access to the OAuth client if touching Google SSO.

The two Supabase invites + the repo are enough to run and change everything code-side.
