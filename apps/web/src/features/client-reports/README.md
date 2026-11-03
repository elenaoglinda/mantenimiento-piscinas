# Client reports

PDFs a pool company sends **its own client**, and the buttons that send them:

- **Visit report**: report detail → "Enviar al cliente" (completed or signed visits only):
  **Descargar PDF**, **Enviar por email**, **Enviar por WhatsApp**.
- **Monthly summary**: pool page → Resumen → "Resumen mensual para el cliente": pick a month
  (the last 12), same three buttons.
- **Logo**: Ajustes → "Logotipo para los PDF" (admins).

The PDFs themselves are built on the server by `api/report-pdf.ts` from the layout in
`packages/shared/src/client-reports/` (see that README for how pages are laid out and drawn).

## How the pieces connect

```
ShareActions ──POST /api/report-pdf (Bearer = the user's Supabase token)──▶ api/report-pdf.ts
                                                     reads as the user (RLS), renders, stores
◀── { url (signed, 30 days), fileName, pages, warnings } ──  reports/<org>/client-reports/…
   Descargar PDF  → url&download=<fileName>
   Enviar email   → mailto:<client.contact_email>?subject…&body…<url>
   WhatsApp       → https://wa.me/<client.contact_phone as 34…>?text…<url>
```

- `lib/api.ts`: `requestPdf()`. Never throws; every failure is a code with a Spanish
  message in `clientReports.errors`.
- `lib/data.ts`: the client's contact, through `dbError` like every Supabase call.
- `lib/thumbnail.ts`: a 640 px JPEG saved next to each new photo (`<path>.thumb.jpg`).
- `lib/logo.ts`: the logo at `<org>/branding/logo`.

## Decisions a newcomer might undo

- **The PDF is built on the server, not in the browser.** pdf-lib would add hundreds of KB to
  the app for a button pressed a few times a day, and the signed link needs the file in
  storage anyway. The browser bundle only gets `share.ts` (links and months).
- **No new table, no migration.** The PDF is a file in the existing private bucket, under the
  org's folder (the bucket's RLS already scopes it). The logo is a file at a fixed path. The
  bucket has no update policy, so files are write-once: the PDF is named after the hash of its
  bytes, and the logo is replaced by delete + upload.
- **The link lasts 30 days.** It's a Supabase signed URL; anyone with it can open that one PDF
  until then, and nothing else. A client who needs it later gets a new one (same file).
- **WhatsApp opens a blank tab on the click, then points it at wa.me.** The link only exists
  after the server answers, and browsers block tabs opened after an `await`. If the tab is
  blocked anyway, the success panel has plain links to open the PDF, the e-mail and WhatsApp.
- **Thumbnails at upload.** A phone photo is 3–5 MB; six of them in a PDF would make it
  unopenable on a phone, and decoding them on the server takes seconds each. Photos uploaded
  before this change have no thumbnail: the server uses Supabase's resized image if the plan
  includes image transformations, the original if it is small, or leaves it out and the PDF
  says how many photos are only in the app.
- **Drafts are never sent.** The server answers 409 and the card isn't shown.
- **Viewers** can share a PDF that already exists (same content) but can't create one: storage
  writes need the technician or admin role. The message says who to ask.

## Testing

- `packages/shared/src/client-reports/index.test.ts`: layout, Spanish formatting, rendering,
  determinism, share links, colour tokens.
- `api/_tests/report-pdf.test.ts`: the endpoint against an in-memory Supabase (auth, RLS-style
  access, storage reuse, missing migrations, errors).
- `scripts/redesign/client-reports.spec.ts`: the buttons in a real browser, with the real PDF
  builder behind them; downloads and re-opens the PDFs.
