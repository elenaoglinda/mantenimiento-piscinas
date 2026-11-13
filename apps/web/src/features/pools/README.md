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
