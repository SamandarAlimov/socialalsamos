-- Professional video recommendation global quality layer.
--
-- Personalized ranking stays client/session-specific, while this table contains
-- non-personal global priors calculated from retention/completion + engagement
-- + freshness. This prevents pure popularity sorting and gives high-retention
-- videos a chance even when their raw view count is smaller.

create table if not exists public.recommendation_global_rankings (
  post_id uuid primary key references public.posts(id) on delete cascade,
  content_mode text not null default 'feed',
  score double precision not null default 0,
  quality_score double precision not null default 0,
  engagement_score double precision not null default 0,
  freshness_score double precision not null default 0,
  calculated_at timestamptz not null default now()
);

create index if not exists recommendation_global_video_score_idx
  on public.recommendation_global_rankings
  (content_mode, score desc, calculated_at desc);

create index if not exists posts_video_recommendation_quality_idx
  on public.posts
  (likes_count desc, comments_count desc, views_count desc, created_at desc)
  where visibility = 'public' and media_type = 'video';

alter table public.recommendation_global_rankings enable row level security;

drop policy if exists "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings;
create policy "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings
  for select
  using (true);

grant select on public.recommendation_global_rankings to anon, authenticated;

-- The user's event stream is private and can only be written/read by that user.
alter table public.recommendation_events enable row level security;

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

grant select, insert on public.recommendation_events to authenticated;

create or replace function public.recalculate_video_recommendation_rank(
  post_id_param uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
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
    coalesce(likes_count, 0)::double precision as likes_count,
    coalesce(comments_count, 0)::double precision as comments_count,
    coalesce(shares_count, 0)::double precision as shares_count,
    coalesce(bookmarks_count, 0)::double precision as bookmarks_count,
    coalesce(views_count, 0)::double precision as views_count
  into p
  from public.posts
  where id = post_id_param;

  if not found or p.media_type <> 'video' or p.visibility <> 'public' then
    delete from public.recommendation_global_rankings
    where post_id = post_id_param;
    return;
  end if;

  select
    count(*)::bigint,
    coalesce(
      avg(
        case
          when duration_seconds is not null and duration_seconds > 0
            then least(1.5, watched_seconds / duration_seconds)
          else null
        end
      ),
      0
    )::double precision,
    coalesce(
      (count(*) filter (where completed))::double precision
        / greatest(count(*), 1),
      0
    )::double precision
  into session_count, avg_retention, completion_rate
  from public.video_watch_sessions
  where post_id = post_id_param
    and created_at >= now() - interval '90 days';

  confidence := least(
    1.0,
    ln(1 + greatest(session_count, 0)::double precision) / ln(31.0)
  );

  freshness :=
    3.4 * exp(
      -greatest(
        extract(epoch from (now() - coalesce(p.created_at, now()))) / 3600.0,
        0
      ) / 120.0
    )
    + 0.7 * exp(
      -greatest(
        extract(epoch from (now() - coalesce(p.created_at, now()))) / 86400.0,
        0
      ) / 45.0
    );

  engagement :=
    ln(
      1
      + p.likes_count * 1.7
      + p.comments_count * 3.6
      + p.shares_count * 3.1
      + p.bookmarks_count * 4.4
    )
    + ln(1 + p.views_count) * 0.17;

  quality :=
    (
      least(1.25, greatest(avg_retention, 0)) * 5.2
      + least(1, greatest(completion_rate, 0)) * 4.8
    ) * confidence;

  final_score := freshness + engagement * 0.9 + quality;

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
  on conflict (post_id) do update
    set content_mode = excluded.content_mode,
        score = excluded.score,
        quality_score = excluded.quality_score,
        engagement_score = excluded.engagement_score,
        freshness_score = excluded.freshness_score,
        calculated_at = excluded.calculated_at;
end;
$$;

revoke all on function public.recalculate_video_recommendation_rank(uuid)
  from public;

create or replace function public.refresh_video_rank_from_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_video_recommendation_rank(new.id);
  return new;
end;
$$;

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

create or replace function public.refresh_video_rank_from_watch()
returns trigger
language plpgsql
security definer
set search_path = public
as $video_rank_watch$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_video_recommendation_rank(old.post_id);
    return old;
  end if;

  perform public.recalculate_video_recommendation_rank(new.post_id);
  return new;
end;
$video_rank_watch$;

drop trigger if exists video_watch_refresh_recommendation_rank
  on public.video_watch_sessions;
create trigger video_watch_refresh_recommendation_rank
after insert or delete on public.video_watch_sessions
for each row
execute function public.refresh_video_rank_from_watch();

-- Seed existing public videos. Triggered updates keep the table fresh afterwards.
do $$
declare
  row_item record;
begin
  for row_item in
    select id
    from public.posts
    where media_type = 'video'
      and visibility = 'public'
  loop
    perform public.recalculate_video_recommendation_rank(row_item.id);
  end loop;
end;
$$;
