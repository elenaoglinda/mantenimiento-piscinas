# Phase 0 — audit (24 Oct 2026)

Baseline for the panel redesign. Screenshots of every route at 1440 / 1024 / 390 px are in
[`before/`](./before/), captured with the harness in `scripts/redesign/` against a **fake
Supabase backend** (see below), so they show realistic logged-in pages without credentials and
without touching the real database. All 60 captures loaded with **zero page or console errors**
(`before/_report.json`).

## Routes

| Route                                                                              | Page                                | Auth                        | In sidebar  |
| ---------------------------------------------------------------------------------- | ----------------------------------- | --------------------------- | ----------- |
| `/login`                                                                           | LoginPage                           | public                      | —           |
| `/signup`                                                                          | SignupPage                          | public                      | —           |
| `/invite/:token`                                                                   | InvitePage                          | public                      | —           |
| `/onboarding`                                                                      | OnboardingPage                      | session, no profile         | —           |
| `/`                                                                                | DashboardPage                       | full                        | Inicio      |
| `/pools`, `/pools/:poolId`                                                         | PoolsPage, PoolDetailPage           | full                        | Piscinas    |
| `/reports`, `/reports/new`, `/reports/import`, `/reports/:id`, `/reports/:id/edit` | Reports\*, ReportForm, ImportReport | full                        | Informes    |
| `/routes`                                                                          | RoutesPage                          | full                        | Rutas       |
| `/siloe`                                                                           | SiloeExportPage                     | full                        | SILOÉ       |
| `/invoices`, `/invoices/resumen`, `/invoices/settings`, `/invoices/:id`            | invoicing feature                   | full                        | Facturación |
| `/clients`                                                                         | ClientsPage                         | full, **company orgs only** | Clientes    |
| `/team`                                                                            | TeamPage                            | full                        | Equipo      |
| `*`                                                                                | → `/`                               | —                           | —           |

`/clients` is hidden from the nav for owner orgs today. The new sidebar keeps that rule — the plan's
table lists Clientes unconditionally, but showing it to owners would be a behaviour change.

## Colour findings

The codebase is already well tokenised: every colour goes through `src/styles/tokens.css`.

- **Teal brand** (`--brand-*`, hue ≈ 175°) in `tokens.css`, `#0d9488` as `theme-color` in
  `index.html`. Replaced in phase 1.
- **`bg-brand-50`** — 2 usages (`AppShell.tsx`, `OnboardingPage.tsx`).
- **Literal hex** — only two places: `GoogleButton.tsx` (Google's own logo colours, which must
  stay as-is) and `SignaturePad.tsx` (`#0f1f1d` ink, moved to a token in phase 1).
- **No** `teal-*` / `emerald-*` / `green-*` Tailwind utilities anywhere.

## Contrast (WCAG AA) — the plan's palette

Computed, not eyeballed (`text ≥ 4.5:1`, UI components ≥ 3:1):

| Pair                                                                  | Ratio         |                      |
| --------------------------------------------------------------------- | ------------- | -------------------- |
| text / text-muted on bg, surface, surface-muted, sidebar, accent-soft | 5.8 – 18.6    | pass                 |
| accent (links) on surface, bg, accent-soft                            | 5.8 – 6.2     | pass                 |
| white on primary navy-800 / navy-900                                  | 14.1 / 18.6   | pass                 |
| **status-green / amber / red / unknown as pill text**                 | **2.3 – 3.9** | **fail**             |
| **focus ring brand-400 vs bg / surface**                              | **2.4 / 2.5** | **fail (needs 3:1)** |

The status failures are **not new** — the plan carried over today's values, so current pills
already fail AA. Fix applied in phase 1:

- Fills, dots and bars keep the vivid values from the plan (`--status-green: #16A34A`, …).
- Status-coloured **text** uses new `--status-*-text` tokens: green `#166534`, amber `#A34A07`,
  red `#B91C1C`, unknown `#5B677A` — the lightest shades that pass on both the `-bg` tint and the
  15 % tints the pills use. 25 usages in 14 files move from `text-status-x` to `text-status-x-text`.
- Focus ring moves from brand-400 to **brand-500 `#1394B5`** (3.3:1).

## How the harness fakes the backend

`scripts/redesign/capture.spec.ts` builds the app with `VITE_SUPABASE_URL=https://mock.supabase.co`,
seeds a session into `localStorage`, and answers every Supabase request from
`scripts/redesign/fixtures.ts` (a company org, two clients, three pools, three reports, a route).
It honours `eq.` filters, `single()` vs `maybeSingle()`, and `count` via `Content-Range` — which
must be CORS-exposed, or every count silently reads as 0 (the first baseline run had exactly
that bug and showed "add a client first" with two clients present).

Re-run for the after shots: `SHOT_DIR=after npx playwright test -c scripts/redesign/playwright.config.ts`.

## Phase 5 — QA results

Run with `SHOT_DIR=after LIGHTHOUSE=1 npx playwright test -c scripts/redesign/playwright.config.ts`
(see [`scripts/redesign/README.md`](../../scripts/redesign/README.md)).

| Check                                                                              | Result                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Screenshots: 21 pages × 1440 / 1024 / 390 + 4 shell states → `after/`              | 63 + 4 captured, 0 page errors              |
| axe-core WCAG 2.1 A/AA, every page at 1440 and 390 (`after/_axe.json`)             | **0 violations**                            |
| axe on open overlays (pool sheet, ⌘K, user menu, mobile drawer, client sheet)      | **0 violations**                            |
| Lighthouse accessibility, every page (`after/_lighthouse.json`)                    | **100** on all 21 (target ≥ 95)             |
| Keyboard: skip link, palette, drawer + sheet focus trap/return, tables, tabs, rail | 7/7 pass                                    |
| No horizontal scroll at 390px                                                      | 21/21 pass                                  |
| End to end: client → pool → vaso → report → SILOÉ XML download                     | pass (XML carries the pool and basin codes) |
| Repo e2e smoke (`e2e/`) and unit tests                                             | 3/3 · 80 web + 73 shared                    |

Found and fixed during QA:

- **User menu label** didn't contain its visible text (WCAG 2.5.3, every page). The expanded
  button is now named by the visible name and role; only the icon rail keeps an `aria-label`.
- **Invite link input** had no label.
- **Wide tables** on phones weren't keyboard-scrollable. `HScroll` makes them a focusable region
  only while they overflow.
- **Focus return**: pages that unmount their modal (`{open && <Modal/>}`) dropped focus on
  `<body>` when it closed. `useReturnFocus` in the kit restores it to the trigger.

The **before** set was re-captured in phase 5 from a worktree of `main` with the same harness and
the same (richer) fake data, so before/after compare like with like.

Pre-existing gap surfaced by the flow test: there is **no UI to enter a basin's SILOÉ code**
(`basin.siloe_cod_v`), which the XML export requires. The flow spec sets it directly; it is listed
as a follow-up in the PR.

## Loro rebrand (24 Nov 2026)

The product is now **Loro** (meetloro.com). Only the brand layer changed: tokens, logo, favicon,
font and copy. Layout, components and flows are as before. The palette comes from the website's
`styles.css` and logo: navy `#0b3c5d`, aqua `#22b8cf`, darker aqua `#006e87` for links, mist
`#f0f4f7` page background, muted text `#435b70`, border `#d2dce4`. The font is Manrope.

Contrast of the new values, computed against bg, surface, surface-muted, sidebar and accent-soft:

| Pair                                        | Ratio       |                                          |
| ------------------------------------------- | ----------- | ---------------------------------------- |
| text (navy-800)                             | 9.7 – 11.5  | pass                                     |
| text-muted                                  | 5.9 – 7.1   | pass                                     |
| accent (brand-700, links)                   | 4.9 – 5.9   | pass                                     |
| white on primary navy-800 / navy-900        | 11.5 / 15.0 | pass                                     |
| focus ring (brand-600)                      | 3.5 – 4.2   | pass (UI, 3:1)                           |
| status-\*-text (green, amber, red, unknown) | ≥ 4.8       | pass                                     |
| brand-400 logo aqua on white                | 2.4         | decorative only, never text or a UI edge |

The focus ring moved from brand-500 to **brand-600** because the new brand-500 is 2.9:1 on the
slightly darker page background.
