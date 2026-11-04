# Client reports (shared)

The two PDFs a pool company sends its **own client**: the **visit report** (one visit, sent
after it) and the **monthly summary** (one pool, one month). Used by `api/report-pdf.ts`; the
buttons live in `apps/web/src/features/client-reports/`.

## Two entry points, on purpose

- `client-reports/index.ts`: everything, including `render.ts`, which uses **pdf-lib**. Only
  the API imports it, by relative path (`../packages/shared/src/client-reports/index.js`; see
  docs/ONBOARDING.md §6 for why `/api` never imports the package by name).
- `@piscinas/shared` (the package barrel) exports **only `share.ts`**: the e-mail and WhatsApp
  links and the month helpers. Exporting the rest from the barrel would put pdf-lib (and its
  fonts) in the browser bundle, even though the browser never draws a PDF.

## How a PDF is made

1. The API reads the data **with the caller's token** (RLS applies) and maps it to
   `VisitReportData` / `MonthlySummaryData`: plain data, no Supabase types.
2. `layoutVisitReport` / `layoutMonthlySummary` turn that into pages of drawing operations
   (`DrawOp`) with `Flow` (`layout.ts`): headings, wrapped paragraphs, tables whose header
   repeats on each page and whose rows never split, image grids, charts (`chart.ts`).
3. `renderPdf` draws the operations with pdf-lib.

The layout never touches pdf-lib: tests run it with a fake font (`fakeMeasure`) and check
wrapping, pagination and content directly. `render` is tested on top with the real fonts.

## Decisions a newcomer might undo

- **Standard Helvetica, no font files.** The function stays small and fast. The price: only
  WinAnsi characters can be drawn. `pdfSafe()` maps the rest (`≤` → `<=`, `CO₂` → `CO2`, emoji
  → `?`); every string goes through it, because pdf-lib throws on an unencodable character and
  a client's name typed with an emoji would otherwise break the PDF.
- **Deterministic bytes.** `PDFDocument.create({ updateMetadata: false })`, no dates, no ids.
  The API names the stored file after the SHA-256 of the bytes, so re-sending a signed visit
  reuses the same file and the old links keep working. Don't add a "generated at" timestamp.
- **Labels come from the locale file** (`clientReports.pdf` in
  `apps/web/src/locales/es/common.json`), flattened with `flattenLabels`. `PDF_LABEL_KEYS`
  lists every key used, and a test fails if the locale file lacks one.
- **Colours are design tokens by name** (`palette.ts`). A test reads `tokens.css` and fails if
  a value drifts.
- **Legal vs recommended.** Readings outside SILOÉ (alkalinity, hardness, salt, phosphates)
  print "recomendado" and are never counted as "fuera del rango legal".
- **Monthly lights follow the current thresholds** (`lightVisits`), like the app's Historial,
  so the PDF and the screen agree. The visit report shows the status saved with the visit, like
  the report page.
- **"Unavailable" is not "none".** If the API couldn't read products or tasks it passes
  `unavailable`, and the PDF says so instead of claiming nothing was used.
- **The signer's DNI is not printed.** The PDF travels by WhatsApp; the name and date are
  enough for a client, and the DNI stays in the app's legal record.
