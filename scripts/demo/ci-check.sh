#!/usr/bin/env bash
# Loads the demo into a Postgres that has every migration (and supabase/seed.sql's real org,
# if any), then proves against the real schema:
#   - every row satisfies the constraints and triggers;
#   - the portfolio is what docs/DEMO.md promises;
#   - --reset's wipe removes the demo org and nothing else;
#   - loading again gives the same org with the same ids.
# Needs PGHOST/PGUSER/PGPASSWORD and a database named by $DB (default: app).
set -euo pipefail
DB=${DB:-app}
TODAY=${TODAY:-$(TZ=Europe/Madrid date +%F)}
TMP=$(mktemp -d)
q() { psql -v ON_ERROR_STOP=1 -tA -d "$DB" -c "$1"; }

# A real org with a pool, which the wipe must leave alone.
q "insert into public.org (id, type, name) values ('11111111-1111-4111-8111-111111111111', 'company', 'Piscinas Reales SL') on conflict do nothing" >/dev/null
q "insert into public.client (id, org_id, name) values ('11111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', 'Cliente real') on conflict do nothing" >/dev/null
q "insert into public.pool (id, org_id, client_id, denominacion) values ('11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111112', 'Piscina real') on conflict do nothing" >/dev/null

q "select json_agg(p) from public.parameter_def p where ccaa is null and active" > "$TMP/params.json"
npx tsx scripts/demo/to-sql.ts insert "$TMP/params.json" "$TODAY" > "$TMP/demo.sql"
npx tsx scripts/demo/to-sql.ts wipe > "$TMP/wipe.sql"
chmod 644 "$TMP"/*.sql; chmod 755 "$TMP"

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$TMP/demo.sql"
ORG=$(q "select id from public.org where name = 'Piscinas Mediterráneo (demo)'")
[ -n "$ORG" ] || { echo "::error::demo org not created"; exit 1; }

check() { # check <description> <sql returning t/f>
  if [ "$(q "$2")" = "t" ]; then echo "PASS $1"; else echo "FAIL $1"; FAILED=1; fi
}
FAILED=0
check "3 clients, 8 pools, 11 vasos" \
  "select (select count(*) from client where org_id='$ORG')=3 and (select count(*) from pool where org_id='$ORG')=8 and (select count(*) from basin where org_id='$ORG')=11"
check "2 technicians and an admin" \
  "select (select count(*) from app_user where org_id='$ORG' and role='technician')=2 and (select count(*) from app_user where org_id='$ORG' and role='admin')=1"
check "SILOÉ codes on every Tipo 1-3A pool and vaso, none on the villa" \
  "select not exists (select 1 from pool p where p.org_id='$ORG' and (p.pool_type is not null) <> (p.siloe_cod_p is not null)) and not exists (select 1 from basin b join pool p on p.id=b.pool_id where b.org_id='$ORG' and (p.pool_type is not null) <> (b.siloe_cod_v is not null))"
check "90 days of visits" \
  "select (max(visited_at) - min(visited_at)) between interval '88 days' and interval '90 days' from report where org_id='$ORG'"
check "5-6 legal red readings, each with an incident and a corrective action" \
  "with red as (select distinct m.report_id from measurement m join parameter_def d on d.id=m.parameter_def_id where m.org_id='$ORG' and m.status='red' and d.in_siloe) select count(*) between 5 and 6 and bool_and(exists (select 1 from incident i where i.report_id=red.report_id and i.corrective_action is not null)) from red"
check "products and tasks on every visit (the salt villa may skip products)" \
  "select not exists (select 1 from report r where r.org_id='$ORG' and not exists (select 1 from report_task t where t.report_id=r.id)) and not exists (select 1 from report r join pool p on p.id=r.pool_id where r.org_id='$ORG' and p.denominacion <> 'Villa Los Almendros' and not exists (select 1 from report_chemical c where c.report_id=r.id))"
check "the last 7 days signed with signer and signature, older ones completed" \
  "select bool_and(case when visited_at >= (date '$TODAY' - 6)::timestamp at time zone 'Europe/Madrid' then status='signed' and signed_by_name is not null and signature_path is not null else status='completed' end) from report where org_id='$ORG'"
check "routes: done stops point at that day's report, skipped ones have a reason" \
  "select not exists (select 1 from route_stop s join route rt on rt.id=s.route_id left join report r on r.id=s.report_id where s.org_id='$ORG' and ((s.estado='hecha' and (r.id is null or r.pool_id<>s.pool_id or (r.visited_at at time zone 'Europe/Madrid')::date<>rt.route_date)) or (s.estado='saltada' and coalesce(s.motivo,'')='') or (s.estado='pendiente' and rt.route_date<date '$TODAY'))) and (select count(*) from route_stop where org_id='$ORG' and estado='saltada')=2"
check "invoices are drafts with totals, and there is no billing profile" \
  "select bool_and(status='draft' and number is null and total_cents>0) and not exists (select 1 from billing_profile where org_id='$ORG') from invoice where org_id='$ORG'"

IDS_BEFORE=$(q "select md5(string_agg(id::text, ',' order by id)) from (select id from report where org_id='$ORG' union all select id from measurement where org_id='$ORG' union all select id from route_stop where org_id='$ORG') x")

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$TMP/wipe.sql"
check "the wipe removes the demo org completely" \
  "select not exists (select 1 from org where id='$ORG') and not exists (select 1 from report where org_id='$ORG') and not exists (select 1 from app_user where org_id='$ORG')"
check "the wipe leaves the real org alone" \
  "select exists (select 1 from pool where id='11111111-1111-4111-8111-111111111113') and exists (select 1 from org where name='Piscinas Reales SL')"

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$TMP/demo.sql"
IDS_AFTER=$(q "select md5(string_agg(id::text, ',' order by id)) from (select id from report where org_id='$ORG' union all select id from measurement where org_id='$ORG' union all select id from route_stop where org_id='$ORG') x")
check "loading again gives the same org with the same ids" "select '$IDS_BEFORE' = '$IDS_AFTER' and exists (select 1 from org where id='$ORG')"

rm -rf "$TMP"
exit $FAILED
