# Brand

`Logo.tsx` — the Loro logo: the parrot mark (navy head, aqua wing, navy eye) plus the lowercase
"loro" wordmark, both as SVG outlines copied from the meetloro.com website. Colours come from the
`navy-800` and `brand-400` tokens. `markOnly` drops the wordmark for tight spaces such as the
collapsed sidebar rail; the SVG keeps `aria-label="Loro"` so the mark is never anonymous.

The favicon (`apps/web/public/favicon.svg`) is the website's app icon: the same mark in white and
aqua on a navy rounded square. It can't read CSS variables, so its hex values (`#0b3c5d`,
`#22b8cf`) are copied from `styles/tokens.css`. If the mark changes, change both.
