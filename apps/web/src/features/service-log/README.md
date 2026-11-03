# Service log

What a technician does at a visit beyond the SILOÉ readings: the **products added**, the
**tasks done**, the **readings private pools care about** (alkalinity, hardness, salt,
phosphates), and whether each **route stop** was done. Before this, Cloro stored readings and
incidents only.

| Piece          | Tables                                                                 | Where it shows                                                                     |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Products added | `chemical_product` (org catalogue), `report_chemical` (per visit)      | Report form "Productos añadidos" · report detail · Historial · Ajustes → Productos |
| Tasks done     | `task_def` (org list, ordered), `report_task` (per visit: hecho, nota) | Report form "Tareas" · report detail · Historial · Ajustes → Tareas de la visita   |

Migrations: `supabase/migrations/20261103130000_chemical_products.sql`,
`20261103130100_visit_tasks.sql` (each with its
`supabase/rollback/*.down.sql`). Database tests: `supabase/tests/service_log.test.sql`.
Pure logic and its tests: `packages/shared/src/service-log/`.

## How it connects

- **Report form** (`pages/ReportFormPage.tsx`) uses `useServiceLogForm(reportId)` and the
  section components. The report row is saved first, then readings and incidents, then the
  service log. If the log fails, the report stays saved, the form says exactly what failed,
  and saving again updates the same report instead of creating a second one.
- **Historial** (`features/history`) asks `useVisitLogs(ids)` for the visits on screen, in a
  query of its own, so the history still shows if this part fails.
- **Report detail** shows `ReportServiceLogCard`.
- **Ajustes** shows the catalogue editors to admins.
- Every call goes through `lib/dbError.ts`; `ServiceLogAlert` says what went wrong.

## Decisions a newcomer would otherwise undo

- **Separate queries, not embeds in the visit query.** Until Sara merges, the preview runs
  against a production database without these tables. An embed of a missing table makes the
  whole visit query fail, so Historial would break. Fetched apart, a missing table shows one
  notice ("falta aplicar las migraciones…") and everything else works.
- **A used product can't be deleted, only deactivated.** `report_chemical → chemical_product`
  is `on delete restrict`: the log of what was poured into a pool must not lose its product.
  Deactivated products leave the quick-pick chips but stay on every visit that used them.
- **The unit is copied onto each visit.** Changing a product from kg to g later doesn't
  rewrite past visits.
- **Only admins change the catalogue** (RLS, not just the UI). Technicians pick from it.
- **Signed reports are immutable here too.** `report_chemical` follows `report_is_editable()`
  exactly like `measurement`.
- **Quantities are typed, never guessed.** A product on the form without a valid amount
  blocks saving with a message on that row (`chemicalRows`); "0,5" and "0.5" both work.
- **An untouched checklist saves nothing.** Only tasks marked done or given a note become
  `report_task` rows (`taskRows`), so "0 of 8" is never stored for visits where nobody used
  the checklist, and history shows what was actually done.
- **Catalogues are seeded by `seed_org_catalogues()`**, called by the migration for existing
  orgs and by `provision_account()` for new ones. It is not callable by app users, so nobody
  can seed into another org; it is idempotent.
