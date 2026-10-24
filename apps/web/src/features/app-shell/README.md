# App shell

The authenticated layout around every page: left sidebar, sticky top bar, fluid content area and
the ⌘K command palette. Pages render unchanged inside `<Outlet />` — the shell owns navigation,
never page content.

```
index.ts               public surface — import { AppShell } from here
AppShell.tsx           layout, drawer + palette state, document.title, ⌘K listener
Sidebar.tsx            rail (desktop) and drawer content: groups, active state, user menu
Topbar.tsx             hamburger, breadcrumb, search trigger, "+ Nuevo informe", help, bell
CommandMenu.tsx        ⌘K palette — pages, quick actions, pool/client search
NotificationsMenu.tsx  the bell: current alerts
ShellDataProvider.tsx  loads alerts and sidebar counts on each navigation
shellData.ts           the context those read from
MobileDrawer.tsx       the sidebar as a modal drawer below 1024px
nav.ts                 the navigation table + resolveRoute(): one source for sidebar,
                       breadcrumb, palette and page titles
useSidebarCollapsed.ts collapsed state in localStorage, crash-proof
recordCrumb.ts         useRecordCrumb(): detail pages name their record for the breadcrumb
RecordCrumbProvider.tsx holds that name for the shell
```

## Adding a page to the sidebar

Add one entry to `NAV_GROUPS` in `nav.ts`. The sidebar, the breadcrumb, the command palette and
`document.title` all pick it up. If the page has sub-routes (`/x/new`, `/x/:id/edit`), add their
labels to `SUB_PAGES` — specific patterns **before** the generic `/section/:id` one, or `/x/new`
will read as a record called "new". `nav.test.ts` covers this ordering.

## Behaviour worth knowing

- **Active state** uses React Router's `NavLink`, so `/pools/:id` keeps Piscinas active. Only Inicio
  is `end`-matched, otherwise it would be active everywhere.
- **Clientes is company-only**, carried over from the previous nav. The plan's table lists it for
  everyone; showing it to owner orgs (which only have an implicit self-client) would be a
  behaviour change.
- **"+ Nuevo informe" is hidden for viewers**, matching the reports page, which already refuses
  them. Offering a button that leads to a page they can't use would be worse than no button.
- **Breakpoints:** rail at ≥ 1024px (`lg`), drawer below. The drawer is a real modal — focus moves
  in, Tab wraps, Esc and the backdrop close it, the page behind doesn't scroll, and focus returns
  to the menu button.
- **Collapsed rail** shows icons with tooltips on hover _and_ keyboard focus. Tooltips are
  `position: fixed` from the trigger's rect so the scrolling nav can't clip them.
- **Collapsed state** survives reloads via `localStorage` under `cloro.sidebar.collapsed`, wrapped
  in try/catch: private mode or blocked storage just means it starts expanded.

## Record names in the breadcrumb

Detail pages call `useRecordCrumb(name)` (exported from `index.ts`) once their record has loaded,
so the breadcrumb and the tab title read "Piscinas › Villa Mar" instead of "Detalle". The name is
stored with the path it belongs to, so it never leaks onto the next page while that one loads.

## Live data in the shell

`ShellDataProvider` loads, on every navigation, what the shell shows everywhere:

- **Avisos** (the bell): out-of-range readings from the last 30 days and invoices the AEAT
  rejected or that couldn't be sent (`invoices_needing_attention`). Derived, so nothing is
  "marked as read": an alert disappears when its cause is fixed.
- **Sidebar counts**: draft reports next to Informes, invoices needing attention next to
  Facturación. The count is part of the link's accessible name.

All read-only, on existing tables and RPCs. A failed load leaves the previous values; the shell
never blocks a page on it.

**⌘K** searches pools and clients by name from two letters on (`ilike`, read-only) and offers
"Buscar «…» en informes", which deep-links into the Informes search with `?q=` (Clientes takes
`?q=` too).

**Ajustes** (`/settings`) and **Ayuda** (`/ayuda`) are `UTILITY_PAGES` in `nav.ts`: not in the
sidebar groups, but known to the breadcrumb, the tab title and ⌘K.

## What's still deliberately simple

| Element     | Today                                                   | Would need                        |
| ----------- | ------------------------------------------------------- | --------------------------------- |
| Company row | Opens the organisation's settings (one org per account) | Multi-organisation membership     |
| Avisos      | Recomputed on navigation, not pushed                    | Realtime subscriptions, if wanted |
