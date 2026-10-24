# Invoicing (web)

The UI for issuing invoices and filing them with the AEAT through Verifacti (Veri\*Factu).

## Layout

```
index.ts                     the feature's public surface — import from here, not from inside
pages/InvoicesPage.tsx       history table + filters, setup checklist, draft creation
pages/InvoiceDetailPage.tsx  line editor, totals, Emitir / Enviar / Actualizar estado
pages/BillingSettingsPage.tsx the org's fiscal identity (the emisor)
pages/ResumenPage.tsx        billed / outstanding / overdue / needs-attention
components/SetupChecklist.tsx   the three steps before anything can be issued
components/FiscalStateBadge.tsx fiscal badge + the separate payment badge
components/InvoiceTimeline.tsx  the append-only history of one invoice
components/RejectionPanel.tsx   the three legal exits from a rejected record
components/RectificativaDialog.tsx  R1–R5, por diferencias / por sustitución
components/InvoicingHeader.tsx  the header every tab shares: "Facturación", TEST badge, tabs
components/FacturacionNav.tsx   section sub-nav (kit TabsNav) + the TEST environment badge
components/DbFailureAlert.tsx   renders a DbFailure as something actionable
lib/data.ts                  all Supabase access + the Veri*Factu send orchestration
```

## How it connects

- **Database** — `supabase/migrations/*_invoicing*.sql`. The schema is not incidental: gapless
  numbering, immutability of issued invoices and the fiscal state machine are enforced by
  constraints, triggers and RPCs, so this UI cannot violate them even if it tries. Treat a
  rejection from the database as the specification, not as a bug to work around.
- **Pure logic** — `@piscinas/shared` → `packages/shared/src/invoicing/`. Money arithmetic,
  Spanish tax-ID validation and the Verifacti request/response contract live there because they
  are framework-free and must behave identically wherever they run.
- **Network** — `api/verifacti.ts`, a Vercel function. It holds `VERIFACTI_API_KEY` and is the
  only thing that talks to Verifacti. This folder never sees the key.
- **Error handling** — `apps/web/src/lib/dbError.ts`. Deliberately _outside_ this feature: the
  no-silent-failures rule is project-wide, and a second feature needing it must not have to
  import from `features/invoicing/`.

## The state machine is not here

Every fiscal transition goes through an RPC — `issue_invoice`, `claim_invoice_for_send`,
`record_aeat_result`, `cancel_invoice`, `cancel_and_replace`, `create_rectificativa`,
`mark_invoice_paid`. This folder never writes `status` or `send_status` directly. If you need a
new transition, add it to `invoice_transition_allowed()` first; the trigger will reject anything
the table does not permit, whatever the UI does.

Two states are **derived and never stored**: _Rectificada_ (a rectificativa names this invoice)
and _Vencida_ (`due_date` passed, unpaid). Storing either would mean a nightly job just to keep
them true.

## Two rules worth knowing before editing

**Money is integer cents.** Floats never touch an amount. Values become decimal strings only at
the API boundary. `amountToCents()` accepts both `1.234,56` and `1,234.56`.

**Every Supabase call surfaces its error.** `lib/data.ts` returns a `DbFailure` rather than
swallowing it, and pages render it with `<DbFailureAlert>`. This exists because the first
version ignored `error` everywhere: a failed write looked exactly like a successful one, and the
fiscal form reported "guardado" while discarding what the user typed. If you add a call here,
thread its error through the same path.

Full documentation, including the verified Verifacti contract and the state machine:
[`docs/INVOICING.md`](../../../../../docs/INVOICING.md). The manual test script —
the flows that can only be checked by a logged-in human — is
[`docs/INVOICING_TEST_SCRIPT.md`](../../../../../docs/INVOICING_TEST_SCRIPT.md).
