-- =============================================================================
-- Storage recovery: ensure every bucket used by the current chat/media code exists.
--
-- Root cause addressed here:
--   * chat/media rendering can reference legacy chat-media/message-attachments
--     objects after those buckets were made private;
--   * current uploads use the public `media` bucket;
--   * private Create assets use `media-private`.
--
-- The statements are idempotent so this migration is safe on databases where
-- some or all buckets already exist.
-- =============================================================================

-- Current public media bucket used by chat uploads, posts, stories, etc.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 536870912)
on conflict (id) do update
set public = true,
    file_size_limit = 536870912;

-- Current private bucket used by friends/private Create media.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
set public = false,
    file_size_limit = 536870912;

-- Legacy chat buckets. Keep them private: old messages can be repaired with
-- participant-authorized signed URLs instead of making historical media public.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat-media', 'chat-media', false, 536870912),
  ('message-attachments', 'message-attachments', false, 536870912)
on conflict (id) do update
set public = false,
    file_size_limit = 536870912;

-- ---------------------------------------------------------------------------
-- Public `media`: authenticated users can manage their own user-prefixed files.
-- ---------------------------------------------------------------------------
drop policy if exists "Media files are publicly readable" on storage.objects;
create policy "Media files are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'media');

drop policy if exists "Users can upload their own media" on storage.objects;
create policy "Users can upload their own media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own media" on storage.objects;
create policy "Users can update their own media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own media" on storage.objects;
create policy "Users can delete their own media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Private `media-private`: owner manages objects; viewers are handled by the
-- existing post/media visibility policies created by earlier migrations.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload their private media" on storage.objects;
create policy "Users can upload their private media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their private media" on storage.objects;
create policy "Users can update their private media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their private media" on storage.objects;
create policy "Users can delete their private media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Legacy private chat buckets: owner OR conversation participant can read;
-- upload/update/delete remains restricted to the object's owner/user folder.
-- ---------------------------------------------------------------------------
drop policy if exists "Chat media owner or participant read" on storage.objects;
create policy "Chat media owner or participant read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = (storage.foldername(name))[1]
          and cp.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can upload legacy chat media" on storage.objects;
create policy "Users can upload legacy chat media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('chat-media', 'message-attachments')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = (storage.foldername(name))[1]
          and cp.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update legacy chat media" on storage.objects;
create policy "Users can update legacy chat media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  )
  with check (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  );

drop policy if exists "Users can delete legacy chat media" on storage.objects;
create policy "Users can delete legacy chat media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  );
