-- Service log, part 2: the task checklist of each visit.
--   task_def     the org's list of usual tasks, ordered; preloaded for every org.
--   report_task  what was done at one visit (hecho) with an optional note.
-- Same tenancy pattern as chemical_product / report_chemical (20261103130000).
-- Rollback: supabase/rollback/20261103130100_visit_tasks.down.sql

create table public.task_def (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  nombre      text not null check (btrim(nombre) <> ''),
  orden       integer not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index task_def_org_idx on public.task_def (org_id, orden);
create unique index task_def_org_nombre_key on public.task_def (org_id, lower(btrim(nombre)));

create table public.report_task (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org (id) on delete cascade,
  report_id   uuid not null,
  task_id     uuid not null,
  hecho       boolean not null default true,
  nota        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (report_id, task_id),
  foreign key (report_id, org_id) references public.report (id, org_id) on delete cascade,
  -- A task that was ever logged can't be deleted, only deactivated.
  foreign key (task_id, org_id) references public.task_def (id, org_id) on delete restrict
);
create index report_task_report_idx on public.report_task (report_id);
create index report_task_task_idx on public.report_task (task_id);

create trigger task_def_set_updated_at before update on public.task_def
  for each row execute function public.set_updated_at();
create trigger report_task_set_updated_at before update on public.report_task
  for each row execute function public.set_updated_at();

alter table public.task_def enable row level security;
alter table public.report_task enable row level security;

-- The list: everyone in the org reads it; only admins change it (Ajustes).
create policy task_def_select on public.task_def
  for select to authenticated using (org_id = public.current_org_id());
create policy task_def_insert on public.task_def
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');
create policy task_def_update on public.task_def
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin')
  with check (org_id = public.current_org_id() and public.current_user_role() = 'admin');
create policy task_def_delete on public.task_def
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_role() = 'admin');

-- Per visit: can_write AND the report still editable (not signed).
create policy report_task_select on public.report_task
  for select to authenticated using (org_id = public.current_org_id());
create policy report_task_insert on public.report_task
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_can_write()
              and public.report_is_editable(report_id));
create policy report_task_update on public.report_task
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write()
         and public.report_is_editable(report_id))
  with check (org_id = public.current_org_id() and public.current_user_can_write()
              and public.report_is_editable(report_id));
create policy report_task_delete on public.report_task
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write()
         and public.report_is_editable(report_id));

grant select, insert, update, delete on public.task_def to authenticated;
grant select, insert, update, delete on public.report_task to authenticated;

-- The org defaults now include the task list (products as in 20261103130000).
create or replace function public.seed_org_catalogues(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chemical_product (org_id, nombre, unidad, orden)
  values
    (p_org_id, 'Cloro granulado', 'kg', 1),
    (p_org_id, 'Cloro en pastillas', 'pastillas', 2),
    (p_org_id, 'Minorador de pH', 'kg', 3),
    (p_org_id, 'Incrementador de pH', 'kg', 4),
    (p_org_id, 'Floculante', 'L', 5),
    (p_org_id, 'Alguicida', 'L', 6),
    (p_org_id, 'Clarificante', 'L', 7),
    (p_org_id, 'Sal', 'kg', 8)
  on conflict do nothing;

  insert into public.task_def (org_id, nombre, orden)
  values
    (p_org_id, 'Barrido / limpieza de fondo', 1),
    (p_org_id, 'Limpieza de paredes y línea de flotación', 2),
    (p_org_id, 'Vaciado de skimmers y prefiltro', 3),
    (p_org_id, 'Contralavado del filtro', 4),
    (p_org_id, 'Limpieza del filtro', 5),
    (p_org_id, 'Revisión de bomba y equipos', 6),
    (p_org_id, 'Revisión del clorador salino', 7),
    (p_org_id, 'Retirada de hojas', 8)
  on conflict do nothing;
end;
$$;
revoke execute on function public.seed_org_catalogues(uuid) from public, anon, authenticated;

select public.seed_org_catalogues(id) from public.org;
