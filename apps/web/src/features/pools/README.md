# Pools (installations and their vasos)

Feature code for pools (SILOÉ "instalaciones") and vasos. The list and detail pages are still
in `src/pages/PoolsPage.tsx` and `src/pages/PoolDetailPage.tsx`; new pool code goes here.

```
components/SiloeBadge   "ready for SILOÉ?" pill on the Piscinas list and the pool header
```

## Things that will bite you

- **The SILOÉ badge is green only when the export would have every code.** The annual-results
  XML needs the installation's code and the code of every vaso still in use. Before November
  2026 the badge checked the installation code only, so a pool with an uncoded vaso (Arkana)
  showed green. The rule lives in `packages/shared/src/siloe/readiness.ts`; the badge only
  words the result. A vaso retired on or before today (`fecha_baja`) doesn't count.
- **Pages that show the badge must load the vasos** with `fecha_baja` and `siloe_cod_v`
  (the Piscinas list embeds `basin!basin_pool_id_org_id_fkey(denominacion, siloe_cod_v, fecha_baja)`).
- **Checked by** `scripts/redesign/siloe-badge.spec.ts` (ready, missing installation code, one
  uncoded vaso, retired vaso ignored, no active vasos) in the CI ui job.
- **The Comunidad Autónoma is a code** (`pool.ccaa_code`, one of 19, `CT` = Cataluña) and
  decides which regional thresholds apply. `PoolFormModal` shows a select prefilled from the
  postcode and the address suggestion (`resolveCcaa` in `packages/shared/src/territory/`); once
  someone picks one by hand, the address no longer changes it. The form also writes the
  community's name into the old `pool.ccaa` text, which older app versions read (expand step).
- **Code that reads a pool's region selects `*`, not `ccaa_code`,** and goes through
  `poolRegion()` in `lib/parameters.ts`, so it works before and after the migration (previews use
  the production database). The form retries without `ccaa_code` if PostgREST answers PGRST204
  for it. Both workarounds go when `pool.ccaa` is dropped (contract step, Phase 9 at the earliest).
- **Checked by** `scripts/redesign/ccaa.spec.ts` (postcode prefill, manual choice sticks, saved
  name, "Sin indicar", saving before the migration) and `supabase/tests/pool_ccaa_code.test.sql`.
