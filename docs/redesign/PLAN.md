# Cloro panel — UI/UX redesign plan

> Scope: **panel.cloro.app only** (Vite + React + Tailwind). No API, database or business-logic
> changes. The React Native technician app is out of scope.
>
> Condensed from the brief (24 Oct 2026). Token values, rules and the definition of done are
> exact; descriptive sections are shortened. Deviations made during execution are recorded in [`AUDIT.md`](./AUDIT.md) and in the
> PR, not by editing this file.

---

## 0. Why we're doing this (current state, audited 24 Oct 2026)

| Issue          | Today                                                                                                | Target                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Brand color    | Tailwind **teal** scale (`--brand-600: #0d9488`), which reads green, like a pool that needs shocking | Clear-water **aqua-blue** + **navy** taken from cloro.app                                                              |
| Brand identity | Header says "Mantenimiento de Piscinas", no logo, system-ui font                                     | Cloro logo (waves mark), **Space Grotesk** headings + **DM Sans** body, same as the website                            |
| Navigation     | Horizontal tabs on top, content squeezed into a centered `max-w-5xl` column                          | **Left sidebar** (like Claude, Qalea and Konecto) with grouped sections, collapsible, and a mobile drawer              |
| Home           | Onboarding checklist only                                                                            | Operational dashboard: KPI cards, today's route, out-of-range alerts, SILOÉ progress. Checklist becomes a compact card |
| Pages          | Generic cards, number input for the year, plain text empty states                                    | Consistent page header, tables with filters, status pills, guided empty states                                         |

---

## 1. Ground rules

1. **Git workflow (required):**
   - Run `git status` and make sure the tree is clean. Then `git checkout -b feat/panel-redesign` from the latest `main`.
   - **Never push to `main` directly.** Commit at the end of every phase with a clear message (`feat(ui): phase 2 – sidebar shell`) and **`git push -u origin feat/panel-redesign` after every phase**, so Vercel builds a preview that can be checked as you go.
   - At the end, open a PR with `gh pr create`. Include a summary, before/after screenshots and the Vercel preview URL.
   - Before starting, confirm push access (`gh auth status` / `git remote -v`). If push fails, stop.
2. **Codebase rule:** every feature lives in its own folder with a `README.md`. New folders: `src/features/app-shell/`, `src/components/ui/`, `src/styles/` (tokens), each with a README explaining what's inside and how to use it.
3. **No functional regressions.** Don't change routes, API calls, data shapes or form validation. This is visual and layout work only. If a page needs new data (for example, dashboard KPIs), use endpoints that already exist. If one is missing, show a placeholder and list it in the PR as a follow-up.
4. UI copy stays in **Spanish** (keep the existing strings and only add new ones).
5. Run `typecheck`, `lint`, `test` and `build` before every push. All must pass.

---

## 2. Brand system: "clean pool water"

Source of truth is the live website (cloro.app): primary `#006B79`, ink `#00161C`, deep navy `#00303B`, hero background a light aqua → warm white gradient, lucide `waves` logo mark in a rounded square.

**Rule: every brand hue sits between 186° and 215° (cyan to blue). The current teal is around 175°, which is why it reads green. Nothing below 185°.**

### 2.1 Tokens

```css
:root {
  /* Aqua-blue — clean pool water */
  --brand-50: #eef9fc;
  --brand-100: #d5f1f7;
  --brand-200: #aee3ef;
  --brand-300: #74cde2;
  --brand-400: #36b0ce;
  --brand-500: #1394b5;
  --brand-600: #007a96;
  --brand-700: #006b79; /* website primary — links, active states, focus */
  --brand-800: #0a5566;
  --brand-900: #0b4252;

  /* Marine navy — highlights, primary buttons, sidebar active */
  --navy-700: #0e4a66;
  --navy-800: #00303b; /* website deep navy */
  --navy-900: #00161c; /* website ink */

  --primary: var(--navy-800);
  --primary-hover: var(--navy-900);
  --primary-contrast: #ffffff;
  --accent: var(--brand-700);
  --accent-soft: var(--brand-50);
  --focus-ring: var(--brand-400);

  --bg: #f5f9fa;
  --surface: #ffffff;
  --surface-muted: #eef4f6;
  --sidebar-bg: #f8fbfc;
  --text: #00161c;
  --text-muted: #506169;
  --border: #dce6ea;

  --status-green: #16a34a;
  --status-green-bg: #dcfce7;
  --status-amber: #d97706;
  --status-amber-bg: #fef3c7;
  --status-red: #dc2626;
  --status-red-bg: #fee2e2;
  --status-unknown: #94a3b8;
  --status-unknown-bg: #f1f5f9;

  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-full: 9999px;
  --shadow-card: 0 1px 2px rgb(0 22 28 / 0.04), 0 1px 3px rgb(0 22 28 / 0.06);
}
```

- Check every text/background pair for **WCAG AA** contrast (≥ 4.5:1 for body text). Adjust shades if any pair fails and note it in the PR.
- Grep the codebase for hard-coded teal or green (`teal-`, `emerald-`, `#0d9488`, `#14b8a6`, `brand-` usages) and move them to tokens.

### 2.2 Typography

- Install `@fontsource/space-grotesk` (500, 600) and `@fontsource/dm-sans` (400, 500, 600), self-hosted.
- Headings, KPI numbers and the logo wordmark use Space Grotesk. Everything else uses DM Sans. Tabular numbers for ppm, pH, €, counts and dates.
- Scale: page title 24/32 semibold · section title 16/24 semibold · body 14/20 · small/meta 12/16.

### 2.3 Identity

- Logo component: lucide `Waves` icon, white on a `--navy-800` rounded square (radius 8), plus the "Cloro" wordmark.
- `document.title` = `Cloro · {Page}`. Favicon from the same mark.
- Remove the "Mantenimiento de Piscinas" header text.

---

## 3. App shell: left sidebar

### 3.1 Sidebar (`src/features/app-shell/Sidebar.tsx`)

- 248px expanded, 68px collapsed icon rail; toggle remembered in `localStorage` (try/catch).
- Top: Cloro logo, then a company switcher row (company name + user, chevron).
- Navigation: Inicio · **Operación** (Rutas, Piscinas, Informes, Clientes) · **Cumplimiento** (SILOÉ) · **Gestión** (Facturación, Equipo). Commented slot for future items (Agente WhatsApp, Productos químicos).
- Item: 36px, radius-md, muted. Hover `--surface-muted`. **Active: `--accent-soft` bg, `--navy-800` text, `--accent` icon, 3px left bar in `--accent`.**
- Group headers: 11px uppercase, letter-spacing .06em, `--text-muted`.
- Count badges on items if the data already exists.
- Bottom: "Ayuda", then a user card whose menu holds "Ajustes" and **"Cerrar sesión"**.
- Collapsed rail: icons only, tooltips.
- **< 1024px:** off-canvas drawer, hamburger in the top bar, closes on navigation, traps focus, closes with Esc.

### 3.2 Top bar (`src/features/app-shell/Topbar.tsx`), sticky

- Breadcrumb · search "Buscar piscinas, clientes o informes" with ⌘K opening a command palette that jumps to pages · **"+ Nuevo informe"**, help icon, notifications bell (placeholder).

### 3.3 Content area

- Fluid, `max-w-[1440px]`, 32px padding (16px mobile), 8px grid. `PageHeader` on every page.

---

## 4. Component kit (`src/components/ui/`)

shadcn/ui (Radix) primitives themed with the tokens: `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `Textarea`, `Card`, `StatCard`, `ProgressBar`, `StatusPill`, `ParamChip`, `DataTable`, `EmptyState`, `Tabs`, `Dialog`/`Sheet`, `Toast`, `Tooltip`, `Skeleton`, `Avatar`, `Breadcrumb`, `CommandMenu`. Hidden **`/design`** route (dev and preview only) showing every component and token.

---

## 5. Page-by-page

1. **Inicio:** 4 `StatCard`s (Piscinas activas · Visitas hoy · Lecturas fuera de rango · SILOÉ {año}), Ruta de hoy + Alertas, compact collapsible "Primeros pasos".
2. **Piscinas:** `DataTable`, "+ Nueva piscina" in a `Sheet`, detail tabs Resumen · Vasos · Informes · SILOÉ.
3. **Informes:** filtered table; sectioned report form with a sticky live summary.
4. **Rutas:** day/week toggle, technician filter, list + map placeholder.
5. **SILOÉ:** 3-step stepper, year as `Select`, per-pool readiness, exports table.
6. **Facturación:** table, status pills, totals strip. VeriFactu logic untouched.
7. **Clientes / Equipo:** `DataTable` + `Sheet`; role badges and invite status.
8. **Login / registro / onboarding:** split layout with the aqua gradient panel.

---

## 6. Execution phases (commit + push after each)

| Phase                 | Deliverable                                                                                                    | Gate                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **0. Audit**          | Branch, baseline screenshots at 1440 / 1024 / 390 into `docs/redesign/before/`, route list, hard-coded colours | Post findings, continue                           |
| **1. Tokens + fonts** | Section 2 globally, fonts self-hosted, logo                                                                    | Build passes, push                                |
| **2. App shell**      | Sidebar, top bar, drawer, layout; pages render unchanged inside it                                             | Push. **Pause for shell approval on the preview** |
| **3. Component kit**  | Section 4 + `/design`                                                                                          | Push                                              |
| **4. Pages**          | Section 5, one commit per page                                                                                 | Push after each                                   |
| **5. QA**             | All checks, after screenshots, keyboard + axe + Lighthouse a11y ≥ 95                                           | Push                                              |
| **6. Ship**           | PR into `main` with screenshots and preview URL                                                                | Review and promote                                |

## 7. Definition of done

- Zero teal/green brand colours left; everything from tokens.
- Sidebar works expanded, collapsed and on mobile; active state correct on nested routes.
- Every page uses `PageHeader`, has loading skeletons and a designed empty state.
- No behaviour change: create client → pool → vaso → report → SILOÉ export works end to end (Playwright).
- PR open on `feat/panel-redesign`, Vercel preview green, screenshots attached.
