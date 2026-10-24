# App shell

The authenticated layout around every page: left sidebar, sticky top bar, fluid content area and
the ⌘K command palette. Pages render unchanged inside `<Outlet />` — the shell owns navigation,
never page content.

```
index.ts               public surface — import { AppShell } from here
AppShell.tsx           layout, drawer + palette state, document.title, ⌘K listener
Sidebar.tsx            rail (desktop) and drawer content: groups, active state, user menu
Topbar.tsx             hamburger, breadcrumb, search trigger, "+ Nuevo informe", help, bell
CommandMenu.tsx        ⌘K palette — jumps to pages and quick actions
MobileDrawer.tsx       the sidebar as a modal drawer below 1024px
nav.ts                 the navigation table + resolveRoute(): one source for sidebar,
                       breadcrumb, palette and page titles
useSidebarCollapsed.ts collapsed state in localStorage, crash-proof
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

## Placeholders and follow-ups

These are visible in the UI and deliberately not wired to anything yet:

| Element                 | Today                                        | Needs                                                               |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Company row             | Shows the one company; chevron is decorative | Multi-company switching                                             |
| Ajustes (user menu)     | Disabled, "Próximamente"                     | A general settings page — none exists                               |
| Ayuda                   | Opens cloro.app                              | A real help centre or contact address                               |
| Notifications bell      | `aria-disabled`, "Próximamente"              | A notifications source                                              |
| Record search           | The palette jumps to pages only, and says so | A search endpoint                                                   |
| Sidebar count badges    | Not shown                                    | Counts the shell can load cheaply (e.g. invoices needing attention) |
| Breadcrumb record names | Shows "Detalle", not "Villa Mar"             | Pages passing their record name up (phase 4, with `PageHeader`)     |
