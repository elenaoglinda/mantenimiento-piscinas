# Implementation Plan — Pool Maintenance & SILOE App

Companion to [technical-spec.md](./technical-spec.md). Work is grouped into **8 phases**.
Each phase has small, independently reviewable tasks with a clear deliverable and
acceptance check. Phases are mostly sequential; some tasks within a phase parallelize.

**Status legend:** ⬜ not started · 🔲 needs external input · ✅ done

---

## Phase 0 — Project foundations

| #      | Task                                                                                                                                                  | Deliverable                           | Acceptance                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| ✅ 0.1 | Monorepo scaffold (Vite + React + TS frontend, `/api` Vercel serverless functions, shared `packages/shared`)                                          | Repo builds, `npm run dev` serves app | App shell loads locally                              |
| ✅ 0.2 | Tooling: ESLint, Prettier, Vitest, Playwright, CI (GitHub Actions: lint+typecheck+test)                                                               | Green CI on PR                        | CI passes on a trivial PR                            |
| ✅ 0.3 | Vercel project linked; preview deploys per PR                                                                                                         | Live URL + env vars                   | https://mantenimiento-piscinas.vercel.app (HTTP 200) |
| ✅ 0.4 | Supabase project (EU region) + local `supabase` CLI; env wiring (`.env`, Vercel envs)                                                                 | CLI installed + `.env` wired          | Client configured for Supabase                       |
| ✅ 0.5 | Design tokens foundation: Tailwind + CSS-variable token layer (color/space/typography/radius), aqua-teal + semantic green/amber/red, light/dark-ready | `tokens.css` + Tailwind theme         | Swapping one token recolors the app                  |

**Phase 0 exit:** empty but deployable app, CI green, Supabase + tokens in place.
**Status:** ✅ complete. Live at https://mantenimiento-piscinas.vercel.app.
_Note: Vercel CLI v50 won't add Preview-scoped env vars without a branch; Production +
Development are set. Add Preview vars via the dashboard if/when PR previews are used._

---

## Phase 1 — Auth, tenancy & app skeleton

| #      | Task                                                                                              | Deliverable            | Acceptance                                              |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| ✅ 1.1 | DB: `org`, `app_user` tables + RLS helpers (`current_org_id()` SECURITY DEFINER, not a JWT claim) | Migration              | ✅ RLS cross-org isolation verified via SQL test        |
| ✅ 1.2 | Supabase Auth: email/password + magic link; email verification                                    | Sign-in/up screens     | Login/signup screens built                              |
| 🔲 1.3 | Google Workspace SSO (OIDC)                                                                       | "Continue with Google" | Code wired; needs Google OAuth creds in Supabase (Sara) |
| ✅ 1.4 | Sign-up flow with **account-type choice** (owner vs company) → provisions `org` + first admin     | Onboarding wizard      | `provision_account` RPC + wizard                        |
| 🟡 1.5 | Roles (Admin/Technician/Viewer) + route guards + member invite                                    | Members admin page     | Guards + roles + team list done; invite deferred        |
| ✅ 1.6 | App shell: nav, layout, i18n setup (es-ES, `react-i18next`), token-based theme                    | Authenticated shell    | Shell + nav + i18n live                                 |

**Phase 1 exit:** users can register (both account types), log in (email + Google), and see a
role-appropriate empty app.
**Status:** code complete & green. 1.3 needs Google OAuth credentials from Sara (dashboard);
member invite (part of 1.5) deferred to when team management is needed.

---

## Phase 2 — Core domain (clients, pools, basins, treatments)

| #   | Task                                                                                                                              | Deliverable        | Acceptance                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------- |
| 2.1 | DB + RLS: `client`, `pool`, `basin`, `treatment`, `siloe_catalog`                                                                 | Migrations         | RLS + FK constraints tested   |
| 2.2 | Seed `siloe_catalog` with annual-results catalogs (PARAMETROS, LUGAR, METODO, TIPO_PM, TIPO_ANALISIS, MOTIVO_CIERRE — Appendix A) | Seed script        | Catalogs queryable            |
| 2.3 | `parameter_def` table + seed RD 742/2013 national defaults + **Cataluña** overrides (thresholds/colors)                           | Seed script        | Thresholds drive color engine |
| 2.4 | Clients CRUD (company); owner auto-self-client                                                                                    | Clients UI         | Create/edit/list/archive      |
| 2.5 | Pools CRUD incl. address + **Mapbox geocoding** (lat/lng), pool type, water source, SILOE codes fields                            | Pools UI + map pin | Address → coords stored       |
| 2.6 | Basins (`vaso`) CRUD nested under pool (class, type, volume, depths, SILOE codes)                                                 | Basin UI           | Multiple basins per pool      |
| 2.7 | Treatments per basin (filtración/desinfección/coagulación/correcciónpH/otros)                                                     | Treatment UI       | Captured per Appendix data    |

**Phase 2 exit:** an org can fully model its clients, pools, basins and treatments.

---

## Phase 3 — Reporting & traffic-light engine (online first)

| #   | Task                                                                                              | Deliverable                        | Acceptance                       |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| 3.1 | DB + RLS: `report`, `measurement`, `incident`, `attachment`                                       | Migrations                         | Constraints + status enum        |
| 3.2 | **`evaluate(value, parameter_def)`** shared lib → `{status, compliant}` (green/amber/red)         | `packages/types` util + unit tests | Boundary cases tested            |
| 3.3 | Report form: pick pool→basin, render only configured params, **live color feedback**, GPS capture | Report screen                      | Colors update as you type        |
| 3.4 | Draft save / mark completed; required-field validation for completed                              | Status transitions                 | Draft resumable; completed gated |
| 3.5 | Incidents + corrective actions; photo upload + **lab PDF attach** + manual lab values             | Sub-forms + Storage                | Files stored, linked to report   |
| 3.6 | Signature capture (drawn) + name + DNI + GPS + timestamp → `signed`, **immutable**                | Signature modal                    | Signed report cannot be edited   |
| 3.7 | Reports list + filters + detail view + on-screen PDF/print of a report                            | Reports UI                         | View any report's full detail    |

**Phase 3 exit:** technicians can create, complete, sign and view reports online.

---

## Phase 4 — Offline & sync (PWA)

| #   | Task                                                                                                       | Deliverable        | Acceptance                             |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
| 4.1 | PWA setup: Workbox service worker, manifest, installable, app-shell precache                               | Installable PWA    | Loads offline (shell)                  |
| 4.2 | Local store (Dexie/IndexedDB): mirror assigned pools/basins/parameter_defs/routes for the day              | Offline data layer | Data readable offline                  |
| 4.3 | Offline writes + **outbox queue**; reports/measurements/signatures created offline with client UUID        | Write path         | Create report fully offline            |
| 4.4 | Sync engine: idempotent upsert, last-write-wins per field, signed = immutable; Storage upload on reconnect | Sync service       | Offline report appears after reconnect |
| 4.5 | Sync status UI (pending/synced/error) + conflict surfacing                                                 | Status indicators  | States visible per record              |

**Phase 4 exit:** a technician with no coverage can do a full visit; data syncs when back online.

---

## Phase 5 — SILOE export (annual results + pool registration)

| #   | Task                                                                                                                                            | Deliverable      | Acceptance                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- |
| 5.1 | DB: `annual_result`, `annual_result_param`, `xml_export`                                                                                        | Migrations       | —                                |
| 5.2 | **Aggregation engine**: measurements → per-basin/season summary (daily-mean rule, deter/deter_c, dias_nc, med/min/max), supports `peraperturas` | Service + tests  | Matches manual's worked example  |
| 5.3 | Aggregation **review/edit UI** before export                                                                                                    | Review screen    | Admin can adjust pre-export      |
| 5.4 | **Annual-results XML builder** + XSD validation (`libxmljs`) + Spanish date/decimal formatting + catalog mapping                                | `/api` function  | Output validates vs XSD          |
| 5.5 | **Pre-export validation** mirroring SILOE rules (errors 004/201/206/208/209/236/237/290–293…) with friendly messages                            | Validation layer | Bad data blocked w/ clear errors |
| 5.6 | Download + `xml_export` history; (🔲 pool-registration XML — gated on §13.1 catalogs)                                                           | Export UI        | Annual XML downloadable          |

**Phase 5 exit:** an org can generate a valid SILOE annual-results XML for a year and download it.
_(Pool-registration XML lands when the registration catalogs arrive — §13.1.)_

---

## Phase 6 — Route planning (Mapbox)

| #   | Task                                                                             | Deliverable   | Acceptance               |
| --- | -------------------------------------------------------------------------------- | ------------- | ------------------------ |
| 6.1 | DB: `route`, `route_stop`                                                        | Migration     | —                        |
| 6.2 | `/api` geocoding + **Mapbox Optimization API** proxy (keys server-side, caching) | Function      | Returns optimized order  |
| 6.3 | Select pools for a day → optimized route + map + ordered stops + ETAs            | Route UI      | Multi-pool route renders |
| 6.4 | Route available offline once fetched; "start visit" deep-links into report flow  | Offline route | Route usable in field    |

**Phase 6 exit:** a technician plans an optimized multi-pool day and works it offline.

---

## Phase 7 — Notifications, dashboards & polish

| #   | Task                                                                                                                   | Deliverable | Acceptance                    |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------- |
| 7.1 | Non-compliance + missing-measurement detection → **in-app + email** alerts (Supabase scheduled function + Resend/SMTP) | Alerts      | Out-of-range reading notifies |
| 7.2 | Dashboard: pool health overview, recent reports, upcoming **30-Apr** export reminder                                   | Dashboard   | At-a-glance status            |
| 7.3 | Design-system pass + accessibility (WCAG AA), empty/loading/error states                                               | Polished UI | a11y audit passes             |
| 7.4 | E2E happy paths (Playwright): onboard → pool → report → sign → export; offline cycle                                   | Test suite  | Green in CI                   |
| 7.5 | Docs: user guide (es) + deploy runbook                                                                                 | Docs        | Handover-ready                |

**Phase 7 exit:** v1 feature-complete, tested, accessible, documented.

---

## Cross-cutting (every phase)

- RLS test for each new table; typecheck + lint gates on every PR.
- All UI strings via i18n; all colors via tokens.
- Small PRs, one task ≈ one PR where practical.

## External inputs still needed (non-blocking)

- 🔲 Pool-registration catalogs (_Anexo Carga xml piscinas_) → unblocks Task 5.6 reg-XML.
- 🔲 SILOE laboratory code(s) → required field in annual-results export (Task 5.4).
- 🔲 Confirmed Cataluña threshold values → Task 2.3 seed.

## Suggested build order

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 5 and 6 can overlap once Phase 3 is done if capacity allows.
