-- =============================================================================
-- External media provider compatibility
--
-- New binary objects live on the Alsamos MinIO/S3 media server, not Supabase
-- Storage. Supabase keeps only post metadata + a stable external provider key.
-- Legacy Supabase `storage://` references continue to work unchanged.
-- =============================================================================

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
  -- Canonical external server reference always wins over stale provider fields.
  if new.storage_url like 'alsamos-media://%' then
    new.storage_bucket := 'alsamos-media';
    new.storage_key := substr(new.storage_url, length('alsamos-media://') + 1);
  elsif new.storage_url like 'private/%' then
    -- Old API client stored the raw key for private objects.
    new.storage_bucket := 'alsamos-media';
    new.storage_key := new.storage_url;
  elsif new.storage_url like 'https://media.alsamos.com/media/%' then
    -- Old/new public API client stores the permanent CDN URL.
    new.storage_bucket := 'alsamos-media';
    new.storage_key := substr(
      new.storage_url,
      length('https://media.alsamos.com/media/') + 1
    );
  end if;

  if new.thumbnail_url like 'alsamos-media://%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := substr(new.thumbnail_url, length('alsamos-media://') + 1);
  elsif new.thumbnail_url like 'private/%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := new.thumbnail_url;
  elsif new.thumbnail_url like 'https://media.alsamos.com/media/%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := substr(
      new.thumbnail_url,
      length('https://media.alsamos.com/media/') + 1
    );
  end if;

  -- Legacy Supabase reference remains supported.
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

  if v_visibility <> 'public' then
    if (
         new.storage_bucket is distinct from 'media-private'
         and new.storage_bucket is distinct from 'alsamos-media'
       )
       or new.storage_key is null
       or length(new.storage_key) = 0 then
      raise exception 'Maxfiy post fayli private yoki Alsamos media storage da bo''lishi shart';
    end if;

    if new.thumbnail_url is not null
       and (
         (
           new.thumbnail_bucket is distinct from 'media-private'
           and new.thumbnail_bucket is distinct from 'alsamos-media'
         )
         or new.thumbnail_key is null
         or length(new.thumbnail_key) = 0
       ) then
      raise exception 'Maxfiy post preview fayli private yoki Alsamos media storage da bo''lishi shart';
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

-- Repair canonical scheme rows.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = substr(storage_url, length('alsamos-media://') + 1)
where storage_url like 'alsamos-media://%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from substr(storage_url, length('alsamos-media://') + 1)
  );

-- Repair old private API rows where storage_url itself was just `private/...`.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = storage_url
where storage_url like 'private/%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from storage_url
  );

-- Repair old public API rows that were incorrectly tagged as Supabase `media`
-- because both providers happened to use the same bucket name.
update public.post_media
set
  storage_bucket = 'alsamos-media',
  storage_key = substr(
    storage_url,
    length('https://media.alsamos.com/media/') + 1
  )
where storage_url like 'https://media.alsamos.com/media/%'
  and (
    storage_bucket is distinct from 'alsamos-media'
    or storage_key is distinct from substr(
      storage_url,
      length('https://media.alsamos.com/media/') + 1
    )
  );

update public.post_media
set
  thumbnail_bucket = 'alsamos-media',
  thumbnail_key = case
    when thumbnail_url like 'alsamos-media://%'
      then substr(thumbnail_url, length('alsamos-media://') + 1)
    when thumbnail_url like 'private/%'
      then thumbnail_url
    else substr(
      thumbnail_url,
      length('https://media.alsamos.com/media/') + 1
    )
  end
where thumbnail_url like 'alsamos-media://%'
   or thumbnail_url like 'private/%'
   or thumbnail_url like 'https://media.alsamos.com/media/%';

notify pgrst, 'reload schema';
