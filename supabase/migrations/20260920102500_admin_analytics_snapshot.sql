-- One permission-aware analytics snapshot for the admin dashboard.
-- Replaces seven legacy RPC round-trips that only recognized enum-based admins.

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
        select count(*)
        from public.profiles
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
          extract(hour from created_at)::integer as hour,
          count(*)::bigint as activity_count,
          coalesce(sum(duration_seconds), 0)::bigint as total_duration
        from public.user_activity_logs
        where created_at > now() - interval '7 days'
        group by extract(hour from created_at)
      ) x
    ), '[]'::jsonb),
    'page_stats', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.visit_count desc)
      from (
        select
          page,
          count(*)::bigint as visit_count,
          count(distinct user_id)::bigint as unique_users,
          coalesce(sum(duration_seconds), 0)::bigint as total_duration,
          coalesce(avg(duration_seconds), 0)::numeric as avg_duration
        from public.user_activity_logs
        where created_at > now() - interval '30 days'
          and page is not null
        group by page
        order by visit_count desc
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
        select date(created_at) as date, count(distinct user_id)::bigint as dau
        from public.user_activity_logs
        where created_at > now() - interval '30 days'
        group by date(created_at)
      ) x
    ), '[]'::jsonb),
    'weekly_pattern', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.day_of_week)
      from (
        select
          extract(dow from created_at)::integer as day_of_week,
          count(*)::bigint as activity_count,
          count(distinct user_id)::bigint as unique_users
        from public.user_activity_logs
        where created_at > now() - interval '30 days'
        group by extract(dow from created_at)
      ) x
    ), '[]'::jsonb),
    'generated_at', now()
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics_snapshot_v1() from public;
grant execute on function public.admin_analytics_snapshot_v1() to authenticated;

notify pgrst, 'reload schema';
