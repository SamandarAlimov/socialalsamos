-- Videolar uchun haqiqiy "eng ko'p qayta ko'rilgan qism" (YouTube: most
-- replayed) va watch-time statistikasi.
--
-- 1) video_watch_segments - har bir video 100 ta teng bo'lakka bo'linadi
--    (bucket 0..99) va har bo'lak necha marta ko'rilgani jamlanadi. Bu
--    agregat, shaxsiy bo'lmagan ma'lumot: hamma o'qiy oladi, lekin yozish
--    faqat SECURITY DEFINER funksiya orqali amalga oshadi.
-- 2) video_watch_sessions - har bir ko'rish seansi: qancha soniya sof
--    ko'rilgan, video uzunligi, oxirgi nuqta, tugatilganmi. Retention va
--    completion rate shu jadvaldan hisoblanadi.

-- ============================ Segmentlar (heatmap) ==========================

create table if not exists public.video_watch_segments (
  post_id uuid not null references public.posts(id) on delete cascade,
  bucket smallint not null,
  views bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (post_id, bucket),
  constraint video_watch_segments_bucket_range check (bucket >= 0 and bucket < 100)
);

create index if not exists video_watch_segments_post_idx
  on public.video_watch_segments (post_id);

alter table public.video_watch_segments enable row level security;

drop policy if exists "video_watch_segments_public_read" on public.video_watch_segments;
create policy "video_watch_segments_public_read"
  on public.video_watch_segments
  for select
  using (true);

-- Yozish uchun policy ataylab yo'q: faqat record_video_watch() yozadi.

-- ============================ Seanslar (watch-time) ========================

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

alter table public.video_watch_sessions enable row level security;

-- Foydalanuvchi o'z seanslarini, muallif esa o'z postining seanslarini ko'radi.
drop policy if exists "video_watch_sessions_select_own_or_author" on public.video_watch_sessions;
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

-- ================================== Yozish =================================

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
as $$
declare
  actor uuid := auth.uid();
  safe_duration numeric;
  safe_watched numeric;
  safe_position numeric;
begin
  if post_id_param is null or actor is null then
    return;
  end if;

  if not exists (select 1 from public.posts p where p.id = post_id_param) then
    return;
  end if;

  safe_duration := nullif(greatest(coalesce(duration_seconds_param, 0), 0), 0);
  safe_watched := greatest(coalesce(watched_seconds_param, 0), 0);
  safe_position := greatest(coalesce(max_position_seconds_param, 0), 0);

  -- Soxta katta qiymatlardan himoya: sof ko'rish vaqti uzunlikning 5
  -- barobaridan oshmaydi (loop hisobga olingan).
  if safe_duration is not null then
    safe_watched := least(safe_watched, safe_duration * 5);
    safe_position := least(safe_position, safe_duration);
  else
    safe_watched := least(safe_watched, 43200);
  end if;

  -- 1 soniyadan kam ko'rish statistika uchun shovqin.
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
    case when safe_duration is null then null else round(safe_duration, 2) end,
    round(safe_position, 2),
    coalesce(completed_param, false)
  );

  if buckets_param is null or array_length(buckets_param, 1) is null then
    return;
  end if;

  insert into public.video_watch_segments as s (post_id, bucket, views)
  select post_id_param, b::smallint, count(*)::bigint
  from unnest(buckets_param) as b
  where b >= 0 and b < 100
  group by b
  on conflict (post_id, bucket) do update
    set views = s.views + excluded.views,
        updated_at = now();
end;
$$;

revoke all on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) from public;
grant execute on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) to authenticated;

-- ================================== O'qish =================================

create or replace function public.get_video_heatmap(post_id_param uuid)
returns table (bucket smallint, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.bucket, s.views
  from public.video_watch_segments s
  where s.post_id = post_id_param
  order by s.bucket;
$$;

grant execute on function public.get_video_heatmap(uuid) to anon, authenticated;

create or replace function public.get_video_watch_stats(post_id_param uuid)
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
as $$
  select
    count(*)::bigint as sessions,
    round(coalesce(avg(w.watched_seconds), 0), 2) as avg_watched_seconds,
    round(
      coalesce(
        avg(
          case
            when w.duration_seconds is not null and w.duration_seconds > 0
              then least(1, w.watched_seconds / w.duration_seconds)
            else null
          end
        ),
        0
      ),
      4
    ) as avg_retention,
    round(
      (count(*) filter (where w.completed))::numeric / greatest(count(*), 1),
      4
    ) as completion_rate
  from public.video_watch_sessions w
  where w.post_id = post_id_param;
$$;

grant execute on function public.get_video_watch_stats(uuid) to authenticated;
