-- Legacy posts and private chat attachments share these buckets. Keep the
-- buckets private and allow signing only objects attached to a visible,
-- published post by that object's author. No post, media, or object is changed.
-- The absolute URL prefix is deliberately scoped to this production project.

drop policy if exists "Legacy media readable by post audience" on storage.objects;
create policy "Legacy media readable by post audience"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id in ('message-attachments', 'chat-media')
    and exists (
      select 1
      from public.posts p
      cross join lateral (
        select array[
          'storage://' || objects.bucket_id || '/' || objects.name,
          'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/' || objects.bucket_id || '/' || objects.name,
          'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/sign/' || objects.bucket_id || '/' || objects.name,
          'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/authenticated/' || objects.bucket_id || '/' || objects.name
        ]::text[] as urls
      ) refs
      where p.user_id::text = (storage.foldername(objects.name))[1]
        and coalesce(p.status, 'published') = 'published'
        -- The posts and post_media SELECT policies still apply in this query.
        and (
          exists (
            select 1
            from unnest(p.media_urls) as legacy(url)
            where split_part(split_part(legacy.url, '?', 1), '#', 1) = any(refs.urls)
          )
          or exists (
            select 1
            from public.post_media pm
            where pm.post_id = p.id
              and (
                (pm.storage_bucket = objects.bucket_id and pm.storage_key = objects.name)
                or (pm.thumbnail_bucket = objects.bucket_id and pm.thumbnail_key = objects.name)
                or split_part(split_part(pm.storage_url, '?', 1), '#', 1) = any(refs.urls)
                or split_part(split_part(pm.thumbnail_url, '?', 1), '#', 1) = any(refs.urls)
              )
          )
        )
    )
  );

notify pgrst, 'reload schema';
