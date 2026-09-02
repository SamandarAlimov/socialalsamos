-- ============================================================================
-- Media storage repair
--
-- AI/chat uploads use the public `media` bucket from src/lib/mediaUpload.ts.
-- The application can receive `Bucket not found` when the bucket was removed
-- manually or when an older production database is ahead of the migration
-- history. Re-create the buckets idempotently without changing existing
-- storage.objects policies.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = 536870912;

insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = 536870912;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat-media', 'chat-media', false, 536870912),
  ('message-attachments', 'message-attachments', false, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = 536870912;
