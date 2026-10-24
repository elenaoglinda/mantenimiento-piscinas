# Design gallery (`/design`)

An internal page that renders every token and every component in
[`components/ui`](../../components/ui/README.md) with realistic sample data. Use it to check a
change to the kit in one place, and to show the system to someone without clicking through the
app.

```
DesignPage.tsx   the gallery itself (sample data is inline and fake)
visibility.ts    showDesignPage: where the route exists
```

## Where it's available

| Build                         | `/design`                                                                   |
| ----------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                 | yes                                                                         |
| Vercel **preview** deployment | yes                                                                         |
| Vercel **production**         | no — the route isn't registered, so it falls through to the normal redirect |

`vite.config.ts` copies Vercel's build-time `VERCEL_ENV` into `import.meta.env.VITE_VERCEL_ENV`.
The page is lazy-loaded, so its code isn't in the main bundle either.

It needs no login and reads no data: everything on it is sample content.

## Adding to it

When you add a component to `components/ui`, add a section here showing its variants and states
(loading, empty, error, disabled).
