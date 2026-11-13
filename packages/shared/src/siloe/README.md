# SILOÉ (shared logic)

Framework-free code behind the SILOÉ annual-results export. Read `docs/technical-spec.md`
Appendix A (the XML contract) before changing anything here.

| File           | What                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `catalogs.ts`  | SILOÉ code tables (parameters, LUGAR, METODO, TIPO_PM…), mirrored in the `siloe_catalog` table |
| `aggregate.ts` | per-visit readings → annual figures per parameter (daily-mean rule, días_nc, vc_med/min/max)   |
| `season.ts`    | groups a season's readings per vaso; `season.test.ts` pins the XML byte for byte               |
| `xml.ts`       | `buildAnnualResultsXml()` (XSD element names and order) and `validateAnnualResults()`          |
| `readiness.ts` | `siloeReadiness()`: does an installation have every code the XML needs?                        |

## Things that will bite you

- **The golden XML test is a contract.** The file is filed with the Ministry; a byte change is a
  behaviour change even if SILOÉ would accept it. Change `season.test.ts` only on purpose.
- **Readiness checks exactly what the XML uses:** `pool.siloe_cod_p` (cod_seguridad) and the
  `siloe_cod_v` of every vaso still in use. A vaso is retired on its `fecha_baja`, not the day
  after. An installation with no active vaso is not ready, because it has nothing to report.
