# Invoicing & Veri\*Factu

Issuing invoices and filing them with the AEAT through [Verifacti](https://www.verifacti.com),
a third-party API that handles the Veri\*Factu plumbing on our behalf.

> **This is a test-environment integration.** It is deliberately not ready for real invoices.
> Read [What is NOT done](#what-is-not-done) before switching anything to production.

---

## 1. Why Verifacti

Under RD 1007/2023 an invoicing system must generate a _registro de facturación_ per invoice,
hash it, chain it to the previous one, and send it to AEAT. Verifacti does all of that:

> «La API Verifacti se encarga de generar el Registro de Facturación (XML) y todo lo que va
> incluido y depende del mismo: huella hash y encadenamiento.»

So **we never compute a hash or a chain**. A `200` from `/verifactu/create` means the record
exists, is correctly chained, and is queued for AEAT. That single fact removes most of the risk
from this module and is why the integration is as small as it is.

## 2. The verified contract

Everything below was confirmed against the live sandbox, not read from docs alone.

| Item               | Value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Base URL           | `https://api.verifacti.com`                                                                            |
| Auth               | `Authorization: Bearer <api key>`                                                                      |
| Environment        | Decided **by the key prefix** — `vf_test_` vs `vf_prod_`. The URLs are identical.                      |
| Idempotency        | `Idempotency-Key` header. `409` = same key in flight, `422` = key reused with a different payload.     |
| `fecha_expedicion` | **`DD-MM-YYYY`, and it must be today.** Invoices cannot be backdated.                                  |
| `lineas`           | The **IVA breakdown** (`base_imponible`, `tipo_impositivo`, `cuota_repercutida`), _not_ product lines. |

A full round trip looks like this:

```
POST /verifactu/create   → 200 {"estado":"Pendiente","uuid":…,"qr":<base64 png>,"url":<AEAT>,"huella":…}
POST /verifactu/status   → {"mensaje":"Factura no encontrada"}     ← for ~60s. TRANSIENT.
POST /verifactu/status   → {"estado":"Correcta", …}                 ← after ~60–90s
```

**That "Factura no encontrada" window is the trap in this integration.** For about a minute
after a perfectly successful create, the status endpoint reports the invoice as missing. Treating
that as an error would mark a valid, legally-filed invoice as failed. `isPendingLookup()` exists
solely to recognise it, and `refreshStatus()` leaves the status untouched when it sees it.

## 3. Architecture

```
apps/web/src/pages/InvoicesPage.tsx        list, series/fiscal setup, draft creation
apps/web/src/pages/InvoiceDetailPage.tsx   line editor, issue, send, status
apps/web/src/pages/BillingSettingsPage.tsx the org's fiscal identity
apps/web/src/lib/invoicing.ts              data access + send orchestration
api/verifacti.ts                           authenticated proxy; holds the API key
packages/shared/src/invoicing.ts           money, NIF validation, payload/response contract
supabase/migrations/20260925120000_invoicing.sql
supabase/rollback/20260925120000_invoicing.down.sql
```

### Money is integer cents, everywhere

`bigint` in Postgres, `number` (cents) in TypeScript, decimal strings only at the API boundary.
No amount ever touches a float. `amountToCents()` accepts both `1.234,56` and `1,234.56`.

### Rounding happens once, in SQL

AEAT reconciles the quota **per tax rate**, so bases are summed per rate first and the quota
rounded once per rate — rounding each line separately drifts by cents on long invoices. That
logic lives in `invoice_tax_breakdown()` and the `recalc_invoice_totals` trigger, so the totals
stored on the invoice and the figures sent to AEAT come from one implementation, not two.

### Numbers are allocated at issue, never at creation

Gaps in a series are prohibited. A Postgres `SEQUENCE` is the wrong tool — it is
non-transactional, so a rolled-back insert burns a number. Instead `issue_invoice()` locks the
series row `FOR UPDATE`, reads `next_number`, and writes the invoice in the same transaction.
Drafts carry **no number at all**, so abandoning one cannot leave a hole.

### Issued invoices are immutable

`invoice_guard_immutable` blocks `DELETE` and freezes every business column once the invoice
leaves `draft`; only the Veri\*Factu tracking columns may still move.
`invoice_line_guard_immutable` does the same for its lines. Corrections are made with a
rectificativa (R1–R5) or an abono — never by editing. This is enforced in the database, not the
UI, so it holds regardless of what any client does.

### Retries can never duplicate a legal record

Each invoice carries a stored `idempotency_key`, generated once and **never regenerated**. Every
send reuses it. If a send times out we record `failed` and keep the key, because a timeout means
_we don't know_ whether AEAT received it — the retry must collapse onto the same record.
`mapEstado()` defaults an unrecognised state to `sending`, never to `failed`, for the same
reason: guessing "failed" is what invites a duplicate.

## 4. Setup

1. **Apply the migration** — `supabase/migrations/20260925120000_invoicing.sql`.
2. **Regenerate types** — Supabase MCP `generate_typescript_types`, then `npm run format`.
   (The types in this PR were written by hand to match; regenerating should be a no-op.)
3. **Set `VERIFACTI_API_KEY`** in Vercel, **Preview + Development only** for now. Server-side,
   no `VITE_` prefix — it must never reach the browser.
4. In the app: **Facturas → Datos fiscales**, fill in the NIF and razón social, then
   **Crear serie del año en curso**. `issue_invoice()` refuses until both exist.

## 5. Testing it

Draft → add lines → **Emitir factura** (allocates the number, freezes it) → **Enviar a la AEAT**
→ wait a minute → **Actualizar estado** until it reads _Aceptada_. The detail page then links to
the AEAT validation URL for that record.

Worth trying deliberately:

- **Press Enviar twice.** The second press should not create a second record.
- **Edit an issued invoice via the API.** The database should refuse it.
- **Refresh status immediately after sending.** It should stay _Enviando_, not flip to an error.

## 6. What is NOT done

- **Single-tenant key.** Verifacti issues **one API key per obligado tributario**. This PR reads
  a single key from the environment, so every org would invoice through the same Veri\*Factu
  account. **Real multi-tenant use needs a per-org credential** stored server-side — the next PR.
- **No modelo de representación.** Before a NIF's first _production_ invoice, its holder must
  sign an authorisation. Autónomos (DNI/NIE) can use Verifacti's remote signature; companies
  (CIF) must sign a PDF with a digital certificate. Neither is wired up.
- **Paid tier required** for webhooks, the NIF-management API and automated representación. The
  free/shared account cannot use them, which is why status is polled rather than pushed.
- No PDF, no QR rendering (the base64 QR is returned but not yet stored), no email delivery.
- No rectificativas or abonos yet, so **a mistake on an issued invoice currently has no remedy
  in the UI**. Worth knowing before issuing anything real.
- No recurring contracts, no monthly batch, no chemicals/parts on invoices, no gestoría export.
- No scheduled retry sweep; retry is manual, from the invoice page.

## 7. Undoing it

`supabase/rollback/20260925120000_invoicing.down.sql` drops everything this migration added.
It lives outside `supabase/migrations/` on purpose: the Supabase CLI applies every `.sql` in
that directory as a _forward_ migration.

It is destructive — it drops all invoices, lines and series. **Invoices already sent to AEAT
continue to exist at AEAT**; dropping the local rows does not cancel them. Export first.

The rest of the module is additive: new files, three new routes, one nav entry, five nullable
columns on `client`. Nothing existing changes behaviour, so reverting the branch plus running
the down script returns the app to its previous state.
