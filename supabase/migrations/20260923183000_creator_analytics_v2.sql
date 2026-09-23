-- Creator analytics v2
-- - canonical share events with idempotent client event ids
-- - server-side engagement enrichment for canonical interactions
-- - bounded/normalized post telemetry to resist polluted analytics
-- - time-window-correct watch/source/device/retention metrics
-- - creator/collaborator-only aggregate insights remain SECURITY DEFINER

create table if not exists public.post_share_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  client_event_id text not null,
  channel text not null default 'other',
  destination text null,
  created_at timestamptz not null default now(),
  constraint post_share_events_client_event_len check (char_length(client_event_id) between 8 and 128),
  constraint post_share_events_channel_len check (char_length(channel) between 1 and 32),
  constraint post_share_events_destination_len check (destination is null or char_length(destination) <= 64),
  unique (actor_id, post_id, client_event_id)
);

create index if not exists post_share_events_post_created_idx
  on public.post_share_events (post_id, created_at desc);
create index if not exists post_share_events_actor_created_idx
  on public.post_share_events (actor_id, created_at desc);

alter table public.post_share_events enable row level security;
drop policy if exists "Direct client access denied" on public.post_share_events;
create policy "Direct client access denied"
  on public.post_share_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.post_share_events from anon, authenticated;

create or replace function public.track_post_share(
  p_post_id uuid,
  p_channel text default 'other',
  p_destination text default null,
  p_client_event_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_channel text;
  v_destination text;
  v_event_id text;
  v_inserted boolean := false;
begin
  if v_actor is null or p_post_id is null then
    return false;
  end if;

  if not public.can_view_post(p_post_id) then
    return false;
  end if;

  v_channel := case lower(coalesce(nullif(trim(p_channel), ''), 'other'))
    when 'internal_chat' then 'internal_chat'
    when 'copy_link' then 'copy_link'
    when 'external' then 'external'
    when 'native_share' then 'native_share'
    when 'repost' then 'repost'
    else 'other'
  end;

  v_destination := nullif(left(trim(coalesce(p_destination, '')), 64), '');
  v_event_id := left(
    coalesce(
      nullif(trim(p_client_event_id), ''),
      md5(random()::text || clock_timestamp()::text || v_actor::text || p_post_id::text)
    ),
    128
  );

  insert into public.post_share_events (
    post_id,
    actor_id,
    client_event_id,
    channel,
    destination
  ) values (
    p_post_id,
    v_actor,
    v_event_id,
    v_channel,
    v_destination
  )
  on conflict (actor_id, post_id, client_event_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted then
    update public.posts
    set shares_count = coalesce(shares_count, 0) + 1
    where id = p_post_id;
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.track_post_share(uuid, text, text, text) from public, anon;
grant execute on function public.track_post_share(uuid, text, text, text) to authenticated, service_role;

-- Interaction tables are canonical. Whenever an interaction is inserted, mark
-- the viewer's most recent qualified analytics session as engaged. This works
-- across Home, Profile, Search, Videos and future surfaces without duplicating
-- analytics glue in every UI component.
create or replace function public.mark_latest_post_analytics_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := to_jsonb(new);
  v_post_id uuid;
  v_user_id uuid;
  v_session_id uuid;
begin
  begin
    v_post_id := nullif(v_payload ->> 'post_id', '')::uuid;
    v_user_id := coalesce(
      nullif(v_payload ->> 'user_id', '')::uuid,
      nullif(v_payload ->> 'actor_id', '')::uuid
    );
  exception when others then
    return new;
  end;

  if v_post_id is null or v_user_id is null then
    return new;
  end if;

  select s.id
    into v_session_id
  from public.post_analytics_sessions s
  where s.post_id = v_post_id
    and s.viewer_id = v_user_id
    and s.last_seen_at >= now() - interval '24 hours'
  order by s.last_seen_at desc
  limit 1;

  if v_session_id is not null then
    update public.post_analytics_sessions
    set engaged = true
    where id = v_session_id;
  end if;

  return new;
end;
$$;

revoke all on function public.mark_latest_post_analytics_engagement() from public, anon, authenticated;

drop trigger if exists post_likes_mark_analytics_engagement on public.post_likes;
create trigger post_likes_mark_analytics_engagement
  after insert on public.post_likes
  for each row execute function public.mark_latest_post_analytics_engagement();

drop trigger if exists comments_mark_analytics_engagement on public.comments;
create trigger comments_mark_analytics_engagement
  after insert on public.comments
  for each row execute function public.mark_latest_post_analytics_engagement();

drop trigger if exists reposts_mark_analytics_engagement on public.reposts;
create trigger reposts_mark_analytics_engagement
  after insert on public.reposts
  for each row execute function public.mark_latest_post_analytics_engagement();

drop trigger if exists bookmarks_mark_analytics_engagement on public.bookmarks;
create trigger bookmarks_mark_analytics_engagement
  after insert on public.bookmarks
  for each row execute function public.mark_latest_post_analytics_engagement();

drop trigger if exists post_share_events_mark_analytics_engagement on public.post_share_events;
create trigger post_share_events_mark_analytics_engagement
  after insert on public.post_share_events
  for each row execute function public.mark_latest_post_analytics_engagement();

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
  v_source text;
  v_device text;
  v_dwell_ms bigint;
  v_watch_ms bigint;
  v_max_position_ms bigint;
  v_media_duration_ms bigint;
begin
  if v_viewer_id is null or p_post_id is null or nullif(trim(p_session_id), '') is null then
    return;
  end if;

  select p.user_id
    into v_owner_id
  from public.posts p
  where p.id = p_post_id
    and coalesce(p.is_hidden, false) = false;

  -- Creators do not inflate their own audience/watch analytics.
  if v_owner_id is null or v_owner_id = v_viewer_id then
    return;
  end if;

  select exists (
    select 1
    from public.follows f
    where f.follower_id = v_viewer_id
      and f.following_id = v_owner_id
  ) into v_is_follower;

  v_source := case lower(coalesce(nullif(trim(p_source), ''), 'unknown'))
    when 'home' then 'home'
    when 'discover' then 'discover'
    when 'search' then 'search'
    when 'videos' then 'videos'
    when 'profile' then 'profile'
    when 'permalink' then 'permalink'
    when 'messages' then 'messages'
    when 'other' then 'other'
    else 'unknown'
  end;

  v_device := case lower(coalesce(nullif(trim(p_device_type), ''), 'unknown'))
    when 'mobile' then 'mobile'
    when 'tablet' then 'tablet'
    when 'desktop' then 'desktop'
    else 'unknown'
  end;

  -- Bound untrusted client telemetry so one malformed/spoofed call cannot
  -- dominate creator averages. Twelve hours covers legitimate long sessions.
  v_dwell_ms := least(greatest(coalesce(p_dwell_ms, 0), 0), 43200000::bigint);
  v_media_duration_ms := case
    when p_media_duration_ms is null then null
    else least(greatest(p_media_duration_ms, 0), 86400000::bigint)
  end;
  v_watch_ms := least(
    greatest(coalesce(p_watch_ms, 0), 0),
    v_dwell_ms
  );
  v_max_position_ms := least(
    greatest(coalesce(p_max_position_ms, 0), 0),
    coalesce(v_media_duration_ms, 86400000::bigint)
  );

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
    left(trim(p_session_id), 128),
    v_source,
    v_device,
    v_is_follower,
    now(),
    now(),
    v_dwell_ms,
    v_watch_ms,
    v_max_position_ms,
    v_media_duration_ms,
    coalesce(p_completed, false),
    coalesce(p_engaged, false),
    coalesce(p_profile_clicked, false)
  )
  on conflict (post_id, viewer_id, session_id) do update set
    source = case
      when post_analytics_sessions.source in ('unknown', 'other') then excluded.source
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
    media_duration_ms = case
      when post_analytics_sessions.media_duration_ms is null and excluded.media_duration_ms is null then null
      else greatest(
        coalesce(post_analytics_sessions.media_duration_ms, 0),
        coalesce(excluded.media_duration_ms, 0)
      )
    end,
    completed = post_analytics_sessions.completed or excluded.completed,
    engaged = post_analytics_sessions.engaged or excluded.engaged,
    profile_clicked = post_analytics_sessions.profile_clicked or excluded.profile_clicked;
end;
$$;

revoke all on function public.track_post_analytics_session(uuid, text, text, text, bigint, bigint, bigint, bigint, boolean, boolean, boolean) from public, anon;
grant execute on function public.track_post_analytics_session(uuid, text, text, text, bigint, bigint, bigint, bigint, boolean, boolean, boolean) to authenticated, service_role;

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
  v_window_reach bigint := 0;
  v_likes bigint := 0;
  v_comments bigint := 0;
  v_shares bigint := 0;
  v_shares_canonical bigint := 0;
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
  v_telemetry_viewers bigint := 0;
  v_video_sessions bigint := 0;
  v_total_watch_ms bigint := 0;
  v_avg_watch_ms bigint := 0;
  v_avg_dwell_ms bigint := 0;
  v_completion_rate numeric := 0;
  v_skip_rate numeric := 0;
  v_profile_clicks bigint := 0;
  v_telemetry_started_at timestamptz;
  v_share_tracking_started_at timestamptz;
  v_last_event_at timestamptz;
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

  select count(distinct pv.user_id)
    into v_window_reach
  from public.post_views pv
  where pv.post_id = p_post_id
    and pv.viewed_at >= v_since;

  v_views := greatest(coalesce(v_post.views_count, 0)::bigint, v_reach);

  select greatest(coalesce(v_post.likes_count, 0)::bigint, count(*))
    into v_likes
  from public.post_likes pl
  where pl.post_id = p_post_id;

  select greatest(coalesce(v_post.comments_count, 0)::bigint, count(*))
    into v_comments
  from public.comments c
  where c.post_id = p_post_id;

  select count(*), min(created_at)
    into v_shares_canonical, v_share_tracking_started_at
  from public.post_share_events
  where post_id = p_post_id;

  v_shares := greatest(coalesce(v_post.shares_count, 0)::bigint, v_shares_canonical);

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
      union all
      select date_trunc('day', se.created_at), count(*)::bigint
      from public.post_share_events se
      where se.post_id = p_post_id and se.created_at >= v_since
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

  select min(s.first_seen_at), count(*) filter (where s.profile_clicked)
    into v_telemetry_started_at, v_profile_clicks
  from public.post_analytics_sessions s
  where s.post_id = p_post_id;

  select
    count(*),
    count(distinct s.viewer_id),
    count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0),
    coalesce(sum(s.watch_ms), 0),
    coalesce(avg(s.watch_ms)::bigint, 0),
    coalesce(avg(s.dwell_ms)::bigint, 0),
    coalesce(100.0 * count(*) filter (where s.completed) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0),
    coalesce(100.0 * count(*) filter (
      where s.media_duration_ms is not null
        and s.media_duration_ms > 0
        and s.max_position_ms < least(3000::bigint, greatest(1000::bigint, s.media_duration_ms / 5))
    ) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0)
  into
    v_session_count,
    v_telemetry_viewers,
    v_video_sessions,
    v_total_watch_ms,
    v_avg_watch_ms,
    v_avg_dwell_ms,
    v_completion_rate,
    v_skip_rate
  from public.post_analytics_sessions s
  where s.post_id = p_post_id
    and s.first_seen_at >= v_since;

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
      and s.first_seen_at >= v_since
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
      and s.first_seen_at >= v_since
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
        and s.first_seen_at >= v_since
        and s.media_duration_ms is not null
        and s.media_duration_ms > 0
      group by bucket
    ) r;
  end if;

  select max(event_at)
    into v_last_event_at
  from (
    select max(viewed_at) as event_at from public.post_views where post_id = p_post_id
    union all select max(created_at) from public.post_likes where post_id = p_post_id
    union all select max(created_at) from public.comments where post_id = p_post_id
    union all select max(created_at) from public.reposts where post_id = p_post_id
    union all select max(created_at) from public.bookmarks where post_id = p_post_id
    union all select max(created_at) from public.post_share_events where post_id = p_post_id
    union all select max(last_seen_at) from public.post_analytics_sessions where post_id = p_post_id
  ) events;

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
      'engagement_rate', coalesce(round(100.0 * v_interactions / nullif(v_reach, 0), 1), 0),
      'profile_clicks', v_profile_clicks
    ),
    'audience', jsonb_build_object(
      'followers', v_followers,
      'non_followers', v_non_followers,
      'followers_percentage', coalesce(round(100.0 * v_followers / nullif(v_followers + v_non_followers, 0), 1), 0),
      'non_followers_percentage', coalesce(round(100.0 * v_non_followers / nullif(v_followers + v_non_followers, 0), 1), 0)
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
      'data_source', 'server_rpc',
      'generated_at', now(),
      'telemetry_sessions', v_session_count,
      'telemetry_started_at', v_telemetry_started_at,
      'share_tracking_started_at', v_share_tracking_started_at,
      'last_event_at', v_last_event_at,
      'window_days', v_days,
      'window_reach', v_window_reach,
      'telemetry_coverage_pct', coalesce(round(100.0 * v_telemetry_viewers / nullif(v_window_reach, 0), 1), 0)
    )
  );
end;
$$;

revoke all on function public.get_post_insights(uuid, integer) from public, anon;
grant execute on function public.get_post_insights(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
