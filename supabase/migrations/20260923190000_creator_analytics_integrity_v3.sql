-- Creator analytics integrity v3
-- Creators/collaborators are not audience. Public view counters are canonical
-- post_views rows, while creator insights combine historical unique rows with
-- qualified telemetry sessions without double-counting the first session.

-- Remove invalid creator-generated view telemetry accumulated by the legacy
-- counter. This is analytics correction only; no user content is removed.
delete from public.post_views pv
using public.posts p
where p.id = pv.post_id
  and pv.user_id = p.user_id;

delete from public.post_views pv
where exists (
  select 1
  from public.post_collaborators pc
  where pc.post_id = pv.post_id
    and pc.user_id = pv.user_id
    and pc.status = 'accepted'
);

-- Keep the legacy denormalized counter aligned for old UI surfaces while the
-- canonical source of truth remains post_views.
update public.posts p
set views_count = least((
  select count(*)
  from public.post_views pv
  where pv.post_id = p.id
), 2147483647)::integer;

create or replace function public.guard_creator_post_view()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.post_id is null or new.user_id is null then
    return null;
  end if;

  select p.user_id into v_owner
  from public.posts p
  where p.id = new.post_id;

  if v_owner is null or new.user_id = v_owner then
    return null;
  end if;

  if exists (
    select 1
    from public.post_collaborators pc
    where pc.post_id = new.post_id
      and pc.user_id = new.user_id
      and pc.status = 'accepted'
  ) then
    return null;
  end if;

  -- Direct-client fallback and the RPC both execute under the viewer session.
  if auth.uid() is not null and auth.uid() = new.user_id and not public.can_view_post(new.post_id) then
    return null;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_creator_post_view() from public, anon, authenticated;

drop trigger if exists post_views_guard_creator on public.post_views;
create trigger post_views_guard_creator
  before insert on public.post_views
  for each row execute function public.guard_creator_post_view();

create or replace function public.sync_post_views_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  if v_post_id is not null then
    update public.posts p
    set views_count = least((
      select count(*)
      from public.post_views pv
      where pv.post_id = v_post_id
    ), 2147483647)::integer
    where p.id = v_post_id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.sync_post_views_count() from public, anon, authenticated;

drop trigger if exists post_views_sync_count on public.post_views;
create trigger post_views_sync_count
  after insert or delete on public.post_views
  for each row execute function public.sync_post_views_count();

create or replace function public.increment_post_views(post_id_param uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null or post_id_param is null then
    return;
  end if;

  if not public.can_view_post(post_id_param) then
    return;
  end if;

  select p.user_id into v_owner
  from public.posts p
  where p.id = post_id_param;

  if v_owner is null or v_owner = v_user then
    return;
  end if;

  if exists (
    select 1
    from public.post_collaborators pc
    where pc.post_id = post_id_param
      and pc.user_id = v_user
      and pc.status = 'accepted'
  ) then
    return;
  end if;

  insert into public.post_views (post_id, user_id)
  values (post_id_param, v_user)
  on conflict (post_id, user_id) do nothing;
end;
$$;
revoke all on function public.increment_post_views(uuid) from public, anon;
grant execute on function public.increment_post_views(uuid) to authenticated, service_role;

-- Creator/collaborator sessions are not audience sessions.
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

  select p.user_id into v_owner_id
  from public.posts p
  where p.id = p_post_id
    and coalesce(p.is_hidden, false) = false;

  if v_owner_id is null or v_owner_id = v_viewer_id then
    return;
  end if;

  if exists (
    select 1
    from public.post_collaborators pc
    where pc.post_id = p_post_id
      and pc.user_id = v_viewer_id
      and pc.status = 'accepted'
  ) then
    return;
  end if;

  select exists (
    select 1 from public.follows f
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

  v_dwell_ms := least(greatest(coalesce(p_dwell_ms, 0), 0), 43200000::bigint);
  v_media_duration_ms := case
    when p_media_duration_ms is null then null
    else least(greatest(p_media_duration_ms, 0), 86400000::bigint)
  end;
  v_watch_ms := least(greatest(coalesce(p_watch_ms, 0), 0), v_dwell_ms);
  v_max_position_ms := least(
    greatest(coalesce(p_max_position_ms, 0), 0),
    coalesce(v_media_duration_ms, 86400000::bigint)
  );

  insert into public.post_analytics_sessions (
    post_id, viewer_id, session_id, source, device_type, is_follower,
    first_seen_at, last_seen_at, dwell_ms, watch_ms, max_position_ms,
    media_duration_ms, completed, engaged, profile_clicked
  ) values (
    p_post_id, v_viewer_id, left(trim(p_session_id), 128), v_source, v_device,
    v_is_follower, now(), now(), v_dwell_ms, v_watch_ms, v_max_position_ms,
    v_media_duration_ms, coalesce(p_completed, false), coalesce(p_engaged, false),
    coalesce(p_profile_clicked, false)
  )
  on conflict (post_id, viewer_id, session_id) do update set
    source = case
      when post_analytics_sessions.source in ('unknown', 'other')
        and excluded.source not in ('unknown', 'other') then excluded.source
      else post_analytics_sessions.source
    end,
    device_type = case
      when post_analytics_sessions.device_type = 'unknown' and excluded.device_type <> 'unknown'
        then excluded.device_type
      else post_analytics_sessions.device_type
    end,
    is_follower = excluded.is_follower,
    last_seen_at = now(),
    dwell_ms = greatest(post_analytics_sessions.dwell_ms, excluded.dwell_ms),
    watch_ms = greatest(post_analytics_sessions.watch_ms, excluded.watch_ms),
    max_position_ms = greatest(post_analytics_sessions.max_position_ms, excluded.max_position_ms),
    media_duration_ms = case
      when post_analytics_sessions.media_duration_ms is null and excluded.media_duration_ms is null then null
      else greatest(coalesce(post_analytics_sessions.media_duration_ms, 0), coalesce(excluded.media_duration_ms, 0))
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
  v_historical_views bigint := 0;
  v_telemetry_views bigint := 0;
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
    select 1 from public.post_collaborators pc
    where pc.post_id = p_post_id and pc.user_id = v_user_id and pc.status = 'accepted'
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_since := date_trunc('day', now()) - ((v_days - 1) || ' days')::interval;

  -- Sessions represent repeat qualified views. Historical post_views rows are
  -- first-view unique rows; count only those that do not have a telemetry
  -- session near the same moment so the first qualified session is not doubled.
  select count(*)::bigint
    into v_telemetry_views
  from public.post_analytics_sessions s
  where s.post_id = p_post_id
    and s.viewer_id <> v_post.user_id
    and not exists (
      select 1 from public.post_collaborators pc
      where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
    );

  select count(*)::bigint
    into v_historical_views
  from public.post_views pv
  where pv.post_id = p_post_id
    and pv.user_id is not null
    and pv.user_id <> v_post.user_id
    and not exists (
      select 1 from public.post_collaborators pc
      where pc.post_id = p_post_id and pc.user_id = pv.user_id and pc.status = 'accepted'
    )
    and not exists (
      select 1
      from public.post_analytics_sessions s
      where s.post_id = p_post_id
        and s.viewer_id = pv.user_id
        and abs(extract(epoch from (s.first_seen_at - pv.viewed_at))) <= 300
    );

  v_views := v_historical_views + v_telemetry_views;

  select count(*)::bigint
    into v_reach
  from (
    select pv.user_id as viewer_id
    from public.post_views pv
    where pv.post_id = p_post_id
      and pv.user_id is not null
      and pv.user_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = pv.user_id and pc.status = 'accepted'
      )
    union
    select s.viewer_id
    from public.post_analytics_sessions s
    where s.post_id = p_post_id
      and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
  ) viewers;

  select count(*)::bigint
    into v_window_reach
  from (
    select pv.user_id as viewer_id
    from public.post_views pv
    where pv.post_id = p_post_id
      and pv.viewed_at >= v_since
      and pv.user_id is not null
      and pv.user_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = pv.user_id and pc.status = 'accepted'
      )
    union
    select s.viewer_id
    from public.post_analytics_sessions s
    where s.post_id = p_post_id
      and s.first_seen_at >= v_since
      and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
  ) viewers;

  select count(*)::bigint into v_likes from public.post_likes where post_id = p_post_id;
  select count(*)::bigint into v_comments from public.comments where post_id = p_post_id;
  select count(*)::bigint, min(created_at) into v_shares_canonical, v_share_tracking_started_at
    from public.post_share_events where post_id = p_post_id;
  v_shares := greatest(coalesce(v_post.shares_count, 0)::bigint, v_shares_canonical);
  select count(*)::bigint into v_reposts from public.reposts where post_id = p_post_id;
  select count(*)::bigint into v_saves from public.bookmarks where post_id = p_post_id;
  v_interactions := v_likes + v_comments + v_shares + v_reposts + v_saves;

  with distinct_viewers as (
    select pv.user_id as viewer_id
    from public.post_views pv
    where pv.post_id = p_post_id and pv.user_id is not null
      and pv.user_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = pv.user_id and pc.status = 'accepted'
      )
    union
    select s.viewer_id
    from public.post_analytics_sessions s
    where s.post_id = p_post_id and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
  )
  select
    count(*) filter (where exists (
      select 1 from public.follows f
      where f.follower_id = dv.viewer_id and f.following_id = v_post.user_id
    ))::bigint,
    count(*) filter (where not exists (
      select 1 from public.follows f
      where f.follower_id = dv.viewer_id and f.following_id = v_post.user_id
    ))::bigint
  into v_followers, v_non_followers
  from distinct_viewers dv;

  with days as (
    select generate_series(v_since, date_trunc('day', now()), interval '1 day') as day
  ), historical_view_counts as (
    select date_trunc('day', pv.viewed_at) as day, count(*)::bigint as views
    from public.post_views pv
    where pv.post_id = p_post_id
      and pv.viewed_at >= v_since
      and pv.user_id is not null
      and pv.user_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = pv.user_id and pc.status = 'accepted'
      )
      and not exists (
        select 1 from public.post_analytics_sessions s
        where s.post_id = p_post_id and s.viewer_id = pv.user_id
          and abs(extract(epoch from (s.first_seen_at - pv.viewed_at))) <= 300
      )
    group by 1
  ), telemetry_view_counts as (
    select date_trunc('day', s.first_seen_at) as day, count(*)::bigint as views
    from public.post_analytics_sessions s
    where s.post_id = p_post_id
      and s.first_seen_at >= v_since
      and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
    group by 1
  ), view_counts as (
    select day, sum(views)::bigint as views
    from (
      select * from historical_view_counts
      union all
      select * from telemetry_view_counts
    ) x group by day
  ), interaction_counts as (
    select day, sum(value)::bigint as interactions
    from (
      select date_trunc('day', created_at) day, count(*)::bigint value
      from public.post_likes where post_id = p_post_id and created_at >= v_since group by 1
      union all
      select date_trunc('day', created_at), count(*)::bigint
      from public.comments where post_id = p_post_id and created_at >= v_since group by 1
      union all
      select date_trunc('day', created_at), count(*)::bigint
      from public.reposts where post_id = p_post_id and created_at >= v_since group by 1
      union all
      select date_trunc('day', created_at), count(*)::bigint
      from public.bookmarks where post_id = p_post_id and created_at >= v_since group by 1
      union all
      select date_trunc('day', created_at), count(*)::bigint
      from public.post_share_events where post_id = p_post_id and created_at >= v_since group by 1
    ) x group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'views', coalesce(vc.views, 0),
    'interactions', coalesce(ic.interactions, 0)
  ) order by d.day), '[]'::jsonb)
  into v_timeline
  from days d
  left join view_counts vc on vc.day = d.day
  left join interaction_counts ic on ic.day = d.day;

  select min(s.first_seen_at), count(*) filter (where s.profile_clicked)
    into v_telemetry_started_at, v_profile_clicks
  from public.post_analytics_sessions s
  where s.post_id = p_post_id
    and s.viewer_id <> v_post.user_id
    and not exists (
      select 1 from public.post_collaborators pc
      where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
    );

  select
    count(*)::bigint,
    count(distinct s.viewer_id)::bigint,
    count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0)::bigint,
    coalesce(sum(s.watch_ms), 0)::bigint,
    coalesce(avg(s.watch_ms)::bigint, 0),
    coalesce(avg(s.dwell_ms)::bigint, 0),
    coalesce(100.0 * count(*) filter (where s.completed) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0),
    coalesce(100.0 * count(*) filter (
      where s.media_duration_ms is not null and s.media_duration_ms > 0
        and s.max_position_ms < least(3000::bigint, greatest(1000::bigint, s.media_duration_ms / 5))
    ) / nullif(count(*) filter (where s.media_duration_ms is not null and s.media_duration_ms > 0), 0), 0)
  into v_session_count, v_telemetry_viewers, v_video_sessions, v_total_watch_ms,
       v_avg_watch_ms, v_avg_dwell_ms, v_completion_rate, v_skip_rate
  from public.post_analytics_sessions s
  where s.post_id = p_post_id
    and s.first_seen_at >= v_since
    and s.viewer_id <> v_post.user_id
    and not exists (
      select 1 from public.post_collaborators pc
      where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'source', source, 'sessions', sessions,
    'percentage', round(100.0 * sessions / nullif(total_sessions, 0), 1)
  ) order by sessions desc), '[]'::jsonb)
  into v_sources
  from (
    select s.source, count(*)::bigint sessions, sum(count(*)) over()::bigint total_sessions
    from public.post_analytics_sessions s
    where s.post_id = p_post_id and s.first_seen_at >= v_since
      and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
    group by s.source
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'device', device_type, 'sessions', sessions,
    'percentage', round(100.0 * sessions / nullif(total_sessions, 0), 1)
  ) order by sessions desc), '[]'::jsonb)
  into v_device_mix
  from (
    select s.device_type, count(*)::bigint sessions, sum(count(*)) over()::bigint total_sessions
    from public.post_analytics_sessions s
    where s.post_id = p_post_id and s.first_seen_at >= v_since
      and s.viewer_id <> v_post.user_id
      and not exists (
        select 1 from public.post_collaborators pc
        where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
      )
    group by s.device_type
  ) q;

  if v_video_sessions > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'position', bucket * 10, 'viewers', viewers,
      'rate', round(100.0 * viewers / nullif(v_video_sessions, 0), 1)
    ) order by bucket), '[]'::jsonb)
    into v_retention
    from (
      select bucket, count(*) filter (
        where s.media_duration_ms > 0
          and s.max_position_ms >= (s.media_duration_ms * bucket / 10)
      )::bigint viewers
      from generate_series(0, 10) bucket
      cross join public.post_analytics_sessions s
      where s.post_id = p_post_id and s.first_seen_at >= v_since
        and s.media_duration_ms is not null and s.media_duration_ms > 0
        and s.viewer_id <> v_post.user_id
        and not exists (
          select 1 from public.post_collaborators pc
          where pc.post_id = p_post_id and pc.user_id = s.viewer_id and pc.status = 'accepted'
        )
      group by bucket
    ) r;
  end if;

  select max(event_at) into v_last_event_at
  from (
    select max(viewed_at) event_at from public.post_views where post_id = p_post_id
    union all select max(created_at) from public.post_likes where post_id = p_post_id
    union all select max(created_at) from public.comments where post_id = p_post_id
    union all select max(created_at) from public.reposts where post_id = p_post_id
    union all select max(created_at) from public.bookmarks where post_id = p_post_id
    union all select max(created_at) from public.post_share_events where post_id = p_post_id
    union all select max(last_seen_at) from public.post_analytics_sessions where post_id = p_post_id
  ) events;

  return jsonb_build_object(
    'post', jsonb_build_object(
      'id', v_post.id, 'created_at', v_post.created_at,
      'content_type', v_post.content_type, 'media_type', v_post.media_type,
      'video_duration', v_post.video_duration
    ),
    'overview', jsonb_build_object(
      'views', v_views, 'reach', v_reach, 'likes', v_likes, 'comments', v_comments,
      'shares', v_shares, 'reposts', v_reposts, 'saves', v_saves,
      'interactions', v_interactions,
      'engagement_rate', coalesce(round(100.0 * v_interactions / nullif(v_reach, 0), 1), 0),
      'profile_clicks', v_profile_clicks
    ),
    'audience', jsonb_build_object(
      'followers', coalesce(v_followers, 0), 'non_followers', coalesce(v_non_followers, 0),
      'followers_percentage', coalesce(round(100.0 * v_followers / nullif(v_followers + v_non_followers, 0), 1), 0),
      'non_followers_percentage', coalesce(round(100.0 * v_non_followers / nullif(v_followers + v_non_followers, 0), 1), 0)
    ),
    'watch', jsonb_build_object(
      'sessions', v_session_count, 'video_sessions', v_video_sessions,
      'total_watch_ms', v_total_watch_ms, 'average_watch_ms', v_avg_watch_ms,
      'average_dwell_ms', v_avg_dwell_ms, 'completion_rate', round(v_completion_rate, 1),
      'skip_rate', round(v_skip_rate, 1)
    ),
    'timeline', v_timeline, 'sources', v_sources, 'devices', v_device_mix, 'retention', v_retention,
    'data_quality', jsonb_build_object(
      'historical_metrics', true,
      'historical_views_are_unique', true,
      'views_include_qualified_sessions', true,
      'canonical_share_events', true,
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
