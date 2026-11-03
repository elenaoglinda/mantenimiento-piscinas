-- Service log, part 4: was each route stop done?
--   route_stop.estado     pendiente (default) | hecha | saltada
--   route_stop.motivo     why it was skipped (required when saltada)
--   route_stop.report_id  the visit's report, set when a report marks the stop done
--   route_stop.updated_at + trigger, like every other table
--
-- A report saved for a pool marks that pool's PENDING stop on a route of the same day (visit
-- date, Madrid calendar) as hecha and links it. It runs in the database (trigger), so new
-- reports, edits that create them and photo-import drafts all count, whatever screen saved
-- them. The trigger runs with the inserter's own rights (no SECURITY DEFINER): someone who can
-- write a report can already update route stops (current_user_can_write).
-- Rollback: supabase/rollback/20261103130300_route_stop_status.down.sql

create type public.route_stop_estado as enum ('pendiente', 'hecha', 'saltada');

alter table public.route_stop
  add column estado     public.route_stop_estado not null default 'pendiente',
  add column motivo     text,
  add column report_id  uuid,
  add column updated_at timestamptz not null default now();

-- Same-org link only (composite FK). Deleting the report frees the link, not the stop
-- (PG 15+ column list; Supabase runs 17).
alter table public.route_stop
  add constraint route_stop_report_id_org_id_fkey
  foreign key (report_id, org_id) references public.report (id, org_id)
  on delete set null (report_id);

alter table public.route_stop
  add constraint route_stop_saltada_needs_motivo
  check (estado <> 'saltada' or nullif(btrim(motivo), '') is not null);

create index route_stop_pool_idx on public.route_stop (pool_id);
create index route_stop_report_idx on public.route_stop (report_id);

create trigger route_stop_set_updated_at before update on public.route_stop
  for each row execute function public.set_updated_at();

create or replace function public.route_stop_mark_visited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.route_stop s
     set estado = 'hecha', report_id = new.id, motivo = null
    from public.route r
   where s.route_id = r.id
     and r.org_id = new.org_id
     and s.org_id = new.org_id
     and s.pool_id = new.pool_id
     and s.estado = 'pendiente'
     and r.route_date = (new.visited_at at time zone 'Europe/Madrid')::date;
  return null;
end;
$$;
revoke execute on function public.route_stop_mark_visited() from public, anon;

create trigger report_marks_route_stop
  after insert on public.report
  for each row execute function public.route_stop_mark_visited();
