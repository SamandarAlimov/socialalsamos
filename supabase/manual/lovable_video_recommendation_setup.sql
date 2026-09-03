-- ============================================================
-- ALSAMOS / LOVABLE — COMPLETE VIDEO RECOMMENDATION SETUP
-- ============================================================
--
-- One-shot, idempotent bootstrap for projects where the normal Supabase
-- migration chain was not run by Lovable.
--
-- Creates:
--   1) video_watch_segments
--   2) video_watch_sessions
--   3) record_video_watch(...)
--   4) get_video_heatmap(...)
--   5) get_video_watch_stats(...)
--   6) recommendation_global_rankings
--   7) recommendation RLS policies
--   8) automatic global video rank refresh triggers
--   9) initial ranking seed
--
-- Tagged dollar quotes are intentionally used instead of $$ blocks so this
-- file is safe to paste into Lovable SQL Editor.
-- ============================================================


-- ============================================================
-- 1. VIDEO WATCH SEGMENTS (TIMELINE / MOST-REPLAYED HEATMAP)
-- ============================================================

create table if not exists public.video_watch_segments (
  post_id uuid not null references public.posts(id) on delete cascade,
  bucket smallint not null,
  views bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (post_id, bucket),
  constraint video_watch_segments_bucket_range
    check (bucket >= 0 and bucket < 100)
);

create index if not exists video_watch_segments_post_idx
  on public.video_watch_segments (post_id);

alter table public.video_watch_segments enable row level security;

drop policy if exists "video_watch_segments_public_read"
  on public.video_watch_segments;

create policy "video_watch_segments_public_read"
  on public.video_watch_segments
  for select
  using (true);


-- ============================================================
-- 2. VIDEO WATCH SESSIONS (RETENTION / COMPLETION)
-- ============================================================

create table if not exists public.video_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  watched_seconds numeric(10, 2) not null default 0,
  duration_seconds numeric(10, 2),
  max_position_seconds numeric(10, 2),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists video_watch_sessions_post_idx
  on public.video_watch_sessions (post_id, created_at desc);

create index if not exists video_watch_sessions_user_idx
  on public.video_watch_sessions (user_id, created_at desc);

create index if not exists video_watch_sessions_recommendation_idx
  on public.video_watch_sessions (post_id, created_at desc);

alter table public.video_watch_sessions enable row level security;

drop policy if exists "video_watch_sessions_select_own_or_author"
  on public.video_watch_sessions;

create policy "video_watch_sessions_select_own_or_author"
  on public.video_watch_sessions
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = video_watch_sessions.post_id
        and p.user_id = auth.uid()
    )
  );


-- ============================================================
-- 3. RECORD VIDEO WATCH RPC
-- ============================================================

create or replace function public.record_video_watch(
  post_id_param uuid,
  buckets_param integer[] default null,
  watched_seconds_param numeric default 0,
  duration_seconds_param numeric default null,
  max_position_seconds_param numeric default null,
  completed_param boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $record_video_watch_function$
declare
  actor uuid := auth.uid();
  safe_duration numeric;
  safe_watched numeric;
  safe_position numeric;
begin
  if post_id_param is null or actor is null then
    return;
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = post_id_param
  ) then
    return;
  end if;

  safe_duration :=
    nullif(greatest(coalesce(duration_seconds_param, 0), 0), 0);

  safe_watched :=
    greatest(coalesce(watched_seconds_param, 0), 0);

  safe_position :=
    greatest(coalesce(max_position_seconds_param, 0), 0);

  if safe_duration is not null then
    safe_watched := least(safe_watched, safe_duration * 5);
    safe_position := least(safe_position, safe_duration);
  else
    safe_watched := least(safe_watched, 43200);
  end if;

  if safe_watched < 1 then
    return;
  end if;

  insert into public.video_watch_sessions (
    post_id,
    user_id,
    watched_seconds,
    duration_seconds,
    max_position_seconds,
    completed
  )
  values (
    post_id_param,
    actor,
    round(safe_watched, 2),
    case
      when safe_duration is null then null
      else round(safe_duration, 2)
    end,
    round(safe_position, 2),
    coalesce(completed_param, false)
  );

  if buckets_param is null
     or array_length(buckets_param, 1) is null then
    return;
  end if;

  insert into public.video_watch_segments as segment (
    post_id,
    bucket,
    views
  )
  select
    post_id_param,
    bucket_value::smallint,
    count(*)::bigint
  from unnest(buckets_param) as bucket_value
  where bucket_value >= 0
    and bucket_value < 100
  group by bucket_value
  on conflict (post_id, bucket)
  do update set
    views = segment.views + excluded.views,
    updated_at = now();
end;
$record_video_watch_function$;

revoke all
  on function public.record_video_watch(
    uuid,
    integer[],
    numeric,
    numeric,
    numeric,
    boolean
  )
  from public;

grant execute
  on function public.record_video_watch(
    uuid,
    integer[],
    numeric,
    numeric,
    numeric,
    boolean
  )
  to authenticated;


-- ============================================================
-- 4. VIDEO HEATMAP RPC
-- ============================================================

create or replace function public.get_video_heatmap(
  post_id_param uuid
)
returns table (
  bucket smallint,
  views bigint
)
language sql
stable
security definer
set search_path = public
as $video_heatmap_function$
  select
    segment.bucket,
    segment.views
  from public.video_watch_segments segment
  where segment.post_id = post_id_param
  order by segment.bucket;
$video_heatmap_function$;

grant execute
  on function public.get_video_heatmap(uuid)
  to anon, authenticated;


-- ============================================================
-- 5. VIDEO WATCH STATS RPC
-- ============================================================

create or replace function public.get_video_watch_stats(
  post_id_param uuid
)
returns table (
  sessions bigint,
  avg_watched_seconds numeric,
  avg_retention numeric,
  completion_rate numeric
)
language sql
stable
security definer
set search_path = public
as $video_watch_stats_function$
  select
    count(*)::bigint as sessions,

    round(
      coalesce(avg(watch_session.watched_seconds), 0),
      2
    ) as avg_watched_seconds,

    round(
      coalesce(
        avg(
          case
            when watch_session.duration_seconds is not null
              and watch_session.duration_seconds > 0
            then least(
              1,
              watch_session.watched_seconds
                / watch_session.duration_seconds
            )
            else null
          end
        ),
        0
      ),
      4
    ) as avg_retention,

    round(
      (
        count(*) filter (
          where watch_session.completed is true
        )
      )::numeric
        / greatest(count(*), 1),
      4
    ) as completion_rate

  from public.video_watch_sessions watch_session
  where watch_session.post_id = post_id_param;
$video_watch_stats_function$;

grant execute
  on function public.get_video_watch_stats(uuid)
  to authenticated;


-- ============================================================
-- 6. GLOBAL VIDEO RECOMMENDATION RANKINGS
-- ============================================================

create table if not exists public.recommendation_global_rankings (
  post_id uuid primary key
    references public.posts(id)
    on delete cascade,

  content_mode text not null default 'feed',
  score double precision not null default 0,
  quality_score double precision not null default 0,
  engagement_score double precision not null default 0,
  freshness_score double precision not null default 0,
  calculated_at timestamptz not null default now()
);

alter table public.recommendation_global_rankings
  add column if not exists content_mode
    text not null default 'feed';

alter table public.recommendation_global_rankings
  add column if not exists score
    double precision not null default 0;

alter table public.recommendation_global_rankings
  add column if not exists quality_score
    double precision not null default 0;

alter table public.recommendation_global_rankings
  add column if not exists engagement_score
    double precision not null default 0;

alter table public.recommendation_global_rankings
  add column if not exists freshness_score
    double precision not null default 0;

alter table public.recommendation_global_rankings
  add column if not exists calculated_at
    timestamptz not null default now();

create index if not exists recommendation_global_video_score_idx
  on public.recommendation_global_rankings (
    content_mode,
    score desc,
    calculated_at desc
  );

create index if not exists posts_video_recommendation_quality_idx
  on public.posts (
    likes_count desc,
    comments_count desc,
    views_count desc,
    created_at desc
  )
  where visibility = 'public'
    and media_type = 'video';

alter table public.recommendation_global_rankings
  enable row level security;

drop policy if exists "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings;

create policy "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings
  for select
  using (true);

grant select
  on public.recommendation_global_rankings
  to anon, authenticated;


-- ============================================================
-- 7. PERSONAL RECOMMENDATION EVENTS — RLS
-- ============================================================

alter table public.recommendation_events
  enable row level security;

drop policy if exists "recommendation_events_select_own"
  on public.recommendation_events;

create policy "recommendation_events_select_own"
  on public.recommendation_events
  for select
  using (user_id = auth.uid());

drop policy if exists "recommendation_events_insert_own"
  on public.recommendation_events;

create policy "recommendation_events_insert_own"
  on public.recommendation_events
  for insert
  with check (user_id = auth.uid());

grant select, insert
  on public.recommendation_events
  to authenticated;


-- ============================================================
-- 8. GLOBAL VIDEO RANK FUNCTION
-- ============================================================

create or replace function public.recalculate_video_recommendation_rank(
  post_id_param uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $video_rank_function$
declare
  post_row record;

  session_count bigint := 0;
  avg_retention double precision := 0;
  completion_rate double precision := 0;

  freshness double precision := 0;
  engagement double precision := 0;
  quality double precision := 0;
  confidence double precision := 0;
  final_score double precision := 0;
begin
  select
    id,
    media_type,
    visibility,
    created_at,
    coalesce(likes_count, 0)::double precision
      as likes_count,
    coalesce(comments_count, 0)::double precision
      as comments_count,
    coalesce(shares_count, 0)::double precision
      as shares_count,
    coalesce(bookmarks_count, 0)::double precision
      as bookmarks_count,
    coalesce(views_count, 0)::double precision
      as views_count
  into post_row
  from public.posts
  where id = post_id_param;

  if not found then
    delete from public.recommendation_global_rankings
    where post_id = post_id_param;
    return;
  end if;

  if post_row.media_type is distinct from 'video'
     or post_row.visibility is distinct from 'public' then
    delete from public.recommendation_global_rankings
    where post_id = post_id_param;
    return;
  end if;

  select
    count(*)::bigint,

    coalesce(
      avg(
        case
          when watch_session.duration_seconds is not null
            and watch_session.duration_seconds > 0
          then least(
            1.5,
            greatest(
              0,
              watch_session.watched_seconds
                / watch_session.duration_seconds
            )
          )
          else null
        end
      ),
      0
    )::double precision,

    coalesce(
      (
        count(*) filter (
          where watch_session.completed is true
        )
      )::double precision
        / greatest(count(*), 1),
      0
    )::double precision

  into
    session_count,
    avg_retention,
    completion_rate

  from public.video_watch_sessions watch_session

  where watch_session.post_id = post_id_param
    and watch_session.created_at >= now() - interval '90 days';

  confidence :=
    least(
      1.0,
      ln(
        1
          + greatest(
              session_count,
              0
            )::double precision
      )
      / ln(31.0)
    );

  freshness :=
      3.4
      * exp(
          -greatest(
            extract(
              epoch from (
                now()
                  - coalesce(
                      post_row.created_at,
                      now()
                    )
              )
            ) / 3600.0,
            0
          ) / 120.0
        )

      +

      0.7
      * exp(
          -greatest(
            extract(
              epoch from (
                now()
                  - coalesce(
                      post_row.created_at,
                      now()
                    )
              )
            ) / 86400.0,
            0
          ) / 45.0
        );

  engagement :=
      ln(
        1
          + post_row.likes_count * 1.7
          + post_row.comments_count * 3.6
          + post_row.shares_count * 3.1
          + post_row.bookmarks_count * 4.4
      )
      + ln(1 + post_row.views_count) * 0.17;

  quality :=
    (
        least(
          1.25,
          greatest(avg_retention, 0)
        ) * 5.2

        +

        least(
          1.0,
          greatest(completion_rate, 0)
        ) * 4.8
    )
    * confidence;

  final_score :=
    freshness
      + engagement * 0.9
      + quality;

  insert into public.recommendation_global_rankings (
    post_id,
    content_mode,
    score,
    quality_score,
    engagement_score,
    freshness_score,
    calculated_at
  )
  values (
    post_id_param,
    'video',
    final_score,
    quality,
    engagement,
    freshness,
    now()
  )
  on conflict (post_id)
  do update set
    content_mode = excluded.content_mode,
    score = excluded.score,
    quality_score = excluded.quality_score,
    engagement_score = excluded.engagement_score,
    freshness_score = excluded.freshness_score,
    calculated_at = excluded.calculated_at;
end;
$video_rank_function$;

revoke all
  on function public.recalculate_video_recommendation_rank(uuid)
  from public;


-- ============================================================
-- 9. POSTS CHANGE -> REFRESH RANK
-- ============================================================

create or replace function public.refresh_video_rank_from_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $video_post_rank_trigger$
begin
  perform public.recalculate_video_recommendation_rank(new.id);
  return new;
end;
$video_post_rank_trigger$;

drop trigger if exists posts_refresh_video_recommendation_rank
  on public.posts;

create trigger posts_refresh_video_recommendation_rank
after insert or update of
  likes_count,
  comments_count,
  shares_count,
  bookmarks_count,
  views_count,
  visibility,
  media_type
on public.posts
for each row
execute function public.refresh_video_rank_from_post();


-- ============================================================
-- 10. WATCH SESSION CHANGE -> REFRESH RANK
-- ============================================================

create or replace function public.refresh_video_rank_from_watch()
returns trigger
language plpgsql
security definer
set search_path = public
as $video_watch_rank_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_video_recommendation_rank(old.post_id);
    return old;
  end if;

  perform public.recalculate_video_recommendation_rank(new.post_id);
  return new;
end;
$video_watch_rank_trigger$;

drop trigger if exists video_watch_refresh_recommendation_rank
  on public.video_watch_sessions;

create trigger video_watch_refresh_recommendation_rank
after insert
or update of
  watched_seconds,
  duration_seconds,
  completed,
  max_position_seconds
or delete
on public.video_watch_sessions
for each row
execute function public.refresh_video_rank_from_watch();


-- ============================================================
-- 11. INITIAL SEED
-- ============================================================

select
  public.recalculate_video_recommendation_rank(id)
from public.posts
where media_type = 'video'
  and visibility = 'public';


-- ============================================================
-- 12. CLEANUP STALE GLOBAL RANKS
-- ============================================================

delete from public.recommendation_global_rankings as ranking
where not exists (
  select 1
  from public.posts as post
  where post.id = ranking.post_id
    and post.media_type = 'video'
    and post.visibility = 'public'
);


-- ============================================================
-- DONE
-- ============================================================
