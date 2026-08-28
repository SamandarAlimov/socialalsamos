-- =============================================================================
-- ADR-004: So'rovnoma turlari (oddiy, kviz, rasmli, slayder, reyting)
-- ADR-001: Video qayta ishlash uchun gibrid ish navbati (video_jobs)
-- ADR-002: Musiqa katalogi ingest metadatasi
--
-- MUHIM: barcha yangi ustunlar NULL qabul qiladi yoki DEFAULT bilan keladi,
-- shuning uchun mavjud postlar, so'rovnomalar va treklar buzilmaydi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. So'rovnoma turlari
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'poll_type') then
    create type public.poll_type as enum ('standard', 'quiz', 'image', 'slider', 'rating');
  end if;
end $$;

alter table public.polls
  add column if not exists poll_type public.poll_type not null default 'standard',
  add column if not exists min_value numeric,
  add column if not exists max_value numeric,
  add column if not exists step numeric,
  add column if not exists left_label text,
  add column if not exists right_label text;

-- Mavjud kviz so'rovnomalarini to'g'ri turga o'tkazamiz
update public.polls
set poll_type = 'quiz'
where quiz_mode is true and poll_type = 'standard';

-- Slayder uchun diapazon mantiqiy bo'lishi shart
alter table public.polls
  drop constraint if exists polls_slider_range_check;

alter table public.polls
  add constraint polls_slider_range_check check (
    poll_type <> 'slider'
    or (
      min_value is not null
      and max_value is not null
      and max_value > min_value
      and (step is null or step > 0)
    )
  );

-- Rasmli variantlar
alter table public.poll_options
  add column if not exists image_url text;

-- Slayder/reyting ovozlari raqamli qiymat bilan keladi
alter table public.poll_votes
  add column if not exists numeric_value numeric;

comment on column public.polls.poll_type is 'ADR-004: so''rovnoma turi';
comment on column public.poll_votes.numeric_value is 'Slayder va reyting turlari uchun ovoz qiymati';

-- -----------------------------------------------------------------------------
-- 2. Ovoz turini tekshiruvchi trigger
--    Slayderda variant emas, qiymat kerak; oddiy turda esa aksincha.
-- -----------------------------------------------------------------------------

create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.poll_type;
  v_min numeric;
  v_max numeric;
begin
  select poll_type, min_value, max_value
    into v_type, v_min, v_max
  from public.polls
  where id = new.poll_id;

  if v_type is null then
    return new;
  end if;

  if v_type in ('slider', 'rating') then
    if new.numeric_value is null then
      raise exception 'Slayder so''rovnomasi uchun qiymat majburiy';
    end if;
    if v_min is not null and new.numeric_value < v_min then
      raise exception 'Qiymat ruxsat etilgan diapazondan kichik';
    end if;
    if v_max is not null and new.numeric_value > v_max then
      raise exception 'Qiymat ruxsat etilgan diapazondan katta';
    end if;
  else
    if new.option_id is null then
      raise exception 'Variant tanlanmagan';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists validate_poll_vote_trigger on public.poll_votes;

create trigger validate_poll_vote_trigger
  before insert or update on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- Slayder natijasi: o'rtacha, mediana va ovoz soni
create or replace function public.poll_slider_summary(p_poll_id uuid)
returns table (
  vote_count bigint,
  average_value numeric,
  median_value numeric,
  min_voted numeric,
  max_voted numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    round(avg(numeric_value), 2),
    percentile_cont(0.5) within group (order by numeric_value),
    min(numeric_value),
    max(numeric_value)
  from public.poll_votes
  where poll_id = p_poll_id
    and numeric_value is not null;
$$;

-- -----------------------------------------------------------------------------
-- 3. ADR-001: video ish navbati
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_job_status') then
    create type public.media_job_status as enum ('queued', 'processing', 'done', 'failed', 'canceled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_job_kind') then
    create type public.media_job_kind as enum ('transcode', 'hls', 'thumbnail', 'audio_mux', 'nsfw_scan');
  end if;
end $$;

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  media_id uuid references public.post_media (id) on delete cascade,
  kind public.media_job_kind not null default 'transcode',
  status public.media_job_status not null default 'queued',
  -- Klientda urinib ko'rilganmi (ADR-001: avval klient, keyin server)
  client_attempts integer not null default 0,
  attempts integer not null default 0,
  source_url text not null,
  output_url text,
  params jsonb not null default '{}'::jsonb,
  error_message text,
  -- Xarajat nazorati: qayta ishlangan sekundlar
  processed_seconds numeric,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists video_jobs_status_idx on public.video_jobs (status, created_at);
create index if not exists video_jobs_owner_idx on public.video_jobs (owner_id, created_at desc);
create index if not exists video_jobs_post_idx on public.video_jobs (post_id);

alter table public.video_jobs enable row level security;

drop policy if exists "video_jobs_select_own" on public.video_jobs;
create policy "video_jobs_select_own"
  on public.video_jobs for select
  using (auth.uid() = owner_id);

drop policy if exists "video_jobs_insert_own" on public.video_jobs;
create policy "video_jobs_insert_own"
  on public.video_jobs for insert
  with check (auth.uid() = owner_id);

drop policy if exists "video_jobs_update_own" on public.video_jobs;
create policy "video_jobs_update_own"
  on public.video_jobs for update
  using (auth.uid() = owner_id);

drop policy if exists "video_jobs_delete_own" on public.video_jobs;
create policy "video_jobs_delete_own"
  on public.video_jobs for delete
  using (auth.uid() = owner_id);

-- Kunlik server-daqiqa limiti (ADR-001 xarajat nazorati)
create or replace function public.video_job_quota_used(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(processed_seconds), 0)
  from public.video_jobs
  where owner_id = p_user_id
    and created_at >= now() - interval '1 day';
$$;

-- -----------------------------------------------------------------------------
-- 4. ADR-002: musiqa katalogi ingest metadatasi
-- -----------------------------------------------------------------------------

alter table public.music_tracks
  add column if not exists waveform jsonb,
  add column if not exists bpm integer,
  add column if not exists genre text,
  add column if not exists language text,
  add column if not exists license_url text,
  add column if not exists is_commercial_ok boolean,
  add column if not exists popularity integer not null default 0,
  add column if not exists ingested_at timestamptz;

-- Litsenziyasiz ommaviy trek katalogga kirmasligi kerak (o'zgarmas tamoyil #5)
alter table public.music_tracks
  drop constraint if exists music_tracks_public_requires_license;

alter table public.music_tracks
  add constraint music_tracks_public_requires_license check (
    is_public is not true
    or (license is not null and length(trim(license)) > 0)
  );

create index if not exists music_tracks_search_idx
  on public.music_tracks using gin ((title || ' ' || coalesce(artist, '')) gin_trgm_ops);

create index if not exists music_tracks_popularity_idx
  on public.music_tracks (is_public, popularity desc);

-- Ingest jurnali: qaysi manbadan qachon nechta trek olindi
create table if not exists public.music_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source public.music_source not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text
);

alter table public.music_ingest_runs enable row level security;

-- Jurnalni faqat service role yozadi; oddiy foydalanuvchi o'qiy oladi.
drop policy if exists "music_ingest_runs_select_all" on public.music_ingest_runs;
create policy "music_ingest_runs_select_all"
  on public.music_ingest_runs for select
  using (true);

-- Musiqa qidiruvi (katalog + foydalanuvchining o'z fayllari)
create or replace function public.search_music_tracks(
  p_query text,
  p_limit integer default 20
)
returns setof public.music_tracks
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.music_tracks
  where (is_public = true or owner_id = auth.uid())
    and (
      p_query is null
      or length(trim(p_query)) = 0
      or title ilike '%' || p_query || '%'
      or coalesce(artist, '') ilike '%' || p_query || '%'
    )
  order by popularity desc, created_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;
