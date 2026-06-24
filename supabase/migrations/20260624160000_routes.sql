-- Phase 6.1 — Route planning: a saved optimized day-route over selected pools and its ordered
-- stops. Org-scoped RLS; write requires admin/technician. See docs/technical-spec.md §9.3.

create table public.route (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.org (id) on delete cascade,
  technician_id   uuid references public.app_user (id) on delete set null,
  route_date      date not null,
  start_lat       numeric(12, 8),
  start_lng       numeric(13, 8),
  distance_m      integer,
  duration_s      integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id)
);
create index route_org_date_idx on public.route (org_id, route_date desc);

create table public.route_stop (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  route_id    uuid not null,
  pool_id     uuid not null,
  seq         integer not null,        -- order in the optimized route
  eta         timestamptz,             -- estimated arrival
  leg_s       integer,                 -- driving seconds from previous stop
  created_at  timestamptz not null default now(),
  foreign key (route_id, org_id) references public.route (id, org_id) on delete cascade,
  foreign key (pool_id, org_id) references public.pool (id, org_id) on delete cascade
);
create index route_stop_route_idx on public.route_stop (route_id);

create trigger route_set_updated_at before update on public.route
  for each row execute function public.set_updated_at();

alter table public.route enable row level security;
alter table public.route_stop enable row level security;

do $$
declare t text;
begin
  foreach t in array array['route', 'route_stop']
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated
         using (org_id = public.current_org_id());', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated
         with check (org_id = public.current_org_id() and public.current_user_can_write());', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write())
         with check (org_id = public.current_org_id() and public.current_user_can_write());', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write());', t);
  end loop;
end $$;

grant select, insert, update, delete on public.route to authenticated;
grant select, insert, update, delete on public.route_stop to authenticated;
