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

One folder per feature, per `docs/ONBOARDING.md` §7.1:

```
apps/web/src/features/invoicing/
  index.ts                     public surface — outside code imports this, nothing deeper
  pages/InvoicesPage.tsx       history table + filters, setup checklist, draft creation
  pages/InvoiceDetailPage.tsx  line editor, totals, Emitir / Enviar / Actualizar estado
  pages/BillingSettingsPage.tsx the org's fiscal identity
  components/                  SetupChecklist · SendStatusBadge · DbFailureAlert
  lib/data.ts                  Supabase access + Veri*Factu send orchestration
  README.md

packages/shared/src/invoicing/ money, NIF validation, payload/response contract (+ README)
apps/web/src/lib/dbError.ts    error mapping — outside the feature on purpose, see below
api/verifacti.ts               authenticated proxy; holds VERIFACTI_API_KEY
supabase/migrations/20260925120000_invoicing.sql
supabase/migrations/20261002120000_invoicing_lifecycle.sql
supabase/rollback/*.down.sql
```

`dbError.ts` sits outside the feature although invoicing is, today, its only consumer. The
no-silent-failures rule is project-wide, and the moment a second feature needs it, importing
from `features/invoicing/` would be the wrong dependency direction. If invoicing stays the only
consumer, moving it in later is a one-line change.

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

Step-by-step manual script, including how to force a rejection and a transport failure:
[`docs/INVOICING_TEST_SCRIPT.md`](./INVOICING_TEST_SCRIPT.md).

Draft → add lines → **Emitir factura** (allocates the number, freezes it) → **Enviar a la AEAT**
→ wait a minute → **Actualizar estado** until it reads _Aceptada_. The detail page then links to
the AEAT validation URL for that record.

Worth trying deliberately:

- **Press Enviar twice.** The second press should not create a second record.
- **Edit an issued invoice via the API.** The database should refuse it.
- **Refresh status immediately after sending.** It should stay _Enviando_, not flip to an error.

## 5b. Troubleshooting

**"Could not find the table 'public.billing_profile' in the schema cache"** — PostgREST code
`PGRST205`, returned as a `404`. The app is deployed but **the migration has not been applied**.
Apply `supabase/migrations/20260925120000_invoicing.sql`. The RPC equivalent is `PGRST202`
(`issue_invoice`, `invoice_tax_breakdown`); if the tables exist but you still see these, the
schema cache is stale — `NOTIFY pgrst, 'reload schema';` forces a reload.

Every Supabase call in this module routes its error through `toDbFailure()` and renders it with
`<DbFailureAlert>`, so a missing migration now says so on screen instead of showing an empty
form. This was not true in the first version: the writes ignored `error` entirely and the UI
reported success regardless, which made an unapplied migration look like a form that forgot
what you typed. If you add a call here, thread its error through the same path.

## 5c. Fiscal lifecycle (Phase 1a)

The state machine is enforced **in the database**. `invoice_transition_allowed()` is the single
source of truth; the guard trigger refuses anything else, so an illegal move fails server-side
with a clear message even if the UI (or a script, or a future client) tries it.

State is the pair `(invoice.status, invoice.send_status)`:

| Badge              | status / send_status                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| Borrador           | `draft` / `not_sent`                                                      |
| Pendiente de envío | `issued` / `queued`, `sending`, `failed`                                  |
| Enviada            | `issued` / `accepted` (`aeat_estado` says Correcta vs AceptadaConErrores) |
| Rechazada          | `issued` / `rejected`                                                     |
| Anulada            | `void`                                                                    |
| Rectificada        | **derived** — a rectificativa points at it                                |
| Vencida            | **derived** — `due_date` passed and unpaid                                |

Derived states are never stored, so they cannot go stale or disagree with reality.

### Exits from a rejected record

A rejection is not a rectificativa case. Verifacti is explicit that `/verifactu/modify`
(subsanación) _"solo puede usarse para subsanar registros de facturación en aquellos casos en
los que la subsanación no tiene ninguna repercusión fiscal"_, and their worked example for a
rejected record resends the **unchanged** payload with `rechazo_previo=X`.

So:

- **Formal/technical cause** (their example: an expired certificate) → resend unchanged,
  `rechazo_previo=X`. `claim_invoice_for_send(id, 'subsanacion')` sets this automatically.
- **Fiscal cause** (wrong amount, NIF, tax rate) → **anular and issue a new invoice**. The
  anulación carries `sin_registro_previo='S'` because AEAT holds nothing, and the replacement
  gets its own number: _"se deberá registrar con un alta y con un número de factura o fecha de
  expedición diferente."_
- **Never a rectificativa.** `create_rectificativa()` refuses unless the original was accepted —
  there is nothing at AEAT to rectify otherwise.

### Concurrency

`claim_invoice_for_send()` is the only way into `sending`. It takes a row lock, checks the state
is still claimable, and returns `null` otherwise — so a user pressing "Reintentar" while
`pg_cron` sweeps results in one send, not two. A second "Emitir" on the same draft blocks on the
lock and
then fails with "La factura ya fue emitida", so a number is never allocated twice. Retries reuse
the registro's stored `idempotency_key`; it is never regenerated, which is what makes a retry
after an unknown outcome safe.

### Retry

Backoff is 1m → 5m → 15m → 1h → 3h, max 5 attempts, then the invoice appears in
`invoices_needing_attention()`. `reap_stuck_sends()` returns invoices abandoned mid-flight by a
crashed worker. The worker itself lives in `/api` (that is where the key is); scheduling it from
`pg_cron` via `pg_net` is deployment configuration, not part of this migration.

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
- **No PDF and no email yet**, so an invoice cannot be delivered to a customer from the app.
- **Document language is presentation only.** Translating an invoice does not make it compliant
  anywhere else: Portugal requires certified software with ATCUD and SAF-T, France is moving to
  Factur-X via PDPs, and Verifacti covers neither. Nothing here should be read as "we can
  invoice in Portugal or France".
- **Per-org Verifacti credentials and the modelo de representación** (Phase 5) remain the gate
  between this and production. Verifacti issues one API key per obligado tributario, and each
  one must sign an authorisation before its first production invoice.
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
