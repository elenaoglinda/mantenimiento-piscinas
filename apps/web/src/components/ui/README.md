# UI kit

Shared building blocks for every page of the panel, themed with the tokens in
[`src/styles/tokens.css`](../../styles/README.md). Interactive primitives (dialogs, selects,
tabs, tooltips, toasts) are [Radix](https://www.radix-ui.com/) components styled the
[shadcn/ui](https://ui.shadcn.com/) way: the source lives here and we own it, nothing is a
black box.

**See them all, with sample data, at `/design`** — available in `npm run dev` and on Vercel
preview deployments, never in production (see [`features/design`](../../features/design/README.md)).

Import each component from its file: `import { Button } from '../components/ui/Button.js'`.

## What's here

| File                          | Exports                                                           | Use for                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Button.tsx`                  | `Button`                                                          | `variant` primary · secondary · ghost · danger · link; `size` sm · md · lg · icon; `loading`; `asChild` to style a `<Link>` |
| `Input.tsx`                   | `Field`, `Input`, `Textarea`, `NativeSelect`, `controlClass`      | Form controls. Put a control inside `Field` and the label, hint and error are wired for you                                 |
| `TextField.tsx`, `fields.tsx` | `TextField`, `SelectField`, `TextareaField`                       | `Field` + control in one (the original API, kept for existing forms)                                                        |
| `Select.tsx`                  | `Select`                                                          | Radix select for filters and toolbars (e.g. SILOÉ year). In forms, prefer `NativeSelect`                                    |
| `Combobox.tsx`                | `Combobox`                                                        | Type-to-filter select for long lists (pools, clients). `name` submits it with a form                                        |
| `DatePicker.tsx`              | `DatePicker`                                                      | Calendar in a popover. Value is `YYYY-MM-DD`, like `<input type="date">`                                                    |
| `Card.tsx`                    | `Card`, `CardHeader`                                              | Surfaces. `Card` is padded; `padded={false}` for tables and lists                                                           |
| `StatCard.tsx`                | `StatCard`                                                        | KPI tile; links when given `to`; `loading` shows a skeleton                                                                 |
| `ProgressBar.tsx`             | `ProgressBar`                                                     | "8 de 12 listas"                                                                                                            |
| `StatusPill.tsx`              | `StatusPill`                                                      | State labels: green · amber · red · unknown · info · neutral                                                                |
| `StatusChip.tsx`              | `StatusChip`                                                      | A water-parameter status, translated                                                                                        |
| `ParamChip.tsx`               | `ParamChip`                                                       | One reading: "Cl libre 1,2 ppm", tinted by status                                                                           |
| `DataTable.tsx`               | `DataTable`, `TableToolbar`, `Column`                             | Record lists: sortable headers, skeleton rows, empty state, whole-row links                                                 |
| `EmptyState.tsx`              | `EmptyState`                                                      | What an empty list says, and the one action that fills it                                                                   |
| `Tabs.tsx`                    | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `TabsNav`       | In-page tabs (Radix), or `TabsNav` when each tab is a route                                                                 |
| `Dialog.tsx`                  | `Dialog`, `Sheet`                                                 | Modal dialog; `Sheet` is the right-hand side panel for create/edit forms                                                    |
| `Modal.tsx`                   | `Modal`                                                           | The original modal API, now backed by `Dialog`                                                                              |
| `Toast.tsx`, `toast.ts`       | `Toaster`, `toast()`                                              | `toast('Piscina creada')` from anywhere; `Toaster` is mounted once in `App`                                                 |
| `Tooltip.tsx`                 | `Tooltip`, `TooltipProvider`                                      | Hover/focus hints. The provider is mounted once in `App`                                                                    |
| `Skeleton.tsx`                | `Skeleton`, `SkeletonText`                                        | Loading placeholders                                                                                                        |
| `Avatar.tsx`                  | `Avatar`                                                          | Photo or initials                                                                                                           |
| `Breadcrumb.tsx`              | `Breadcrumb`                                                      | Used by the top bar                                                                                                         |
| `Command.tsx`                 | `Command*`, `CommandDialog`                                       | cmdk lists; `CommandDialog` is the ⌘K palette shell                                                                         |
| `Popover.tsx`                 | `Popover*`                                                        | Floating panel (used by Combobox and DatePicker)                                                                            |
| `PageHeader.tsx`              | `PageHeader`                                                      | Top of every page: back link, title, badges, actions, tabs                                                                  |
| `HScroll.tsx`                 | `HScroll`                                                         | Wide tables: becomes a focusable, labelled region only when it actually overflows                                           |
| `useReturnFocus.ts`           | `useReturnFocus`                                                  | Used by Dialog/Sheet/CommandDialog: focus goes back to the trigger even when a page unmounts the dialog                     |
| `feedback.tsx`                | `Alert`, `Spinner`, `Card`                                        | Inline messages (error · warning · success · info)                                                                          |
| `utils.ts`                    | `cn`, `focusRing`, `fold`, `foldFilter`, `initials`, date helpers | Class merging and small helpers                                                                                             |
| `variants.ts`                 | `buttonVariants`, `toneClass`                                     | Style maps shared between components                                                                                        |

## Rules

- **Colours come from tokens only** (`bg-primary`, `text-accent`, `bg-status-red-bg`…). No hex,
  no Tailwind palette colours. Status text uses the `-text` tokens, which pass AA.
- **One primary button per view.** Everything else is `secondary` or `ghost`.
- **Every list has three states**: skeleton while loading, `EmptyState` when empty, rows.
- **Text carries meaning, colour reinforces it.** A pill says "Fuera de rango", it isn't just red.
- **Keyboard first.** Every interactive piece is reachable with Tab and shows the focus ring
  (`focusRing` in `utils.ts`). Radix handles focus traps, Esc and arrow keys.
- **Copy is Spanish** and comes from `locales/es/common.json` in product pages.
- `Button` has **no default `type`** on purpose: buttons inside forms keep submitting, as before.
  Pass `type="button"` for buttons in a form that shouldn't submit.

## Tests

`ui.test.tsx` covers the behaviour that would hurt if it broke: form submission, label wiring,
Spanish-aware sorting, empty/loading states, row links, Esc to close, toasts, accent-insensitive
search and the date helpers.
