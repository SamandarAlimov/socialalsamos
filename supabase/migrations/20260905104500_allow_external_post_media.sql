-- =============================================================================
-- External media provider compatibility
--
-- New binary objects live on the Alsamos MinIO/S3 media server, not Supabase
-- Storage. Supabase keeps only post metadata + a stable `alsamos-media://` key.
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
  -- Canonical external server reference: alsamos-media://private/post/... or
  -- alsamos-media://post/...
  if new.storage_bucket is null
     and new.storage_key is null
     and new.storage_url like 'alsamos-media://%' then
    new.storage_bucket := 'alsamos-media';
    new.storage_key := substr(new.storage_url, length('alsamos-media://') + 1);
  end if;

  if new.thumbnail_bucket is null
     and new.thumbnail_key is null
     and new.thumbnail_url like 'alsamos-media://%' then
    new.thumbnail_bucket := 'alsamos-media';
    new.thumbnail_key := substr(new.thumbnail_url, length('alsamos-media://') + 1);
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

  -- Non-public media may live either in the old Supabase private bucket or in
  -- the new external Alsamos media provider. Public Supabase bucket is never
  -- accepted for a friends/private post.
  if v_visibility <> 'public' then
    if new.storage_bucket not in ('media-private', 'alsamos-media')
       or new.storage_key is null
       or length(new.storage_key) = 0 then
      raise exception 'Maxfiy post fayli private yoki Alsamos media storage da bo''lishi shart';
    end if;

    if new.thumbnail_url is not null
       and (
         new.thumbnail_bucket not in ('media-private', 'alsamos-media')
         or new.thumbnail_key is null
         or length(new.thumbnail_key) = 0
       ) then
      raise exception 'Maxfiy post preview fayli private yoki Alsamos media storage da bo''lishi shart';
    end if;
  end if;

  return new;
end
$$;

-- Keep exactly one normalizer trigger, including on databases that only have a
-- subset of the historical migrations.
drop trigger if exists post_media_normalize_storage on public.post_media;
create trigger post_media_normalize_storage
  before insert or update of storage_url, thumbnail_url, storage_bucket, storage_key,
    thumbnail_bucket, thumbnail_key
  on public.post_media
  for each row execute function public.normalize_post_media_storage();

notify pgrst, 'reload schema';
