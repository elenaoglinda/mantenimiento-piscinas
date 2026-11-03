-- Rollback for 20261103130000_chemical_products.sql.
-- DESTRUCTIVE: drops every product logged at a visit and each org's product catalogue.
-- Restores provision_account to its previous body (no catalogue seeding).

create or replace function public.provision_account(
  p_account_type public.org_type,
  p_org_name text,
  p_full_name text
)
returns public.org
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.org;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.app_user where id = v_uid) then
    raise exception 'Account already provisioned' using errcode = '23505';
  end if;

  insert into public.org (type, name)
    values (p_account_type, p_org_name)
    returning * into v_org;

  insert into public.app_user (id, org_id, role, full_name, email)
    values (
      v_uid,
      v_org.id,
      'admin',
      nullif(trim(p_full_name), ''),
      (select email from auth.users where id = v_uid)
    );

  return v_org;
end;
$$;
revoke execute on function public.provision_account(public.org_type, text, text) from public, anon;
grant execute on function public.provision_account(public.org_type, text, text) to authenticated;

drop function if exists public.seed_org_catalogues(uuid);
drop table if exists public.report_chemical;
drop table if exists public.chemical_product;
drop type if exists public.chemical_unit;
