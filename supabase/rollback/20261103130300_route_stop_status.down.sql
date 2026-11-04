-- Rollback for 20261103130300_route_stop_status.sql.
-- DESTRUCTIVE: forgets which stops were done or skipped, and why. Routes and stops stay.
drop trigger if exists report_marks_route_stop on public.report;
drop function if exists public.route_stop_mark_visited();
drop trigger if exists route_stop_set_updated_at on public.route_stop;
drop index if exists public.route_stop_report_idx;
drop index if exists public.route_stop_pool_idx;
alter table public.route_stop drop constraint if exists route_stop_saltada_needs_motivo;
alter table public.route_stop drop constraint if exists route_stop_report_id_org_id_fkey;
alter table public.route_stop
  drop column if exists updated_at,
  drop column if exists report_id,
  drop column if exists motivo,
  drop column if exists estado;
drop type if exists public.route_stop_estado;
