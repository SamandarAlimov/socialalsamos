-- Platform activity analytics v2
-- Fixes legacy heartbeat/full-page duration double counting, adds idempotent
-- non-overlapping activity segments, and gives admin analytics indexed reads.

alter table public.user_activity_logs
  add column if not exists schema_version smallint not null default 1,
  add column if not exists session_id text,
  add column if not exists client_event_id text,
  add column if not exists segment_started_at timestamptz;

alter table public.user_activity_logs
  drop constraint if exists user_activity_logs_schema_version_check,
  add constraint user_activity_logs_schema_version_check
    check (schema_version between 1 and 2),
  drop constraint if exists user_activity_logs_session_id_len,
  add constraint user_activity_logs_session_id_len
    check (session_id is null or char_length(session_id) between 8 and 128),
  drop constraint if exists user_activity_logs_client_event_id_len,
  add constraint user_activity_logs_client_event_id_len
    check (client_event_id is null or char_length(client_event_id) between 8 and 128);

create unique index if not exists user_activity_logs_user_event_uidx
  on public.user_activity_logs (user_id, client_event_id)
  where client_event_id is not null;

create index if not exists user_activity_logs_user_created_idx
  on public.user_activity_logs (user_id, created_at desc);

create index if not exists user_activity_logs_created_idx
  on public.user_activity_logs (created_at desc);

create index if not exists user_activity_logs_page_created_idx
  on public.user_activity_logs (page, created_at desc);

create index if not exists user_activity_logs_session_created_idx
  on public.user_activity_logs (session_id, created_at desc)
  where session_id is not null;

create or replace function public.track_user_activity_v2(
  p_session_id text,
  p_client_event_id text,
  p_page text,
  p_duration_seconds integer,
  p_activity_type text default 'page_view'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session text := left(trim(coalesce(p_session_id, '')), 128);
  v_event text := left(trim(coalesce(p_client_event_id, '')), 128);
  v_page text := left(coalesce(nullif(trim(p_page), ''), '/'), 200);
  v_duration integer := least(greatest(coalesce(p_duration_seconds, 0), 0), 300);
  v_type text;
  v_category text;
  v_rows bigint := 0;
begin
  if v_user is null
     or char_length(v_session) < 8
     or char_length(v_event) < 8
     or v_duration < 5 then
    return false;
  end if;

  v_type := case lower(coalesce(nullif(trim(p_activity_type), ''), 'page_view'))
    when 'heartbeat' then 'heartbeat'
    when 'session_end' then 'session_end'
    else 'page_view'
  end;

  v_category := case
    when v_page = '/' or v_page like '/home%' or v_page like '/feed%' then 'feed'
    when v_page like '/messages%' then 'messaging'
    when v_page like '/videos%' then 'videos'
    when v_page like '/discover%' or v_page like '/search%' then 'discovery'
    when v_page like '/profile%' or v_page like '/user/%' then 'profile'
    when v_page like '/marketplace%' then 'shopping'
    when v_page like '/map%' then 'maps'
    when v_page like '/settings%' then 'settings'
    when v_page like '/ai%' or v_page like '/projects%' then 'ai'
    when v_page like '/create%' then 'creation'
    else 'other'
  end;

  insert into public.user_activity_logs (
    user_id,
    activity_type,
    page,
    duration_seconds,
    content_category,
    schema_version,
    session_id,
    client_event_id,
    segment_started_at
  ) values (
    v_user,
    v_type,
    v_page,
    v_duration,
    v_category,
    2,
    v_session,
    v_event,
    now() - make_interval(secs => v_duration)
  )
  on conflict (user_id, client_event_id)
    where client_event_id is not null
  do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.track_user_activity_v2(text, text, text, integer, text)
  from public, anon;
grant execute on function public.track_user_activity_v2(text, text, text, integer, text)
  to authenticated, service_role;

-- Keep the existing RPC name so all admin UI remains backward compatible while
-- correcting visit/duration semantics under the hood.
create or replace function public.admin_analytics_snapshot_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or not public.has_admin_permission(v_actor, 'analytics.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'platform_stats', jsonb_build_object(
      'total_users', (select count(*) from public.profiles),
      'online_users', (
        select count(*) from public.profiles
        where coalesce(is_online, false)
          and last_seen >= now() - interval '2 minutes'
      ),
      'new_users_24h', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
      'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new_users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
      'verified_users', (select count(*) from public.profiles where coalesce(is_verified, false)),
      'total_posts', (select count(*) from public.posts),
      'posts_24h', (select count(*) from public.posts where created_at > now() - interval '24 hours'),
      'total_messages', (select count(*) from public.messages),
      'messages_24h', (select count(*) from public.messages where created_at > now() - interval '24 hours')
    ),
    'hourly_activity', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.hour)
      from (
        select
          extract(hour from l.created_at)::integer as hour,
          count(*)::bigint as activity_count,
          coalesce(sum(l.duration_seconds), 0)::bigint as total_duration
        from public.user_activity_logs l
        where l.created_at > now() - interval '7 days'
          and (
            coalesce(l.schema_version, 1) = 2
            or (
              coalesce(l.schema_version, 1) = 1
              and (l.activity_type = 'heartbeat' or coalesce(l.duration_seconds, 0) < 30)
            )
          )
        group by extract(hour from l.created_at)
      ) x
    ), '[]'::jsonb),
    'page_stats', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.visit_count desc, x.page)
      from (
        select
          a.page,
          a.visit_count,
          a.unique_users,
          a.total_duration,
          case when a.visit_count > 0
            then round(a.total_duration::numeric / a.visit_count, 2)
            else 0::numeric
          end as avg_duration
        from (
          select
            l.page,
            (
              count(*) filter (
                where coalesce(l.schema_version, 1) = 1
                  and l.activity_type <> 'heartbeat'
              )
              + count(distinct l.session_id) filter (
                where coalesce(l.schema_version, 1) = 2
                  and l.session_id is not null
              )
            )::bigint as visit_count,
            count(distinct l.user_id)::bigint as unique_users,
            coalesce(sum(l.duration_seconds) filter (
              where coalesce(l.schema_version, 1) = 2
                or (
                  coalesce(l.schema_version, 1) = 1
                  and (l.activity_type = 'heartbeat' or coalesce(l.duration_seconds, 0) < 30)
                )
            ), 0)::bigint as total_duration
          from public.user_activity_logs l
          where l.created_at > now() - interval '30 days'
            and l.page is not null
          group by l.page
        ) a
        order by a.visit_count desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'country_stats', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.user_count desc)
      from (
        select coalesce(country, 'Unknown') as country, count(*)::bigint as user_count
        from public.profiles
        group by country
        order by user_count desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'age_stats', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order)
      from (
        select age_group, count(*)::bigint as user_count, min(sort_order) as sort_order
        from (
          select
            case
              when birth_date is null then 'Unknown'
              when extract(year from age(birth_date)) < 18 then '13-17'
              when extract(year from age(birth_date)) < 25 then '18-24'
              when extract(year from age(birth_date)) < 35 then '25-34'
              when extract(year from age(birth_date)) < 45 then '35-44'
              when extract(year from age(birth_date)) < 55 then '45-54'
              else '55+'
            end as age_group,
            case
              when birth_date is null then 7
              when extract(year from age(birth_date)) < 18 then 1
              when extract(year from age(birth_date)) < 25 then 2
              when extract(year from age(birth_date)) < 35 then 3
              when extract(year from age(birth_date)) < 45 then 4
              when extract(year from age(birth_date)) < 55 then 5
              else 6
            end as sort_order
          from public.profiles
        ) grouped
        group by age_group
      ) x
    ), '[]'::jsonb),
    'dau_trend', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date)
      from (
        select date(l.created_at) as date, count(distinct l.user_id)::bigint as dau
        from public.user_activity_logs l
        where l.created_at > now() - interval '30 days'
        group by date(l.created_at)
      ) x
    ), '[]'::jsonb),
    'weekly_pattern', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.day_of_week)
      from (
        select
          extract(dow from l.created_at)::integer as day_of_week,
          count(*)::bigint as activity_count,
          count(distinct l.user_id)::bigint as unique_users
        from public.user_activity_logs l
        where l.created_at > now() - interval '30 days'
          and (
            coalesce(l.schema_version, 1) = 2
            or (
              coalesce(l.schema_version, 1) = 1
              and (l.activity_type = 'heartbeat' or coalesce(l.duration_seconds, 0) < 30)
            )
          )
        group by extract(dow from l.created_at)
      ) x
    ), '[]'::jsonb),
    'data_quality', jsonb_build_object(
      'activity_schema_version', 2,
      'v2_rows', (select count(*) from public.user_activity_logs where schema_version = 2),
      'legacy_rows', (select count(*) from public.user_activity_logs where schema_version = 1),
      'legacy_duration_strategy', 'heartbeat_plus_short_tail',
      'duration_segment_cap_seconds', 300
    ),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics_snapshot_v1() from public, anon;
grant execute on function public.admin_analytics_snapshot_v1() to authenticated;

notify pgrst, 'reload schema';
