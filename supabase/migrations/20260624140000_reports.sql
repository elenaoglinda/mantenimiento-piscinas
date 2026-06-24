-- Phase 3.1 — Reporting: report, measurement, incident, attachment + a private storage
-- bucket for signatures/photos/lab PDFs. Org-scoped RLS with composite (id, org_id) FKs.
-- Signed reports are immutable: enforced by RLS (the report's own update policy excludes
-- already-signed rows, and child writes are gated by report_is_editable()).
-- See docs/technical-spec.md §7, §9.2.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.report_status as enum ('draft', 'completed', 'signed');
create type public.analysis_type as enum ('autocontrol', 'vigilancia');
create type public.measurement_lugar as enum ('in_situ', 'lab');
create type public.measurement_status as enum ('green', 'amber', 'red', 'unknown');
create type public.attachment_kind as enum ('photo', 'lab_pdf');

-- ---------------------------------------------------------------------------
-- report
-- ---------------------------------------------------------------------------
create table public.report (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.org (id) on delete cascade,
  pool_id         uuid not null,
  basin_id        uuid not null,
  technician_id   uuid references public.app_user (id) on delete set null,
  visited_at      timestamptz not null default now(),
  status          public.report_status not null default 'draft',
  analysis_type   public.analysis_type not null default 'autocontrol',
  punto_muestreo  smallint, -- SILOE TIPO_PM id (1-4)
  location_lat    numeric(12, 8),
  location_lng    numeric(13, 8),
  notes           text,
  signed_at       timestamptz,
  signed_by_name  text,
  signed_by_dni   text,
  signature_path  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id),
  foreign key (pool_id, org_id) references public.pool (id, org_id) on delete cascade,
  foreign key (basin_id, org_id) references public.basin (id, org_id) on delete cascade
);
create index report_org_status_idx on public.report (org_id, status);
create index report_pool_idx on public.report (pool_id);
create index report_basin_idx on public.report (basin_id);
create index report_visited_idx on public.report (visited_at);

-- ---------------------------------------------------------------------------
-- measurement
-- ---------------------------------------------------------------------------
create table public.measurement (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.org (id) on delete cascade,
  report_id         uuid not null,
  parameter_def_id  uuid not null references public.parameter_def (id) on delete restrict,
  value             numeric,
  metodo            smallint, -- SILOE METODO id
  lugar             public.measurement_lugar not null default 'in_situ',
  compliant         boolean,
  status            public.measurement_status not null default 'unknown',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (report_id, org_id) references public.report (id, org_id) on delete cascade
);
create index measurement_report_idx on public.measurement (report_id);
create index measurement_org_idx on public.measurement (org_id);

-- ---------------------------------------------------------------------------
-- incident
-- ---------------------------------------------------------------------------
create table public.incident (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.org (id) on delete cascade,
  report_id          uuid not null,
  description        text not null,
  corrective_action  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (report_id, org_id) references public.report (id, org_id) on delete cascade
);
create index incident_report_idx on public.incident (report_id);

-- ---------------------------------------------------------------------------
-- attachment (storage object pointers)
-- ---------------------------------------------------------------------------
create table public.attachment (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.org (id) on delete cascade,
  report_id    uuid not null,
  kind         public.attachment_kind not null,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  foreign key (report_id, org_id) references public.report (id, org_id) on delete cascade
);
create index attachment_report_idx on public.attachment (report_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger report_set_updated_at before update on public.report
  for each row execute function public.set_updated_at();
create trigger measurement_set_updated_at before update on public.measurement
  for each row execute function public.set_updated_at();
create trigger incident_set_updated_at before update on public.incident
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Editability helper: a report's children may be mutated only while it is not signed.
-- ---------------------------------------------------------------------------
create or replace function public.report_is_editable(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report r
    where r.id = p_report_id
      and r.org_id = public.current_org_id()
      and r.status <> 'signed'
  );
$$;
revoke execute on function public.report_is_editable(uuid) from public, anon;
grant execute on function public.report_is_editable(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.report enable row level security;
alter table public.measurement enable row level security;
alter table public.incident enable row level security;
alter table public.attachment enable row level security;

-- report: read within org; write requires admin/technician; SIGNED reports cannot be updated
-- (the USING clause excludes already-signed rows, so the completed→signed transition is allowed
-- but nothing after it).
create policy report_select on public.report
  for select to authenticated using (org_id = public.current_org_id());
create policy report_insert on public.report
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.current_user_can_write());
create policy report_update on public.report
  for update to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write() and status <> 'signed')
  with check (org_id = public.current_org_id() and public.current_user_can_write());
create policy report_delete on public.report
  for delete to authenticated
  using (org_id = public.current_org_id() and public.current_user_can_write() and status <> 'signed');

-- Child tables: read within org; write requires can_write AND parent report still editable.
do $$
declare t text;
begin
  foreach t in array array['measurement', 'incident', 'attachment']
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated
         using (org_id = public.current_org_id());', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated
         with check (org_id = public.current_org_id() and public.current_user_can_write()
                     and public.report_is_editable(report_id));', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write()
                and public.report_is_editable(report_id))
         with check (org_id = public.current_org_id() and public.current_user_can_write()
                     and public.report_is_editable(report_id));', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated
         using (org_id = public.current_org_id() and public.current_user_can_write()
                and public.report_is_editable(report_id));', t);
  end loop;
end $$;

grant select, insert, update, delete on public.report to authenticated;
grant select, insert, update, delete on public.measurement to authenticated;
grant select, insert, update, delete on public.incident to authenticated;
grant select, insert, update, delete on public.attachment to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for signatures, photos, lab PDFs.
-- Objects are keyed by org under <org_id>/... so RLS scopes by the first path segment.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy reports_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy reports_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.current_user_can_write()
  );
create policy reports_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.current_user_can_write()
  );
