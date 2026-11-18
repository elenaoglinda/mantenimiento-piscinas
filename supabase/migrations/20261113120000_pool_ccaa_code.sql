-- Comunidad Autónoma as a code (Phase 8, item 8.4).
--   pool.ccaa_code   one of the 19 ISO 3166-2:ES community codes ('CT' = Cataluña), or null
--
-- Expand step: pool.ccaa (free text) stays, and the app keeps writing the community's name
-- there, so the deployed app reads it as before. Thresholds use ccaa_code when set
-- (parameter_def.ccaa already uses 'CT').
--
-- Backfill, only where ccaa_code is null: the postcode's first two digits (INE province 01-52),
-- else the province name, else what was typed in ccaa. The tables below are generated from
-- packages/shared/src/territory/ccaa.ts; apps/web/src/lib/ccaaSql.test.ts fails if they drift.
-- Pools none of them resolve stay null; the app asks for the community.
-- The backfill doesn't touch updated_at (it isn't a user edit).
-- Rollback: supabase/rollback/20261113120000_pool_ccaa_code.down.sql

alter table public.pool add column ccaa_code text;

alter table public.pool
  add constraint pool_ccaa_code_check
  check (ccaa_code is null or ccaa_code in (
    'AN', 'AR', 'AS', 'IB', 'CN', 'CB', 'CL', 'CM', 'CT', 'VC', 'EX', 'GA', 'MD', 'MC', 'NC', 'PV', 'RI', 'CE', 'ML'
  ));

-- Lowercase, no accents, no punctuation, single spaces (foldPlace in ccaa.ts).
create function public.fold_place(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
      'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- ccaaFromPostcode: a five-digit postcode → its community.
create function public.ccaa_from_postcode(p_cp text)
returns text
language sql
immutable
set search_path = ''
as $$
  select v.ccaa
    from (values
    ('01', 'PV'), ('02', 'CM'), ('03', 'VC'), ('04', 'AN'), ('05', 'CL'), ('06', 'EX'),
    ('07', 'IB'), ('08', 'CT'), ('09', 'CL'), ('10', 'EX'), ('11', 'AN'), ('12', 'VC'),
    ('13', 'CM'), ('14', 'AN'), ('15', 'GA'), ('16', 'CM'), ('17', 'CT'), ('18', 'AN'),
    ('19', 'CM'), ('20', 'PV'), ('21', 'AN'), ('22', 'AR'), ('23', 'AN'), ('24', 'CL'),
    ('25', 'CT'), ('26', 'RI'), ('27', 'GA'), ('28', 'MD'), ('29', 'AN'), ('30', 'MC'),
    ('31', 'NC'), ('32', 'GA'), ('33', 'AS'), ('34', 'CL'), ('35', 'CN'), ('36', 'GA'),
    ('37', 'CL'), ('38', 'CN'), ('39', 'CB'), ('40', 'CL'), ('41', 'AN'), ('42', 'CL'),
    ('43', 'CT'), ('44', 'AR'), ('45', 'CM'), ('46', 'VC'), ('47', 'CL'), ('48', 'PV'),
    ('49', 'CL'), ('50', 'AR'), ('51', 'CE'), ('52', 'ML')
    ) as v(prov, ccaa)
   where p_cp ~ '^\s*[0-9]{5}\s*$'
     and v.prov = left(btrim(p_cp), 2)
$$;

-- ccaaFromProvinceName: Spanish or co-official province names.
create function public.ccaa_from_province(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select v.ccaa
    from (values
    ('alava', 'PV'), ('araba', 'PV'), ('araba alava', 'PV'), ('albacete', 'CM'),
    ('alicante', 'VC'), ('alacant', 'VC'), ('almeria', 'AN'), ('avila', 'CL'),
    ('badajoz', 'EX'), ('illes balears', 'IB'), ('islas baleares', 'IB'), ('baleares', 'IB'),
    ('balears', 'IB'), ('barcelona', 'CT'), ('burgos', 'CL'), ('caceres', 'EX'),
    ('cadiz', 'AN'), ('castellon', 'VC'), ('castello', 'VC'), ('castellon de la plana', 'VC'),
    ('ciudad real', 'CM'), ('cordoba', 'AN'), ('a coruna', 'GA'), ('la coruna', 'GA'),
    ('coruna', 'GA'), ('cuenca', 'CM'), ('girona', 'CT'), ('gerona', 'CT'),
    ('granada', 'AN'), ('guadalajara', 'CM'), ('gipuzkoa', 'PV'), ('guipuzcoa', 'PV'),
    ('huelva', 'AN'), ('huesca', 'AR'), ('jaen', 'AN'), ('leon', 'CL'),
    ('lleida', 'CT'), ('lerida', 'CT'), ('la rioja', 'RI'), ('rioja', 'RI'),
    ('lugo', 'GA'), ('madrid', 'MD'), ('malaga', 'AN'), ('murcia', 'MC'),
    ('navarra', 'NC'), ('nafarroa', 'NC'), ('ourense', 'GA'), ('orense', 'GA'),
    ('asturias', 'AS'), ('palencia', 'CL'), ('las palmas', 'CN'), ('palmas', 'CN'),
    ('pontevedra', 'GA'), ('salamanca', 'CL'), ('santa cruz de tenerife', 'CN'), ('tenerife', 'CN'),
    ('cantabria', 'CB'), ('segovia', 'CL'), ('sevilla', 'AN'), ('soria', 'CL'),
    ('tarragona', 'CT'), ('teruel', 'AR'), ('toledo', 'CM'), ('valencia', 'VC'),
    ('valladolid', 'CL'), ('bizkaia', 'PV'), ('vizcaya', 'PV'),
    ('zamora', 'CL'), ('zaragoza', 'AR'), ('ceuta', 'CE'), ('melilla', 'ML')
    ) as v(name, ccaa)
   where v.name = regexp_replace(public.fold_place(p_name), '^provincia de ', '')
$$;

-- ccaaFromText: what was typed in the old field: an ISO code, 'CAT', a community name or a
-- province name.
create function public.ccaa_from_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(btrim(p_text)) in ('AN', 'AR', 'AS', 'IB', 'CN', 'CB', 'CL', 'CM', 'CT', 'VC', 'EX', 'GA', 'MD', 'MC', 'NC', 'PV', 'RI', 'CE', 'ML') then upper(btrim(p_text))
    when upper(btrim(p_text)) = 'CAT' then 'CT'
    else coalesce(
      (select v.ccaa
         from (values
    ('andalucia', 'AN'), ('aragon', 'AR'), ('principado de asturias', 'AS'), ('illes balears', 'IB'),
    ('canarias', 'CN'), ('cantabria', 'CB'), ('castilla y leon', 'CL'), ('castilla la mancha', 'CM'),
    ('cataluna', 'CT'), ('comunitat valenciana', 'VC'), ('extremadura', 'EX'), ('galicia', 'GA'),
    ('comunidad de madrid', 'MD'), ('region de murcia', 'MC'), ('comunidad foral de navarra', 'NC'), ('pais vasco', 'PV'),
    ('la rioja', 'RI'), ('ceuta', 'CE'), ('melilla', 'ML'), ('asturias', 'AS'),
    ('baleares', 'IB'), ('islas baleares', 'IB'), ('balears', 'IB'), ('islas canarias', 'CN'),
    ('castilla leon', 'CL'), ('catalunya', 'CT'),
    ('catalonia', 'CT'), ('comunidad valenciana', 'VC'), ('valenciana', 'VC'), ('madrid', 'MD'),
    ('murcia', 'MC'), ('navarra', 'NC'), ('euskadi', 'PV'),
    ('rioja', 'RI')
         ) as v(name, ccaa)
        where v.name = regexp_replace(public.fold_place(p_text),
                         '^(comunidad autonoma de|comunidad de|region de) ', '')
        limit 1),
      public.ccaa_from_province(p_text))
  end
$$;

revoke execute on function public.fold_place(text) from public, anon, authenticated;
revoke execute on function public.ccaa_from_postcode(text) from public, anon, authenticated;
revoke execute on function public.ccaa_from_province(text) from public, anon, authenticated;
revoke execute on function public.ccaa_from_text(text) from public, anon, authenticated;

alter table public.pool disable trigger pool_set_updated_at;
update public.pool
   set ccaa_code = coalesce(public.ccaa_from_postcode(cp),
                            public.ccaa_from_province(provincia),
                            public.ccaa_from_text(ccaa))
 where ccaa_code is null;
alter table public.pool enable trigger pool_set_updated_at;
