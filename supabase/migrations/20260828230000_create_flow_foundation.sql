-- ============================================================================
-- CREATE FLOW FOUNDATION (Stage 1)
-- Maqsad: post yaratish oqimidagi barcha meta-ma'lumotni post matnidan
-- ([POLL]{...}[/POLL], [MUSIC:id], "📍 ...") strukturali jadvallarga ko'chirish.
--
-- Bu migratsiya idempotent: qayta ishga tushirsa xato bermaydi.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 0. ENUM turlari
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('image', 'video', 'audio', 'document', 'archive', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'post_location_mode') then
    create type public.post_location_mode as enum ('place', 'live');
  end if;

  if not exists (select 1 from pg_type where typname = 'music_source') then
    create type public.music_source as enum ('platform', 'device', 'jamendo', 'audius', 'fma', 'ccmixter', 'pixabay');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. posts jadvaliga yangi ustunlar
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists post_kind text not null default 'post',
  add column if not exists status text not null default 'published',
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists has_poll boolean not null default false,
  add column if not exists formatted_content jsonb,
  add column if not exists edit_state jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_post_kind_check') then
    alter table public.posts
      add constraint posts_post_kind_check
      check (post_kind in ('post', 'reel', 'story', 'location', 'poll', 'file'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_status_check') then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('draft', 'scheduled', 'published', 'failed'));
  end if;
end $$;

update public.posts set published_at = created_at where published_at is null;

create index if not exists posts_status_published_idx
  on public.posts (status, published_at desc);
create index if not exists posts_scheduled_idx
  on public.posts (scheduled_at)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- 2. Ko'rish huquqini tekshiruvchi yordamchi funksiya
-- ---------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.visibility = 'public'
        or p.user_id = auth.uid()
        or exists (
          select 1 from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

create or replace function public.owns_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. post_media — har qanday turdagi fayl uchun
-- ---------------------------------------------------------------------------
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position int not null default 0,
  kind public.media_kind not null default 'other',
  storage_url text not null,
  thumbnail_url text,
  mime_type text,
  file_name text,
  file_size bigint,
  width int,
  height int,
  duration_seconds numeric(10, 3),
  aspect_ratio text,
  alt_text text,
  -- filtr, trim, crop, rotate, overlay holati (klientda qo'llanilgan tahrir)
  edit_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_idx on public.post_media (post_id, position);
create index if not exists post_media_kind_idx on public.post_media (kind);

alter table public.post_media enable row level security;

drop policy if exists "post_media_select" on public.post_media;
create policy "post_media_select" on public.post_media
  for select using (public.can_view_post(post_id));

drop policy if exists "post_media_write" on public.post_media;
create policy "post_media_write" on public.post_media
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 4. places + post_locations — xarita bilan integratsiya
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  -- tashqi geocoder (nominatim/photon/osm) identifikatori
  external_source text,
  external_id text,
  created_by uuid references auth.users(id) on delete set null,
  usage_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists places_external_uniq
  on public.places (external_source, external_id)
  where external_source is not null and external_id is not null;
create index if not exists places_coords_idx on public.places (latitude, longitude);
create index if not exists places_name_trgm_idx on public.places using gin (name gin_trgm_ops);

alter table public.places enable row level security;

drop policy if exists "places_select_all" on public.places;
create policy "places_select_all" on public.places for select using (true);

drop policy if exists "places_insert_auth" on public.places;
create policy "places_insert_auth" on public.places
  for insert with check (auth.uid() is not null);

drop policy if exists "places_update_own" on public.places;
create policy "places_update_own" on public.places
  for update using (created_by = auth.uid());

create table if not exists public.post_locations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  -- 'place'  -> tanlangan joy (Telegramdagi "Send location" analogi, boyitilgan)
  -- 'live'   -> real vaqtli joylashuv (live_until gacha yangilanadi)
  mode public.post_location_mode not null default 'place',
  label text,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading double precision,
  live_until timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists post_locations_post_uniq on public.post_locations (post_id);
create index if not exists post_locations_coords_idx on public.post_locations (latitude, longitude);
create index if not exists post_locations_live_idx on public.post_locations (live_until)
  where mode = 'live';

alter table public.post_locations enable row level security;

drop policy if exists "post_locations_select" on public.post_locations;
create policy "post_locations_select" on public.post_locations
  for select using (public.can_view_post(post_id));

drop policy if exists "post_locations_write" on public.post_locations;
create policy "post_locations_write" on public.post_locations
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 5. polls / poll_options / poll_votes — real ovoz berish tizimi
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  max_choices int,
  is_anonymous boolean not null default false,
  show_results_before_vote boolean not null default false,
  quiz_mode boolean not null default false,
  correct_option_id uuid,
  explanation text,
  closes_at timestamptz,
  total_votes int not null default 0,
  total_voters int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists polls_post_uniq on public.polls (post_id);
create index if not exists polls_closes_at_idx on public.polls (closes_at);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position int not null default 0,
  label text not null,
  emoji text,
  image_url text,
  votes_count int not null default 0
);

create index if not exists poll_options_poll_idx on public.poll_options (poll_id, position);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'polls_correct_option_fk') then
    alter table public.polls
      add constraint polls_correct_option_fk
      foreign key (correct_option_id) references public.poll_options(id) on delete set null;
  end if;
end $$;

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, user_id)
);

create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id);

-- Ovoz berishdan oldingi qat'iy tekshiruvlar
create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_existing int;
begin
  select * into v_poll from public.polls where id = new.poll_id;

  if v_poll.id is null then
    raise exception 'So''rovnoma topilmadi';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'So''rovnoma yakunlangan';
  end if;

  if not exists (
    select 1 from public.poll_options o
    where o.id = new.option_id and o.poll_id = new.poll_id
  ) then
    raise exception 'Variant bu so''rovnomaga tegishli emas';
  end if;

  select count(*) into v_existing
  from public.poll_votes v
  where v.poll_id = new.poll_id and v.user_id = new.user_id;

  if not v_poll.allow_multiple and v_existing >= 1 then
    raise exception 'Bu so''rovnomada faqat bitta variant tanlanadi';
  end if;

  if v_poll.allow_multiple
     and v_poll.max_choices is not null
     and v_existing >= v_poll.max_choices then
    raise exception 'Eng ko''p % variant tanlash mumkin', v_poll.max_choices;
  end if;

  return new;
end $$;

drop trigger if exists poll_votes_validate on public.poll_votes;
create trigger poll_votes_validate
  before insert on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- Ovoz hisoblagichlarini yangilash
create or replace function public.sync_poll_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id uuid;
begin
  v_poll_id := coalesce(new.poll_id, old.poll_id);

  update public.poll_options o
  set votes_count = (select count(*) from public.poll_votes v where v.option_id = o.id)
  where o.poll_id = v_poll_id;

  update public.polls p
  set total_votes = (select count(*) from public.poll_votes v where v.poll_id = p.id),
      total_voters = (select count(distinct v.user_id) from public.poll_votes v where v.poll_id = p.id)
  where p.id = v_poll_id;

  return null;
end $$;

drop trigger if exists poll_votes_sync_counts on public.poll_votes;
create trigger poll_votes_sync_counts
  after insert or delete on public.poll_votes
  for each row execute function public.sync_poll_counts();

-- posts.has_poll flagini avtomatik saqlash
create or replace function public.sync_post_has_poll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.posts set has_poll = false where id = old.post_id;
  else
    update public.posts set has_poll = true where id = new.post_id;
  end if;
  return null;
end $$;

drop trigger if exists polls_sync_post_flag on public.polls;
create trigger polls_sync_post_flag
  after insert or delete on public.polls
  for each row execute function public.sync_post_has_poll();

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "polls_select" on public.polls;
create policy "polls_select" on public.polls
  for select using (public.can_view_post(post_id));

drop policy if exists "polls_write" on public.polls;
create policy "polls_write" on public.polls
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

drop policy if exists "poll_options_select" on public.poll_options;
create policy "poll_options_select" on public.poll_options
  for select using (
    exists (select 1 from public.polls p where p.id = poll_id and public.can_view_post(p.post_id))
  );

drop policy if exists "poll_options_write" on public.poll_options;
create policy "poll_options_write" on public.poll_options
  for all using (
    exists (select 1 from public.polls p where p.id = poll_id and public.owns_post(p.post_id))
  ) with check (
    exists (select 1 from public.polls p where p.id = poll_id and public.owns_post(p.post_id))
  );

-- Anonim so'rovnomada boshqa foydalanuvchi ovozlari ko'rinmaydi
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select" on public.poll_votes
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.polls p
      where p.id = poll_id
        and p.is_anonymous = false
        and public.can_view_post(p.post_id)
    )
  );

drop policy if exists "poll_votes_insert" on public.poll_votes;
create policy "poll_votes_insert" on public.poll_votes
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and public.can_view_post(p.post_id))
  );

drop policy if exists "poll_votes_delete" on public.poll_votes;
create policy "poll_votes_delete" on public.poll_votes
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. hashtags / post_hashtags — Unicode (kirill + lotin) qidiruv
-- ---------------------------------------------------------------------------
create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  posts_count int not null default 0,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists hashtags_tag_uniq on public.hashtags (tag);
create index if not exists hashtags_tag_trgm_idx on public.hashtags using gin (tag gin_trgm_ops);
create index if not exists hashtags_popular_idx on public.hashtags (posts_count desc, last_used_at desc);

create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag_id)
);

create index if not exists post_hashtags_hashtag_idx on public.post_hashtags (hashtag_id, created_at desc);

-- Post matnidan hashtaglarni ajratib olish (kirill harflar ham ishlaydi:
-- [[:alnum:]] UTF-8 locale da Unicode harflarni qamrab oladi)
create or replace function public.sync_post_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_id uuid;
begin
  delete from public.post_hashtags where post_id = new.id;

  for v_tag in
    select distinct lower(m[1])
    from regexp_matches(coalesce(new.content, ''), '#([[:alnum:]_]{1,64})', 'g') as m
  loop
    insert into public.hashtags (tag, last_used_at)
    values (v_tag, now())
    on conflict (tag) do update set last_used_at = now()
    returning id into v_id;

    insert into public.post_hashtags (post_id, hashtag_id)
    values (new.id, v_id)
    on conflict do nothing;
  end loop;

  return null;
end $$;

drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags
  after insert or update of content on public.posts
  for each row execute function public.sync_post_hashtags();

create or replace function public.sync_hashtag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := coalesce(new.hashtag_id, old.hashtag_id);
  update public.hashtags h
  set posts_count = (select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id)
  where h.id = v_id;
  return null;
end $$;

drop trigger if exists post_hashtags_sync_counts on public.post_hashtags;
create trigger post_hashtags_sync_counts
  after insert or delete on public.post_hashtags
  for each row execute function public.sync_hashtag_counts();

alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;

drop policy if exists "hashtags_select_all" on public.hashtags;
create policy "hashtags_select_all" on public.hashtags for select using (true);

drop policy if exists "post_hashtags_select" on public.post_hashtags;
create policy "post_hashtags_select" on public.post_hashtags
  for select using (public.can_view_post(post_id));

-- Server tomonda hashtag qidiruvi (prefiks + fuzzy)
create or replace function public.search_hashtags(p_query text, p_limit int default 12)
returns table (id uuid, tag text, posts_count int)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(trim(both '#' from coalesce(p_query, ''))) as term)
  select h.id, h.tag, h.posts_count
  from public.hashtags h, q
  where q.term = '' or h.tag like q.term || '%' or h.tag % q.term
  order by
    case when q.term <> '' and h.tag like q.term || '%' then 0 else 1 end,
    h.posts_count desc,
    h.last_used_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- Trend hashtaglar: oxirgi N kun ichidagi ishlatilish soni bo'yicha
create or replace function public.trending_hashtags(p_limit int default 12, p_days int default 7)
returns table (id uuid, tag text, recent_count bigint, posts_count int)
language sql
stable
security definer
set search_path = public
as $$
  select h.id,
         h.tag,
         count(ph.post_id) as recent_count,
         h.posts_count
  from public.hashtags h
  join public.post_hashtags ph on ph.hashtag_id = h.id
  join public.posts p on p.id = ph.post_id
  where ph.created_at >= now() - make_interval(days => greatest(1, coalesce(p_days, 7)))
    and p.visibility = 'public'
  group by h.id, h.tag, h.posts_count
  order by recent_count desc, h.posts_count desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- ---------------------------------------------------------------------------
-- 7. music_tracks / post_music — device + platforma + open source katalog
-- ---------------------------------------------------------------------------
create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  album text,
  audio_url text not null,
  cover_url text,
  duration_seconds numeric(10, 3),
  source public.music_source not null default 'platform',
  external_id text,
  license text,
  attribution text,
  genre text,
  owner_id uuid references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  uses_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists music_tracks_external_uniq
  on public.music_tracks (source, external_id)
  where external_id is not null;
create index if not exists music_tracks_title_trgm_idx
  on public.music_tracks using gin (title gin_trgm_ops);
create index if not exists music_tracks_popular_idx
  on public.music_tracks (is_public, uses_count desc);

create table if not exists public.post_music (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  track_id uuid references public.music_tracks(id) on delete set null,
  start_seconds numeric(10, 3) not null default 0,
  end_seconds numeric(10, 3),
  volume numeric(4, 3) not null default 1.0,
  muted_original boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists post_music_post_uniq on public.post_music (post_id);

alter table public.music_tracks enable row level security;
alter table public.post_music enable row level security;

drop policy if exists "music_tracks_select" on public.music_tracks;
create policy "music_tracks_select" on public.music_tracks
  for select using (is_public = true or owner_id = auth.uid());

drop policy if exists "music_tracks_insert" on public.music_tracks;
create policy "music_tracks_insert" on public.music_tracks
  for insert with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

drop policy if exists "music_tracks_update_own" on public.music_tracks;
create policy "music_tracks_update_own" on public.music_tracks
  for update using (owner_id = auth.uid());

drop policy if exists "music_tracks_delete_own" on public.music_tracks;
create policy "music_tracks_delete_own" on public.music_tracks
  for delete using (owner_id = auth.uid());

drop policy if exists "post_music_select" on public.post_music;
create policy "post_music_select" on public.post_music
  for select using (public.can_view_post(post_id));

drop policy if exists "post_music_write" on public.post_music;
create policy "post_music_write" on public.post_music
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 8. Hammuallif limiti: 10 nafar (Instagram 5 ta, bizda 10 ta)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.post_collaborators
  where post_id = new.post_id;

  if v_count >= 10 then
    raise exception 'Bitta postga eng ko''pi bilan 10 nafar hammuallif qo''shish mumkin';
  end if;

  return new;
end $$;

drop trigger if exists post_collaborators_limit on public.post_collaborators;
create trigger post_collaborators_limit
  before insert on public.post_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- ---------------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.poll_votes;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.poll_options;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.post_locations;
  exception when duplicate_object or undefined_object then null;
  end;
end $$;
