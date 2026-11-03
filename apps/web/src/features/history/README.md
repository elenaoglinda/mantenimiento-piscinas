# Service history

Shows back what Cloro already stores about a pool's visits — readings, incidents, photos,
signatures — so nobody has to open reports one by one to know how a pool is doing.

| Screen                     | Where                                            | What it answers                                                                         |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Último estado del agua** | Pool → Resumen                                   | What is the water like now, per vaso? When was the last visit? Anything open?           |
| **Historial**              | Pool → Historial (replaces the old Informes tab) | Every visit, newest first, with the key readings inline                                 |
| **Evolución**              | Pool → Evolución                                 | How a parameter moved over 30 / 90 / 365 days, per vaso, against the legal range        |
| **Ficha del cliente**      | `/clients/:clientId`                             | The client's contact, pools, current state, one timeline of every visit, open incidents |
| **Informes filters + CSV** | `/reports`                                       | Visits by date, client, pool, technician, out-of-range; exported for Spanish Excel      |

Alerts on the dashboard and in the bell link to the visit **inside its pool's Historial**
(`/pools/:id?tab=historial&visita=:reportId`), which opens that row expanded and scrolls to it.
Build that URL with `historyLink()` rather than by hand.

## What it connects to

- **Tables, read-only:** `report`, `measurement`, `incident`, `attachment`, plus `pool`,
  `basin`, `client`, `app_user` and `parameter_def` for names, units and thresholds. RLS does
  the scoping, as everywhere else. Nothing in this feature writes, apart from the client edit
  form it reuses (`components/ClientFormModal.tsx`, unchanged rules).
- **No migration.** See "Why no SQL view" below.
- **`@piscinas/shared` → `history/`** holds the logic that isn't React or Supabase: latest value
  per vaso, trend series and axis ticks, Madrid date ranges, the CSV format, the URL filters.
  It is unit-tested there; start with `packages/shared/src/history/index.test.ts`.
- **`lib/parameters.ts` → `resolveParameterDefs`** picks the definition that applies in the
  pool's region (CCAA override over the national default). The traffic light is then
  `evaluate()` from `@piscinas/shared` — the same engine the report form uses.
- **`lib/dbError.ts`**: every query returns `{ data, failure }` and screens show
  `FailureAlert` instead of an empty list. An empty history must mean "no visits", never "the
  query failed".

## Decisions a newcomer would otherwise undo

- **Why no SQL view.** A `visit_summary` view would make filtering and paging simpler. But the
  Vercel preview talks to the production database, where a new view only appears after Sara
  merges (the Supabase GitHub integration applies migrations then). With a view, the preview
  could not show any history before the merge, and production would break for the minutes
  between the deploy and the migration. Reading the existing tables avoids both. If histories
  grow to many thousands of visits per org, a view is the next step; `lib/data.ts` is the only
  file that would change.
- **"Solo fuera de rango" lists red readings first, then fetches the page.** PostgREST can't
  filter a report by its children without also trimming the embedded readings, so
  `listOutOfRangeIds` fetches the red readings' visits (just the fields the filters need),
  filters and sorts them in the browser, and only then fetches 30 full rows. "Out of range" is
  the stored status `red`, the same rule as the dashboard and the bell.
- **Colours are re-evaluated, not read from the database.** The light on each reading comes
  from `evaluate()` with the pool's current thresholds, so the same value shows the same colour
  on every screen. The stored `measurement.status` is used only for a parameter with no
  definition. The filter above uses the stored status because it runs in the database.
- **An incident is "open" when it has no corrective action.** The `incident` table has no
  resolved flag; a written corrective action is the logbook's own way of closing one.
- **"Último estado" looks at the last 200 visits per pool** (`RECENT_VISITS`), not all of them —
  over three months for two vasos visited daily. A value older than that isn't the current
  state, and the card stays fast for pools with years of history. Each value shows its own
  date, because lab parameters are measured less often than chlorine.
- **Drafts count.** A draft is a real visit whose readings were taken (photo imports are
  checked by the technician before saving), so it appears in the history with its "Borrador"
  badge and feeds the last state. SILOÉ still uses only completed and signed reports.
- **Times are Madrid time** whatever the device's timezone (`lib/format.ts`), and the date
  filters are Madrid calendar days (`dateRangeBounds`), so "hasta el 31" includes the whole 31st.
- **The chart is hand-drawn SVG, loaded on demand.** `TrendChart` is a `React.lazy` chunk; no
  chart library. One line per vaso in the fixed `--chart-1..3` order (tokens.css); a vaso keeps
  its colour whatever is shown, and more than three vasos are shown three at a time rather than
  inventing colours. Out-of-range points are red **triangles**, so the shape carries the meaning
  too. The SVG is an image with a summary; the same numbers are in the table beneath it.
- **Filters live in the URL** (`desde`, `hasta`, `vaso`, `piscina`, `cliente`, `tecnico`,
  `fuera`, `estado`), so a filtered list can be bookmarked or sent. Parsing drops anything
  malformed instead of guessing (`parseVisitFilters`).
- **CSV is for Spanish Excel:** UTF-8 with BOM (or "ñ" breaks), `;` separator, decimal comma,
  dates as DD/MM/AAAA. Cells starting with `= + - @` are quoted with a leading `'` so a pool
  name can never run as a formula.

## Bundle

The bell and the dashboard import `historyLink` from the barrel, and the bell lives in the app
shell, i.e. the first download. Rollup only drops the rest of the feature if nothing in it looks
like it runs code on import, so module-level `new Intl…`, `new Map` and `lazy()` calls carry a
`/* @__PURE__ */` mark. Without them the entry chunk grows from ~126 kB to ~149 kB. Check
`npm run build` output (`index-*.js`) after adding module-level code here.

## Files

```
index.ts                 public surface (import only this from outside)
pages/ClientDetailPage   /clients/:clientId
components/              WaterStateCards, VisitHistory (+ VisitRow), TrendPanel, TrendChart (lazy),
                         VisitFilters (Informes), ExportCsvButton, ReadingChip, FailureAlert
lib/data.ts              every query, typed, through dbError
lib/format.ts            numbers and dates in es-ES / Madrid
lib/links.ts             historyLink()
lib/useParamCatalog.ts   parameter definitions, loaded once per session
```

Tests: `packages/shared/src/history/index.test.ts` (logic), `scripts/redesign/flow.spec.ts`
(end to end: client → pool → vaso → three visits → every history screen), plus the axe,
keyboard and phone-width checks over the new routes in `scripts/redesign/routes.ts`.
