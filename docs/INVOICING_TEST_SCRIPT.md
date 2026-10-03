# Invoicing — manual test script (Phase 1a)

I cannot log in, so this is the part of the verification only you can do. Each section says what
to click, what you should see, and **what it would mean if you see something else**.

Run it against a **preview deployment** of the branch, never production, and only with the
`vf_test_` key. Everything below files records against Verifacti's shared sandbox NIF
(`B75777847`), not your company.

**Before you start:** apply `supabase/migrations/20261002120000_invoicing_lifecycle.sql`. Without
it every page shows _"Falta aplicar la migración"_ — which is itself a valid first check that the
error surfacing works.

---

## 1. Happy path — draft → emitida → aceptada

1. **Facturación → Ajustes** → NIF + razón social → _Guardar_. Expect _"Datos fiscales guardados"_.
2. Back to **Facturas** → _Crear serie del año en curso_. The checklist ticks steps 1 and 2.
3. **Nueva factura** → series, a client **with a valid CIF**, a description → _Crear borrador_.
4. Open it → add a line (`Mantenimiento mensual`, 1, `200,00`). Total reads **242,00 €**
   (200 + 21 %). If it reads anything else, the SQL rounding and the UI disagree — stop and tell me.
5. _Emitir factura_ → a confirmation dialog appears explaining it cannot be edited afterwards.
   Confirm.
   - The badge becomes **Pendiente de envío** and a number appears.
   - The timeline shows **Emitida** with serie and número.
6. _Enviar a la AEAT_. Timeline gains **Enviada a la AEAT** with a huella.
7. Wait ~60–90 s, then _Actualizar estado_ until the badge reads **Enviada a AEAT**.
   - Pressing it too early must leave the badge unchanged. It must **never** flip to an error —
     that transient window is the single most likely regression in this module.
8. The Veri\*Factu card shows estado, huella and a link to the AEAT sede.

**Also check:** reopen the invoice and confirm there is no way to edit lines or the client.

---

## 2. Concurrency — the double click

1. Create and issue a new draft.
2. Press _Enviar a la AEAT_ twice in quick succession (or in two tabs).
   - Exactly **one** send happens. The second is a silent no-op, not an error.
   - The timeline must show **one** _Enviada a la AEAT_, not two.
3. On a draft, open it in two tabs and press _Emitir_ in both.
   - The second shows _"La factura ya fue emitida"_.
   - **The number must not skip.** Check the next invoice you issue continues the sequence with
     no gap — a gap here is a compliance problem, not a cosmetic one.

---

## 3. Transport failure → retry → requiere atención

The reliable way to force this: temporarily **remove `VERIFACTI_API_KEY`** from the preview
environment and redeploy.

1. Issue an invoice and press _Enviar_. It fails; badge stays **Pendiente de envío**, timeline
   shows **Fallo de envío**, and the error names the missing service.
2. Press _Enviar_ again a few times. Timeline shows **Reintento de envío** with a rising attempt
   count. After 5 attempts you get **Requiere atención**.
3. **Resumen** shows it in the _Requieren atención_ tile, and **Facturas → filtro "Requieren
   atención"** lists it.
4. Put the key back, redeploy, press _Enviar_ once more — it should now succeed **without**
   creating a duplicate at AEAT (the idempotency key is reused).

---

## 4. Rejection — all three exits

A genuine AEAT `Incorrecta` is hard to provoke on demand, so drive it from the database. In the
Supabase SQL editor, for an invoice you have already sent:

```sql
-- Put the most recent unsettled registro into "rejected", as AEAT would.
select public.record_aeat_result(
  (select id from public.invoice_aeat_record
    where invoice_id = '<INVOICE_UUID>' and settled_at is null
    order by created_at desc limit 1),
  'Incorrecta', null, null, null, null,
  '1100', 'NIF del destinatario no censado en la AEAT', false);
```

Reload the invoice. You should see the **Rechazada** badge and the rejection panel with
**three** options, each explaining when it applies:

| Option                                         | Expected behaviour                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| **Reenviar sin cambios** (causa técnica)       | Sends a subsanación with `rechazo_previo=X`. Timeline: _Subsanación enviada_. |
| **Subsanar registro** (dato sin efecto fiscal) | Same mechanism, offered separately so it is a deliberate choice.              |
| **Anular y crear nueva** (importe/NIF/IVA)     | Annuls and opens a **new draft** with the lines copied.                       |

**The thing to verify:** there is **no** "corregir y reenviar" that would let you change an
amount and resend. Verifacti restricts subsanación to changes with no fiscal repercussion, so
that button would quietly produce an invalid correction. If you can find a path that edits a
fiscal field on a rejected invoice, that is a bug — tell me.

Also confirm: _Crear rectificativa_ is **not** offered on a rejected invoice. There is nothing at
AEAT to rectify. The database refuses it too, so even if the button appeared it would fail.

---

## 5. Anulación and "Anular y crear nueva"

1. On an **accepted** invoice, press _Anular_.
   - Badge becomes **Anulada**, timeline shows _Anulada_.
   - The invoice is still listed and still readable. It must not disappear.
2. On another accepted invoice, press _Anular y crear nueva_.
   - You land on a **new draft** with the same lines and **no number**.
   - The original links to its replacement ("Esta factura fue anulada y sustituida").
3. Issue the replacement. **Its number must be a new one** — never the annulled invoice's number.
4. Try _Anular_ on an invoice that is still _Pendiente de envío_: it must refuse with
   _"Espere la respuesta de la AEAT antes de anular"_.

---

## 6. Rectificativas

You need a **second series** first (Ajustes → create one, e.g. `R2026`). A rectificativa in the
original's series is rejected — RD 1619/2012 requires a serie específica.

**Por diferencias:**

1. On an accepted invoice → _Crear rectificativa_ → tipo **R1**, modo **Por diferencias**, series
   `R2026` → _Crear borrador_.
2. You land on a draft in `R2026` with the original's lines copied.
3. Edit the lines to the corrected amount, _Emitir_, _Enviar_.
4. The original now shows **Rectificada** and links to the rectificativa; the rectificativa links
   back to the original.

**Por sustitución:** repeat with modo **Por sustitución**. The difference is internal — the
rectificativa stores the rectified base and cuota — so check the original still shows the link
and the new invoice carries tipo `R1` with modo `S`.

Try selecting the **original's own series** in the dialog: it is filtered out of the list, and the
database refuses it even if forced.

---

## 7. Payment

1. On an issued invoice, _Marcar como pagada_ → badge **Pagada**, timeline _Marcada como pagada_.
2. _Marcar como pendiente_ → back to **Pendiente de cobro**.
3. A draft offers no payment action at all.

(_Vencida_ needs a `due_date` in the past; there is no UI for setting due dates yet, so set one in
the SQL editor if you want to see that badge.)

---

## 8. Permissions

Sign in as a **viewer** (or change your role temporarily). Every action button — Emitir, Enviar,
Anular, Rectificativa, Marcar como pagada — must be absent. The database refuses them regardless,
but they should not be offered.

---

## What to send me if something fails

The invoice number, what you clicked, what you expected, and the exact on-screen message. Every
database failure now surfaces its real cause, so the message is usually enough to locate the
problem without a repro.
