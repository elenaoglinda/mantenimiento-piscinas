# Mantenimiento de Piscinas

Web app for Spanish public-pool operators to record RD 742/2013 water-quality maintenance and
export the XML files SILOÉ accepts.

**New here? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md)** — how everything is set up
(Vercel, Supabase, auth, deploys), the architectural decisions and why, and how to make changes.
Also: [docs/technical-spec.md](docs/technical-spec.md) (domain + SILOE XML contract) and
[docs/implementation-plan.md](docs/implementation-plan.md) (build status).

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Tailwind v4 (design tokens), i18n (es-ES)
- **Backend:** Supabase (Postgres + RLS + Auth + Storage, EU region) + Node serverless `/api`
- **Hosting:** Vercel
- **Shared code:** `packages/shared` (traffic-light engine, SILOE catalogs/types)

## Layout

```
apps/web/          React PWA
api/               Vercel serverless functions (XML, geocoding/routing, PDF)
packages/shared/   Code shared by web + api (evaluate(), SILOE catalogs)
supabase/          Local Supabase config + migrations
docs/              Spec + implementation plan
e2e/               Playwright tests
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
| `npm run typecheck` | Typecheck web, shared, and api            |
| `npm run lint`      | ESLint                                    |
| `npm run format`    | Prettier write (`format:check` to verify) |
| `npm test`          | Unit tests (Vitest)                       |
| `npm run e2e`       | Playwright end-to-end tests               |

## Environment

`apps/web/.env` (browser, `VITE_`-prefixed only):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable key)

Server-only secrets (Mapbox token, Supabase service-role key) belong to `/api` functions and
Vercel project env vars — never in the client bundle.

## Supabase

Remote project: **Mantenimiento Piscina** (`ekbzksquvduudpoeuxkz`, region `eu-west-1`).
Local stack: `supabase start` (requires Docker). Linking for migrations: `supabase login`
then `supabase link --project-ref ekbzksquvduudpoeuxkz`.
