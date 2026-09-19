-- Photo import — provenance for machine-extracted readings.
--
-- Readings transcribed from a photographed paper parte must be distinguishable from
-- hand-entered ones: this data ends up in the SILOE annual-results XML filed with the
-- Ministry of Health, so an audit needs to know which values came from OCR and what the
-- extractor actually returned.
--
-- `source`          — how the report's data got here ('manual' is the existing behaviour).
-- `extraction_meta` — the raw, normalised extractor payload (model, confidence, per-field
--                     values and the fields it flagged as uncertain). Kept verbatim so a
--                     dispute can be traced back to what was read vs. what was saved.
--
-- The original photo itself is stored as a normal `attachment` (kind='photo') on the report,
-- which is the primary evidence; this column is the machine-readable companion to it.
--
-- No new RLS policies: `report` is already org-scoped and signed reports stay immutable.

create type public.report_source as enum ('manual', 'photo_import');

alter table public.report
  add column source public.report_source not null default 'manual',
  add column extraction_meta jsonb;

comment on column public.report.source is
  'How this report was created: manual entry or import from a photographed paper parte.';
comment on column public.report.extraction_meta is
  'Raw normalised payload from the photo extractor (model, confidence, readings, flagged fields).';
