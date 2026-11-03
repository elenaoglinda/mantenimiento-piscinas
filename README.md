# Mantenimiento de Piscinas

Web app for Spanish public-pool operators to record RD 742/2013 water-quality maintenance and
export the XML files SILOÉ accepts.

**New here? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md)** — how everything is set up
(Vercel, Supabase, auth, deploys), the architectural decisions and why, and how to make changes.
Also: [docs/technical-spec.md](docs/technical-spec.md) (domain + SILOE XML contract),
[docs/implementation-plan.md](docs/implementation-plan.md) (build status),
[docs/INVOICING.md](docs/INVOICING.md) (invoicing and Veri\*Factu) and
[docs/DEMO.md](docs/DEMO.md) (the 10-minute sales demo, in Spanish).

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Tailwind v4 (design tokens), i18n (es-ES)
- **Backend:** Supabase (Postgres + RLS + Auth + Storage, EU region) + Node serverless `/api`
- **Hosting:** Vercel
- **Shared code:** `packages/shared` (traffic lights, SILOE aggregation + XML, history, service log,
  invoicing, client-PDF layout)

## Layout

```
apps/web/          React app; new work goes in src/features/<feature>/ (ONBOARDING §7.1)
api/               Vercel functions: Mapbox proxies, photo import, Veri*Factu, client PDFs
packages/shared/   Framework-free domain logic used by the app and /api, with unit tests
supabase/          Migrations, rollbacks, SQL tests, local seed
scripts/           Demo seed, /api load check, Playwright UI checks (scripts/redesign)
docs/              Onboarding, spec, plan, invoicing, demo guide
e2e/               Playwright smoke test
```

## Getting started

```bash
nvm use                 # Node 20+
npm install
cp apps/web/.env.example apps/web/.env   # fill in Supabase URL + anon key
npm run dev             # http://localhost:5173
```

## Scripts (run from repo root)

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the web dev server                  |
| `npm run build`     | Build all workspaces                      |
| `npm run typecheck` | Typecheck web, shared, api and scripts    |
| `npm run lint`      | ESLint                                    |
| `npm run format`    | Prettier write (`format:check` to verify) |
| `npm test`          | Unit tests (Vitest), incl. /api and demo  |
| `npm run e2e`       | Playwright end-to-end tests               |

## Environment

`apps/web/.env` (browser, `VITE_`-prefixed only):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable key)

Server-only secrets (`MAPBOX_TOKEN`, `ANTHROPIC_API_KEY`, `VERIFACTI_API_KEY`) are Vercel project
env vars read only by `/api` functions — never in the client bundle. The Supabase service-role key
is used by nothing in the app or `/api`; only the demo seed script reads it, from your terminal's
environment (scripts/demo/README.md).

## Supabase

Remote project: **Mantenimiento Piscina** (`ekbzksquvduudpoeuxkz`, region `eu-west-1`).
Migrations are applied to production by the Supabase GitHub integration when a PR is merged; never
by hand. Local stack: `supabase start` (requires Docker), then `supabase db reset` for the
migrations plus a small demo org (`supabase/seed.sql`, login `demo@cloro.local` / `demo-local`).
Demo data for sales demos: `scripts/demo-seed.ts` (scripts/demo/README.md).
