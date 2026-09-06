-- Premium post insights: privacy-safe, owner-only aggregated analytics.
-- Existing post_views/likes/comments/bookmarks/reposts remain the historical source of truth.
-- This migration only adds telemetry; it does not delete or rewrite user content.

create table if not exists public.post_analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  source text not null default 'unknown',
  device_type text not null default 'unknown',
  is_follower boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  dwell_ms bigint not null default 0 check (dwell_ms >= 0),
  watch_ms bigint not null default 0 check (watch_ms >= 0),
  max_position_ms bigint not null default 0 check (max_position_ms >= 0),
  media_duration_ms bigint null check (media_duration_ms is null or media_duration_ms >= 0),
  completed boolean not null default false,
  engaged boolean not null default false,
  profile_clicked boolean not null default false,
  constraint post_analytics_sessions_session_id_len check (char_length(session_id) between 1 and 128),
  constraint post_analytics_sessions_source_len check (char_length(source) between 1 and 48),
  constraint post_analytics_sessions_device_len check (char_length(device_type) between 1 and 32),
  unique (post_id, viewer_id, session_id)
);

create index if not exists post_analytics_sessions_post_seen_idx
  on public.post_analytics_sessions (post_id, first_seen_at desc);
create index if not exists post_analytics_sessions_post_source_idx
  on public.post_analytics_sessions (post_id, source);
create index if not exists post_analytics_sessions_post_follower_idx
  on public.post_analytics_sessions (post_id, is_follower);

alter table public.post_analytics_sessions enable row level security;

-- Raw session rows are intentionally not exposed to normal clients. All writes
-- and owner reads go through SECURITY DEFINER RPCs below.
revoke all on table public.post_analytics_sessions from anon, authenticated;

create or replace function public.track_post_analytics_session(
  p_post_id uuid,
  p_session_id text,
  p_source text default 'unknown',
  p_device_type text default 'unknown',
  p_dwell_ms bigint default 0,
  p_watch_ms bigint default 0,
  p_max_position_ms bigint default 0,
  p_media_duration_ms bigint default null,
  p_completed boolean default false,
  p_engaged boolean default false,
  p_profile_clicked boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner_id uuid;
  v_is_follower boolean := false;
begin
  if v_viewer_id is null or p_post_id is null or nullif(trim(p_session_id), '') is null then
    return;
  end if;

  select p.user_id
    into v_owner_id
  from public.posts p
  where p.id = p_post_id
    and coalesce(p.is_hidden, false) = false;

  -- Do not let creators inflate their own analytics.
  if v_owner_id is null or v_owner_id = v_viewer_id then
    return;
  end if;

  select exists (
    select 1
    from public.follows f
    where f.follower_id = v_viewer_id
      and f.following_id = v_owner_id
  ) into v_is_follower;

  insert into public.post_analytics_sessions (
    post_id,
    viewer_id,
    session_id,
    source,
    device_type,
    is_follower,
    first_seen_at,
    last_seen_at,
    dwell_ms,
    watch_ms,
    max_position_ms,
    media_duration_ms,
    completed,
    engaged,
    profile_clicked
  ) values (
    p_post_id,
    v_viewer_id,
    left(coalesce(nullif(trim(p_session_id), ''), 'unknown'), 128),
    left(coalesce(nullif(trim(p_source), ''), 'unknown'), 48),
    left(coalesce(nullif(trim(p_device_type), ''), 'unknown'), 32),
    v_is_follower,
    now(),
    now(),
    greatest(coalesce(p_dwell_ms, 0), 0),
    greatest(coalesce(p_watch_ms, 0), 0),
    greatest(coalesce(p_max_position_ms, 0), 0),
    case when p_media_duration_ms is null then null else greatest(p_media_duration_ms, 0) end,
    coalesce(p_completed, false),
    coalesce(p_engaged, false),
    coalesce(p_profile_clicked, false)
  )
  on conflict (post_id, viewer_id, session_id) do update set
    source = case
      when post_analytics_sessions.source = 'unknown' then excluded.source
      else post_analytics_sessions.source
    end,
    device_type = case
      when post_analytics_sessions.device_type = 'unknown' then excluded.device_type
      else post_analytics_sessions.device_type
    end,
    is_follower = excluded.is_follower,
    last_seen_at = now(),
    dwell_ms = greatest(post_analytics_sessions.dwell_ms, excluded.dwell_ms),
    watch_ms = greatest(post_analytics_sessions.watch_ms, excluded.watch_ms),
    max_position_ms = greatest(post_analytics_sessions.max_position_ms, excluded.max_position_ms),
    media_duration_ms = greatest(
      coalesce(post_analytics_sessions.media_duration_ms, 0),
      coalesce(excluded.media_duration_ms, 0)
    ),
    completed = post_analytics_sessions.completed or excluded.completed,
    engaged = post_analytics_sessions.engaged or excluded.engaged,
    profile_clicked = post_analytics_sessions.profile_clicked or excluded.profile_clicked;
end;
$$;

revoke all on function public.track_post_analytics_session(uuid, text, text, text, bigint, bigint, bigint, bigint, boolean, boolean, boolean) from public;
grant execute on function public.track_post_analytics_session(uuid, text, text, text, bigint, bigint, bigint, bigint, boolean, boolean, boolean) to authenticated;

create or replace function public.get_post_insights(
  p_post_id uuid,
  p_days integer default 28
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.posts%rowtype;
  v_days integer := greatest(1, least(coalesce(p_days, 28), 365));
  v_since timestamptz;
  v_views bigint := 0;
  v_reach bigint := 0;
  v_likes bigint := 0;
  v_comments bigint := 0;
  v_shares bigint := 0;
  v_reposts bigint := 0;
  v_saves bigint := 0;
  v_interactions bigint := 0;
  v_followers bigint := 0;
  v_non_followers bigint := 0;
  v_timeline jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_retention jsonb := '[]'::jsonb;
  v_device_mix jsonb := '[]'::jsonb;
  v_session_count bigint := 0;
  v_video_sessions bigint := 0;
  v_total_watch_ms bigint := 0;
  v_avg_watch_ms bigint := 0;
  v_avg_dwell_ms bigint := 0;
  v_completion_rate numeric := 0;
  v_skip_rate numeric := 0;
  v_profile_clicks bigint := 0;
  v_telemetry_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if v_post.user_id <> v_user_id and not exists (
    select 1
    from public.post_collaborators pc
    where pc.post_id = p_post_id
      and pc.user_id = v_user_id
      and pc.status = 'accepted'
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_since := date_trunc('day', now()) - ((v_days - 1) || ' days')::interval;

  select count(distinct pv.user_id)
    into v_reach
  from public.post_views pv
  where pv.post_id = p_post_id;

  v_views := greatest(coalesce(v_post.views_count, 0)::bigint, v_reach);

  select greatest(coalesce(v_post.likes_count, 0)::bigint, count(*))
    into v_likes
  from public.post_likes pl
  where pl.post_id = p_post_id;

  select greatest(coalesce(v_post.comments_count, 0)::bigint, count(*))
    into v_comments
  from public.comments c
  where c.post_id = p_post_id;

  v_shares := greatest(coalesce(v_post.shares_count, 0)::bigint, 0);

  select greatest(coalesce(v_post.reposts_count, 0)::bigint, count(*))
    into v_reposts
  from public.reposts r
  where r.post_id = p_post_id;

  select greatest(coalesce(v_post.bookmarks_count, 0)::bigint, count(*))
    into v_saves
  from public.bookmarks b
  where b.post_id = p_post_id;

  v_interactions := v_likes + v_comments + v_shares + v_reposts + v_saves;

  with distinct_viewers as (
    select distinct pv.user_id
    from public.post_views pv
    where pv.post_id = p_post_id
  )
  select
    count(*) filter (where exists (
      select 1 from public.follows f
      where f.follower_id = dv.user_id
        and f.following_id = v_post.user_id
    )),
    count(*) filter (where not exists (
      select 1 from public.follows f
      where f.follower_id = dv.user_id
        and f.following_id = v_post.user_id
    ))
  into v_followers, v_non_followers
  from distinct_viewers dv;

  with days as (
    select generate_series(
      date_trunc('day', now()) - ((v_days - 1) || ' days')::interval,
      date_trunc('day', now()),
      interval '1 day'
    ) as day
  ), view_counts as (
    select date_trunc('day', pv.viewed_at) as day, count(distinct pv.user_id)::bigint as views
    from public.post_views pv
    where pv.post_id = p_post_id and pv.viewed_at >= v_since
    group by 1
  ), interaction_counts as (
    select day, sum(value)::bigint as interactions
    from (
      select date_trunc('day', pl.created_at) as day, count(*)::bigint as value
      from public.post_likes pl
      where pl.post_id = p_post_id and pl.created_at >= v_since
      group by 1
      union all
      select date_trunc('day', c.created_at), count(*)::bigint
      from public.comments c
      where c.post_id = p_post_id and c.created_at >= v_since
      group by 1
      union all
      select date_trunc('day', r.created_at), count(*)::bigint
      from public.reposts r
      where r.post_id = p_post_id and r.created_at >= v_since
      group by 1
      union all
      select date_trunc('day', b.created_at), count(*)::bigint
      from public.bookmarks b
      where b.post_id = p_post_id and b.created_at >= v_since
      group by 1
    ) x
    group by day
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'views', coalesce(vc.views, 0),
      'interactions', coalesce(ic.interactions, 0)
    ) order by d.day
  ), '[]'::jsonb)
  into v_timeline
  from days d
  left join view_counts vc on vc.day = d.day
  left join interaction_counts ic on ic.day = d.day;

  select
    count(*),
    count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0),
    coalesce(sum(s.watch_ms), 0),
    coalesce(avg(s.watch_ms)::bigint, 0),
    coalesce(avg(s.dwell_ms)::bigint, 0),
    coalesce(100.0 * count(*) filter (where s.completed) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0),
    coalesce(100.0 * count(*) filter (
      where s.media_duration_ms is not null
        and s.media_duration_ms > 0
        and s.max_position_ms < least(3000::bigint, greatest(1000::bigint, s.media_duration_ms / 5))
    ) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0),
    count(*) filter (where s.profile_clicked),
    min(s.first_seen_at)
  into
    v_session_count,
    v_video_sessions,
    v_total_watch_ms,
    v_avg_watch_ms,
    v_avg_dwell_ms,
    v_completion_rate,
    v_skip_rate,
    v_profile_clicks,
    v_telemetry_started_at
  from public.post_analytics_sessions s
  where s.post_id = p_post_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source', source,
      'sessions', sessions,
      'percentage', round(100.0 * sessions / nullif(total_sessions, 0), 1)
    ) order by sessions desc
  ), '[]'::jsonb)
  into v_sources
  from (
    select
      s.source,
      count(*)::bigint as sessions,
      sum(count(*)) over ()::bigint as total_sessions
    from public.post_analytics_sessions s
    where s.post_id = p_post_id
    group by s.source
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'device', device_type,
      'sessions', sessions,
      'percentage', round(100.0 * sessions / nullif(total_sessions, 0), 1)
    ) order by sessions desc
  ), '[]'::jsonb)
  into v_device_mix
  from (
    select
      s.device_type,
      count(*)::bigint as sessions,
      sum(count(*)) over ()::bigint as total_sessions
    from public.post_analytics_sessions s
    where s.post_id = p_post_id
    group by s.device_type
  ) q;

  if v_video_sessions > 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'position', bucket * 10,
        'viewers', viewers,
        'rate', round(100.0 * viewers / nullif(v_video_sessions, 0), 1)
      ) order by bucket
    ), '[]'::jsonb)
    into v_retention
    from (
      select
        bucket,
        count(*) filter (
          where s.media_duration_ms > 0
            and s.max_position_ms >= (s.media_duration_ms * bucket / 10)
        )::bigint as viewers
      from generate_series(0, 10) bucket
      cross join public.post_analytics_sessions s
      where s.post_id = p_post_id
        and s.media_duration_ms is not null
        and s.media_duration_ms > 0
      group by bucket
    ) r;
  end if;

  return jsonb_build_object(
    'post', jsonb_build_object(
      'id', v_post.id,
      'created_at', v_post.created_at,
      'content_type', v_post.content_type,
      'media_type', v_post.media_type,
      'video_duration', v_post.video_duration
    ),
    'overview', jsonb_build_object(
      'views', v_views,
      'reach', v_reach,
      'likes', v_likes,
      'comments', v_comments,
      'shares', v_shares,
      'reposts', v_reposts,
      'saves', v_saves,
      'interactions', v_interactions,
      'engagement_rate', round(100.0 * v_interactions / nullif(v_reach, 0), 1),
      'profile_clicks', v_profile_clicks
    ),
    'audience', jsonb_build_object(
      'followers', v_followers,
      'non_followers', v_non_followers,
      'followers_percentage', round(100.0 * v_followers / nullif(v_followers + v_non_followers, 0), 1),
      'non_followers_percentage', round(100.0 * v_non_followers / nullif(v_followers + v_non_followers, 0), 1)
    ),
    'watch', jsonb_build_object(
      'sessions', v_session_count,
      'video_sessions', v_video_sessions,
      'total_watch_ms', v_total_watch_ms,
      'average_watch_ms', v_avg_watch_ms,
      'average_dwell_ms', v_avg_dwell_ms,
      'completion_rate', round(v_completion_rate, 1),
      'skip_rate', round(v_skip_rate, 1)
    ),
    'timeline', v_timeline,
    'sources', v_sources,
    'devices', v_device_mix,
    'retention', v_retention,
    'data_quality', jsonb_build_object(
      'historical_metrics', true,
      'telemetry_sessions', v_session_count,
      'telemetry_started_at', v_telemetry_started_at,
      'window_days', v_days
    )
  );
end;
$$;

revoke all on function public.get_post_insights(uuid, integer) from public;
grant execute on function public.get_post_insights(uuid, integer) to authenticated;

comment on table public.post_analytics_sessions is
  'Privacy-safe per-viewer session telemetry for owner-only aggregated post insights.';
comment on function public.get_post_insights(uuid, integer) is
  'Returns aggregated post analytics to the post owner or accepted collaborator; never exposes raw viewer session telemetry.';
