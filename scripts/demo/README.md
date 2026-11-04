# Demo data

`scripts/demo-seed.ts` creates (or regenerates) **one** org, **"Piscinas Mediterráneo
(demo)"**, full of realistic history so no sales demo starts empty. The demo path itself is in
[`docs/DEMO.md`](../../docs/DEMO.md).

## Run it (Sara, after merging)

From a checkout of `main`, in a terminal (the key is read from the environment and never
leaves your machine):

```bash
npm ci
export SUPABASE_URL=https://ekbzksquvduudpoeuxkz.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=…   # Supabase → Project settings → API keys → service_role
npx tsx scripts/demo-seed.ts --admin-email demo@cloro.app
```

- `--admin-email` is the login you'll use for demos. **Use an address only for the demo**
  (e.g. `demo@cloro.app`): an address that already belongs to a real org is refused. If it has
  no account yet, one is created, confirmed and without a password. Sign in with a magic link,
  or with "¿Has olvidado tu contraseña?" to set one.
- Run it again any time: if the demo exists, nothing changes.
- `--reset` wipes the demo org and regenerates it with fresh dates (the 90 days end today).
  Do it before an important demo so "hoy" and "ayer" line up.
- Don't paste the service-role key into a file in the repo, a chat or a command saved in your
  shell history if you can avoid it (`export` in a terminal you then close is fine).

## What it creates

|               |                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients       | Comunidad de Propietarios Residencial Mar Azul, Hotel Costa Blanca Playa, Villa Los Almendros (particular, clorador salino)                                |
| Pools / vasos | 8 pools, 11 vasos. SILOÉ codes on the Tipo 2 and 3A ones (the private villa has none)                                                                      |
| People        | You (admin) and two technicians, Lucía Ferrer and Javier Martí (logins `demo.tecnico.*@example.com`, never used)                                           |
| Visits        | 90 days, 2–3 a week per pool, one report per vaso: readings drifting naturally, products and tasks on every visit, some photos. The last 7 days are signed |
| Out of range  | 6 red readings, each with an incident and its corrective action. The latest is 2 days ago, so the dashboard opens with an alert                            |
| Routes        | The last 5 working days (stops done, two skipped with a reason), today (first stop done) and the next 5 (pending)                                          |
| Invoices      | 3 **drafts**. The demo org has no billing profile, so they **cannot be issued**: nothing can reach Verifacti or the AEAT                                   |
| Files         | Photos, signatures and a logo, drawn by the script (`images.ts`); nothing binary in git                                                                    |

Client e-mails are `@example.com` and clients have **no phone numbers**, so "Enviar por email"
and "Enviar por WhatsApp" never reach a real stranger. On WhatsApp, pick yourself as the
recipient.

## Safety rules (all in `run.ts`, all tested in `run.test.ts`)

1. It only ever wipes or writes the org with the demo's fixed id, and only if that org's
   name ends in **"(demo)"**; otherwise it stops and changes nothing.
2. It refuses an admin e-mail that belongs to a real org.
3. Without `--reset`, an existing demo is left alone. A run that died half-way leaves the org
   named "… (creando…) (demo)", and the next run rebuilds it.
4. It never deletes an issued invoice (a fiscal record): if one exists, it stops and says so.
5. It uses the service-role key, which bypasses RLS. That's why it is a script you run by
   hand, and the key is never in a request path, the app, or the repo.

## How it's built

- `generate.ts`: the data, pure and deterministic (fixed ids derived from names, seeded
  noise). Same day → same rows. Tested in `generate.test.ts`.
- `run.ts`: the decisions above, against a small `DemoStore` interface; `supabaseStore.ts` is
  the Supabase adapter.
- `to-sql.ts` + `ci-check.sh`: CI loads the same rows into Postgres with every migration and
  checks constraints, triggers, the portfolio, that the wipe removes only the demo, and that
  loading again gives the same ids.

`supabase/seed.sql` is a separate, smaller version for local development
(`supabase db reset`; login `demo@cloro.local` / `demo-local`, local only). It seeds only an
empty database.
