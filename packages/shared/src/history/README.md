# History (shared)

Framework-free logic behind the service-history screens (`apps/web/src/features/history`).
No React, no Supabase: the app fetches visit rows and hands them in here. `index.ts` is the whole
module; `index.test.ts` covers it.

## What lives here, and why

- **Traffic lights** — `worstStatus`, `readingStatus`. A reading is lit with `evaluate()` and the
  pool's current thresholds; the stored status is only a fallback for a parameter with no
  definition.
- **Latest state** — `latestStateByBasin`: newest value per vaso and parameter, its light, and
  the worst light of the vaso. Basins with no readings still get an (empty) entry, so the card
  can say so instead of disappearing.
- **Madrid dates** — `daysSince` counts calendar days in Madrid ("ayer" is yesterday on the
  pool's calendar, not 24 hours ago). `dateRangeBounds` turns an inclusive day range into
  half-open UTC bounds and survives the DST change days.
- **Trends** — `buildTrend`, `trendDomain`, `niceTicks`. Points outside the legal range are
  flagged `outOfRange` (from `evaluate().compliant`), which is what the chart marks.
- **CSV** — `toCsv`, `csvNumber`, `visitsCsv`. Built for Spanish Excel: BOM, `;`, decimal comma,
  CRLF, formula-looking cells neutralised.
- **URL filters** — `parseVisitFilters`, `writeVisitFilters`, `activeFilterCount`. Malformed
  values are dropped, never guessed; writing keeps unrelated query parameters.

## What deliberately does NOT live here

SILOÉ aggregation. The annual figures stay in `siloe/aggregate.ts` with their own rules (daily
means, completed/signed reports only). History shows visits as recorded; it never feeds SILOÉ.
