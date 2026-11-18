-- Rollback for 20261113120000_pool_ccaa_code.sql.
-- Drops the community codes; pool.ccaa (the text the app also writes) stays, so the app falls
-- back to reading it. Deploy the previous app version first: this one writes ccaa_code.
drop function if exists public.ccaa_from_text(text);
drop function if exists public.ccaa_from_province(text);
drop function if exists public.ccaa_from_postcode(text);
drop function if exists public.fold_place(text);
alter table public.pool drop constraint if exists pool_ccaa_code_check;
alter table public.pool drop column if exists ccaa_code;
