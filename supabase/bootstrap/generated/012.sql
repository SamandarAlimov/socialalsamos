-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260830091000_atomic_create_publish.sql
-- SHA256 7c417389ff60004ae151457763b5165ca62d5821df3c558fee23f625497d97ef
-- ============================================================================
-- =============================================================================
-- Atomic Create publishing
--
-- Binary uploads happen before this RPC. Everything that belongs to the
-- database post graph is written in one PostgreSQL transaction: post, media,
-- poll/options, location/place, music and collaboration invitations.
-- Any database error aborts the whole graph instead of leaving a half-post.
-- =============================================================================

create or replace function public.publish_post_draft(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_poll_id uuid;
  v_place_id uuid;
  v_track_id uuid;
  v_item jsonb;
  v_location jsonb := p_payload -> 'location';
  v_music jsonb := p_payload -> 'music';
  v_poll jsonb := p_payload -> 'poll';
  v_place jsonb;
  v_track jsonb;
  v_correct_index int;
  v_position int := 0;
  v_source_index int := 0;
  v_option_id uuid;
  v_scheduled_at timestamptz;
  v_visibility text := coalesce(nullif(p_payload ->> 'visibility', ''), 'public');
  v_post_kind text := coalesce(nullif(p_payload ->> 'postKind', ''), 'post');
begin
  if v_user_id is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if v_visibility not in ('public', 'friends', 'private') then
    raise exception 'Noto''g''ri visibility';
  end if;

  if v_post_kind not in ('post', 'reel', 'story', 'location', 'poll', 'file') then
    raise exception 'Noto''g''ri post turi';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    v_scheduled_at := (p_payload ->> 'scheduledAt')::timestamptz;
  end if;

  insert into public.posts (
    user_id,
    content,
    media_urls,
    media_type,
    visibility,
    post_kind,
    status,
    scheduled_at,
    published_at,
    edit_state
  )
  values (
    v_user_id,
    coalesce(p_payload ->> 'content', ''),
    coalesce(
      (select array_agg(value order by ordinality)
       from jsonb_array_elements_text(coalesce(p_payload -> 'mediaUrls', '[]'::jsonb))
       with ordinality as urls(value, ordinality)),
      array[]::text[]
    ),
    coalesce(nullif(p_payload ->> 'mediaType', ''), 'text'),
    v_visibility,
    v_post_kind,
    case when v_scheduled_at is null then 'published' else 'scheduled' end,
    v_scheduled_at,
    case when v_scheduled_at is null then now() else null end,
    p_payload -> 'editState'
  )
  returning id into v_post_id;

  -- Structured media metadata
  v_position := 0;
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'media', '[]'::jsonb))
  loop
    insert into public.post_media (
      post_id, position, kind, storage_url, thumbnail_url, mime_type,
      file_name, file_size, width, height, duration_seconds, aspect_ratio,
      alt_text, edit_state
    )
    values (
      v_post_id,
      v_position,
      coalesce(nullif(v_item ->> 'kind', ''), 'other')::public.media_kind,
      v_item ->> 'storageUrl',
      nullif(v_item ->> 'thumbnailUrl', ''),
      nullif(v_item ->> 'mimeType', ''),
      nullif(v_item ->> 'fileName', ''),
      nullif(v_item ->> 'fileSize', '')::bigint,
      nullif(v_item ->> 'width', '')::int,
      nullif(v_item ->> 'height', '')::int,
      nullif(v_item ->> 'durationSeconds', '')::numeric,
      nullif(v_item ->> 'aspectRatio', ''),
      nullif(v_item ->> 'altText', ''),
      v_item -> 'editState'
    );
    v_position := v_position + 1;
  end loop;

  -- Poll + options
  if v_poll is not null and jsonb_typeof(v_poll) = 'object' then
    if length(trim(coalesce(v_poll ->> 'question', ''))) = 0 then
      raise exception 'So''rovnoma savoli bo''sh';
    end if;

    insert into public.polls (
      post_id, question, allow_multiple, max_choices, is_anonymous,
      show_results_before_vote, quiz_mode, explanation, closes_at, poll_type
    )
    values (
      v_post_id,
      trim(v_poll ->> 'question'),
      coalesce((v_poll ->> 'allowMultiple')::boolean, false),
      case
        when coalesce((v_poll ->> 'allowMultiple')::boolean, false)
          then nullif(v_poll ->> 'maxChoices', '')::int
        else null
      end,
      coalesce((v_poll ->> 'isAnonymous')::boolean, false),
      coalesce((v_poll ->> 'showResultsBeforeVote')::boolean, false),
      coalesce((v_poll ->> 'quizMode')::boolean, false),
      nullif(v_poll ->> 'explanation', ''),
      nullif(v_poll ->> 'closesAt', '')::timestamptz,
      case when coalesce((v_poll ->> 'quizMode')::boolean, false)
        then 'quiz'::public.poll_type
        else 'standard'::public.poll_type
      end
    )
    returning id into v_poll_id;

    v_correct_index := nullif(v_poll ->> 'correctOptionIndex', '')::int;
    v_position := 0;
    v_source_index := 0;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_poll -> 'options', '[]'::jsonb))
    loop
      if length(trim(coalesce(v_item ->> 'label', ''))) > 0 then
        insert into public.poll_options (
          poll_id, position, label, emoji, image_url
        )
        values (
          v_poll_id,
          v_position,
          trim(v_item ->> 'label'),
          nullif(v_item ->> 'emoji', ''),
          nullif(v_item ->> 'imageUrl', '')
        )
        returning id into v_option_id;

        if v_correct_index is not null and v_correct_index = v_source_index then
          update public.polls
          set correct_option_id = v_option_id
          where id = v_poll_id;
        end if;

        v_position := v_position + 1;
      end if;

      v_source_index := v_source_index + 1;
    end loop;

    if v_position < 2 then
      raise exception 'So''rovnomada kamida 2 ta variant bo''lishi kerak';
    end if;

    if v_position > 12 then
      raise exception 'So''rovnomada ko''pi bilan 12 ta variant bo''lishi mumkin';
    end if;

    if coalesce((v_poll ->> 'quizMode')::boolean, false)
       and (
         v_correct_index is null
         or not exists (
           select 1 from public.polls
           where id = v_poll_id and correct_option_id is not null
         )
       ) then
      raise exception 'Viktorina uchun to''g''ri javob belgilanmagan';
    end if;
  end if;

  -- Location + optional reusable place
  if v_location is not null and jsonb_typeof(v_location) = 'object' then
    v_place := v_location -> 'place';
    v_place_id := null;

    if v_place is not null and jsonb_typeof(v_place) = 'object' then
      if nullif(v_place ->> 'externalSource', '') is not null
         and nullif(v_place ->> 'externalId', '') is not null then
        select id into v_place_id
        from public.places
        where external_source = v_place ->> 'externalSource'
          and external_id = v_place ->> 'externalId'
        limit 1;
      end if;

      if v_place_id is null then
        begin
          insert into public.places (
            name, address, category, latitude, longitude,
            external_source, external_id, created_by
          )
          values (
            coalesce(nullif(v_place ->> 'name', ''), coalesce(v_location ->> 'label', 'Joylashuv')),
            nullif(v_place ->> 'address', ''),
            nullif(v_place ->> 'category', ''),
            (v_location ->> 'latitude')::double precision,
            (v_location ->> 'longitude')::double precision,
            nullif(v_place ->> 'externalSource', ''),
            nullif(v_place ->> 'externalId', ''),
            v_user_id
          )
          returning id into v_place_id;
        exception when unique_violation then
          select id into v_place_id
          from public.places
          where external_source = v_place ->> 'externalSource'
            and external_id = v_place ->> 'externalId'
          limit 1;
        end;
      end if;
    end if;

    insert into public.post_locations (
      post_id, place_id, mode, label, latitude, longitude,
      accuracy_m, live_until
    )
    values (
      v_post_id,
      v_place_id,
      coalesce(nullif(v_location ->> 'mode', ''), 'place')::public.post_location_mode,
      coalesce(nullif(v_location ->> 'label', ''), nullif(v_place ->> 'name', '')),
      (v_location ->> 'latitude')::double precision,
      (v_location ->> 'longitude')::double precision,
      nullif(v_location ->> 'accuracyM', '')::double precision,
      case
        when coalesce(v_location ->> 'mode', 'place') = 'live'
          then nullif(v_location ->> 'liveUntil', '')::timestamptz
        else null
      end
    );
  end if;

  -- Music: existing catalog track or newly uploaded device track
  if v_music is not null and jsonb_typeof(v_music) = 'object' then
    v_track_id := nullif(v_music ->> 'trackId', '')::uuid;
    v_track := v_music -> 'track';

    if v_track_id is null and v_track is not null and jsonb_typeof(v_track) = 'object' then
      insert into public.music_tracks (
        title, artist, audio_url, cover_url, duration_seconds, source,
        external_id, license, attribution, owner_id, is_public
      )
      values (
        v_track ->> 'title',
        nullif(v_track ->> 'artist', ''),
        v_track ->> 'audioUrl',
        nullif(v_track ->> 'coverUrl', ''),
        nullif(v_track ->> 'durationSeconds', '')::numeric,
        coalesce(nullif(v_track ->> 'source', ''), 'device')::public.music_source,
        nullif(v_track ->> 'externalId', ''),
        nullif(v_track ->> 'license', ''),
        nullif(v_track ->> 'attribution', ''),
        coalesce(nullif(v_track ->> 'ownerId', '')::uuid, v_user_id),
        coalesce((v_track ->> 'isPublic')::boolean, false)
      )
      returning id into v_track_id;
    end if;

    if v_track_id is not null then
      insert into public.post_music (
        post_id, track_id, start_seconds, end_seconds, volume, muted_original
      )
      values (
        v_post_id,
        v_track_id,
        coalesce(nullif(v_music ->> 'startSeconds', '')::numeric, 0),
        nullif(v_music ->> 'endSeconds', '')::numeric,
        coalesce(nullif(v_music ->> 'volume', '')::numeric, 1),
        coalesce((v_music ->> 'mutedOriginal')::boolean, false)
      );
    end if;
  end if;

  -- Collaboration invitations: deduplicated and hard-capped at ten.
  insert into public.post_collaborators (post_id, user_id, invited_by, status)
  select
    v_post_id,
    collaborator_id,
    v_user_id,
    'pending'
  from (
    select distinct value::uuid as collaborator_id
    from jsonb_array_elements_text(coalesce(p_payload -> 'collaboratorIds', '[]'::jsonb))
    where value::uuid <> v_user_id
    limit 10
  ) collaborators;

  return v_post_id;
end
$$;

revoke all on function public.publish_post_draft(jsonb) from public;
grant execute on function public.publish_post_draft(jsonb) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830092000_create_visibility_media.sql
-- SHA256 4c4132aaa3605c211c4d27d6209d3475a3890c1dc7f5ac6b46dc89d3f86bf3a0
-- ============================================================================
-- =============================================================================
-- Create P0: visibility-aware posts and private media references
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical post visibility
--    "friends" = ikki tomonlama follow (mutual follow).
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
        or (
          p.visibility = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
          and exists (
            select 1
            from public.follows f
            where f.follower_id = p.user_id
              and f.following_id = auth.uid()
          )
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

-- Dastlabki policy friends semantikasini bilmaydi. Bitta canonical SELECT
-- policy qoldiramiz; metadata jadvallari ham xuddi shu funksiyaga tayanadi.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));


-- post_hashtags eski DBlarda noma'lum SELECT policy bilan kelgan bo'lishi mumkin.
-- Barcha SELECT policy nomlarini katalogdan olib tashlab, bitta canonical policy
-- yaratamiz. Write'lar posts triggeri orqali SECURITY DEFINER bilan bajariladi.
do $
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'post_hashtags'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.post_hashtags',
      v_policy.policyname
    );
  end loop;
end
$;

create policy "post_hashtags_select"
  on public.post_hashtags
  for select
  using (public.can_view_post(post_id));

-- Public hashtag katalogi private/friends postlar borligini count/search orqali
-- oshkor qilmasin. Faqat public postlar katalog countiga kiradi.
create or replace function public.sync_hashtag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_id uuid;
begin
  v_id := coalesce(new.hashtag_id, old.hashtag_id);

  update public.hashtags h
  set posts_count = (
    select count(*)
    from public.post_hashtags ph
    join public.posts p on p.id = ph.post_id
    where ph.hashtag_id = h.id
      and p.visibility = 'public'
  )
  where h.id = v_id;

  return null;
end
$;

update public.hashtags h
set posts_count = (
  select count(*)
  from public.post_hashtags ph
  join public.posts p on p.id = ph.post_id
  where ph.hashtag_id = h.id
    and p.visibility = 'public'
);

create or replace function public.search_hashtags(p_query text, p_limit int default 12)
returns table (id uuid, tag text, posts_count int)
language sql
stable
security definer
set search_path = public
as $
  with q as (select lower(trim(both '#' from coalesce(p_query, ''))) as term)
  select h.id, h.tag, h.posts_count
  from public.hashtags h, q
  where h.posts_count > 0
    and (q.term = '' or h.tag like q.term || '%' or h.tag % q.term)
  order by
    case when q.term <> '' and h.tag like q.term || '%' then 0 else 1 end,
    h.posts_count desc,
    h.last_used_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$;

-- ---------------------------------------------------------------------------
-- 2. Stable Storage references
--    Private signed URL vaqtinchalik bo'lgani uchun DB ga URL emas,
--    bucket + key yoziladi. storage_url legacy/public compatibility uchun qoladi.
-- ---------------------------------------------------------------------------
alter table public.post_media
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_key text;

create index if not exists post_media_storage_object_idx
  on public.post_media (storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;

create index if not exists post_media_thumbnail_object_idx
  on public.post_media (thumbnail_bucket, thumbnail_key)
  where thumbnail_bucket is not null and thumbnail_key is not null;

create or replace function public.normalize_post_media_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_ref text;
begin
  -- storage://bucket/path/to/object ni bucket/key ga ajratamiz.
  if new.storage_bucket is null
     and new.storage_key is null
     and new.storage_url like 'storage://%' then
    v_ref := substring(new.storage_url from 11);
    new.storage_bucket := split_part(v_ref, '/', 1);
    new.storage_key := substring(v_ref from length(new.storage_bucket) + 2);
  end if;

  if new.thumbnail_bucket is null
     and new.thumbnail_key is null
     and new.thumbnail_url like 'storage://%' then
    v_ref := substring(new.thumbnail_url from 11);
    new.thumbnail_bucket := split_part(v_ref, '/', 1);
    new.thumbnail_key := substring(v_ref from length(new.thumbnail_bucket) + 2);
  end if;

  select p.visibility into v_visibility
  from public.posts p
  where p.id = new.post_id;

  if v_visibility is null then
    raise exception 'Post topilmadi';
  end if;

  -- Friends/private post hech qachon ommaviy bucket obyektiga bog'lanmasin.
  if v_visibility <> 'public' then
    if new.storage_bucket is distinct from 'media-private'
       or new.storage_key is null
       or length(new.storage_key) = 0 then
      raise exception 'Maxfiy post fayli private storage da bo''lishi shart';
    end if;

    if new.thumbnail_url is not null
       and (
         new.thumbnail_bucket is distinct from 'media-private'
         or new.thumbnail_key is null
         or length(new.thumbnail_key) = 0
       ) then
      raise exception 'Maxfiy post preview fayli private storage da bo''lishi shart';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists post_media_normalize_storage on public.post_media;
create trigger post_media_normalize_storage
  before insert or update of storage_url, thumbnail_url, storage_bucket, storage_key,
    thumbnail_bucket, thumbnail_key
  on public.post_media
  for each row execute function public.normalize_post_media_storage();

-- Storage RLS uchun SECURITY DEFINER helper. Viewer faqat o'zi ko'ra oladigan
-- postga bog'langan private obyektga signed URL ola oladi.
create or replace function public.can_view_post_media_object(
  p_bucket text,
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.post_media pm
    where (
      (pm.storage_bucket = p_bucket and pm.storage_key = p_key)
      or (pm.thumbnail_bucket = p_bucket and pm.thumbnail_key = p_key)
    )
      and public.can_view_post(pm.post_id)
  );
$$;

revoke all on function public.can_view_post_media_object(text, text) from public;
grant execute on function public.can_view_post_media_object(text, text) to authenticated;

-- Old owner-only reader is replaced with post visibility aware reader.
drop policy if exists "Private media readable by owner" on storage.objects;
drop policy if exists "Private media readable by post viewers" on storage.objects;

create policy "Private media readable by post viewers"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_post_media_object(bucket_id, name)
    )
  );


-- ============================================================================
-- SOURCE B-web: 20260830093000_create_foundation_ready.sql
-- SHA256 69255b280553b8266a4e582e1e668ff619ba2f16fe960e6563feac87492423a0
-- ============================================================================
-- =============================================================================
-- Create P0 readiness marker
--
-- This function is intentionally the LAST P0 migration marker. Frontend can
-- safely switch /create to the modular composer only when this RPC exists.
-- If any earlier migration fails or has not been deployed, the function is
-- absent and the app falls back to the legacy Create page instead of exposing
-- half-working controls.
-- =============================================================================

create or replace function public.create_foundation_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    to_regclass('public.post_media') is not null
    and to_regclass('public.polls') is not null
    and to_regclass('public.post_locations') is not null
    and to_regclass('public.music_tracks') is not null
    and to_regclass('public.post_collaborators') is not null
    and to_regclass('public.hashtags') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'post_media'
        and column_name = 'storage_bucket'
    );
$$;

revoke all on function public.create_foundation_ready() from public;
grant execute on function public.create_foundation_ready() to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830101000_post_music_private_storage.sql
-- SHA256 caf306657e2ab3a517a78f6a21f1277f90d88b05c1c1898ee59fe3495e816ddf
-- ============================================================================
-- =============================================================================
-- Post Creator: private-safe music storage + playback access
-- =============================================================================

alter table public.music_tracks
  add column if not exists storage_bucket text,
  add column if not exists storage_key text;

create index if not exists music_tracks_storage_object_idx
  on public.music_tracks (storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;

create or replace function public.normalize_music_track_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  if new.storage_bucket is null
     and new.storage_key is null
     and new.audio_url like 'storage://%' then
    v_ref := substring(new.audio_url from 11);
    new.storage_bucket := split_part(v_ref, '/', 1);
    new.storage_key := substring(v_ref from length(new.storage_bucket) + 2);
  end if;

  return new;
end
$$;

drop trigger if exists music_tracks_normalize_storage on public.music_tracks;
create trigger music_tracks_normalize_storage
  before insert or update of audio_url, storage_bucket, storage_key
  on public.music_tracks
  for each row execute function public.normalize_music_track_storage();

create or replace function public.can_view_post_music_object(
  p_bucket text,
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.music_tracks mt
    where mt.storage_bucket = p_bucket
      and mt.storage_key = p_key
      and (
        mt.owner_id = auth.uid()
        or exists (
          select 1
          from public.post_music pm
          where pm.track_id = mt.id
            and public.can_view_post(pm.post_id)
        )
      )
  );
$$;

revoke all on function public.can_view_post_music_object(text, text) from public;
grant execute on function public.can_view_post_music_object(text, text) to authenticated;

-- Track metadata ham private/friends post viewerlariga ko'rinishi kerak.
drop policy if exists "music_tracks_select" on public.music_tracks;
create policy "music_tracks_select"
  on public.music_tracks
  for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or exists (
      select 1
      from public.post_music pm
      where pm.track_id = music_tracks.id
        and public.can_view_post(pm.post_id)
    )
  );

-- Existing private bucket read policy'ni music object access bilan kengaytiramiz.
drop policy if exists "Private media readable by post viewers" on storage.objects;

create policy "Private media readable by post viewers"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_post_media_object(bucket_id, name)
      or public.can_view_post_music_object(bucket_id, name)
    )
  );


-- ============================================================================
-- SOURCE B-web: 20260830102000_live_location_resume.sql
-- SHA256 349a00f255d73a273fe1de7744b7a2be3eb9f1d16075219a0eb0019e47b9f0d8
-- ============================================================================
-- =============================================================================
-- Post Creator: resumeable live-location sharing
-- =============================================================================

create or replace function public.my_active_live_locations()
returns table (
  post_id uuid,
  live_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pl.post_id, pl.live_until
  from public.post_locations pl
  join public.posts p on p.id = pl.post_id
  where p.user_id = auth.uid()
    and pl.mode = 'live'
    and pl.live_until is not null
    and pl.live_until > now()
  order by pl.live_until asc;
$$;

revoke all on function public.my_active_live_locations() from public;
grant execute on function public.my_active_live_locations() to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830103000_message_drafts.sql
-- SHA256 dbd4ebf6cec29c791e4ac5bc8dac055969a0b95bec66733d90e48084f0286433
-- ============================================================================
-- =============================================================================
-- Telegram-style per-chat message drafts
-- Drafts are private to the authenticated user and sync across devices.
-- =============================================================================

create table if not exists public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 10000),
  updated_at timestamptz not null default now(),
  unique (user_id, conversation_id)
);

create index if not exists message_drafts_user_updated_idx
  on public.message_drafts (user_id, updated_at desc);

alter table public.message_drafts enable row level security;

drop policy if exists "Users can read own message drafts" on public.message_drafts;
create policy "Users can read own message drafts"
  on public.message_drafts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create own message drafts" on public.message_drafts;
create policy "Users can create own message drafts"
  on public.message_drafts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own message drafts" on public.message_drafts;
create policy "Users can update own message drafts"
  on public.message_drafts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own message drafts" on public.message_drafts;
create policy "Users can delete own message drafts"
  on public.message_drafts
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ============================================================================
-- SOURCE B-web: 20260830110000_publish_formatted_content.sql
-- SHA256 40accd315d442bf849d86e08fabb992c7bfbf8cf7a649e83bf4fad16d73ab0cc
-- ============================================================================
-- =============================================================================
-- Structured rich text publishing
-- Replaces publish_post_draft so formatted_content is written in the same
-- transaction as the post graph. Plain content remains searchable/indexable.
-- =============================================================================

create or replace function public.publish_post_draft(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_poll_id uuid;
  v_place_id uuid;
  v_track_id uuid;
  v_item jsonb;
  v_location jsonb := p_payload -> 'location';
  v_music jsonb := p_payload -> 'music';
  v_poll jsonb := p_payload -> 'poll';
  v_place jsonb;
  v_track jsonb;
  v_correct_index int;
  v_position int := 0;
  v_source_index int := 0;
  v_option_id uuid;
  v_scheduled_at timestamptz;
  v_visibility text := coalesce(nullif(p_payload ->> 'visibility', ''), 'public');
  v_post_kind text := coalesce(nullif(p_payload ->> 'postKind', ''), 'post');
begin
  if v_user_id is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if v_visibility not in ('public', 'friends', 'private') then
    raise exception 'Noto''g''ri visibility';
  end if;

  if v_post_kind not in ('post', 'reel', 'story', 'location', 'poll', 'file') then
    raise exception 'Noto''g''ri post turi';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    v_scheduled_at := (p_payload ->> 'scheduledAt')::timestamptz;
  end if;

  insert into public.posts (
    user_id,
    content,
    media_urls,
    media_type,
    visibility,
    post_kind,
    status,
    scheduled_at,
    published_at,
    formatted_content,
    edit_state
  )
  values (
    v_user_id,
    coalesce(p_payload ->> 'content', ''),
    coalesce(
      (select array_agg(value order by ordinality)
       from jsonb_array_elements_text(coalesce(p_payload -> 'mediaUrls', '[]'::jsonb))
       with ordinality as urls(value, ordinality)),
      array[]::text[]
    ),
    coalesce(nullif(p_payload ->> 'mediaType', ''), 'text'),
    v_visibility,
    v_post_kind,
    case when v_scheduled_at is null then 'published' else 'scheduled' end,
    v_scheduled_at,
    case when v_scheduled_at is null then now() else null end,
    p_payload -> 'formattedContent',
    p_payload -> 'editState'
  )
  returning id into v_post_id;

  -- Structured media metadata
  v_position := 0;
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'media', '[]'::jsonb))
  loop
    insert into public.post_media (
      post_id, position, kind, storage_url, thumbnail_url, mime_type,
      file_name, file_size, width, height, duration_seconds, aspect_ratio,
      alt_text, edit_state
    )
    values (
      v_post_id,
      v_position,
      coalesce(nullif(v_item ->> 'kind', ''), 'other')::public.media_kind,
      v_item ->> 'storageUrl',
      nullif(v_item ->> 'thumbnailUrl', ''),
      nullif(v_item ->> 'mimeType', ''),
      nullif(v_item ->> 'fileName', ''),
      nullif(v_item ->> 'fileSize', '')::bigint,
      nullif(v_item ->> 'width', '')::int,
      nullif(v_item ->> 'height', '')::int,
      nullif(v_item ->> 'durationSeconds', '')::numeric,
      nullif(v_item ->> 'aspectRatio', ''),
      nullif(v_item ->> 'altText', ''),
      v_item -> 'editState'
    );
    v_position := v_position + 1;
  end loop;

  -- Poll + options
  if v_poll is not null and jsonb_typeof(v_poll) = 'object' then
    if length(trim(coalesce(v_poll ->> 'question', ''))) = 0 then
      raise exception 'So''rovnoma savoli bo''sh';
    end if;

    insert into public.polls (
      post_id, question, allow_multiple, max_choices, is_anonymous,
      show_results_before_vote, quiz_mode, explanation, closes_at, poll_type
    )
    values (
      v_post_id,
      trim(v_poll ->> 'question'),
      coalesce((v_poll ->> 'allowMultiple')::boolean, false),
      case
        when coalesce((v_poll ->> 'allowMultiple')::boolean, false)
          then nullif(v_poll ->> 'maxChoices', '')::int
        else null
      end,
      coalesce((v_poll ->> 'isAnonymous')::boolean, false),
      coalesce((v_poll ->> 'showResultsBeforeVote')::boolean, false),
      coalesce((v_poll ->> 'quizMode')::boolean, false),
      nullif(v_poll ->> 'explanation', ''),
      nullif(v_poll ->> 'closesAt', '')::timestamptz,
      case when coalesce((v_poll ->> 'quizMode')::boolean, false)
        then 'quiz'::public.poll_type
        else 'standard'::public.poll_type
      end
    )
    returning id into v_poll_id;

    v_correct_index := nullif(v_poll ->> 'correctOptionIndex', '')::int;
    v_position := 0;
    v_source_index := 0;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_poll -> 'options', '[]'::jsonb))
    loop
      if length(trim(coalesce(v_item ->> 'label', ''))) > 0 then
        insert into public.poll_options (
          poll_id, position, label, emoji, image_url
        )
        values (
          v_poll_id,
          v_position,
          trim(v_item ->> 'label'),
          nullif(v_item ->> 'emoji', ''),
          nullif(v_item ->> 'imageUrl', '')
        )
        returning id into v_option_id;

        if v_correct_index is not null and v_correct_index = v_source_index then
          update public.polls
          set correct_option_id = v_option_id
          where id = v_poll_id;
        end if;

        v_position := v_position + 1;
      end if;

      v_source_index := v_source_index + 1;
    end loop;

    if v_position < 2 then
      raise exception 'So''rovnomada kamida 2 ta variant bo''lishi kerak';
    end if;

    if v_position > 12 then
      raise exception 'So''rovnomada ko''pi bilan 12 ta variant bo''lishi mumkin';
    end if;

    if coalesce((v_poll ->> 'quizMode')::boolean, false)
       and (
         v_correct_index is null
         or not exists (
           select 1 from public.polls
           where id = v_poll_id and correct_option_id is not null
         )
       ) then
      raise exception 'Viktorina uchun to''g''ri javob belgilanmagan';
    end if;
  end if;

  -- Location + optional reusable place
  if v_location is not null and jsonb_typeof(v_location) = 'object' then
    v_place := v_location -> 'place';
    v_place_id := null;

    if v_place is not null and jsonb_typeof(v_place) = 'object' then
      if nullif(v_place ->> 'externalSource', '') is not null
         and nullif(v_place ->> 'externalId', '') is not null then
        select id into v_place_id
        from public.places
        where external_source = v_place ->> 'externalSource'
          and external_id = v_place ->> 'externalId'
        limit 1;
      end if;

      if v_place_id is null then
        begin
          insert into public.places (
            name, address, category, latitude, longitude,
            external_source, external_id, created_by
          )
          values (
            coalesce(nullif(v_place ->> 'name', ''), coalesce(v_location ->> 'label', 'Joylashuv')),
            nullif(v_place ->> 'address', ''),
            nullif(v_place ->> 'category', ''),
            (v_location ->> 'latitude')::double precision,
            (v_location ->> 'longitude')::double precision,
            nullif(v_place ->> 'externalSource', ''),
            nullif(v_place ->> 'externalId', ''),
            v_user_id
          )
          returning id into v_place_id;
        exception when unique_violation then
          select id into v_place_id
          from public.places
          where external_source = v_place ->> 'externalSource'
            and external_id = v_place ->> 'externalId'
          limit 1;
        end;
      end if;
    end if;

    insert into public.post_locations (
      post_id, place_id, mode, label, latitude, longitude,
      accuracy_m, live_until
    )
    values (
      v_post_id,
      v_place_id,
      coalesce(nullif(v_location ->> 'mode', ''), 'place')::public.post_location_mode,
      coalesce(nullif(v_location ->> 'label', ''), nullif(v_place ->> 'name', '')),
      (v_location ->> 'latitude')::double precision,
      (v_location ->> 'longitude')::double precision,
      nullif(v_location ->> 'accuracyM', '')::double precision,
      case
        when coalesce(v_location ->> 'mode', 'place') = 'live'
          then nullif(v_location ->> 'liveUntil', '')::timestamptz
        else null
      end
    );
  end if;

  -- Music: existing catalog track or newly uploaded device track
  if v_music is not null and jsonb_typeof(v_music) = 'object' then
    v_track_id := nullif(v_music ->> 'trackId', '')::uuid;
    v_track := v_music -> 'track';

    if v_track_id is null and v_track is not null and jsonb_typeof(v_track) = 'object' then
      insert into public.music_tracks (
        title, artist, audio_url, cover_url, duration_seconds, source,
        external_id, license, attribution, owner_id, is_public
      )
      values (
        v_track ->> 'title',
        nullif(v_track ->> 'artist', ''),
        v_track ->> 'audioUrl',
        nullif(v_track ->> 'coverUrl', ''),
        nullif(v_track ->> 'durationSeconds', '')::numeric,
        coalesce(nullif(v_track ->> 'source', ''), 'device')::public.music_source,
        nullif(v_track ->> 'externalId', ''),
        nullif(v_track ->> 'license', ''),
        nullif(v_track ->> 'attribution', ''),
        coalesce(nullif(v_track ->> 'ownerId', '')::uuid, v_user_id),
        coalesce((v_track ->> 'isPublic')::boolean, false)
      )
      returning id into v_track_id;
    end if;

    if v_track_id is not null then
      insert into public.post_music (
        post_id, track_id, start_seconds, end_seconds, volume, muted_original
      )
      values (
        v_post_id,
        v_track_id,
        coalesce(nullif(v_music ->> 'startSeconds', '')::numeric, 0),
        nullif(v_music ->> 'endSeconds', '')::numeric,
        coalesce(nullif(v_music ->> 'volume', '')::numeric, 1),
        coalesce((v_music ->> 'mutedOriginal')::boolean, false)
      );
    end if;
  end if;

  -- Collaboration invitations: deduplicated and hard-capped at ten.
  insert into public.post_collaborators (post_id, user_id, invited_by, status)
  select
    v_post_id,
    collaborator_id,
    v_user_id,
    'pending'
  from (
    select distinct value::uuid as collaborator_id
    from jsonb_array_elements_text(coalesce(p_payload -> 'collaboratorIds', '[]'::jsonb))
    where value::uuid <> v_user_id
    limit 10
  ) collaborators;

  return v_post_id;
end
$$;

revoke all on function public.publish_post_draft(jsonb) from public;
grant execute on function public.publish_post_draft(jsonb) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830110000_verified_product_reviews.sql
-- SHA256 0281f14b7c0f57e45056b8fdd856c05644da22792186a3521bb2e35a9cd24920
-- ============================================================================
-- Verified-purchase reviews: only buyers with a delivered order containing
-- the reviewed product may create or move a review to that product/order.

DROP POLICY IF EXISTS "Users can create reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can update their reviews" ON public.product_reviews;

CREATE POLICY "Delivered buyers can create reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id = product_reviews.order_id
      AND o.buyer_id = auth.uid()
      AND o.status = 'delivered'
      AND oi.product_id = product_reviews.product_id
  )
);

CREATE POLICY "Delivered buyers can update reviews"
ON public.product_reviews
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id = product_reviews.order_id
      AND o.buyer_id = auth.uid()
      AND o.status = 'delivered'
      AND oi.product_id = product_reviews.product_id
  )
);

CREATE OR REPLACE FUNCTION public.get_product_review_summary(_product_id uuid)
RETURNS TABLE(average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0::numeric) AS average_rating,
    COUNT(*)::bigint AS review_count
  FROM public.product_reviews r
  WHERE r.product_id = _product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_review_summary(uuid) TO anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830111000_marketplace_video_products.sql
-- SHA256 f5b8f075e23c88b952fbfae5075a47826cf5a502f5321d6f2653e2fb5959be15
-- ============================================================================
-- Explicit video -> product links for Marketplace video commerce.
-- A product is shown under a video only when the owner intentionally links it.

CREATE TABLE IF NOT EXISTS public.marketplace_video_products (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_id)
);

CREATE INDEX IF NOT EXISTS marketplace_video_products_product_idx
  ON public.marketplace_video_products(product_id);

ALTER TABLE public.marketplace_video_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video product links are public" ON public.marketplace_video_products;
DROP POLICY IF EXISTS "Owners can link own marketplace products" ON public.marketplace_video_products;
DROP POLICY IF EXISTS "Owners can unlink own marketplace products" ON public.marketplace_video_products;

CREATE POLICY "Video product links are public"
ON public.marketplace_video_products
FOR SELECT
USING (true);

CREATE POLICY "Owners can link own marketplace products"
ON public.marketplace_video_products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = marketplace_video_products.post_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.products pr
    JOIN public.sellers s ON s.id = pr.seller_id
    WHERE pr.id = marketplace_video_products.product_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Owners can unlink own marketplace products"
ON public.marketplace_video_products
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = marketplace_video_products.post_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.products pr
    JOIN public.sellers s ON s.id = pr.seller_id
    WHERE pr.id = marketplace_video_products.product_id
      AND s.user_id = auth.uid()
  )
);


-- ============================================================================
-- SOURCE B-web: 20260830112000_collaboration_lifecycle.sql
-- SHA256 d8f5804ce887840b28268580042aef165c8032cafb569a83998cd81ac86ab37b
-- ============================================================================
-- =============================================================================
-- Professional post collaboration lifecycle
-- Canonical flow: invite -> pending -> accepted/declined -> remove/leave/reinvite.
-- Direct client UPDATE/DELETE is intentionally disabled; state transitions use RPCs.
-- =============================================================================

-- Only active invitations count toward the 10 collaborator cap.
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if new.status not in ('pending', 'accepted') then
    return new;
  end if;

  select count(*) into v_count
  from public.post_collaborators
  where post_id = new.post_id
    and status in ('pending', 'accepted')
    and id is distinct from new.id;

  if v_count >= 10 then
    raise exception 'Bitta postga eng ko''pi bilan 10 nafar faol hammuallif qo''shish mumkin';
  end if;

  return new;
end
$$;

drop trigger if exists post_collaborators_limit on public.post_collaborators;
create trigger post_collaborators_limit
  before insert or update of status on public.post_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- Tighten RLS. SELECT can expose accepted collaborators to legitimate post viewers,
-- while pending/declined state remains visible only to involved users/owner.
drop policy if exists "Users can view their collaborations" on public.post_collaborators;
drop policy if exists "Post owners can invite collaborators" on public.post_collaborators;
drop policy if exists "Invited users can respond" on public.post_collaborators;
drop policy if exists "Post owners can remove collaborators" on public.post_collaborators;
drop policy if exists "collaborators_select" on public.post_collaborators;
drop policy if exists "collaborators_insert" on public.post_collaborators;
drop policy if exists "collaborators_update" on public.post_collaborators;
drop policy if exists "collaborators_delete" on public.post_collaborators;

create policy "collaborators_select"
  on public.post_collaborators
  for select
  to authenticated
  using (
    public.owns_post(post_id)
    or user_id = auth.uid()
    or invited_by = auth.uid()
    or (status = 'accepted' and public.can_view_post(post_id))
  );

create policy "collaborators_insert"
  on public.post_collaborators
  for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and user_id <> auth.uid()
    and public.owns_post(post_id)
    and status = 'pending'
  );

-- No direct UPDATE/DELETE policies: use the SECURITY DEFINER RPCs below.

-- Reinvite must create a notification too, not only first insert.
create or replace function public.notify_on_collaboration_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  select display_name into inviter_name
  from public.profiles
  where id = new.invited_by;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.user_id,
    'collaboration_invite',
    'Hammualliflik taklifi',
    coalesce(inviter_name, 'Foydalanuvchi') || ' sizni postga hammuallif sifatida taklif qildi',
    jsonb_build_object(
      'post_id', new.post_id,
      'collaboration_id', new.id,
      'inviter_id', new.invited_by
    )
  );

  return new;
end
$$;

drop trigger if exists on_collaboration_invite on public.post_collaborators;
create trigger on_collaboration_invite
  after insert or update of status on public.post_collaborators
  for each row execute function public.notify_on_collaboration_invite();

-- Owner can invite/reinvite after publishing.
create or replace function public.invite_post_collaborator(
  p_post_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if not public.owns_post(p_post_id) then
    raise exception 'Faqat post egasi hammuallif taklif qilishi mumkin';
  end if;

  if p_user_id = v_actor then
    raise exception 'O''zingizni hammuallif sifatida taklif qilib bo''lmaydi';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Foydalanuvchi topilmadi';
  end if;

  insert into public.post_collaborators (
    post_id, user_id, invited_by, status, responded_at
  )
  values (
    p_post_id, p_user_id, v_actor, 'pending', null
  )
  on conflict (post_id, user_id)
  do update set
    invited_by = excluded.invited_by,
    status = 'pending',
    responded_at = null,
    created_at = now()
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.invite_post_collaborator(uuid, uuid) from public, anon;
grant execute on function public.invite_post_collaborator(uuid, uuid) to authenticated;

-- Invited collaborator accepts or declines exactly once from pending.
create or replace function public.respond_post_collaboration(
  p_collaboration_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_status text;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammualliflik taklifi topilmadi';
  end if;

  if v_row.user_id <> v_actor then
    raise exception 'Bu taklifga javob berish huquqi yo''q';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Bu taklifga allaqachon javob berilgan';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.post_collaborators
  set status = v_status,
      responded_at = now()
  where id = p_collaboration_id;

  update public.notifications
  set is_read = true
  where user_id = v_actor
    and type = 'collaboration_invite'
    and data ->> 'collaboration_id' = p_collaboration_id::text;

  if not p_accept then
    select display_name into v_actor_name
    from public.profiles
    where id = v_actor;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_row.invited_by,
      'collaboration_declined',
      'Hammualliflik rad etildi',
      coalesce(v_actor_name, 'Foydalanuvchi') || ' hammualliflik taklifini rad etdi',
      jsonb_build_object(
        'post_id', v_row.post_id,
        'collaboration_id', v_row.id,
        'collaborator_id', v_actor
      )
    );
  end if;

  return v_status;
end
$$;

revoke all on function public.respond_post_collaboration(uuid, boolean) from public, anon;
grant execute on function public.respond_post_collaboration(uuid, boolean) to authenticated;

-- Post owner can revoke a pending invite or remove an accepted collaborator.
create or replace function public.remove_post_collaborator(
  p_collaboration_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_kind text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammuallif topilmadi';
  end if;

  if not public.owns_post(v_row.post_id) then
    raise exception 'Faqat post egasi hammuallifni olib tashlashi mumkin';
  end if;

  v_kind := case when v_row.status = 'pending'
    then 'collaboration_revoked'
    else 'collaboration_removed'
  end;

  delete from public.post_collaborators
  where id = p_collaboration_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_row.user_id,
    v_kind,
    case when v_kind = 'collaboration_revoked'
      then 'Hammualliflik taklifi bekor qilindi'
      else 'Hammualliflik tugatildi'
    end,
    case when v_kind = 'collaboration_revoked'
      then 'Post egasi hammualliflik taklifini bekor qildi'
      else 'Post egasi sizni hammualliflikdan olib tashladi'
    end,
    jsonb_build_object(
      'post_id', v_row.post_id,
      'collaboration_id', v_row.id,
      'actor_id', v_actor
    )
  );

  return v_kind;
end
$$;

revoke all on function public.remove_post_collaborator(uuid) from public, anon;
grant execute on function public.remove_post_collaborator(uuid) to authenticated;

-- Accepted collaborator can leave the post without deleting the post itself.
create or replace function public.leave_post_collaboration(
  p_collaboration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.post_collaborators;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select * into v_row
  from public.post_collaborators
  where id = p_collaboration_id
  for update;

  if v_row.id is null then
    raise exception 'Hammualliflik topilmadi';
  end if;

  if v_row.user_id <> v_actor or v_row.status <> 'accepted' then
    raise exception 'Bu hammualliflikdan chiqish huquqi yo''q';
  end if;

  delete from public.post_collaborators
  where id = p_collaboration_id;

  select display_name into v_actor_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_row.invited_by,
    'collaboration_left',
    'Hammuallif postdan chiqdi',
    coalesce(v_actor_name, 'Foydalanuvchi') || ' hammualliflikdan chiqdi',
    jsonb_build_object(
      'post_id', v_row.post_id,
      'collaboration_id', v_row.id,
      'collaborator_id', v_actor
    )
  );

  return true;
end
$$;

revoke all on function public.leave_post_collaboration(uuid) from public, anon;
grant execute on function public.leave_post_collaboration(uuid) to authenticated;

-- Trigger-only helpers must not be directly callable.
revoke execute on function public.notify_on_collaboration_invite() from public, anon, authenticated;
revoke execute on function public.notify_on_collaboration_accepted() from public, anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830112100_collaboration_preview_access.sql
-- SHA256 983b4a8d260bf3e281d936a4eb14a408a5abaf1831e56f2ff5d33d761cbadd50
-- ============================================================================
-- =============================================================================
-- Collaboration invite preview access
-- A pending invite is an explicit owner-granted permission to inspect the post
-- before accepting. Declined/revoked users immediately lose this access.
-- =============================================================================

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
        or (
          p.visibility = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
          and exists (
            select 1
            from public.follows f
            where f.follower_id = p.user_id
              and f.following_id = auth.uid()
          )
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status in ('pending', 'accepted')
        )
      )
  );
$$;


-- ============================================================================
-- SOURCE B-web: 20260830114000_unified_story_foundation.sql
-- SHA256 fc05803c2a9c4460fdcf82445ede1b3b6d24546f69178634404eeba49121ecf7
-- ============================================================================
-- =============================================================================
-- Unified Story foundation
-- New stories use posts/post_media as source-of-truth and keep public.stories
-- as the viewer/archive compatibility index.
-- =============================================================================

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists media_id uuid references public.post_media(id) on delete set null,
  add column if not exists storage_bucket text,
  add column if not exists storage_key text;

create unique index if not exists stories_post_id_uniq
  on public.stories (post_id)
  where post_id is not null;

create index if not exists stories_active_post_idx
  on public.stories (expires_at desc, post_id)
  where is_active is distinct from false;

-- Legacy rows remain readable as before. New linked rows inherit canonical post
-- visibility, including friends/private and pending collaboration preview.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.stories', v_policy.policyname);
  end loop;
end $$;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    post_id is null
    or public.can_view_post(post_id)
  );

-- Interactive sticker metadata must follow the same visibility as its post.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'story_stickers'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.story_stickers', v_policy.policyname);
  end loop;
end $$;

create policy "story_stickers_select_visible"
  on public.story_stickers
  for select
  using (public.can_view_post(post_id));

-- Atomically create the post graph + compatibility story row.
create or replace function public.publish_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_post_id uuid;
  v_media_id uuid;
  v_media jsonb;
  v_kind text;
  v_story_id uuid;
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

  if v_kind not in ('image', 'video') then
    raise exception 'Story faqat rasm yoki video bo''lishi mumkin';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    raise exception 'Story scheduling hali qo''llanmaydi';
  end if;

  v_payload :=
    p_payload
    || jsonb_build_object(
      'postKind', 'story',
      'scheduledAt', null
    );

  v_post_id := public.publish_post_draft(v_payload);

  select pm.id
    into v_media_id
  from public.post_media pm
  where pm.post_id = v_post_id
  order by pm.position asc
  limit 1;

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
    v_media ->> 'storageUrl',
    nullif(v_media ->> 'storageBucket', ''),
    nullif(v_media ->> 'storageKey', ''),
    v_kind,
    nullif(p_payload ->> 'content', ''),
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    now() + interval '24 hours',
    true
  )
  returning id into v_story_id;

  return jsonb_build_object(
    'storyId', v_story_id,
    'postId', v_post_id,
    'mediaId', v_media_id
  );
end
$$;

revoke all on function public.publish_story_draft(jsonb) from public, anon;
grant execute on function public.publish_story_draft(jsonb) to authenticated;

-- SECURITY DEFINER sticker writes/results must not bypass post visibility.
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
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_post_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select post_id into v_post_id
  from public.story_stickers
  where id = p_sticker_id;

  if v_post_id is null or not public.can_view_post(v_post_id) then
    raise exception 'Bu stikerga kirish huquqi yo''q';
  end if;

  insert into public.story_sticker_responses (
    sticker_id, user_id, option_index, numeric_value, text_answer
  )
  values (p_sticker_id, v_user, p_option_index, p_numeric_value, p_text_answer)
  on conflict (sticker_id, user_id) do update
    set option_index = excluded.option_index,
        numeric_value = excluded.numeric_value,
        text_answer = excluded.text_answer,
        created_at = now()
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.story_sticker_results(p_sticker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_post_id uuid;
  v_total integer;
  v_result jsonb;
begin
  select s.type, s.config, s.post_id, (p.user_id = v_user)
  into v_type, v_config, v_post_id, v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if not public.can_view_post(v_post_id) then
    raise exception 'Bu stiker natijalarini ko''rish huquqi yo''q';
  end if;

  select count(*) into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts', coalesce(jsonb_object_agg(option_index::text, cnt), '{}'::jsonb),
      'myChoice', (
        select option_index from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      ),
      'correctIndex', case
        when v_type = 'quiz' then v_config -> 'correctIndex'
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
      'myValue', (
        select numeric_value from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers', case
        when v_is_owner then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', user_id,
            'text', text_answer,
            'createdAt', created_at
          ) order by created_at desc), '[]'::jsonb)
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
        )
        else '[]'::jsonb
      end
    );

  else
    v_result := jsonb_build_object('type', v_type, 'total', 0);
  end if;

  return coalesce(v_result, jsonb_build_object('type', v_type, 'total', v_total));
end
$$;

revoke all on function public.respond_story_sticker(uuid, integer, numeric, text) from public, anon;
revoke all on function public.story_sticker_results(uuid) from public, anon;
grant execute on function public.respond_story_sticker(uuid, integer, numeric, text) to authenticated;
grant execute on function public.story_sticker_results(uuid) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830114100_story_draft_lifecycle.sql
-- SHA256 13c687a0a6da656fa6535e00a9dd6233b3c5aa1ad0358bf70784bbf85327e351
-- ============================================================================
-- =============================================================================
-- Story draft lifecycle
-- Draft stays invisible while the owner configures interactive stickers.
-- =============================================================================

drop policy if exists "stories_select_visible" on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and (
        post_id is null
        or public.can_view_post(post_id)
      )
    )
  );

create or replace function public.create_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_story_id uuid;
begin
  v_result := public.publish_story_draft(p_payload);
  v_story_id := (v_result ->> 'storyId')::uuid;

  update public.stories
  set is_active = false
  where id = v_story_id
    and user_id = auth.uid();

  return v_result;
end
$$;

revoke all on function public.create_story_draft(jsonb) from public, anon;
grant execute on function public.create_story_draft(jsonb) to authenticated;

create or replace function public.activate_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  select s.post_id into v_post_id
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
  set is_active = true,
      expires_at = now() + interval '24 hours'
  where id = p_story_id;

  update public.posts
  set published_at = now(),
      updated_at = now()
  where id = v_post_id;

  return true;
end
$$;

revoke all on function public.activate_story_draft(uuid) from public, anon;
grant execute on function public.activate_story_draft(uuid) to authenticated;

create or replace function public.discard_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
  v_is_active boolean;
begin
  select s.post_id, coalesce(s.is_active, true)
  into v_post_id, v_is_active
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
  where id = p_story_id;

  delete from public.posts
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  return true;
end
$$;

revoke all on function public.discard_story_draft(uuid) from public, anon;
grant execute on function public.discard_story_draft(uuid) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260830123000_message_draft_tombstones.sql
-- SHA256 0bd5f53badaeaeb4b05352ee5e3c6eaac983f27d7a14331ca2ce86c910ac530b
-- ============================================================================
-- =============================================================================
-- Message draft monotonic tombstones
--
-- A sent draft is cleared by writing content='' with a newer updated_at instead
-- of deleting the row. This preserves ordering information across web, mobile,
-- desktop and delayed/offline requests.
-- =============================================================================

create or replace function public.guard_message_draft_monotonic_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists message_drafts_monotonic_updated_at
  on public.message_drafts;

create trigger message_drafts_monotonic_updated_at
before update on public.message_drafts
for each row
execute function public.guard_message_draft_monotonic_updated_at();

comment on column public.message_drafts.content is
  'Per-user draft. Empty content is a versioned clear tombstone; do not delete it during normal draft clearing.';


-- ============================================================================
-- SOURCE B-web: 20260830162000_sticker_schema_compat.sql
-- SHA256 489e76cdb001aa9324814eaa03ab774f01243a0f1a2495b8b3014255765281d5
-- ============================================================================
-- =============================================================================
-- Sticker schema compatibility bridge
--
-- Two sticker generations historically used different column names:
-- legacy: title/cover_url/is_animated + file_url/thumb_url
-- current: name/icon_url/default_kind + full_url/preview_url/kind
--
-- CREATE TABLE IF NOT EXISTS cannot evolve an already existing table, so a
-- database that applied the legacy migration first may legitimately miss the
-- current columns. Keep both contracts available while web/Flutter converge.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sticker_kind') then
    create type public.sticker_kind as enum
      ('animated_emoji', 'image', 'gif', 'lottie', 'video');
  end if;

  if not exists (select 1 from pg_type where typname = 'sticker_pack_source') then
    create type public.sticker_pack_source as enum
      ('builtin', 'platform', 'giphy', 'user');
  end if;
end $$;

alter table if exists public.sticker_packs
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists source public.sticker_pack_source default 'platform',
  add column if not exists default_kind public.sticker_kind default 'image',
  add column if not exists icon_url text,
  add column if not exists icon_emoji text,
  add column if not exists icon_key text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists position integer not null default 0,
  add column if not exists title text,
  add column if not exists cover_url text,
  add column if not exists is_animated boolean not null default false,
  add column if not exists install_count integer not null default 0;

alter table if exists public.stickers
  add column if not exists kind public.sticker_kind default 'image',
  add column if not exists name text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists preview_url text,
  add column if not exists full_url text,
  add column if not exists duration_seconds numeric,
  add column if not exists use_count integer not null default 0,
  add column if not exists file_url text,
  add column if not exists thumb_url text;

update public.sticker_packs
set
  name = coalesce(nullif(name, ''), nullif(title, ''), nullif(slug, ''), 'Stikerlar'),
  title = coalesce(nullif(title, ''), nullif(name, ''), nullif(slug, ''), 'Stikerlar'),
  icon_url = coalesce(icon_url, cover_url),
  cover_url = coalesce(cover_url, icon_url),
  default_kind = case
    when is_animated then 'animated_emoji'::public.sticker_kind
    else coalesce(default_kind, 'image'::public.sticker_kind)
  end
where
  name is null or name = ''
  or title is null or title = ''
  or icon_url is null
  or cover_url is null;

update public.stickers
set
  full_url = coalesce(nullif(full_url, ''), nullif(file_url, '')),
  file_url = coalesce(nullif(file_url, ''), nullif(full_url, '')),
  preview_url = coalesce(nullif(preview_url, ''), nullif(thumb_url, ''), nullif(full_url, ''), nullif(file_url, '')),
  thumb_url = coalesce(nullif(thumb_url, ''), nullif(preview_url, ''))
where
  full_url is null or full_url = ''
  or file_url is null or file_url = ''
  or preview_url is null
  or thumb_url is null;

alter table if exists public.sticker_packs
  alter column name set not null;

create or replace function public.sync_sticker_pack_compat_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := coalesce(nullif(new.name, ''), nullif(new.title, ''), nullif(new.slug, ''), 'Stikerlar');
  new.title := coalesce(nullif(new.title, ''), new.name);
  new.icon_url := coalesce(new.icon_url, new.cover_url);
  new.cover_url := coalesce(new.cover_url, new.icon_url);

  if new.is_animated then
    new.default_kind := 'animated_emoji'::public.sticker_kind;
  elsif new.default_kind is null then
    new.default_kind := 'image'::public.sticker_kind;
  end if;

  new.is_animated := new.default_kind in (
    'animated_emoji'::public.sticker_kind,
    'lottie'::public.sticker_kind,
    'video'::public.sticker_kind
  );
  return new;
end
$$;

drop trigger if exists sticker_pack_compat_columns on public.sticker_packs;
create trigger sticker_pack_compat_columns
before insert or update on public.sticker_packs
for each row execute function public.sync_sticker_pack_compat_columns();

create or replace function public.sync_sticker_compat_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.full_url := coalesce(nullif(new.full_url, ''), nullif(new.file_url, ''));
  new.file_url := coalesce(nullif(new.file_url, ''), nullif(new.full_url, ''));
  new.preview_url := coalesce(
    nullif(new.preview_url, ''),
    nullif(new.thumb_url, ''),
    nullif(new.full_url, ''),
    nullif(new.file_url, '')
  );
  new.thumb_url := coalesce(nullif(new.thumb_url, ''), nullif(new.preview_url, ''));
  new.kind := coalesce(new.kind, 'image'::public.sticker_kind);
  return new;
end
$$;

drop trigger if exists sticker_compat_columns on public.stickers;
create trigger sticker_compat_columns
before insert or update on public.stickers
for each row execute function public.sync_sticker_compat_columns();

comment on function public.sync_sticker_pack_compat_columns() is
  'Keeps legacy and canonical sticker-pack columns synchronized during cross-client rollout.';
comment on function public.sync_sticker_compat_columns() is
  'Keeps legacy and canonical sticker asset columns synchronized during cross-client rollout.';


-- ============================================================================
-- SOURCE B-web: 20260830171000_call_invite_lifecycle.sql
-- SHA256 dbae707475bbb3789ad69a919b4738f3cd0c2c975c50fd08969f4b419e06e99b
-- ============================================================================
-- Premium call invitation lifecycle.
-- Keeps incoming ringing scoped to explicit invitees instead of broadcasting
-- every video_calls INSERT to every authenticated client.

create unique index if not exists call_invites_call_invitee_unique_idx
  on public.call_invites (call_id, invitee_id)
  where invitee_id is not null;

create index if not exists call_invites_pending_invitee_idx
  on public.call_invites (invitee_id, created_at desc)
  where status in ('pending', 'ringing');

alter table public.call_invites enable row level security;

drop policy if exists "call_invites_select_parties" on public.call_invites;
create policy "call_invites_select_parties"
on public.call_invites
for select
to authenticated
using (
  invitee_id = auth.uid()
  or inviter_id = auth.uid()
  or public.can_view_call(call_id, auth.uid())
);

create or replace function public.invite_to_video_call(
  p_call_id uuid,
  p_invitee_id uuid,
  p_call_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_invite_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_call
  from public.video_calls
  where id = p_call_id
  for update;

  if not found then
    raise exception 'call_not_found';
  end if;

  if v_call.ended_at is not null or v_call.status = 'ended' then
    raise exception 'call_ended';
  end if;

  if not public.can_view_call(p_call_id, v_user_id) then
    raise exception 'not_call_participant';
  end if;

  if p_invitee_id = v_user_id then
    raise exception 'cannot_invite_self';
  end if;

  if v_call.conversation_id is not null and not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = v_call.conversation_id
      and cp.user_id = p_invitee_id
  ) then
    raise exception 'invitee_not_conversation_participant';
  end if;

  insert into public.call_invites (
    call_id,
    conversation_id,
    inviter_id,
    invitee_id,
    call_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  values (
    p_call_id,
    v_call.conversation_id,
    v_user_id,
    p_invitee_id,
    coalesce(nullif(p_call_type, ''), v_call.call_type, 'video'),
    'pending',
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (call_id, invitee_id) where invitee_id is not null
  do update set
    inviter_id = excluded.inviter_id,
    call_type = excluded.call_type,
    status = case
      when public.call_invites.status in ('accepted', 'joined') then public.call_invites.status
      else 'pending'
    end,
    updated_at = now()
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.invite_to_video_call(uuid, uuid, text) from public, anon;
grant execute on function public.invite_to_video_call(uuid, uuid, text) to authenticated;

create or replace function public.seed_video_call_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null then
    return new;
  end if;

  insert into public.call_invites (
    call_id,
    conversation_id,
    inviter_id,
    invitee_id,
    call_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  select
    new.id,
    new.conversation_id,
    new.host_id,
    cp.user_id,
    new.call_type,
    'pending',
    '{}'::jsonb,
    now(),
    now()
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.host_id
  on conflict (call_id, invitee_id) where invitee_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_video_call_invites on public.video_calls;
create trigger trg_seed_video_call_invites
after insert on public.video_calls
for each row execute function public.seed_video_call_invites();

create or replace function public.sync_call_invite_from_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.connection_state = 'declined' then
    update public.call_invites
    set status = 'declined', updated_at = now()
    where call_id = new.call_id
      and invitee_id = new.user_id
      and status not in ('missed', 'cancelled');
  elsif new.left_at is null
    and new.joined_at is not null
    and new.connection_state in ('connecting', 'connected')
  then
    update public.call_invites
    set status = 'accepted', updated_at = now()
    where call_id = new.call_id
      and invitee_id = new.user_id
      and status in ('pending', 'ringing');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_call_invite_from_participant on public.call_participants;
create trigger trg_sync_call_invite_from_participant
after insert or update of connection_state, joined_at, left_at
on public.call_participants
for each row execute function public.sync_call_invite_from_participant();

create or replace function public.sync_call_invites_when_call_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null or new.status = 'ended' then
    update public.call_invites
    set status = case
      when status in ('pending', 'ringing') then 'cancelled'
      else status
    end,
    updated_at = now()
    where call_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_call_invites_when_call_ends on public.video_calls;
create trigger trg_sync_call_invites_when_call_ends
after update of status, ended_at on public.video_calls
for each row execute function public.sync_call_invites_when_call_ends();

create or replace function public.mark_video_call_missed(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_call
  from public.video_calls
  where id = p_call_id
  for update;

  if not found then
    return;
  end if;

  if not public.can_view_call(p_call_id, v_user_id) then
    raise exception 'not_call_participant';
  end if;

  update public.call_invites
  set status = 'missed', updated_at = now()
  where call_id = p_call_id
    and invitee_id = v_user_id
    and status in ('pending', 'ringing');

  insert into public.call_participants (
    call_id, user_id, joined_at, left_at, is_muted, is_video_on,
    is_screen_sharing, is_hand_raised, connection_state, last_seen_at
  ) values (
    p_call_id, v_user_id, null, now(), false, false,
    false, false, 'missed', now()
  )
  on conflict (call_id, user_id) do update set
    left_at = now(),
    connection_state = 'missed',
    last_seen_at = now();

  if not coalesce(v_call.is_group_call, false) then
    update public.video_calls
    set status = 'ended',
        ended_at = coalesce(ended_at, now())
    where id = p_call_id
      and ended_at is null;
  end if;
end;
$$;

revoke all on function public.mark_video_call_missed(uuid) from public, anon;
grant execute on function public.mark_video_call_missed(uuid) to authenticated;

-- Backfill explicit invites for currently open calls so deploys are seamless.
insert into public.call_invites (
  call_id,
  conversation_id,
  inviter_id,
  invitee_id,
  call_type,
  status,
  metadata,
  created_at,
  updated_at
)
select
  vc.id,
  vc.conversation_id,
  vc.host_id,
  cp.user_id,
  vc.call_type,
  'pending',
  '{}'::jsonb,
  vc.created_at,
  now()
from public.video_calls vc
join public.conversation_participants cp
  on cp.conversation_id = vc.conversation_id
where vc.ended_at is null
  and vc.status in ('waiting', 'active')
  and cp.user_id <> vc.host_id
on conflict (call_id, invitee_id) where invitee_id is not null
do nothing;


-- ============================================================================
-- SOURCE B-web: 20260830172000_canonical_call_history.sql
-- SHA256 b337e7b4ca82ba27fcee7f40425d0c916e787667d198a6bc91509a0d69850bac
-- ============================================================================
-- Canonical, idempotent call history.
-- One finished call produces one history row and one chat bubble regardless of
-- which participant presses End first or whether both clients race.

alter table public.messages
  add column if not exists call_id uuid references public.video_calls(id) on delete set null;

create unique index if not exists messages_one_call_history_per_call_idx
  on public.messages (call_id)
  where media_type = 'call_history' and call_id is not null;

create index if not exists messages_call_id_idx
  on public.messages (call_id)
  where call_id is not null;

create or replace function public.record_finished_video_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := 'ended';
  v_callee_id uuid;
  v_duration integer;
  v_history_id uuid;
begin
  if new.ended_at is null or old.ended_at is not null then
    return new;
  end if;

  if new.conversation_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.call_invites ci
    where ci.call_id = new.id and ci.status = 'missed'
  ) then
    v_status := 'missed';
  elsif exists (
    select 1 from public.call_invites ci
    where ci.call_id = new.id and ci.status = 'declined'
  ) then
    v_status := 'declined';
  elsif new.started_at is null then
    v_status := 'cancelled';
  end if;

  if not coalesce(new.is_group_call, false) then
    select cp.user_id
    into v_callee_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.host_id
    order by cp.user_id
    limit 1;
  end if;

  v_duration := case
    when new.started_at is not null
      then greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer)
    else null
  end;

  if not exists (
    select 1 from public.call_history ch where ch.call_id = new.id
  ) then
    insert into public.call_history (
      call_id,
      conversation_id,
      caller_id,
      callee_id,
      call_type,
      status,
      started_at,
      ended_at,
      duration_seconds,
      created_at
    )
    values (
      new.id,
      new.conversation_id,
      new.host_id,
      v_callee_id,
      new.call_type,
      v_status,
      new.started_at,
      new.ended_at,
      v_duration,
      now()
    )
    returning id into v_history_id;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    media_type,
    call_id,
    created_at
  )
  values (
    new.conversation_id,
    new.host_id,
    jsonb_build_object(
      'call_id', new.id,
      'type', case when new.call_type = 'audio' then 'audio' else 'video' end,
      'status', v_status,
      'duration', v_duration,
      'timestamp', new.ended_at,
      'caller_id', new.host_id,
      'callee_id', coalesce(v_callee_id, new.host_id)
    )::text,
    'call_history',
    new.id,
    new.ended_at
  )
  on conflict (call_id)
    where media_type = 'call_history' and call_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_record_finished_video_call on public.video_calls;
create trigger trg_record_finished_video_call
after update of status, ended_at on public.video_calls
for each row execute function public.record_finished_video_call();

comment on function public.record_finished_video_call() is
  'Creates exactly one canonical call history row and chat bubble when a call ends.';


-- ============================================================================
-- SOURCE B-web: 20260831003000_marketplace_seller_response_stats.sql
-- SHA256 43d14fee007ecf5b5610a22fe506f9ccbe577cec760c9dfd9c08ed6f009c3095
-- ============================================================================
-- Marketplace seller response stats.
-- Only aggregate data is exposed; message/conversation contents remain private.
-- Fewer than 3 buyer conversations intentionally returns NULL rate/time.

create or replace function public.get_seller_response_stats(_seller_user_id uuid)
returns table (
  response_rate numeric,
  average_response_minutes integer,
  conversations_count bigint,
  is_online boolean,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with seller_profile as (
    select
      p.id,
      coalesce(p.is_online, false) as is_online,
      p.last_seen
    from public.profiles p
    where p.id = _seller_user_id
  ),
  private_conversations as (
    select distinct c.id
    from public.conversations c
    join public.conversation_participants cp
      on cp.conversation_id = c.id
     and cp.user_id = _seller_user_id
    where c.type = 'private'
  ),
  first_buyer_messages as (
    select
      pc.id as conversation_id,
      min(m.created_at) as first_buyer_at
    from private_conversations pc
    join public.messages m on m.conversation_id = pc.id
    where m.sender_id is distinct from _seller_user_id
      and coalesce(m.is_deleted, false) = false
      and m.created_at >= now() - interval '90 days'
    group by pc.id
  ),
  response_pairs as (
    select
      fb.conversation_id,
      fb.first_buyer_at,
      (
        select min(reply.created_at)
        from public.messages reply
        where reply.conversation_id = fb.conversation_id
          and reply.sender_id = _seller_user_id
          and coalesce(reply.is_deleted, false) = false
          and reply.created_at > fb.first_buyer_at
      ) as first_reply_at
    from first_buyer_messages fb
  ),
  aggregate_stats as (
    select
      count(*)::bigint as conversations_count,
      count(first_reply_at)::bigint as responded_count,
      avg(
        extract(epoch from (first_reply_at - first_buyer_at)) / 60.0
      ) filter (where first_reply_at is not null) as average_minutes
    from response_pairs
  )
  select
    case
      when a.conversations_count >= 3
        then round((a.responded_count::numeric / nullif(a.conversations_count, 0)) * 100, 0)
      else null
    end as response_rate,
    case
      when a.responded_count >= 3
        then round(a.average_minutes)::integer
      else null
    end as average_response_minutes,
    a.conversations_count,
    sp.is_online,
    sp.last_seen
  from seller_profile sp
  cross join aggregate_stats a;
$$;

revoke all on function public.get_seller_response_stats(uuid) from public;
grant execute on function public.get_seller_response_stats(uuid) to authenticated;

