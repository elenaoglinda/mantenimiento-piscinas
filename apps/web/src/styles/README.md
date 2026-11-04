# Styles — design tokens

The visual source of truth for the panel. Change a value here and the whole app follows.

```
tokens.css   every colour, radius, shadow and font family, as CSS custom properties
index.css    maps the tokens into Tailwind (@theme inline) + global base styles
```

## Using tokens

Always reach for a semantic utility, never a raw scale step or a hex value:

| Need                                 | Use                                                       | Not                      |
| ------------------------------------ | --------------------------------------------------------- | ------------------------ |
| Primary button                       | `bg-primary text-primary-contrast hover:bg-primary-hover` | `bg-navy-800`            |
| Link, active tab, selected state     | `text-accent`, `border-accent`                            | `text-brand-700`         |
| Selected row / active nav background | `bg-accent-soft`                                          | `bg-brand-50`            |
| Focus                                | `focus-visible:outline-focus`, `focus:ring-focus/40`      | `ring-primary`           |
| Page / card / muted surface          | `bg-bg`, `bg-surface`, `bg-surface-muted`                 | `bg-white`, `bg-gray-50` |
| Body / secondary text                | `text-text`, `text-text-muted`                            | `text-gray-600`          |
| Headings, KPI numbers                | `font-display` (h1–h4 get it automatically)               | —                        |
| Card elevation                       | `shadow-card`                                             | `shadow-sm`              |

The raw `brand-*` and `navy-*` scales exist for the rare decorative case (gradients, illustrations).
If you find yourself using one for an interactive element, there is probably a semantic token for it.

## Status colours — two tokens each, on purpose

| Token                                        | Use for                                   |
| -------------------------------------------- | ----------------------------------------- |
| `status-green` / `amber` / `red` / `unknown` | fills, dots, bars, borders, icons         |
| `status-*-bg`                                | the tinted background of a pill or banner |
| `status-*-text`                              | **any text** in a status colour           |

The base status colours are vivid but only reach 2.3–3.9:1 on their tints, which fails WCAG AA for
text. The `-text` shades are the lightest that pass ≥ 4.5:1 on both the `-bg` tint and the 15 %
tints the pills use. So: `bg-status-red/15 text-status-red-text`, never `text-status-red`.

## Brand rule

Every brand hue sits between **186° and 215°** (cyan → blue). The old teal sat near 175°, which is
why it read green. Don't add anything below 185°. The computed contrast for every pair is in
[`docs/redesign/AUDIT.md`](../../../../docs/redesign/AUDIT.md).

## Type

DM Sans (body) and Space Grotesk (headings, figures) are **self-hosted** through `@fontsource`,
imported in `main.tsx` — no font CDN. Tables and `<time>` use tabular figures so ppm, pH, € and
dates line up in columns.
