-- ROLLBACK for 20260919120000_report_photo_import_provenance.sql
--
-- Removes the photo-import provenance columns from `report`. Run in the Supabase SQL editor
-- only if you need to undo that migration. Idempotent and safe to re-run.
--
-- WARNING: dropping `extraction_meta` destroys the stored extractor payloads, which are audit
-- evidence for any report imported from a photo. Export them first if such reports exist:
--   select id, source, extraction_meta from public.report where source = 'photo_import';
-- The original photos survive as `attachment` rows either way.
--
-- NOTE: this file lives in supabase/rollback/ (NOT supabase/migrations/) on purpose — the
-- Supabase CLI applies every *.sql under migrations/ as a forward migration.

alter table public.report
  drop column if exists extraction_meta,
  drop column if exists source;

drop type if exists public.report_source;
