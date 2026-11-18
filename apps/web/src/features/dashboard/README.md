# Dashboard (`/`)

The home page after sign-in: four stat cards (active pools, today's visits, out-of-range
readings, SILOÉ progress), today's route, alerts (out-of-range readings and pools without a
recent visit), the planned-routes calendar, recent reports and the onboarding checklist.

```
pages/DashboardPage.tsx         the page
lib/data.ts                     every query, with its error read (loadDashboard, loadRoutesBetween)
components/OnboardingChecklist  first-steps card (dismissable per org)
components/RoutesCalendar       month grid of planned routes
```

## Things that will bite you

- **A failed query never becomes a number.** `loadDashboard()` returns `data: null` on the first
  failed query and the page shows an error with "Reintentar", "—" on the stat cards and "No
  disponible" in the cards that would otherwise say there is nothing to do. Partial results are
  not shown: a dashboard that says "0 piscinas" or "Todo en orden" because one query failed is
  worse than one that says it couldn't load. Keep it that way when adding a card.

- **The pure helpers stay in `src/lib/dashboard.ts`.** Madrid dates (`madridDateString`,
  `madridTime`), `stalePools`, `monthGrid` and `ACTIVITY_WINDOW_DAYS` are also used by the app
  shell's bell and by the Rutas page, so they are cross-cutting (ONBOARDING §7.1 rule 3).
- **Embeds name the table, never the column.** Tenant foreign keys are composite
  (`client_id, org_id`), so PostgREST only accepts `client!pool_client_id_org_id_fkey(name)`.
  `client:client_id!pool_client_id_org_id_fkey(name)` fails with PGRST200 and returns no rows;
  that is what made the live dashboard show 0 pools and "Todo en orden" (fixed November 2026).
  `lib/embeds.test.ts` fails the build on that pattern anywhere in the app, and the ui checks'
  fake backend rejects it like the real server.
