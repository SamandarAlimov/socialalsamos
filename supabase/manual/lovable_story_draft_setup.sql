-- ============================================================
-- ALSAMOS / LOVABLE — CREATE CORE + COMPLETE STORY FOUNDATION
-- ============================================================
--
-- Self-contained repair for Lovable databases that missed the later Create
-- migrations. It does NOT assume public.post_media already exists.
--
-- Fixes:
--   PGRST202 create_story_draft(p_payload) not found
--   42P01 public.post_media does not exist
--
-- Installs the missing structured Create core used across Alsamos:
--   - required posts compatibility columns + legacy array guard
--   - media_kind + post_media
--   - places + post_locations
--   - music_tracks + post_music
--   - story compatibility columns
--   - create / activate / discard story draft RPCs
--   - story_stickers + responses + RPCs
--   - RLS for media/location/music/story/stickers
--
-- Safe to run repeatedly.
-- ============================================================


-- ============================================================
-- 1. POSTS — STORY/CREATE COMPATIBILITY COLUMNS
-- ============================================================

alter table public.posts
  add column if not exists post_kind text not null default 'post';

alter table public.posts
  add column if not exists status text not null default 'published';

alter table public.posts
  add column if not exists scheduled_at timestamptz;

alter table public.posts
  add column if not exists published_at timestamptz;

alter table public.posts
  add column if not exists edit_state jsonb;

alter table public.posts
  add column if not exists formatted_content jsonb;

alter table public.posts
  add column if not exists tags text[] default array[]::text[];

alter table public.posts
  add column if not exists hashtags text[] default array[]::text[];

alter table public.posts
  add column if not exists effects_used text[] default array[]::text[];

alter table public.posts
  add column if not exists mentioned_users text[] default array[]::text[];

-- ============================================================
-- 1A. LEGACY POSTS TAGS TRIGGER NULL GUARD
-- ============================================================
--
-- Some Lovable-era databases contain an older posts trigger that executes:
--
--   jsonb_array_elements_text(
--     coalesce(to_jsonb(NEW)->'tags', '[]'::jsonb)
--   )
--
-- SQL NULL in a text[] column becomes JSON "null" after to_jsonb(), which is
-- a scalar (not SQL NULL), so jsonb_array_elements_text() raises 22023.
--
-- This BEFORE trigger runs first (aaa_ prefix) and normalizes NULL tags to an
-- actual empty text array. It repairs the legacy trigger for Story and normal
-- posts without dropping unknown production triggers.
-- ============================================================

create or replace function public.normalize_posts_tags_before_legacy_triggers()
returns trigger
language plpgsql
set search_path = public
as $normalize_posts_tags_function$
begin
  if new.tags is null then
    new.tags := array[]::text[];
  end if;

  if new.hashtags is null then
    new.hashtags := array[]::text[];
  end if;

  if new.effects_used is null then
    new.effects_used := array[]::text[];
  end if;

  if new.mentioned_users is null then
    new.mentioned_users := array[]::text[];
  end if;

  return new;
end;
$normalize_posts_tags_function$;

drop trigger if exists aaa_normalize_posts_tags_before_legacy_triggers
  on public.posts;

create trigger aaa_normalize_posts_tags_before_legacy_triggers
  before insert or update
  on public.posts
  for each row
  execute function public.normalize_posts_tags_before_legacy_triggers();

-- Existing rows are intentionally NOT bulk-updated here. Old Lovable databases
-- may have unrelated UPDATE triggers; touching every post during setup can
-- activate them. The BEFORE guard above normalizes arrays on the next real
-- write instead.


-- ============================================================
-- 2. MEDIA KIND ENUM
-- ============================================================

do $story_media_kind_bootstrap$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'media_kind'
  ) then
    create type public.media_kind as enum (
      'image',
      'video',
      'audio',
      'document',
      'archive',
      'other'
    );
  end if;
end;
$story_media_kind_bootstrap$;


-- ============================================================
-- 3. POST MEDIA — CANONICAL STRUCTURED MEDIA TABLE
-- ============================================================

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position integer not null default 0,
  kind public.media_kind not null default 'other',
  storage_url text not null,
  storage_bucket text,
  storage_key text,
  thumbnail_url text,
  thumbnail_bucket text,
  thumbnail_key text,
  mime_type text,
  file_name text,
  file_size bigint,
  width integer,
  height integer,
  duration_seconds numeric(10, 3),
  aspect_ratio text,
  alt_text text,
  edit_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.post_media
  add column if not exists storage_bucket text;

alter table public.post_media
  add column if not exists storage_key text;

alter table public.post_media
  add column if not exists thumbnail_bucket text;

alter table public.post_media
  add column if not exists thumbnail_key text;

alter table public.post_media
  add column if not exists edit_state jsonb;

create index if not exists post_media_post_idx
  on public.post_media (post_id, position);

create index if not exists post_media_kind_idx
  on public.post_media (kind);

create index if not exists post_media_storage_object_idx
  on public.post_media (storage_bucket, storage_key)
  where storage_bucket is not null
    and storage_key is not null;

alter table public.post_media enable row level security;

drop policy if exists "post_media_select_story_compat"
  on public.post_media;

create policy "post_media_select_story_compat"
  on public.post_media
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or (
            p.visibility = 'friends'
            and auth.uid() is not null
            and exists (
              select 1
              from public.follows f1
              where f1.follower_id = auth.uid()
                and f1.following_id = p.user_id
            )
            and exists (
              select 1
              from public.follows f2
              where f2.follower_id = p.user_id
                and f2.following_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "post_media_write_story_compat"
  on public.post_media;

create policy "post_media_write_story_compat"
  on public.post_media
  for all
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.user_id = auth.uid()
    )
  );




-- ============================================================
-- 3A. STRUCTURED POST VISIBILITY HELPERS
-- ============================================================

create or replace function public.can_view_structured_post_compat(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $can_view_structured_post_compat_function$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (
          p.visibility = 'friends'
          and auth.uid() is not null
          and exists (
            select 1 from public.follows f1
            where f1.follower_id = auth.uid()
              and f1.following_id = p.user_id
          )
          and exists (
            select 1 from public.follows f2
            where f2.follower_id = p.user_id
              and f2.following_id = auth.uid()
          )
        )
      )
  );
$can_view_structured_post_compat_function$;

create or replace function public.owns_structured_post_compat(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $owns_structured_post_compat_function$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.user_id = auth.uid()
  );
$owns_structured_post_compat_function$;

grant execute on function public.can_view_structured_post_compat(uuid)
  to anon, authenticated;
grant execute on function public.owns_structured_post_compat(uuid)
  to authenticated;


-- ============================================================
-- 3B. PLACES + POST LOCATIONS
-- ============================================================

do $post_location_mode_bootstrap$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'post_location_mode'
  ) then
    create type public.post_location_mode as enum ('place', 'live');
  end if;
end;
$post_location_mode_bootstrap$;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  external_source text,
  external_id text,
  created_by uuid references auth.users(id) on delete set null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists places_external_uniq
  on public.places (external_source, external_id)
  where external_source is not null and external_id is not null;
create index if not exists places_coords_idx
  on public.places (latitude, longitude);

alter table public.places enable row level security;

drop policy if exists "places_select_all" on public.places;
create policy "places_select_all" on public.places
  for select using (true);

drop policy if exists "places_insert_auth" on public.places;
create policy "places_insert_auth" on public.places
  for insert with check (auth.uid() is not null);

drop policy if exists "places_update_own" on public.places;
create policy "places_update_own" on public.places
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid());

create table if not exists public.post_locations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
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

create unique index if not exists post_locations_post_uniq
  on public.post_locations (post_id);
create index if not exists post_locations_coords_idx
  on public.post_locations (latitude, longitude);
create index if not exists post_locations_live_idx
  on public.post_locations (live_until)
  where mode = 'live';

alter table public.post_locations enable row level security;

drop policy if exists "post_locations_select_compat"
  on public.post_locations;
create policy "post_locations_select_compat"
  on public.post_locations
  for select
  using (public.can_view_structured_post_compat(post_id));

drop policy if exists "post_locations_write_compat"
  on public.post_locations;
create policy "post_locations_write_compat"
  on public.post_locations
  for all
  using (public.owns_structured_post_compat(post_id))
  with check (public.owns_structured_post_compat(post_id));

insert into public.post_locations (
  post_id, mode, label, latitude, longitude
)
select
  p.id,
  'place'::public.post_location_mode,
  coalesce(nullif(p.location_name, ''), nullif(p.location_address, ''), nullif(p.location, '')),
  p.location_lat,
  p.location_lng
from public.posts p
where p.location_lat is not null
  and p.location_lng is not null
  and not exists (
    select 1 from public.post_locations pl where pl.post_id = p.id
  );


-- ============================================================
-- 3C. MUSIC TRACKS + POST MUSIC
-- ============================================================

do $music_source_bootstrap$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'music_source'
  ) then
    create type public.music_source as enum (
      'platform', 'device', 'jamendo', 'audius',
      'fma', 'ccmixter', 'pixabay'
    );
  end if;
end;
$music_source_bootstrap$;

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
  uses_count integer not null default 0,
  storage_bucket text,
  storage_key text,
  created_at timestamptz not null default now()
);

alter table public.music_tracks add column if not exists storage_bucket text;
alter table public.music_tracks add column if not exists storage_key text;

create unique index if not exists music_tracks_external_uniq
  on public.music_tracks (source, external_id)
  where external_id is not null;
create index if not exists music_tracks_popular_idx
  on public.music_tracks (is_public, uses_count desc);
create index if not exists music_tracks_storage_object_idx
  on public.music_tracks (storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;

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

create unique index if not exists post_music_post_uniq
  on public.post_music (post_id);

alter table public.music_tracks enable row level security;
alter table public.post_music enable row level security;

drop policy if exists "music_tracks_select_compat" on public.music_tracks;
create policy "music_tracks_select_compat"
  on public.music_tracks
  for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or exists (
      select 1
      from public.post_music pm
      where pm.track_id = music_tracks.id
        and public.can_view_structured_post_compat(pm.post_id)
    )
  );

drop policy if exists "music_tracks_insert_compat" on public.music_tracks;
create policy "music_tracks_insert_compat"
  on public.music_tracks
  for insert
  with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

drop policy if exists "music_tracks_update_compat" on public.music_tracks;
create policy "music_tracks_update_compat"
  on public.music_tracks
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "music_tracks_delete_compat" on public.music_tracks;
create policy "music_tracks_delete_compat"
  on public.music_tracks
  for delete using (owner_id = auth.uid());

drop policy if exists "post_music_select_compat" on public.post_music;
create policy "post_music_select_compat"
  on public.post_music
  for select
  using (public.can_view_structured_post_compat(post_id));

drop policy if exists "post_music_write_compat" on public.post_music;
create policy "post_music_write_compat"
  on public.post_music
  for all
  using (public.owns_structured_post_compat(post_id))
  with check (public.owns_structured_post_compat(post_id));


-- ============================================================
-- 3D. LEGACY MEDIA BACKFILL
-- ============================================================
--
-- Existing legacy posts store media in posts.media_urls. Backfill structured
-- post_media without UPDATE-ing posts, so unknown legacy posts triggers are
-- never fired during setup.
-- ============================================================

insert into public.post_media (
  post_id,
  position,
  kind,
  storage_url,
  thumbnail_url
)
select
  p.id,
  (media_item.ordinality - 1)::integer,
  (
    case
      when lower(coalesce(p.media_type, '')) in ('video', 'reel', 'short')
        then 'video'::public.media_kind
      else 'image'::public.media_kind
    end
  ),
  media_item.value,
  case
    when media_item.ordinality = 1 then p.thumbnail_url
    else null
  end
from public.posts p
cross join lateral unnest(
  coalesce(p.media_urls, array[]::text[])
) with ordinality as media_item(value, ordinality)
where nullif(media_item.value, '') is not null
  and not exists (
    select 1
    from public.post_media pm
    where pm.post_id = p.id
      and pm.position = (media_item.ordinality - 1)::integer
  );


-- ============================================================
-- 4. STORIES — CANONICAL LINK COLUMNS
-- ============================================================

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

alter table public.stories
  add column if not exists media_id uuid references public.post_media(id) on delete set null;

alter table public.stories
  add column if not exists storage_bucket text;

alter table public.stories
  add column if not exists storage_key text;

alter table public.stories
  add column if not exists is_active boolean not null default true;

create unique index if not exists stories_post_id_uniq
  on public.stories (post_id)
  where post_id is not null;

create index if not exists stories_active_post_idx
  on public.stories (expires_at desc, post_id)
  where is_active is distinct from false;

alter table public.stories enable row level security;

drop policy if exists "stories_select_visible"
  on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and (
        post_id is null
        or exists (
          select 1
          from public.posts p
          where p.id = stories.post_id
            and (
              p.visibility = 'public'
              or p.user_id = auth.uid()
              or (
                p.visibility = 'friends'
                and auth.uid() is not null
                and exists (
                  select 1
                  from public.follows f1
                  where f1.follower_id = auth.uid()
                    and f1.following_id = p.user_id
                )
                and exists (
                  select 1
                  from public.follows f2
                  where f2.follower_id = p.user_id
                    and f2.following_id = auth.uid()
                )
              )
            )
        )
      )
    )
  );


-- ============================================================
-- 5. CREATE HIDDEN STORY DRAFT
-- ============================================================
--
-- This implementation is deliberately independent from publish_post_draft().
-- Lovable databases that missed Create Foundation can therefore create Story
-- drafts without pulling in Poll/Location/Music schema first.
-- ============================================================

create or replace function public.create_story_draft(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_story_draft_function$
declare
  v_user uuid := auth.uid();
  v_media jsonb;
  v_kind text;
  v_visibility text;
  v_post_id uuid;
  v_media_id uuid;
  v_story_id uuid;
  v_storage_url text;
  v_storage_bucket text;
  v_storage_key text;
begin
  if v_user is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 1 then
    raise exception 'Story uchun aynan bitta rasm yoki video kerak';
  end if;

  v_media := p_payload -> 'media' -> 0;
  v_kind := coalesce(v_media ->> 'kind', '');
  v_visibility := coalesce(nullif(p_payload ->> 'visibility', ''), 'public');

  if v_kind not in ('image', 'video') then
    raise exception 'Story faqat rasm yoki video bo''lishi mumkin';
  end if;

  if v_visibility not in ('public', 'friends', 'private') then
    raise exception 'Noto''g''ri visibility';
  end if;

  v_storage_url := nullif(v_media ->> 'storageUrl', '');
  v_storage_bucket := nullif(v_media ->> 'storageBucket', '');
  v_storage_key := nullif(v_media ->> 'storageKey', '');

  if v_storage_url is null then
    raise exception 'Story media manzili topilmadi';
  end if;

  insert into public.posts (
    user_id,
    content,
    media_urls,
    media_type,
    visibility,
    tags,
    hashtags,
    effects_used,
    mentioned_users,
    post_kind,
    status,
    scheduled_at,
    published_at,
    edit_state
  )
  values (
    v_user,
    coalesce(p_payload ->> 'content', ''),
    array[v_storage_url]::text[],
    v_kind,
    v_visibility,
    array[]::text[],
    array[]::text[],
    array[]::text[],
    array[]::text[],
    'story',
    'draft',
    null,
    null,
    p_payload -> 'editState'
  )
  returning id into v_post_id;

  insert into public.post_media (
    post_id,
    position,
    kind,
    storage_url,
    storage_bucket,
    storage_key,
    thumbnail_url,
    thumbnail_bucket,
    thumbnail_key,
    mime_type,
    file_name,
    file_size,
    width,
    height,
    duration_seconds,
    aspect_ratio,
    alt_text,
    edit_state
  )
  values (
    v_post_id,
    0,
    v_kind::public.media_kind,
    v_storage_url,
    v_storage_bucket,
    v_storage_key,
    nullif(v_media ->> 'thumbnailUrl', ''),
    nullif(v_media ->> 'thumbnailBucket', ''),
    nullif(v_media ->> 'thumbnailKey', ''),
    nullif(v_media ->> 'mimeType', ''),
    nullif(v_media ->> 'fileName', ''),
    nullif(v_media ->> 'fileSize', '')::bigint,
    nullif(v_media ->> 'width', '')::integer,
    nullif(v_media ->> 'height', '')::integer,
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    nullif(v_media ->> 'aspectRatio', ''),
    nullif(v_media ->> 'altText', ''),
    v_media -> 'editState'
  )
  returning id into v_media_id;

  insert into public.stories (
    user_id,
    post_id,
    media_id,
    media_url,
    storage_bucket,
    storage_key,
    media_type,
    caption,
    duration,
    expires_at,
    is_active
  )
  values (
    v_user,
    v_post_id,
    v_media_id,
    v_storage_url,
    v_storage_bucket,
    v_storage_key,
    v_kind,
    nullif(p_payload ->> 'content', ''),
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    now() + interval '24 hours',
    false
  )
  returning id into v_story_id;

  return jsonb_build_object(
    'storyId', v_story_id,
    'postId', v_post_id,
    'mediaId', v_media_id
  );
end;
$create_story_draft_function$;

revoke all
  on function public.create_story_draft(jsonb)
  from public, anon;

grant execute
  on function public.create_story_draft(jsonb)
  to authenticated;


-- ============================================================
-- 6. ACTIVATE STORY DRAFT
-- ============================================================

create or replace function public.activate_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $activate_story_draft_function$
declare
  v_post_id uuid;
begin
  select s.post_id
  into v_post_id
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.user_id = auth.uid()
      and p.post_kind = 'story'
  ) then
    raise exception 'Story post topilmadi';
  end if;

  update public.stories
  set
    is_active = true,
    expires_at = now() + interval '24 hours'
  where id = p_story_id
    and user_id = auth.uid();

  update public.posts
  set
    status = 'published',
    published_at = now(),
    updated_at = now()
  where id = v_post_id
    and user_id = auth.uid();

  return true;
end;
$activate_story_draft_function$;

revoke all
  on function public.activate_story_draft(uuid)
  from public, anon;

grant execute
  on function public.activate_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 7. DISCARD STORY DRAFT
-- ============================================================

create or replace function public.discard_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $discard_story_draft_function$
declare
  v_post_id uuid;
  v_is_active boolean;
begin
  select
    s.post_id,
    coalesce(s.is_active, true)
  into
    v_post_id,
    v_is_active
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    return true;
  end if;

  if v_is_active then
    raise exception 'Live Story qoralama sifatida o''chirilmaydi';
  end if;

  delete from public.stories
  where id = p_story_id
    and user_id = auth.uid();

  delete from public.posts
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  return true;
end;
$discard_story_draft_function$;

revoke all
  on function public.discard_story_draft(uuid)
  from public, anon;

grant execute
  on function public.discard_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 8. STORY STICKER TYPE
-- ============================================================

do $story_sticker_type_bootstrap$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'story_sticker_type'
  ) then
    create type public.story_sticker_type as enum (
      'poll',
      'question',
      'quiz',
      'slider',
      'location',
      'music',
      'mention',
      'hashtag',
      'link',
      'countdown'
    );
  end if;
end;
$story_sticker_type_bootstrap$;


-- ============================================================
-- 9. STORY STICKERS + RESPONSES
-- ============================================================

create table if not exists public.story_stickers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid references public.post_media(id) on delete cascade,
  type public.story_sticker_type not null,
  x numeric not null default 0.5,
  y numeric not null default 0.5,
  scale numeric not null default 0.6,
  rotation numeric not null default 0,
  z integer not null default 0,
  start_seconds numeric,
  end_seconds numeric,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint story_stickers_position_check
    check (x >= -0.5 and x <= 1.5 and y >= -0.5 and y <= 1.5),
  constraint story_stickers_scale_check
    check (scale > 0 and scale <= 3),
  constraint story_stickers_window_check
    check (
      start_seconds is null
      or end_seconds is null
      or end_seconds > start_seconds
    ),
  constraint story_stickers_window_positive_check
    check (
      (start_seconds is null or start_seconds >= 0)
      and (end_seconds is null or end_seconds >= 0)
    )
);

create index if not exists story_stickers_post_idx
  on public.story_stickers (post_id, z);

create index if not exists story_stickers_media_idx
  on public.story_stickers (media_id);

create table if not exists public.story_sticker_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer,
  numeric_value numeric,
  text_answer text,
  created_at timestamptz not null default now(),
  unique (sticker_id, user_id)
);

create index if not exists story_sticker_responses_sticker_idx
  on public.story_sticker_responses (sticker_id);

alter table public.story_stickers enable row level security;
alter table public.story_sticker_responses enable row level security;

drop policy if exists "story_stickers_visible"
  on public.story_stickers;

create policy "story_stickers_visible"
  on public.story_stickers
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or (
            p.visibility = 'friends'
            and auth.uid() is not null
            and exists (
              select 1
              from public.follows f1
              where f1.follower_id = auth.uid()
                and f1.following_id = p.user_id
            )
            and exists (
              select 1
              from public.follows f2
              where f2.follower_id = p.user_id
                and f2.following_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "story_stickers_owner_write"
  on public.story_stickers;

create policy "story_stickers_owner_write"
  on public.story_stickers
  for all
  using (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "story_sticker_responses_read"
  on public.story_sticker_responses;

create policy "story_sticker_responses_read"
  on public.story_sticker_responses
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.story_stickers s
      join public.posts p on p.id = s.post_id
      where s.id = story_sticker_responses.sticker_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "story_sticker_responses_write"
  on public.story_sticker_responses;

create policy "story_sticker_responses_write"
  on public.story_sticker_responses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ============================================================
-- 10. VALIDATE STORY STICKER RESPONSE
-- ============================================================

create or replace function public.validate_story_sticker_response()
returns trigger
language plpgsql
set search_path = public
as $validate_story_sticker_response_function$
declare
  v_type public.story_sticker_type;
  v_config jsonb;
  v_options integer;
begin
  select type, config
  into v_type, v_config
  from public.story_stickers
  where id = new.sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if v_type in ('poll', 'quiz') then
    v_options := coalesce(jsonb_array_length(v_config -> 'options'), 0);

    if new.option_index is null then
      raise exception 'Variant tanlanishi kerak';
    end if;

    if new.option_index < 0 or new.option_index >= v_options then
      raise exception 'Variant mavjud emas';
    end if;

    new.numeric_value := null;
    new.text_answer := null;

  elsif v_type = 'slider' then
    if new.numeric_value is null
       or new.numeric_value < 0
       or new.numeric_value > 100 then
      raise exception 'Slayder qiymati 0..100 oralig''ida bo''lishi kerak';
    end if;

    new.option_index := null;
    new.text_answer := null;

  elsif v_type = 'question' then
    if new.text_answer is null
       or length(btrim(new.text_answer)) = 0 then
      raise exception 'Javob matni bo''sh bo''lmasligi kerak';
    end if;

    new.text_answer := left(btrim(new.text_answer), 280);
    new.option_index := null;
    new.numeric_value := null;

  else
    raise exception 'Bu stiker turi javob qabul qilmaydi';
  end if;

  return new;
end;
$validate_story_sticker_response_function$;

drop trigger if exists validate_story_sticker_response_trigger
  on public.story_sticker_responses;

create trigger validate_story_sticker_response_trigger
  before insert or update
  on public.story_sticker_responses
  for each row
  execute function public.validate_story_sticker_response();


-- ============================================================
-- 11. RESPOND TO STORY STICKER
-- ============================================================

create or replace function public.respond_story_sticker(
  p_sticker_id uuid,
  p_option_index integer default null,
  p_numeric_value numeric default null,
  p_text_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $respond_story_sticker_function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_post_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select s.post_id
  into v_post_id
  from public.story_stickers s
  where s.id = p_sticker_id;

  if v_post_id is null then
    raise exception 'Stiker topilmadi';
  end if;

  insert into public.story_sticker_responses (
    sticker_id,
    user_id,
    option_index,
    numeric_value,
    text_answer
  )
  values (
    p_sticker_id,
    v_user,
    p_option_index,
    p_numeric_value,
    p_text_answer
  )
  on conflict (sticker_id, user_id)
  do update set
    option_index = excluded.option_index,
    numeric_value = excluded.numeric_value,
    text_answer = excluded.text_answer,
    created_at = now()
  returning id into v_id;

  return v_id;
end;
$respond_story_sticker_function$;


-- ============================================================
-- 12. STORY STICKER RESULTS
-- ============================================================

create or replace function public.story_sticker_results(
  p_sticker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $story_sticker_results_function$
declare
  v_user uuid := auth.uid();
  v_type public.story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_total integer;
  v_result jsonb;
begin
  select
    s.type,
    s.config,
    (p.user_id = v_user)
  into
    v_type,
    v_config,
    v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  select count(*)
  into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts',
        coalesce(
          jsonb_object_agg(option_index::text, cnt),
          '{}'::jsonb
        ),
      'myChoice',
        (
          select option_index
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
            and user_id = v_user
        ),
      'correctIndex',
        case
          when v_type = 'quiz'
            then v_config -> 'correctIndex'
          else null
        end
    )
    into v_result
    from (
      select option_index, count(*) as cnt
      from public.story_sticker_responses
      where sticker_id = p_sticker_id
      group by option_index
    ) grouped;

  elsif v_type = 'slider' then
    select jsonb_build_object(
      'type', 'slider',
      'total', v_total,
      'average', round(coalesce(avg(numeric_value), 0), 1),
      'myValue',
        (
          select numeric_value
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
            and user_id = v_user
        )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers',
        case
          when v_is_owner then (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'userId', user_id,
                  'text', text_answer,
                  'createdAt', created_at
                )
                order by created_at desc
              ),
              '[]'::jsonb
            )
            from public.story_sticker_responses
            where sticker_id = p_sticker_id
          )
          else '[]'::jsonb
        end
    );

  else
    v_result := jsonb_build_object(
      'type', v_type,
      'total', 0
    );
  end if;

  return coalesce(
    v_result,
    jsonb_build_object(
      'type', v_type,
      'total', v_total
    )
  );
end;
$story_sticker_results_function$;

revoke all
  on function public.respond_story_sticker(
    uuid,
    integer,
    numeric,
    text
  )
  from public, anon;

revoke all
  on function public.story_sticker_results(uuid)
  from public, anon;

grant execute
  on function public.respond_story_sticker(
    uuid,
    integer,
    numeric,
    text
  )
  to authenticated;

grant execute
  on function public.story_sticker_results(uuid)
  to authenticated;


-- ============================================================
-- 13. POSTGREST SCHEMA CACHE + VERIFICATION
-- ============================================================

notify pgrst, 'reload schema';

select
  to_regclass('public.post_media') as post_media_table,
  to_regclass('public.places') as places_table,
  to_regclass('public.post_locations') as post_locations_table,
  to_regclass('public.music_tracks') as music_tracks_table,
  to_regclass('public.post_music') as post_music_table,
  to_regclass('public.story_stickers') as story_stickers_table,
  to_regclass('public.story_sticker_responses') as story_sticker_responses_table;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_story_draft',
    'activate_story_draft',
    'discard_story_draft',
    'respond_story_sticker',
    'story_sticker_results'
  )
order by p.proname;


-- ============================================================
-- DONE
-- ============================================================
 then 'video'
      else 'image'
    end
  )::public.media_kind,
  media_item.value,
  case when media_item.ordinality = 1 then p.thumbnail_url else null end
from public.posts p
cross join lateral unnest(
  coalesce(p.media_urls, array[]::text[])
) with ordinality as media_item(value, ordinality)
where nullif(media_item.value, '') is not null
  and not exists (
    select 1
    from public.post_media pm
    where pm.post_id = p.id
      and pm.position = (media_item.ordinality - 1)::integer
  );

-- ============================================================
-- 4. STORIES — CANONICAL LINK COLUMNS
-- ============================================================

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

alter table public.stories
  add column if not exists media_id uuid references public.post_media(id) on delete set null;

alter table public.stories
  add column if not exists storage_bucket text;

alter table public.stories
  add column if not exists storage_key text;

alter table public.stories
  add column if not exists is_active boolean not null default true;

create unique index if not exists stories_post_id_uniq
  on public.stories (post_id)
  where post_id is not null;

create index if not exists stories_active_post_idx
  on public.stories (expires_at desc, post_id)
  where is_active is distinct from false;

alter table public.stories enable row level security;

drop policy if exists "stories_select_visible"
  on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and (
        post_id is null
        or exists (
          select 1
          from public.posts p
          where p.id = stories.post_id
            and (
              p.visibility = 'public'
              or p.user_id = auth.uid()
              or (
                p.visibility = 'friends'
                and auth.uid() is not null
                and exists (
                  select 1
                  from public.follows f1
                  where f1.follower_id = auth.uid()
                    and f1.following_id = p.user_id
                )
                and exists (
                  select 1
                  from public.follows f2
                  where f2.follower_id = p.user_id
                    and f2.following_id = auth.uid()
                )
              )
            )
        )
      )
    )
  );


-- ============================================================
-- 5. CREATE HIDDEN STORY DRAFT
-- ============================================================
--
-- This implementation is deliberately independent from publish_post_draft().
-- Lovable databases that missed Create Foundation can therefore create Story
-- drafts without pulling in Poll/Location/Music schema first.
-- ============================================================

create or replace function public.create_story_draft(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_story_draft_function$
declare
  v_user uuid := auth.uid();
  v_media jsonb;
  v_kind text;
  v_visibility text;
  v_post_id uuid;
  v_media_id uuid;
  v_story_id uuid;
  v_storage_url text;
  v_storage_bucket text;
  v_storage_key text;
begin
  if v_user is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 1 then
    raise exception 'Story uchun aynan bitta rasm yoki video kerak';
  end if;

  v_media := p_payload -> 'media' -> 0;
  v_kind := coalesce(v_media ->> 'kind', '');
  v_visibility := coalesce(nullif(p_payload ->> 'visibility', ''), 'public');

  if v_kind not in ('image', 'video') then
    raise exception 'Story faqat rasm yoki video bo''lishi mumkin';
  end if;

  if v_visibility not in ('public', 'friends', 'private') then
    raise exception 'Noto''g''ri visibility';
  end if;

  v_storage_url := nullif(v_media ->> 'storageUrl', '');
  v_storage_bucket := nullif(v_media ->> 'storageBucket', '');
  v_storage_key := nullif(v_media ->> 'storageKey', '');

  if v_storage_url is null then
    raise exception 'Story media manzili topilmadi';
  end if;

  insert into public.posts (
    user_id,
    content,
    media_urls,
    media_type,
    visibility,
    tags,
    hashtags,
    effects_used,
    mentioned_users,
    post_kind,
    status,
    scheduled_at,
    published_at,
    edit_state
  )
  values (
    v_user,
    coalesce(p_payload ->> 'content', ''),
    coalesce(
      (
        select array_agg(value order by ordinality)
        from jsonb_array_elements_text(
          coalesce(p_payload -> 'mediaUrls', '[]'::jsonb)
        ) with ordinality as urls(value, ordinality)
      ),
      array[]::text[]
    ),
    v_kind,
    v_visibility,
    array[]::text[],
    array[]::text[],
    array[]::text[],
    array[]::text[],
    'story',
    'draft',
    null,
    null,
    p_payload -> 'editState'
  )
  returning id into v_post_id;

  insert into public.post_media (
    post_id,
    position,
    kind,
    storage_url,
    storage_bucket,
    storage_key,
    thumbnail_url,
    thumbnail_bucket,
    thumbnail_key,
    mime_type,
    file_name,
    file_size,
    width,
    height,
    duration_seconds,
    aspect_ratio,
    alt_text,
    edit_state
  )
  values (
    v_post_id,
    0,
    v_kind::public.media_kind,
    v_storage_url,
    v_storage_bucket,
    v_storage_key,
    nullif(v_media ->> 'thumbnailUrl', ''),
    nullif(v_media ->> 'thumbnailBucket', ''),
    nullif(v_media ->> 'thumbnailKey', ''),
    nullif(v_media ->> 'mimeType', ''),
    nullif(v_media ->> 'fileName', ''),
    nullif(v_media ->> 'fileSize', '')::bigint,
    nullif(v_media ->> 'width', '')::integer,
    nullif(v_media ->> 'height', '')::integer,
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    nullif(v_media ->> 'aspectRatio', ''),
    nullif(v_media ->> 'altText', ''),
    v_media -> 'editState'
  )
  returning id into v_media_id;

  insert into public.stories (
    user_id,
    post_id,
    media_id,
    media_url,
    storage_bucket,
    storage_key,
    media_type,
    caption,
    duration,
    expires_at,
    is_active
  )
  values (
    v_user,
    v_post_id,
    v_media_id,
    v_storage_url,
    v_storage_bucket,
    v_storage_key,
    v_kind,
    nullif(p_payload ->> 'content', ''),
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    now() + interval '24 hours',
    false
  )
  returning id into v_story_id;

  return jsonb_build_object(
    'storyId', v_story_id,
    'postId', v_post_id,
    'mediaId', v_media_id
  );
end;
$create_story_draft_function$;

revoke all
  on function public.create_story_draft(jsonb)
  from public, anon;

grant execute
  on function public.create_story_draft(jsonb)
  to authenticated;


-- ============================================================
-- 6. ACTIVATE STORY DRAFT
-- ============================================================

create or replace function public.activate_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $activate_story_draft_function$
declare
  v_post_id uuid;
begin
  select s.post_id
  into v_post_id
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.user_id = auth.uid()
      and p.post_kind = 'story'
  ) then
    raise exception 'Story post topilmadi';
  end if;

  update public.stories
  set
    is_active = true,
    expires_at = now() + interval '24 hours'
  where id = p_story_id
    and user_id = auth.uid();

  update public.posts
  set
    status = 'published',
    published_at = now(),
    updated_at = now()
  where id = v_post_id
    and user_id = auth.uid();

  return true;
end;
$activate_story_draft_function$;

revoke all
  on function public.activate_story_draft(uuid)
  from public, anon;

grant execute
  on function public.activate_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 7. DISCARD STORY DRAFT
-- ============================================================

create or replace function public.discard_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $discard_story_draft_function$
declare
  v_post_id uuid;
  v_is_active boolean;
begin
  select
    s.post_id,
    coalesce(s.is_active, true)
  into
    v_post_id,
    v_is_active
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    return true;
  end if;

  if v_is_active then
    raise exception 'Live Story qoralama sifatida o''chirilmaydi';
  end if;

  delete from public.stories
  where id = p_story_id
    and user_id = auth.uid();

  delete from public.posts
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  return true;
end;
$discard_story_draft_function$;

revoke all
  on function public.discard_story_draft(uuid)
  from public, anon;

grant execute
  on function public.discard_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 8. STORY STICKER TYPE
-- ============================================================

do $story_sticker_type_bootstrap$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'story_sticker_type'
  ) then
    create type public.story_sticker_type as enum (
      'poll',
      'question',
      'quiz',
      'slider',
      'location',
      'music',
      'mention',
      'hashtag',
      'link',
      'countdown'
    );
  end if;
end;
$story_sticker_type_bootstrap$;


-- ============================================================
-- 9. STORY STICKERS + RESPONSES
-- ============================================================

create table if not exists public.story_stickers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid references public.post_media(id) on delete cascade,
  type public.story_sticker_type not null,
  x numeric not null default 0.5,
  y numeric not null default 0.5,
  scale numeric not null default 0.6,
  rotation numeric not null default 0,
  z integer not null default 0,
  start_seconds numeric,
  end_seconds numeric,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint story_stickers_position_check
    check (x >= -0.5 and x <= 1.5 and y >= -0.5 and y <= 1.5),
  constraint story_stickers_scale_check
    check (scale > 0 and scale <= 3),
  constraint story_stickers_window_check
    check (
      start_seconds is null
      or end_seconds is null
      or end_seconds > start_seconds
    ),
  constraint story_stickers_window_positive_check
    check (
      (start_seconds is null or start_seconds >= 0)
      and (end_seconds is null or end_seconds >= 0)
    )
);

create index if not exists story_stickers_post_idx
  on public.story_stickers (post_id, z);

create index if not exists story_stickers_media_idx
  on public.story_stickers (media_id);

create table if not exists public.story_sticker_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer,
  numeric_value numeric,
  text_answer text,
  created_at timestamptz not null default now(),
  unique (sticker_id, user_id)
);

create index if not exists story_sticker_responses_sticker_idx
  on public.story_sticker_responses (sticker_id);

alter table public.story_stickers enable row level security;
alter table public.story_sticker_responses enable row level security;

drop policy if exists "story_stickers_visible"
  on public.story_stickers;

create policy "story_stickers_visible"
  on public.story_stickers
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or (
            p.visibility = 'friends'
            and auth.uid() is not null
            and exists (
              select 1
              from public.follows f1
              where f1.follower_id = auth.uid()
                and f1.following_id = p.user_id
            )
            and exists (
              select 1
              from public.follows f2
              where f2.follower_id = p.user_id
                and f2.following_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "story_stickers_owner_write"
  on public.story_stickers;

create policy "story_stickers_owner_write"
  on public.story_stickers
  for all
  using (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = story_stickers.post_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "story_sticker_responses_read"
  on public.story_sticker_responses;

create policy "story_sticker_responses_read"
  on public.story_sticker_responses
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.story_stickers s
      join public.posts p on p.id = s.post_id
      where s.id = story_sticker_responses.sticker_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "story_sticker_responses_write"
  on public.story_sticker_responses;

create policy "story_sticker_responses_write"
  on public.story_sticker_responses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ============================================================
-- 10. VALIDATE STORY STICKER RESPONSE
-- ============================================================

create or replace function public.validate_story_sticker_response()
returns trigger
language plpgsql
set search_path = public
as $validate_story_sticker_response_function$
declare
  v_type public.story_sticker_type;
  v_config jsonb;
  v_options integer;
begin
  select type, config
  into v_type, v_config
  from public.story_stickers
  where id = new.sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if v_type in ('poll', 'quiz') then
    v_options := coalesce(jsonb_array_length(v_config -> 'options'), 0);

    if new.option_index is null then
      raise exception 'Variant tanlanishi kerak';
    end if;

    if new.option_index < 0 or new.option_index >= v_options then
      raise exception 'Variant mavjud emas';
    end if;

    new.numeric_value := null;
    new.text_answer := null;

  elsif v_type = 'slider' then
    if new.numeric_value is null
       or new.numeric_value < 0
       or new.numeric_value > 100 then
      raise exception 'Slayder qiymati 0..100 oralig''ida bo''lishi kerak';
    end if;

    new.option_index := null;
    new.text_answer := null;

  elsif v_type = 'question' then
    if new.text_answer is null
       or length(btrim(new.text_answer)) = 0 then
      raise exception 'Javob matni bo''sh bo''lmasligi kerak';
    end if;

    new.text_answer := left(btrim(new.text_answer), 280);
    new.option_index := null;
    new.numeric_value := null;

  else
    raise exception 'Bu stiker turi javob qabul qilmaydi';
  end if;

  return new;
end;
$validate_story_sticker_response_function$;

drop trigger if exists validate_story_sticker_response_trigger
  on public.story_sticker_responses;

create trigger validate_story_sticker_response_trigger
  before insert or update
  on public.story_sticker_responses
  for each row
  execute function public.validate_story_sticker_response();


-- ============================================================
-- 11. RESPOND TO STORY STICKER
-- ============================================================

create or replace function public.respond_story_sticker(
  p_sticker_id uuid,
  p_option_index integer default null,
  p_numeric_value numeric default null,
  p_text_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $respond_story_sticker_function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_post_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select s.post_id
  into v_post_id
  from public.story_stickers s
  where s.id = p_sticker_id;

  if v_post_id is null then
    raise exception 'Stiker topilmadi';
  end if;

  insert into public.story_sticker_responses (
    sticker_id,
    user_id,
    option_index,
    numeric_value,
    text_answer
  )
  values (
    p_sticker_id,
    v_user,
    p_option_index,
    p_numeric_value,
    p_text_answer
  )
  on conflict (sticker_id, user_id)
  do update set
    option_index = excluded.option_index,
    numeric_value = excluded.numeric_value,
    text_answer = excluded.text_answer,
    created_at = now()
  returning id into v_id;

  return v_id;
end;
$respond_story_sticker_function$;


-- ============================================================
-- 12. STORY STICKER RESULTS
-- ============================================================

create or replace function public.story_sticker_results(
  p_sticker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $story_sticker_results_function$
declare
  v_user uuid := auth.uid();
  v_type public.story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_total integer;
  v_result jsonb;
begin
  select
    s.type,
    s.config,
    (p.user_id = v_user)
  into
    v_type,
    v_config,
    v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  select count(*)
  into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts',
        coalesce(
          jsonb_object_agg(option_index::text, cnt),
          '{}'::jsonb
        ),
      'myChoice',
        (
          select option_index
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
            and user_id = v_user
        ),
      'correctIndex',
        case
          when v_type = 'quiz'
            then v_config -> 'correctIndex'
          else null
        end
    )
    into v_result
    from (
      select option_index, count(*) as cnt
      from public.story_sticker_responses
      where sticker_id = p_sticker_id
      group by option_index
    ) grouped;

  elsif v_type = 'slider' then
    select jsonb_build_object(
      'type', 'slider',
      'total', v_total,
      'average', round(coalesce(avg(numeric_value), 0), 1),
      'myValue',
        (
          select numeric_value
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
            and user_id = v_user
        )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers',
        case
          when v_is_owner then (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'userId', user_id,
                  'text', text_answer,
                  'createdAt', created_at
                )
                order by created_at desc
              ),
              '[]'::jsonb
            )
            from public.story_sticker_responses
            where sticker_id = p_sticker_id
          )
          else '[]'::jsonb
        end
    );

  else
    v_result := jsonb_build_object(
      'type', v_type,
      'total', 0
    );
  end if;

  return coalesce(
    v_result,
    jsonb_build_object(
      'type', v_type,
      'total', v_total
    )
  );
end;
$story_sticker_results_function$;

revoke all
  on function public.respond_story_sticker(
    uuid,
    integer,
    numeric,
    text
  )
  from public, anon;

revoke all
  on function public.story_sticker_results(uuid)
  from public, anon;

grant execute
  on function public.respond_story_sticker(
    uuid,
    integer,
    numeric,
    text
  )
  to authenticated;

grant execute
  on function public.story_sticker_results(uuid)
  to authenticated;


-- ============================================================
-- 13. POSTGREST SCHEMA CACHE + VERIFICATION
-- ============================================================

notify pgrst, 'reload schema';

select
  to_regclass('public.post_media') as post_media_table,
  to_regclass('public.story_stickers') as story_stickers_table,
  to_regclass('public.story_sticker_responses') as story_sticker_responses_table;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_story_draft',
    'activate_story_draft',
    'discard_story_draft',
    'respond_story_sticker',
    'story_sticker_results'
  )
order by p.proname;


-- ============================================================
-- DONE
-- ============================================================
