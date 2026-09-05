-- =============================================================================
-- Repair legacy post media after the structured-media migration wave.
--
-- Historical context:
--   * legacy posts stored only posts.media_urls + posts.media_type;
--   * post_media backfills copied those URLs verbatim;
--   * some old rows therefore have no stable bucket/key and some were assigned
--     the wrong media kind;
--   * foreign/old Supabase project URLs must NOT be rewritten to the current
--     project unless the DB already has a canonical bucket/key.
--
-- This migration is intentionally non-destructive: external legacy URLs are
-- preserved, while stable references and strong file-type evidence are repaired.
-- =============================================================================

alter table public.post_media
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_key text;

-- ---------------------------------------------------------------------------
-- 1. Repair media kind from strong MIME/extension evidence.
--    This fixes legacy videos that were backfilled as image when media_type was
--    incomplete, without guessing when the object is opaque.
-- ---------------------------------------------------------------------------
with inferred as (
  select
    pm.id,
    case
      when lower(coalesce(pm.mime_type, '')) like 'video/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        then 'video'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) like 'audio/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        then 'audio'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) like 'image/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        then 'image'::public.media_kind
      when lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        then 'archive'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) = 'application/pdf'
        or lower(coalesce(pm.mime_type, '')) like 'text/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        then 'document'::public.media_kind
      else null
    end as kind
  from public.post_media pm
)
update public.post_media pm
set kind = inferred.kind
from inferred
where inferred.id = pm.id
  and inferred.kind is not null
  and pm.kind is distinct from inferred.kind;

-- ---------------------------------------------------------------------------
-- 2. Canonicalize storage:// references. These always identify a bucket/key
--    intentionally, so resolving them through the current project is safe.
-- ---------------------------------------------------------------------------
with refs as (
  select
    id,
    split_part(substring(storage_url from 11), '/', 1) as bucket,
    substring(
      substring(storage_url from 11)
      from length(split_part(substring(storage_url from 11), '/', 1)) + 2
    ) as object_key
  from public.post_media
  where storage_url like 'storage://%'
    and (storage_bucket is null or storage_key is null)
)
update public.post_media pm
set
  storage_bucket = coalesce(pm.storage_bucket, nullif(refs.bucket, '')),
  storage_key = coalesce(pm.storage_key, nullif(refs.object_key, ''))
from refs
where refs.id = pm.id
  and nullif(refs.bucket, '') is not null
  and nullif(refs.object_key, '') is not null;

with refs as (
  select
    id,
    split_part(substring(thumbnail_url from 11), '/', 1) as bucket,
    substring(
      substring(thumbnail_url from 11)
      from length(split_part(substring(thumbnail_url from 11), '/', 1)) + 2
    ) as object_key
  from public.post_media
  where thumbnail_url like 'storage://%'
    and (thumbnail_bucket is null or thumbnail_key is null)
)
update public.post_media pm
set
  thumbnail_bucket = coalesce(pm.thumbnail_bucket, nullif(refs.bucket, '')),
  thumbnail_key = coalesce(pm.thumbnail_key, nullif(refs.object_key, ''))
from refs
where refs.id = pm.id
  and nullif(refs.bucket, '') is not null
  and nullif(refs.object_key, '') is not null;

-- ---------------------------------------------------------------------------
-- 3. Recover bucket/key from absolute URLs ONLY for the production Supabase
--    project that this repository deploys to. We intentionally leave other
--    Supabase hosts untouched because those objects may still live there.
-- ---------------------------------------------------------------------------
with raw_refs as (
  select
    id,
    case
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/%'
        then split_part(storage_url, '/storage/v1/object/public/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/sign/%'
        then split_part(storage_url, '/storage/v1/object/sign/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/authenticated/%'
        then split_part(storage_url, '/storage/v1/object/authenticated/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/public/%'
        then split_part(storage_url, '/storage/v1/render/image/public/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/sign/%'
        then split_part(storage_url, '/storage/v1/render/image/sign/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/authenticated/%'
        then split_part(storage_url, '/storage/v1/render/image/authenticated/', 2)
      else null
    end as raw_ref
  from public.post_media
  where (storage_bucket is null or storage_key is null)
), cleaned as (
  select id, split_part(split_part(raw_ref, '?', 1), '#', 1) as ref
  from raw_refs
  where raw_ref is not null
), parsed as (
  select
    id,
    split_part(ref, '/', 1) as bucket,
    substring(ref from length(split_part(ref, '/', 1)) + 2) as object_key
  from cleaned
)
update public.post_media pm
set
  storage_bucket = coalesce(pm.storage_bucket, nullif(parsed.bucket, '')),
  storage_key = coalesce(pm.storage_key, nullif(parsed.object_key, ''))
from parsed
where parsed.id = pm.id
  and nullif(parsed.bucket, '') is not null
  and nullif(parsed.object_key, '') is not null;

with raw_refs as (
  select
    id,
    case
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/%'
        then split_part(thumbnail_url, '/storage/v1/object/public/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/sign/%'
        then split_part(thumbnail_url, '/storage/v1/object/sign/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/authenticated/%'
        then split_part(thumbnail_url, '/storage/v1/object/authenticated/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/public/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/public/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/sign/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/sign/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/authenticated/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/authenticated/', 2)
      else null
    end as raw_ref
  from public.post_media
  where thumbnail_url is not null
    and (thumbnail_bucket is null or thumbnail_key is null)
), cleaned as (
  select id, split_part(split_part(raw_ref, '?', 1), '#', 1) as ref
  from raw_refs
  where raw_ref is not null
), parsed as (
  select
    id,
    split_part(ref, '/', 1) as bucket,
    substring(ref from length(split_part(ref, '/', 1)) + 2) as object_key
  from cleaned
)
update public.post_media pm
set
  thumbnail_bucket = coalesce(pm.thumbnail_bucket, nullif(parsed.bucket, '')),
  thumbnail_key = coalesce(pm.thumbnail_key, nullif(parsed.object_key, ''))
from parsed
where parsed.id = pm.id
  and nullif(parsed.bucket, '') is not null
  and nullif(parsed.object_key, '') is not null;

-- ---------------------------------------------------------------------------
-- 4. Fill genuinely missing structured rows from legacy posts.media_urls.
--    Extension evidence wins; posts.media_type is only a fallback for opaque
--    legacy URLs. Existing rows are never overwritten here.
-- ---------------------------------------------------------------------------
insert into public.post_media (
  post_id,
  position,
  kind,
  storage_url,
  thumbnail_url,
  created_at
)
select
  p.id,
  (media_item.ordinality - 1)::integer,
  case
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
      then 'video'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
      then 'audio'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
      then 'image'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
      then 'archive'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
      then 'document'::public.media_kind
    when lower(coalesce(p.media_type, '')) in ('video', 'reel', 'short')
      then 'video'::public.media_kind
    when lower(coalesce(p.media_type, '')) = 'audio'
      then 'audio'::public.media_kind
    else 'image'::public.media_kind
  end,
  media_item.value,
  case when media_item.ordinality = 1 then p.thumbnail_url else null end,
  coalesce(p.created_at, now())
from public.posts p
cross join lateral unnest(coalesce(p.media_urls, array[]::text[]))
  with ordinality as media_item(value, ordinality)
where nullif(media_item.value, '') is not null
  and not exists (
    select 1
    from public.post_media pm
    where pm.post_id = p.id
      and pm.position = (media_item.ordinality - 1)::integer
  );

-- Empty structured URL is unusable, but a legacy URL at the same position can
-- restore it safely without changing any non-empty structured URL.
update public.post_media pm
set storage_url = p.media_urls[pm.position + 1]
from public.posts p
where p.id = pm.post_id
  and nullif(pm.storage_url, '') is null
  and array_length(p.media_urls, 1) >= pm.position + 1
  and nullif(p.media_urls[pm.position + 1], '') is not null;

notify pgrst, 'reload schema';
