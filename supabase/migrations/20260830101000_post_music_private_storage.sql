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
