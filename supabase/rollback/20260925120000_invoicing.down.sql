-- Rollback for 20260925120000_invoicing.sql
--
-- Kept OUT of supabase/migrations/ on purpose: the Supabase CLI applies every *.sql in that
-- directory as a FORWARD migration, so a down script living there would drop the very tables
-- the migration just created. Run this by hand (SQL editor or psql) to undo.
--
-- DESTRUCTIVE: drops every invoice, line, series and fiscal profile. Invoices already sent to
-- AEAT continue to exist at AEAT — dropping them here does not cancel them. Export first.

begin;

drop trigger if exists invoice_line_guard_immutable on public.invoice_line;
drop trigger if exists invoice_line_recalc_totals   on public.invoice_line;
drop trigger if exists invoice_line_set_updated_at  on public.invoice_line;
drop trigger if exists invoice_guard_immutable      on public.invoice;
drop trigger if exists invoice_set_updated_at       on public.invoice;
drop trigger if exists invoice_series_set_updated_at on public.invoice_series;
drop trigger if exists billing_profile_set_updated_at on public.billing_profile;

drop function if exists public.issue_invoice(uuid);
drop function if exists public.invoice_line_guard_immutable();
drop function if exists public.invoice_guard_immutable();
drop function if exists public.recalc_invoice_totals();
drop function if exists public.invoice_tax_breakdown(uuid);

-- Children first (invoice_line -> invoice -> invoice_series).
drop table if exists public.invoice_line;
drop table if exists public.invoice;
drop table if exists public.invoice_series;
drop table if exists public.billing_profile;

alter table public.client
  drop column if exists billing_direccion,
  drop column if exists billing_cp,
  drop column if exists billing_municipio,
  drop column if exists billing_provincia,
  drop column if exists billing_pais;

drop type if exists public.invoice_send_status;
drop type if exists public.invoice_status;

commit;
