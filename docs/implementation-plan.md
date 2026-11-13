# Implementation Plan — Pool Maintenance & SILOE App

Companion to [technical-spec.md](./technical-spec.md). The original build plan is **Phases 0–7**;
**Phases 8–11** come from the competitor review of November 2026 (see below).
Each phase has small, independently reviewable tasks with a clear deliverable and
acceptance check. Phases are mostly sequential; some tasks within a phase parallelize.

**Status legend:** ⬜ not started · 🟡 in progress / in review · 🔲 needs external input or a decision · ⛔ blocked · ✅ done

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

| #      | Task                                                                                                                              | Deliverable        | Acceptance                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| ✅ 2.1 | DB + RLS: `client`, `pool`, `basin`, `treatment`, `siloe_catalog`                                                                 | Migrations         | ✅ RLS + composite-FK org consistency verified via SQL   |
| ✅ 2.2 | Seed `siloe_catalog` with annual-results catalogs (PARAMETROS, LUGAR, METODO, TIPO_PM, TIPO_ANALISIS, MOTIVO_CIERRE — Appendix A) | Seed script        | 73 rows seeded                                           |
| ✅ 2.3 | `parameter_def` table + seed RD 742/2013 national defaults + **Cataluña** overrides (thresholds/colors)                           | Seed script        | 16 national + CT scaffold; exact CT values pending §13.3 |
| ✅ 2.4 | Clients CRUD (company); owner auto-self-client                                                                                    | Clients UI         | Trigger creates self-client; CRUD live                   |
| ✅ 2.5 | Pools CRUD incl. address + **Mapbox geocoding** (lat/lng), pool type, water source, SILOE codes fields                            | Pools UI + map pin | CRUD + geocode live (MAPBOX_TOKEN set; verified)         |
| ✅ 2.6 | Basins (`vaso`) CRUD nested under pool (class, type, volume, depths, SILOE codes)                                                 | Basin UI           | Nested CRUD live                                         |
| ✅ 2.7 | Treatments per basin (filtración/desinfección/coagulación/correcciónpH/otros)                                                     | Treatment UI       | Per-basin CRUD live                                      |

**Phase 2 status:** ✅ complete & green. `MAPBOX_TOKEN` set in Vercel (geocoding verified live).
Map-pin display and SILOE registration-catalog field mapping (tipo_vaso/sistema/sustancia ids)
land later when the registration catalogs arrive (§13.1).

**Phase 2 exit:** an org can fully model its clients, pools, basins and treatments.

---

## Phase 3 — Reporting & traffic-light engine (online first)

| #      | Task                                                                                              | Deliverable                         | Acceptance                                          |
| ------ | ------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| ✅ 3.1 | DB + RLS: `report`, `measurement`, `incident`, `attachment` (+ private storage bucket)            | Migrations                          | ✅ RLS + signed-immutability verified via SQL       |
| ✅ 3.2 | **`evaluate(value, parameter_def)`** shared lib → `{status, compliant}` (green/amber/red)         | `packages/shared` util + unit tests | 6 boundary tests; DB resolver (CCAA override) added |
| ✅ 3.3 | Report form: pick pool→basin, render only configured params, **live color feedback**, GPS capture | Report screen                       | Live chips per parameter; geolocation capture       |
| ✅ 3.4 | Draft save / mark completed; required-field validation for completed                              | Status transitions                  | Draft resumable; completed requires ≥1 value        |
| ✅ 3.5 | Incidents + corrective actions; photo upload + **lab PDF attach** + manual lab values             | Sub-forms + Storage                 | Incidents in form; attachments on detail page       |
| ✅ 3.6 | Signature capture (drawn) + name + DNI + GPS + timestamp → `signed`, **immutable**                | Signature modal                     | Canvas pad + storage; immutability enforced by RLS  |
| ✅ 3.7 | Reports list + filters + detail view + on-screen PDF/print of a report                            | Reports UI                          | List + status filter, detail, window.print()        |

**Phase 3 exit:** ✅ technicians can create, complete, sign and view reports online.
Offline support (drafts in the field) comes in Phase 4.

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
**Status:** ⏭️ SKIPPED for now (Sara's call) — revisit after Phase 5+. Now planned as **10.1**.

---

## Phase 5 — SILOE export (annual results + pool registration)

| #      | Task                                                                                                                                            | Deliverable      | Acceptance                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| ✅ 5.1 | DB: `annual_result`, `annual_result_param`, `annual_result_period`, `xml_export`                                                                | Migrations       | Org-scoped RLS, composite FKs                          |
| ✅ 5.2 | **Aggregation engine**: measurements → per-basin/season summary (daily-mean rule, deter/deter_c, dias_nc, med/min/max), supports `peraperturas` | Service + tests  | ✅ matches manual's pH example (7.23)                  |
| ✅ 5.3 | Aggregation **review/edit UI** before export                                                                                                    | Review screen    | Editable per-basin fields (lab, fechas, counts, punto) |
| ✅ 5.4 | **Annual-results XML builder** + Spanish date/decimal formatting + catalog mapping                                                              | shared module    | XSD element names/order; unit-tested                   |
| ✅ 5.5 | **Pre-export validation** mirroring SILOE rules (001/002/003/004/201/206/207/208/209/236/237/291…) with friendly messages                       | Validation layer | Bad data blocked w/ clear es-ES messages               |
| 🟡 5.6 | Download + `xml_export` history; (🔲 pool-registration XML — gated on §13.1 catalogs)                                                           | Export UI        | Annual XML download + stored + logged; reg-XML pending |

**Phase 5 exit:** ✅ an org can generate a validated SILOE annual-results XML for a year and download it.
_Note: validation is rule-based (mirrors the documented COD_ERROR list) rather than native-binary
XSD validation, to keep the serverless build robust; the builder follows the XSD element names/order.
XML is generated client-side via the shared module (no secrets); a server endpoint can wrap the
same builder for future direct upload. Pool-registration XML lands when the registration catalogs
arrive (§13.1)._

---

## Phase 6 — Route planning (Mapbox)

| #      | Task                                                                            | Deliverable   | Acceptance                                                                                      |
| ------ | ------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| ✅ 6.1 | DB: `route`, `route_stop`                                                       | Migration     | Org-scoped RLS, composite FKs                                                                   |
| ✅ 6.2 | `/api` **Mapbox Optimization API** proxy + static-map proxy (token server-side) | Functions     | `/api/route-optimize` returns order+legs; `/api/route-map` PNG                                  |
| ✅ 6.3 | Select pools for a day → optimized route + map + ordered stops + ETAs           | Route UI      | Stops with ETAs, static map, save, Google Maps link                                             |
| 🟡 6.4 | Route available offline once fetched; "start visit" deep-links into report flow | Offline route | "Iniciar visita" → /reports/new?poolId deep-link ✅; offline caching deferred (Phase 4 skipped) |

**Phase 6 exit:** ✅ a technician plans an optimized multi-pool day (online). Offline route access
waits for Phase 4 (PWA), which was skipped.

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
**Status:** 7.2 and 7.3 partly done (dashboard alerts, bell, axe at 0 in CI). The e-mail part of
7.1 continues as **10.3**, 7.4 as **10.7**.

---

# Competitor-review plan (November 2026): Phases 8–11

From Elena's development plan of 13 Nov 2026: a review of ClorAqua, ManageMart and VisitPro, a
check of the live panel, `main` as of 4 Nov and cloro.app. In that plan these are "Phase 0" to
"Phase 3"; they are numbered 8–11 here because 0–7 are taken. Cloro's edge is **RD 742/2013 +
SILOÉ correctness, a real treatments log and signed reports**, so anything legal must be exactly
right and tested, citing the BOE text (BOE-A-2013-10580, Anexos I, II, III and V). Each phase
ends with a summary and waits for its PRs to be merged before the next one starts.

## Phase 8 — Fix what's broken

Plan: [`plans/phase-8-fix-whats-broken.md`](./plans/phase-8-fix-whats-broken.md). PRs are stacked
in the order below.

| #      | Task                                                                                                                                     | PR                                   | Acceptance                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| 🟡 8.1 | This plan in the repo (phases 8–11 with status)                                                                                          | `docs: …phases 8–11`                 | The repo is the source of truth for the plan                             |
| 🟡 8.2 | Dashboard: "Piscinas activas" 0 and "Todo en orden" with 7 unvisited pools. Root cause: invalid embeds on composite keys; errors ignored | `fix(dashboard): …`                  | Real counts; a failed query shows an error, never zeros                  |
| ⬜ 8.3 | SILOÉ badge green only when the installation and every active vaso have codes; otherwise says what's missing                             | `fix(pools): …`                      | Arkana-shaped pool (one uncoded vaso) shows amber with the reason        |
| ⬜ 8.4 | Comunidad Autónoma from a fixed list, filled from the address (postcode → province → community); safe backfill                           | `feat(pools): …` (**adds a column**) | `ccaaToCode()` gives `CT` for every Catalan pool; backfill is idempotent |
| 🟡 8.5 | cloro.app copy: only promise what ships; FAQ checked against RD 742/2013                                                                 | elenaoglinda/cloro-app#1             | Elena approves the copy; published from Lovable                          |

## Phase 9 — RD 742/2013 and SILOÉ correctness

Every legal value is checked against the BOE text before seeding and cited (anexo) in code
comments and tests. Nothing may change signed reports or past SILOÉ exports: the demo seed and a
SILOÉ export are compared before and after.

| #      | Task                                                                                                                                                                                                                                                                                                            | Acceptance                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ⬜ 9.1 | Closure limits (Anexo I/III situations that force closing the vaso; to verify: free chlorine >5 mg/L, combined >3, bromine >10, CYA >150, turbidity >20 UNF, bottom drain not visible, E. coli present). A distinct closure status "Cerrar el vaso" in the form, report detail, dashboard, bell and client PDFs | Each limit tested at, just below and just above the value (mutation-tested)                 |
| ⬜ 9.2 | Closure and reopening recorded per vaso and fed into SILOÉ (motivo, días de cierre)                                                                                                                                                                                                                             | XML carries the closures; golden test updated deliberately                                  |
| ⬜ 9.3 | Per-vaso flags (heated, hydromassage/aerosol, stabilised chlorine, disinfection system) decide which parameters are shown and mandatory; "Marcar como completo" requires the mandatory set                                                                                                                      | Legionella only heated + aerosol; CYA only stabilised; redox only without chlorine/bromine… |
| ⬜ 9.4 | Range fixes: CO₂ ≤500 ppm above outdoor air (not mg/m³); air temperature 1–2 °C above water; Langelier index (−0.5 to +0.5) when pH is out of range; Cataluña override values confirmed                                                                                                                         | Values cite the anexo; Cataluña source documented                                           |
| ⬜ 9.5 | Ficha técnica for SILOÉ Anexo IV: tipo 3B (SILOÉ off); vaso type from the SILOÉ catalogue; structured treatment fields (filter, surface, speed, disinfection, flocculant, pH corrector, pump, flow, skimmers, returns); optional shape and dimensions → volume and surface                                      | Typed treatment details instead of free `jsonb`; expand → migrate → contract on live tables |
| ⬜ 9.6 | Cadence per pool type and contract (daily routine control before opening for public pools, monthly periodic, initial control) replaces the fixed 30-day overdue rule; alerts for missing controls and lab analyses due                                                                                          | Madrid dates; tested across DST changes                                                     |
| ⬜ 9.7 | SILOÉ Excel per vaso from the same aggregation as the XML                                                                                                                                                                                                                                                       | Same figures as the XML for the same season                                                 |
| 🔲 9.8 | Pool-registration XML                                                                                                                                                                                                                                                                                           | Blocked on the SILOÉ registration catalogues (§13.1)                                        |

## Phase 10 — Before selling (unblocked parts only)

| #       | Task                                                                                                                                                                               | Acceptance                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| ⬜ 10.1 | Field app: offline capture (reports, photos, signature) with sync. Supersedes Phase 4                                                                                              | A full visit without coverage syncs on reconnect |
| ⬜ 10.2 | Before/after photos with time and GPS, optional company "required" setting; check-in and check-out on site; mobile pass of the report form                                         | UI checks at 390 px, axe at 0                    |
| ⬜ 10.3 | Visit PDF e-mailed automatically when a report is completed; client signature by link. Supersedes the e-mail part of 7.1                                                           | Sent from the server, logged                     |
| ⬜ 10.4 | Stock per van from the products logged per visit, with a restock warning                                                                                                           | Stock moves with each visit's products           |
| ⬜ 10.5 | Plans and usage limits per organisation, set by hand (no payments)                                                                                                                 | Limits enforced in the database                  |
| ⬜ 10.6 | Invoicing (Verifacti test environment): invoice from a completed visit with its products as lines; invoice PDF with the AEAT QR; recurring monthly/annual invoices with bulk issue | docs/INVOICING.md updated                        |
| ⬜ 10.7 | Playwright happy path: sign up → pool → vaso → report → sign → SILOÉ export → invoice. Supersedes 7.4                                                                              | Green in CI                                      |
| ⛔ 10.8 | Stripe subscriptions; per-organisation Verifacti production keys and the modelo de representación                                                                                  | Blocked until the company is incorporated        |

## Phase 11 — WhatsApp agent

| #       | Task           | Acceptance                     |
| ------- | -------------- | ------------------------------ |
| 🔲 11.1 | WhatsApp agent | Not started without Elena's go |

No client portal: not wanted for now.

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
Then 8 → 9 → 10 → (11 on Elena's go); Phase 4 is folded into 10.1.
