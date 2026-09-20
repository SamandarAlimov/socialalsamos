
-- Alsamos Admin Control Plane v6
-- Canonical country intelligence, coarse edge session geo, SLA automation,
-- enforcement retry ledger, hash-chained audit and live security posture.

create schema if not exists private;
revoke all on schema private from public;

-- ===========================================================================
-- 1. Country intelligence and canonical ISO-3166 country resolution
-- ===========================================================================
create table if not exists private.country_reference (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  name_uz text not null,
  name_en text not null,
  name_ru text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  dialing_prefix text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists private.country_aliases (
  alias_key text primary key,
  alias_display text not null,
  country_code text not null references private.country_reference(country_code)
    on update cascade on delete cascade
);

create or replace function private.country_alias_key_v1(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select lower(
    regexp_replace(
      extensions.unaccent(trim(coalesce(p_value,''))),
      '[^a-zA-Z0-9А-Яа-яЁё]+',
      '',
      'g'
    )
  )
$$;
revoke all on function private.country_alias_key_v1(text) from public,anon,authenticated;

insert into private.country_reference(
  country_code,name_uz,name_en,name_ru,latitude,longitude,dialing_prefix
) values
  ('UZ','O‘zbekiston','Uzbekistan','Узбекистан',41.377500,64.585300,'+998'),
  ('RU','Rossiya','Russia','Россия',61.524000,105.318800,'+7'),
  ('KZ','Qozog‘iston','Kazakhstan','Казахстан',48.019600,66.923700,'+7'),
  ('KG','Qirg‘iziston','Kyrgyzstan','Кыргызстан',41.204400,74.766100,'+996'),
  ('TJ','Tojikiston','Tajikistan','Таджикистан',38.861000,71.276100,'+992'),
  ('TM','Turkmaniston','Turkmenistan','Туркменистан',38.969700,59.556300,'+993'),
  ('AF','Afg‘oniston','Afghanistan','Афганистан',33.939100,67.710000,'+93'),
  ('AZ','Ozarbayjon','Azerbaijan','Азербайджан',40.143100,47.576900,'+994'),
  ('TR','Turkiya','Turkey','Турция',38.963700,35.243300,'+90'),
  ('US','AQSH','United States','США',37.090200,-95.712900,'+1'),
  ('GB','Buyuk Britaniya','United Kingdom','Великобритания',55.378100,-3.436000,'+44'),
  ('DE','Germaniya','Germany','Германия',51.165700,10.451500,'+49'),
  ('FR','Fransiya','France','Франция',46.227600,2.213700,'+33'),
  ('IT','Italiya','Italy','Италия',41.871900,12.567400,'+39'),
  ('ES','Ispaniya','Spain','Испания',40.463700,-3.749200,'+34'),
  ('PL','Polsha','Poland','Польша',51.919400,19.145100,'+48'),
  ('UA','Ukraina','Ukraine','Украина',48.379400,31.165600,'+380'),
  ('BY','Belarus','Belarus','Беларусь',53.709800,27.953400,'+375'),
  ('AE','BAA','United Arab Emirates','ОАЭ',23.424100,53.847800,'+971'),
  ('SA','Saudiya Arabistoni','Saudi Arabia','Саудовская Аравия',23.885900,45.079200,'+966'),
  ('QA','Qatar','Qatar','Катар',25.354800,51.183900,'+974'),
  ('KW','Quvayt','Kuwait','Кувейт',29.311700,47.481800,'+965'),
  ('EG','Misr','Egypt','Египет',26.820600,30.802500,'+20'),
  ('IR','Eron','Iran','Иран',32.427900,53.688000,'+98'),
  ('IQ','Iroq','Iraq','Ирак',33.223200,43.679300,'+964'),
  ('PK','Pokiston','Pakistan','Пакистан',30.375300,69.345100,'+92'),
  ('IN','Hindiston','India','Индия',20.593700,78.962900,'+91'),
  ('CN','Xitoy','China','Китай',35.861700,104.195400,'+86'),
  ('JP','Yaponiya','Japan','Япония',36.204800,138.252900,'+81'),
  ('KR','Janubiy Koreya','South Korea','Южная Корея',35.907800,127.766900,'+82'),
  ('MY','Malayziya','Malaysia','Малайзия',4.210500,101.975800,'+60'),
  ('ID','Indoneziya','Indonesia','Индонезия',-0.789300,113.921300,'+62'),
  ('CA','Kanada','Canada','Канада',56.130400,-106.346800,'+1'),
  ('BR','Braziliya','Brazil','Бразилия',-14.235000,-51.925300,'+55'),
  ('AU','Avstraliya','Australia','Австралия',-25.274400,133.775100,'+61')
on conflict(country_code) do update set
  name_uz=excluded.name_uz,
  name_en=excluded.name_en,
  name_ru=excluded.name_ru,
  latitude=excluded.latitude,
  longitude=excluded.longitude,
  dialing_prefix=excluded.dialing_prefix,
  active=true,
  updated_at=now();

with aliases(country_code,alias_display) as (
  values
    ('UZ','UZ'),('UZ','Uzbekistan'),('UZ','O‘zbekiston'),('UZ','Oʻzbekiston'),('UZ','O''zbekiston'),('UZ','Ozbekiston'),('UZ','Ўзбекистон'),('UZ','Узбекистан'),
    ('RU','RU'),('RU','Russia'),('RU','Rossiya'),('RU','Россия'),
    ('KZ','KZ'),('KZ','Kazakhstan'),('KZ','Qozog‘iston'),('KZ','Qozogiston'),('KZ','Казахстан'),
    ('KG','KG'),('KG','Kyrgyzstan'),('KG','Qirg‘iziston'),('KG','Qirgiziston'),('KG','Кыргызстан'),
    ('TJ','TJ'),('TJ','Tajikistan'),('TJ','Tojikiston'),('TJ','Таджикистан'),
    ('TM','TM'),('TM','Turkmenistan'),('TM','Turkmaniston'),('TM','Туркменистан'),
    ('AF','AF'),('AF','Afghanistan'),('AF','Afg‘oniston'),('AF','Афганистан'),
    ('AZ','AZ'),('AZ','Azerbaijan'),('AZ','Ozarbayjon'),('AZ','Азербайджан'),
    ('TR','TR'),('TR','Turkey'),('TR','Türkiye'),('TR','Turkiya'),('TR','Турция'),
    ('US','US'),('US','USA'),('US','United States'),('US','United States of America'),('US','AQSH'),('US','AQSh'),('US','США'),
    ('GB','GB'),('GB','UK'),('GB','United Kingdom'),('GB','Great Britain'),('GB','Buyuk Britaniya'),('GB','Великобритания'),
    ('DE','DE'),('DE','Germany'),('DE','Germaniya'),('DE','Deutschland'),('DE','Германия'),
    ('FR','FR'),('FR','France'),('FR','Fransiya'),('FR','Франция'),
    ('IT','IT'),('IT','Italy'),('IT','Italiya'),('IT','Италия'),
    ('ES','ES'),('ES','Spain'),('ES','Ispaniya'),('ES','Испания'),
    ('PL','PL'),('PL','Poland'),('PL','Polsha'),('PL','Польша'),
    ('UA','UA'),('UA','Ukraine'),('UA','Ukraina'),('UA','Украина'),
    ('BY','BY'),('BY','Belarus'),('BY','Беларусь'),
    ('AE','AE'),('AE','UAE'),('AE','United Arab Emirates'),('AE','BAA'),('AE','ОАЭ'),
    ('SA','SA'),('SA','Saudi Arabia'),('SA','Saudiya Arabistoni'),('SA','Саудовская Аравия'),
    ('QA','QA'),('QA','Qatar'),('QA','Катар'),
    ('KW','KW'),('KW','Kuwait'),('KW','Quvayt'),('KW','Кувейт'),
    ('EG','EG'),('EG','Egypt'),('EG','Misr'),('EG','Египет'),
    ('IR','IR'),('IR','Iran'),('IR','Eron'),('IR','Иран'),
    ('IQ','IQ'),('IQ','Iraq'),('IQ','Iroq'),('IQ','Ирак'),
    ('PK','PK'),('PK','Pakistan'),('PK','Pokiston'),('PK','Пакистан'),
    ('IN','IN'),('IN','India'),('IN','Hindiston'),('IN','Индия'),
    ('CN','CN'),('CN','China'),('CN','Xitoy'),('CN','Китай'),
    ('JP','JP'),('JP','Japan'),('JP','Yaponiya'),('JP','Япония'),
    ('KR','KR'),('KR','South Korea'),('KR','Korea Republic of'),('KR','Janubiy Koreya'),('KR','Южная Корея'),
    ('MY','MY'),('MY','Malaysia'),('MY','Malayziya'),('MY','Малайзия'),
    ('ID','ID'),('ID','Indonesia'),('ID','Indoneziya'),('ID','Индонезия'),
    ('CA','CA'),('CA','Canada'),('CA','Kanada'),('CA','Канада'),
    ('BR','BR'),('BR','Brazil'),('BR','Braziliya'),('BR','Бразилия'),
    ('AU','AU'),('AU','Australia'),('AU','Avstraliya'),('AU','Австралия')
),
normalized as (
  select private.country_alias_key_v1(alias_display) as alias_key,alias_display,country_code
  from aliases
)
insert into private.country_aliases(alias_key,alias_display,country_code)
select distinct on(alias_key) alias_key,alias_display,country_code
from normalized
where alias_key<>''
order by alias_key,alias_display
on conflict(alias_key) do update set
  alias_display=excluded.alias_display,
  country_code=excluded.country_code;

create or replace function public.normalize_country_code_v1(p_value text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_raw text := upper(trim(coalesce(p_value,'')));
  v_code text;
begin
  if v_raw='' then return null; end if;

  select a.country_code into v_code
  from private.country_aliases a
  where a.alias_key=private.country_alias_key_v1(p_value)
  limit 1;
  if v_code is not null then return v_code; end if;

  if v_raw ~ '^[A-Z]{2}$' then return v_raw; end if;
  return null;
end;
$$;
revoke all on function public.normalize_country_code_v1(text) from public,anon;
grant execute on function public.normalize_country_code_v1(text) to authenticated;

create or replace function private.country_code_from_location_v1(p_location text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_parts text[];
  v_code text;
  i integer;
begin
  if nullif(trim(coalesce(p_location,'')),'') is null then return null; end if;

  v_code:=public.normalize_country_code_v1(p_location);
  if v_code is not null then return v_code; end if;

  v_parts:=string_to_array(p_location,',');
  if array_length(v_parts,1) is null then return null; end if;

  for i in reverse array_upper(v_parts,1)..array_lower(v_parts,1) loop
    v_code:=public.normalize_country_code_v1(v_parts[i]);
    if v_code is not null then return v_code; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.country_code_from_location_v1(text) from public,anon,authenticated;

create or replace function private.country_code_from_phone_v1(p_phone text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_digits text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if v_digits ~ '^998[0-9]{9}$' then return 'UZ'; end if;
  if v_digits ~ '^996[0-9]{9}$' then return 'KG'; end if;
  if v_digits ~ '^992[0-9]{9}$' then return 'TJ'; end if;
  if v_digits ~ '^993[0-9]{8}$' then return 'TM'; end if;
  if v_digits ~ '^994[0-9]{9}$' then return 'AZ'; end if;
  if v_digits ~ '^971[0-9]{9}$' then return 'AE'; end if;
  if v_digits ~ '^966[0-9]{9}$' then return 'SA'; end if;
  if v_digits ~ '^974[0-9]{8}$' then return 'QA'; end if;
  if v_digits ~ '^965[0-9]{8}$' then return 'KW'; end if;
  if v_digits ~ '^380[0-9]{9}$' then return 'UA'; end if;
  if v_digits ~ '^375[0-9]{9}$' then return 'BY'; end if;
  if v_digits ~ '^90[0-9]{10}$' then return 'TR'; end if;
  if v_digits ~ '^44[0-9]{10}$' then return 'GB'; end if;
  if v_digits ~ '^33[0-9]{9}$' then return 'FR'; end if;
  if v_digits ~ '^34[0-9]{9}$' then return 'ES'; end if;
  if v_digits ~ '^39[0-9]{9,11}$' then return 'IT'; end if;
  if v_digits ~ '^48[0-9]{9}$' then return 'PL'; end if;
  if v_digits ~ '^86[0-9]{11}$' then return 'CN'; end if;
  if v_digits ~ '^81[0-9]{9,10}$' then return 'JP'; end if;
  if v_digits ~ '^82[0-9]{9,10}$' then return 'KR'; end if;
  if v_digits ~ '^91[0-9]{10}$' then return 'IN'; end if;
  if v_digits ~ '^92[0-9]{10}$' then return 'PK'; end if;
  if v_digits ~ '^61[0-9]{9}$' then return 'AU'; end if;
  if v_digits ~ '^55[0-9]{10,11}$' then return 'BR'; end if;
  return null;
end;
$$;
revoke all on function private.country_code_from_phone_v1(text) from public,anon,authenticated;

create table if not exists private.user_country_resolution (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  country_code text check(country_code is null or country_code ~ '^[A-Z]{2}$'),
  source text not null default 'unknown',
  confidence smallint not null default 0 check(confidence between 0 and 100),
  source_updated_at timestamptz,
  last_resolved_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_sessions
  add column if not exists location_country_code text,
  add column if not exists location_source text,
  add column if not exists location_confidence smallint,
  add column if not exists geo_updated_at timestamptz;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='user_sessions_location_country_code_check'
      and conrelid='public.user_sessions'::regclass
  ) then
    alter table public.user_sessions
      add constraint user_sessions_location_country_code_check
      check(location_country_code is null or location_country_code ~ '^[A-Z]{2}$');
  end if;
  if not exists(
    select 1 from pg_constraint
    where conname='user_sessions_location_confidence_check'
      and conrelid='public.user_sessions'::regclass
  ) then
    alter table public.user_sessions
      add constraint user_sessions_location_confidence_check
      check(location_confidence is null or location_confidence between 0 and 100);
  end if;
end
$$;

create index if not exists user_sessions_country_active_idx
  on public.user_sessions(user_id,location_country_code,last_active_at desc)
  where location_country_code is not null;

create or replace function private.refresh_user_country_resolution_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile_country text;
  v_location text;
  v_phone text;
  v_country text;
  v_source text:='unknown';
  v_confidence smallint:=0;
  v_source_at timestamptz:=now();
begin
  select p.country,p.location into v_profile_country,v_location
  from public.profiles p where p.id=p_user_id;
  if not found then return; end if;

  v_country:=public.normalize_country_code_v1(v_profile_country);
  if v_country is not null then
    v_source:='profile';
    v_confidence:=100;
  else
    select s.location_country_code,coalesce(s.geo_updated_at,s.last_active_at,s.created_at)
      into v_country,v_source_at
    from public.user_sessions s
    where s.user_id=p_user_id
      and s.location_country_code is not null
      and coalesce(s.location_confidence,0)>=80
    order by coalesce(s.geo_updated_at,s.last_active_at,s.created_at) desc
    limit 1;

    if v_country is not null then
      v_source:='edge_ip';
      v_confidence:=92;
    else
      v_country:=private.country_code_from_location_v1(v_location);
      if v_country is not null then
        v_source:='profile_location';
        v_confidence:=82;
      else
        select ai.phone into v_phone
        from public.identity_accounts ia
        join public.auth_identities ai on ai.id=ia.identity_id
        where ia.user_id=p_user_id and ia.status<>'deleted'
        order by ia.is_primary desc,ia.slot_no asc
        limit 1;

        v_country:=private.country_code_from_phone_v1(v_phone);
        if v_country is not null then
          v_source:='phone_prefix';
          v_confidence:=68;
        end if;
      end if;
    end if;
  end if;

  insert into private.user_country_resolution(
    user_id,country_code,source,confidence,source_updated_at,last_resolved_at,metadata
  ) values (
    p_user_id,v_country,v_source,v_confidence,v_source_at,now(),
    jsonb_build_object('resolver_version',1)
  )
  on conflict(user_id) do update set
    country_code=excluded.country_code,
    source=excluded.source,
    confidence=excluded.confidence,
    source_updated_at=excluded.source_updated_at,
    last_resolved_at=now(),
    metadata=excluded.metadata;
end;
$$;
revoke all on function private.refresh_user_country_resolution_v1(uuid) from public,anon,authenticated;

create or replace function private.normalize_profile_country_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_code text;
begin
  v_code:=public.normalize_country_code_v1(new.country);
  new.country:=case when v_code is not null then v_code else nullif(trim(new.country),'') end;
  return new;
end;
$$;
revoke all on function private.normalize_profile_country_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_normalize_profile_country_v1 on public.profiles;
create trigger trg_normalize_profile_country_v1
before insert or update of country on public.profiles
for each row execute function private.normalize_profile_country_trigger_v1();

create or replace function private.refresh_profile_country_resolution_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.refresh_user_country_resolution_v1(new.id);
  return new;
end;
$$;
revoke all on function private.refresh_profile_country_resolution_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_refresh_profile_country_resolution_v1 on public.profiles;
create trigger trg_refresh_profile_country_resolution_v1
after insert or update of country,location on public.profiles
for each row execute function private.refresh_profile_country_resolution_trigger_v1();

update public.profiles
set country=public.normalize_country_code_v1(country)
where country is not null
  and public.normalize_country_code_v1(country) is not null
  and country is distinct from public.normalize_country_code_v1(country);

do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform private.refresh_user_country_resolution_v1(r.id);
  end loop;
end
$$;

create or replace function public.capture_user_session_geo_v1(
  p_session_id uuid,
  p_country_code text,
  p_city text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_code text:=public.normalize_country_code_v1(p_country_code);
  v_name text;
  v_updated uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_country_code is not null and v_code is null then
    raise exception 'invalid_country_code' using errcode='22023';
  end if;

  select coalesce(r.name_en,v_code) into v_name
  from private.country_reference r where r.country_code=v_code;

  update public.user_sessions s
  set location_country_code=coalesce(v_code,s.location_country_code),
      location_country=case when v_code is not null then coalesce(v_name,v_code) else s.location_country end,
      location_city=coalesce(nullif(left(trim(p_city),120),''),s.location_city),
      ip_address=coalesce(nullif(left(trim(p_ip),128),''),s.ip_address),
      location_source=case when v_code is not null then 'vercel_ip' else s.location_source end,
      location_confidence=case when v_code is not null then 92 else s.location_confidence end,
      geo_updated_at=case when v_code is not null then now() else s.geo_updated_at end
  where s.id=p_session_id and s.user_id=v_actor
  returning s.id into v_updated;

  if v_updated is null then raise exception 'session_not_found' using errcode='P0002'; end if;

  perform private.refresh_user_country_resolution_v1(v_actor);
  return jsonb_build_object('session_id',v_updated,'country_code',v_code,'source',case when v_code is not null then 'vercel_ip' else null end);
end;
$$;
revoke all on function public.capture_user_session_geo_v1(uuid,text,text,text) from public,anon;
grant execute on function public.capture_user_session_geo_v1(uuid,text,text,text) to authenticated;

create or replace function public.admin_country_stats_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'analytics.view')
    or public.has_admin_permission(v_actor,'admin.regions.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'country_code',g.country_code,
        'user_count',g.user_count,
        'avg_confidence',g.avg_confidence,
        'sources',g.sources
      )
      order by g.user_count desc,g.country_code nulls last
    )
    from (
      select
        s.country_code,
        sum(s.source_count)::bigint as user_count,
        round(sum(s.confidence_sum)::numeric/nullif(sum(s.source_count),0),1) as avg_confidence,
        jsonb_object_agg(s.source,s.source_count) as sources
      from (
        select
          r.country_code,
          coalesce(r.source,'unknown') as source,
          count(*)::bigint as source_count,
          sum(coalesce(r.confidence,0))::bigint as confidence_sum
        from public.profiles p
        left join private.user_country_resolution r on r.user_id=p.id
        group by r.country_code,coalesce(r.source,'unknown')
      ) s
      group by s.country_code
    ) g
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_country_stats_v2() from public,anon;
grant execute on function public.admin_country_stats_v2() to authenticated;

create or replace function public.admin_online_geo_v1(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.regions.view')
    or public.has_admin_permission(v_actor,'analytics.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.last_seen desc)
    from (
      select p.id,p.username,p.display_name,p.avatar_url,p.last_seen,
             r.country_code,r.source as country_source,r.confidence as country_confidence,
             c.name_uz,c.name_en,c.latitude,c.longitude
      from public.profiles p
      left join private.user_country_resolution r on r.user_id=p.id
      left join private.country_reference c on c.country_code=r.country_code
      where coalesce(p.is_online,false) and p.last_seen>=now()-interval '2 minutes'
      order by p.last_seen desc
      limit least(greatest(coalesce(p_limit,500),1),1000)
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.admin_online_geo_v1(integer) from public,anon;
grant execute on function public.admin_online_geo_v1(integer) to authenticated;

drop function if exists public.admin_region_summary_v3();
create function public.admin_region_summary_v3()
returns table(
  country_code text,
  users_count bigint,
  online_count bigint,
  verified_count bigint,
  new_30d_count bigint,
  posts_count bigint,
  avg_confidence numeric
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.regions.view')
    or public.has_admin_permission(v_actor,'analytics.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return query
  select r.country_code,
         count(*)::bigint,
         count(*) filter(where coalesce(p.is_online,false) and p.last_seen>=now()-interval '2 minutes')::bigint,
         count(*) filter(where coalesce(p.is_verified,false))::bigint,
         count(*) filter(where p.created_at>=now()-interval '30 days')::bigint,
         coalesce(sum(coalesce(p.posts_count,0)),0)::bigint,
         round(avg(coalesce(r.confidence,0))::numeric,1)
  from public.profiles p
  left join private.user_country_resolution r on r.user_id=p.id
  group by r.country_code
  order by count(*) desc,r.country_code nulls last;
end;
$$;
revoke all on function public.admin_region_summary_v3() from public,anon;
grant execute on function public.admin_region_summary_v3() to authenticated;

-- ===========================================================================
-- 2. Trust & Safety SLA automation
-- ===========================================================================
alter table public.moderation_cases
  add column if not exists sla_state text not null default 'on_track',
  add column if not exists sla_escalation_level smallint not null default 0,
  add column if not exists sla_last_evaluated_at timestamptz,
  add column if not exists escalated_at timestamptz;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='moderation_cases_sla_state_check'
      and conrelid='public.moderation_cases'::regclass
  ) then
    alter table public.moderation_cases
      add constraint moderation_cases_sla_state_check
      check(sla_state in ('on_track','at_risk','breached','resolved'));
  end if;
end
$$;

create table if not exists public.moderation_case_sla_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  event_type text not null check(event_type in ('at_risk','breached','recovered','resolved')),
  escalation_level smallint not null default 0,
  prior_priority text,
  new_priority text,
  due_at timestamptz,
  observed_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);
create unique index if not exists moderation_case_sla_event_once_idx
  on public.moderation_case_sla_events(case_id,event_type,escalation_level,(coalesce(due_at,'epoch'::timestamptz)));
create index if not exists moderation_case_sla_events_observed_idx
  on public.moderation_case_sla_events(observed_at desc);
create index if not exists moderation_cases_sla_active_idx
  on public.moderation_cases(sla_state,due_at)
  where status not in ('resolved','dismissed');

alter table public.moderation_case_sla_events enable row level security;
drop policy if exists "Admin trust safety reads SLA events" on public.moderation_case_sla_events;
create policy "Admin trust safety reads SLA events"
on public.moderation_case_sla_events for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.review'))
);
grant select on public.moderation_case_sla_events to authenticated;

create or replace function private.process_moderation_sla_v1()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_state text;
  v_warning interval;
  v_new_priority text;
  v_level smallint;
  v_changed integer:=0;
begin
  for r in
    select id,case_number,title,priority,status,due_at,sla_state,sla_escalation_level
    from public.moderation_cases
    where status not in ('resolved','dismissed') and due_at is not null
    for update skip locked
  loop
    v_warning:=case r.priority
      when 'critical' then interval '1 hour'
      when 'high' then interval '4 hours'
      when 'normal' then interval '12 hours'
      else interval '24 hours'
    end;
    v_state:=case
      when now()>r.due_at then 'breached'
      when r.due_at-now()<=v_warning then 'at_risk'
      else 'on_track'
    end;

    if v_state='breached' then
      v_level:=greatest(r.sla_escalation_level,1);
      v_new_priority:=case r.priority
        when 'low' then 'normal'
        when 'normal' then 'high'
        when 'high' then 'critical'
        else 'critical'
      end;

      update public.moderation_cases
      set sla_state='breached',
          sla_escalation_level=v_level,
          sla_last_evaluated_at=now(),
          escalated_at=coalesce(escalated_at,now()),
          priority=v_new_priority,
          updated_at=now()
      where id=r.id;

      insert into public.moderation_case_sla_events(
        case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
      ) values (
        r.id,'breached',v_level,r.priority,v_new_priority,r.due_at,
        jsonb_build_object('automated',true,'case_number',r.case_number)
      ) on conflict do nothing;

      if r.sla_state is distinct from 'breached' then
        perform public._admin_emit_notification(
          'trust_safety','critical','SLA breached · case #'||r.case_number,r.title,
          '/admin/trust-safety','moderation_case',r.id::text,
          jsonb_build_object('due_at',r.due_at,'escalation_level',v_level)
        );
      end if;
    elsif v_state='at_risk' then
      update public.moderation_cases
      set sla_state='at_risk',sla_last_evaluated_at=now(),updated_at=now()
      where id=r.id;

      insert into public.moderation_case_sla_events(
        case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
      ) values (
        r.id,'at_risk',r.sla_escalation_level,r.priority,r.priority,r.due_at,
        jsonb_build_object('automated',true,'case_number',r.case_number)
      ) on conflict do nothing;

      if r.sla_state is distinct from 'at_risk' then
        perform public._admin_emit_notification(
          'trust_safety','warning','SLA at risk · case #'||r.case_number,r.title,
          '/admin/trust-safety','moderation_case',r.id::text,jsonb_build_object('due_at',r.due_at)
        );
      end if;
    else
      update public.moderation_cases
      set sla_state='on_track',sla_last_evaluated_at=now(),updated_at=now()
      where id=r.id;
    end if;

    if r.sla_state is distinct from v_state then v_changed:=v_changed+1; end if;
  end loop;

  update public.moderation_cases
  set sla_state='resolved',sla_last_evaluated_at=now()
  where status in ('resolved','dismissed') and sla_state<>'resolved';

  return v_changed;
end;
$$;
revoke all on function private.process_moderation_sla_v1() from public,anon,authenticated;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='alsamos_moderation_sla_v1' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'alsamos_moderation_sla_v1',
    '*/5 * * * *',
    $cron$select private.process_moderation_sla_v1();$cron$
  );
end
$$;

select private.process_moderation_sla_v1();

create or replace function public.admin_sla_snapshot_v1(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return jsonb_build_object(
    'generated_at',now(),
    'counts',jsonb_build_object(
      'on_track',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='on_track'),
      'at_risk',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='at_risk'),
      'breached',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='breached')
    ),
    'cases',coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.sla_state when 'breached' then 1 when 'at_risk' then 2 else 3 end,
        x.due_at asc nulls last)
      from (
        select c.id,c.case_number,c.title,c.priority,c.status,c.due_at,c.sla_state,
               c.sla_escalation_level,c.sla_last_evaluated_at,c.escalated_at
        from public.moderation_cases c
        where c.status not in ('resolved','dismissed')
        order by case c.sla_state when 'breached' then 1 when 'at_risk' then 2 else 3 end,c.due_at asc nulls last
        limit least(greatest(coalesce(p_limit,50),1),200)
      ) x
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.observed_at desc)
      from (
        select e.id,e.case_id,e.event_type,e.escalation_level,e.prior_priority,e.new_priority,
               e.due_at,e.observed_at,e.detail,c.case_number,c.title
        from public.moderation_case_sla_events e
        join public.moderation_cases c on c.id=e.case_id
        order by e.observed_at desc
        limit 50
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_sla_snapshot_v1(integer) from public,anon;
grant execute on function public.admin_sla_snapshot_v1(integer) to authenticated;

-- ===========================================================================
-- 3. Enforcement failure/retry ledger
-- ===========================================================================
alter table public.enforcement_actions
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_retry_at timestamptz;

create table if not exists public.enforcement_retry_requests (
  id uuid primary key default gen_random_uuid(),
  enforcement_action_id uuid not null references public.enforcement_actions(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  retry_number integer not null,
  reason text not null,
  previous_failure_reason text,
  status text not null default 'requeued' check(status in ('requeued','cancelled','executed')),
  created_at timestamptz not null default now()
);
create unique index if not exists enforcement_retry_number_unique
  on public.enforcement_retry_requests(enforcement_action_id,retry_number);
create index if not exists enforcement_retry_created_idx
  on public.enforcement_retry_requests(created_at desc);

alter table public.enforcement_retry_requests enable row level security;
drop policy if exists "Admin trust safety reads enforcement retries" on public.enforcement_retry_requests;
create policy "Admin trust safety reads enforcement retries"
on public.enforcement_retry_requests for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()),'admin.enforcement.execute'))
  or (select public.has_admin_permission((select auth.uid()),'reports.review'))
);
grant select on public.enforcement_retry_requests to authenticated;

create or replace function public.admin_retry_enforcement_v1(p_action_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_retry integer;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.execute')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'retry_reason_required'; end if;

  select * into v_action from public.enforcement_actions where id=p_action_id for update;
  if not found then raise exception 'enforcement_not_found'; end if;
  if v_action.status<>'failed' then raise exception 'enforcement_not_failed'; end if;
  if v_action.retry_count>=5 then raise exception 'retry_limit_reached'; end if;

  v_retry:=v_action.retry_count+1;
  update public.enforcement_actions
  set status='pending_execution',retry_count=v_retry,last_retry_at=now(),failure_reason=null
  where id=p_action_id;

  insert into public.enforcement_retry_requests(
    enforcement_action_id,requested_by,retry_number,reason,previous_failure_reason
  ) values (p_action_id,v_actor,v_retry,trim(p_reason),v_action.failure_reason);

  perform public._admin_enforcement_event(
    p_action_id,v_actor,'retry_requeued',
    jsonb_build_object('retry_number',v_retry,'previous_failure_reason',v_action.failure_reason)
  );

  perform public.admin_write_audit(
    'trust_safety.enforcement.retry',null,'enforcement_action',p_action_id::text,trim(p_reason),
    to_jsonb(v_action),
    (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
    jsonb_build_object('retry_number',v_retry)
  );

  return jsonb_build_object('status','pending_execution','retry_count',v_retry,'action_id',p_action_id);
end;
$$;
revoke all on function public.admin_retry_enforcement_v1(uuid,text) from public,anon;
grant execute on function public.admin_retry_enforcement_v1(uuid,text) to authenticated;

create or replace function public.admin_enforcement_queue_v1(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return jsonb_build_object(
    'generated_at',now(),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.status when 'awaiting_approval' then 1 when 'pending_execution' then 2 when 'failed' then 3 else 4 end,
        x.created_at asc)
      from (
        select a.id,a.case_id,a.target_type,a.target_id,a.action_type,a.status,
               a.starts_at,a.ends_at,a.created_by,a.created_at,a.approved_at,a.executed_at,a.executed_by,
               a.failure_reason,a.required_approvals,a.policy_code,a.policy_revision_id,
               a.retry_count,a.last_retry_at,
               c.case_number,c.title as case_title,
               p.username as creator_username,p.display_name as creator_name,
               (select count(*) from public.enforcement_approvals ap
                where ap.enforcement_action_id=a.id and ap.decision='approved') as approved_count
        from public.enforcement_actions a
        left join public.moderation_cases c on c.id=a.case_id
        left join public.profiles p on p.id=a.created_by
        where a.status in ('awaiting_approval','pending_execution','failed')
        order by a.created_at asc
        limit least(greatest(coalesce(p_limit,100),1),250)
      ) x
    ),'[]'::jsonb),
    'policies',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.category,p.code)
      from public.moderation_policies p where p.active
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_enforcement_queue_v1(integer) from public,anon;
grant execute on function public.admin_enforcement_queue_v1(integer) to authenticated;

-- ===========================================================================
-- 4. Tamper-evident immutable admin audit chain
-- ===========================================================================
alter table public.admin_audit_log
  add column if not exists prev_hash text,
  add column if not exists event_hash text;

create or replace function private.admin_audit_event_hash_v1(
  p_prev_hash text,p_id uuid,p_actor_id uuid,p_target_user_id uuid,p_action text,
  p_entity_type text,p_entity_id text,p_reason text,p_before jsonb,p_after jsonb,
  p_metadata jsonb,p_created_at timestamptz
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'prev_hash',coalesce(p_prev_hash,''),
          'id',p_id,'actor_id',p_actor_id,'target_user_id',p_target_user_id,
          'action',p_action,'entity_type',p_entity_type,'entity_id',p_entity_id,'reason',p_reason,
          'before_state',coalesce(p_before,'{}'::jsonb),
          'after_state',coalesce(p_after,'{}'::jsonb),
          'metadata',coalesce(p_metadata,'{}'::jsonb),
          'created_at',p_created_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;
revoke all on function private.admin_audit_event_hash_v1(text,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,timestamptz)
from public,anon,authenticated;

do $$
declare
  r record;
  v_prev text:=repeat('0',64);
  v_hash text;
begin
  for r in select * from public.admin_audit_log order by created_at,id loop
    v_hash:=private.admin_audit_event_hash_v1(
      v_prev,r.id,r.actor_id,r.target_user_id,r.action,r.entity_type,r.entity_id,r.reason,
      r.before_state,r.after_state,r.metadata,r.created_at
    );
    update public.admin_audit_log set prev_hash=v_prev,event_hash=v_hash where id=r.id;
    v_prev:=v_hash;
  end loop;
end
$$;

create or replace function private.admin_audit_chain_insert_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_prev text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alsamos_admin_audit_chain_v1',0));
  select a.event_hash into v_prev
  from public.admin_audit_log a
  order by a.created_at desc,a.id desc limit 1;

  new.prev_hash:=coalesce(v_prev,repeat('0',64));
  new.event_hash:=private.admin_audit_event_hash_v1(
    new.prev_hash,new.id,new.actor_id,new.target_user_id,new.action,new.entity_type,new.entity_id,new.reason,
    new.before_state,new.after_state,new.metadata,new.created_at
  );
  return new;
end;
$$;
revoke all on function private.admin_audit_chain_insert_v1() from public,anon,authenticated;

drop trigger if exists trg_admin_audit_chain_insert_v1 on public.admin_audit_log;
create trigger trg_admin_audit_chain_insert_v1
before insert on public.admin_audit_log
for each row execute function private.admin_audit_chain_insert_v1();

create or replace function private.admin_audit_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'admin_audit_log_is_immutable' using errcode='42501';
end;
$$;
revoke all on function private.admin_audit_immutable_v1() from public,anon,authenticated;

drop trigger if exists trg_admin_audit_immutable_v1 on public.admin_audit_log;
create trigger trg_admin_audit_immutable_v1
before update or delete on public.admin_audit_log
for each row execute function private.admin_audit_immutable_v1();

create or replace function public.admin_verify_audit_chain_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  r record;
  v_prev text:=repeat('0',64);
  v_expected text;
  v_count integer:=0;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  for r in select * from public.admin_audit_log order by created_at,id loop
    v_expected:=private.admin_audit_event_hash_v1(
      v_prev,r.id,r.actor_id,r.target_user_id,r.action,r.entity_type,r.entity_id,r.reason,
      r.before_state,r.after_state,r.metadata,r.created_at
    );
    v_count:=v_count+1;
    if r.prev_hash is distinct from v_prev or r.event_hash is distinct from v_expected then
      return jsonb_build_object('valid',false,'rows_checked',v_count,'first_invalid_id',r.id,'checked_at',now());
    end if;
    v_prev:=r.event_hash;
  end loop;

  return jsonb_build_object('valid',true,'rows_checked',v_count,'head_hash',v_prev,'checked_at',now());
end;
$$;
revoke all on function public.admin_verify_audit_chain_v1() from public,anon;
grant execute on function public.admin_verify_audit_chain_v1() to authenticated;

create or replace function public.admin_audit_export_v1(
  p_from timestamptz default null,p_to timestamptz default null,p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return jsonb_build_object(
    'exported_at',now(),
    'chain',public.admin_verify_audit_chain_v1(),
    'events',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at,x.id)
      from (
        select a.id,a.actor_id,a.target_user_id,a.action,a.entity_type,a.entity_id,a.reason,
               a.before_state,a.after_state,a.metadata,a.created_at,a.prev_hash,a.event_hash
        from public.admin_audit_log a
        where (p_from is null or a.created_at>=p_from)
          and (p_to is null or a.created_at<=p_to)
        order by a.created_at desc,a.id desc
        limit least(greatest(coalesce(p_limit,1000),1),5000)
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_audit_export_v1(timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.admin_audit_export_v1(timestamptz,timestamptz,integer) to authenticated;

-- ===========================================================================
-- 5. Live internal security posture
-- ===========================================================================
create or replace function public.admin_security_posture_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_rls_exposed integer;
  v_definer_public integer;
  v_chain jsonb;
  v_country_known integer;
  v_country_unknown integer;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.system.view')
    or public.has_admin_permission(v_actor,'admin.security.view')
    or public.has_admin_permission(v_actor,'security.view')
    or public.has_admin_permission(v_actor,'admin.audit.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  select count(*) into v_rls_exposed
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid)
    and (
      pg_catalog.has_table_privilege('anon',c.oid,'SELECT')
      or pg_catalog.has_table_privilege('anon',c.oid,'INSERT')
      or pg_catalog.has_table_privilege('anon',c.oid,'UPDATE')
      or pg_catalog.has_table_privilege('anon',c.oid,'DELETE')
      or pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT')
      or pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT')
      or pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE')
      or pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')
    );

  select count(*) into v_definer_public
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and exists(
      select 1
      from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE'
    );

  v_chain:=public.admin_verify_audit_chain_v1();

  select count(*) filter(where country_code is not null),
         count(*) filter(where country_code is null)
    into v_country_known,v_country_unknown
  from private.user_country_resolution;

  return jsonb_build_object(
    'checked_at',now(),
    'audit_chain',v_chain,
    'rls_exposed_without_policy',v_rls_exposed,
    'security_definer_public_execute',v_definer_public,
    'country_resolution',jsonb_build_object(
      'resolved',coalesce(v_country_known,0),
      'unknown',coalesce(v_country_unknown,0),
      'coverage_pct',case
        when coalesce(v_country_known,0)+coalesce(v_country_unknown,0)=0 then 0
        else round(100.0*v_country_known/(v_country_known+v_country_unknown),1)
      end
    ),
    'sla',jsonb_build_object(
      'at_risk',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='at_risk'),
      'breached',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='breached')
    ),
    'enforcement',jsonb_build_object(
      'failed',(select count(*) from public.enforcement_actions where status='failed'),
      'retry_requests',(select count(*) from public.enforcement_retry_requests)
    )
  );
end;
$$;
revoke all on function public.admin_security_posture_v1() from public,anon;
grant execute on function public.admin_security_posture_v1() to authenticated;

notify pgrst,'reload schema';
