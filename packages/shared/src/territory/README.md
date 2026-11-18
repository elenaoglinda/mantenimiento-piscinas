# Territory: Comunidad Autónoma from an address

`ccaa.ts` names the 19 Comunidades Autónomas and autonomous cities by their ISO 3166-2:ES code
(`CT` = Cataluña, the code `parameter_def.ccaa` already uses) and resolves a pool's community:

```
resolveCcaa({ cp, provincia, ccaa })   postcode → province name → old free text, else null
ccaaFromPostcode('08001')              'CT'  (first two digits = INE province 01–52)
ccaaFromProvinceName('Lérida')         'CT'  (Spanish or co-official names, accents ignored)
ccaaFromText('CAT')                    'CT'  (community names, ISO codes, province names)
```

## Things that will bite you

- **The SQL backfill has its own copy of the province table** (`public.ccaa_from_postcode` in
  the `pool_ccaa_code` migration). `apps/web/src/lib/ccaaSql.test.ts` reads that migration and
  fails unless its 52 prefixes match `PROVINCES`. Change both together.
- **The postcode wins.** A pool whose old text said "Madrid" but whose postcode starts with 08
  resolves to Cataluña. That is deliberate: the postcode comes from the address autocomplete.
- **Null means "ask".** Nothing guesses a community from a town name; the pool page asks for it.
