# Invoicing (shared)

Framework-free invoicing logic: money, Spanish tax IDs, and the Verifacti request/response
contract. No React, no Supabase, no `fetch` — so it runs identically in the browser, in the
Vercel functions under `api/`, and in tests.

`index.ts` is the whole module; `index.test.ts` covers it.

## What lives here, and why

- **Money** — `centsToAmount`, `amountToCents`, `formatEuros`. Amounts are integer cents
  everywhere and only become decimal strings for the API. A float is never an amount.
- **Dates** — `toVerifactiDate` (`DD-MM-YYYY`, not ISO) and `madridToday`. Verifacti requires
  `fecha_expedicion` to be _today_, in Spain, so the timezone is part of the contract.
- **`isValidNif`** — checks the control character of a DNI, NIE or CIF, not just the shape.
  Verifacti validates the destinatario against the AEAT census and rejects the invoice if it
  fails, so catching a bad NIF here saves a round trip and a rejected record.
- **Request/response contract** — `buildCreatePayload`, `validateForSending`,
  `parseCreateResponse`, `mapEstado`, `isPendingLookup`.

## What deliberately does NOT live here

**The per-tax-rate aggregation.** It is in SQL (`invoice_tax_breakdown`), so the totals stored on
the invoice and the figures sent to AEAT come from one rounding implementation rather than two
that can drift. This module formats that result; it does not recompute it.

## Behaviour that looks odd until you know why

- `parseCreateResponse` never throws. A surprising payload must not crash a request that may
  already have created a legal record at AEAT.
- `mapEstado` defaults an unrecognised state to `sending`, never to `failed`. Guessing "failed"
  is what would invite a duplicate send of a record AEAT already holds.
- `isPendingLookup` exists for one quirk, verified against the sandbox: for roughly a minute
  after a successful create, the status endpoint answers `{"mensaje":"Factura no encontrada"}`.
  Treating that as an error would mark a validly filed invoice as broken.

See [`docs/INVOICING.md`](../../../../docs/INVOICING.md) for the full contract.
