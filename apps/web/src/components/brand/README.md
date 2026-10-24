# Brand

`Logo.tsx` — the Cloro mark (lucide `Waves`, white on a `navy-800` rounded square, radius 8) plus
the "Cloro" wordmark in Space Grotesk. `markOnly` drops the wordmark for tight spaces such as the
collapsed sidebar rail; it keeps an `sr-only` label so the mark is never anonymous.

The favicon (`apps/web/public/favicon.svg`) is the same mark drawn by hand with the path data
copied from `lucide-react`, so the two can't drift apart visually. If the mark changes, change both.
