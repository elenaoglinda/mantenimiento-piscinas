-- Rollback for 20261103130100_visit_tasks.sql.
-- DESTRUCTIVE: drops every task logged at a visit and each org's task list.
-- Restores seed_org_catalogues to the products-only version of 20261103130000.

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
end;
$$;
revoke execute on function public.seed_org_catalogues(uuid) from public, anon, authenticated;

drop table if exists public.report_task;
drop table if exists public.task_def;
