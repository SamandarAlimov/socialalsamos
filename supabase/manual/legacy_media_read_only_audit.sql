-- Diagnostic only. Run against mbhjganbihamoiqmankv; returns no secrets.
-- Never infer object deletion from a failed public URL or reset a bucket.
begin read only;

select id, name, public
from storage.buckets
where id in ('message-attachments', 'chat-media', 'media', 'media-private');

select bucket_id, count(*) as object_metadata_rows
from storage.objects
where bucket_id in ('message-attachments', 'chat-media', 'media', 'media-private')
group by bucket_id;

select bucket_id, name, id
from storage.objects
where bucket_id = 'message-attachments'
  and name in (
    'e71015f8-3c32-4359-afa8-b118ed7f8fac/1769427345709-02tsye.mp4',
    'e71015f8-3c32-4359-afa8-b118ed7f8fac/1768572257426-3l5qi.mp4'
  );

select id, media_type, media_urls
from public.posts
where id = '938df40f-0d8c-4a8e-86d9-c84299057803';

select id, post_id, position, storage_url, storage_bucket, storage_key
from public.post_media
where post_id = '938df40f-0d8c-4a8e-86d9-c84299057803';

select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT';

select version, name
from supabase_migrations.schema_migrations
where version in ('20260902000000', '20260902001000', '20260905224500', '20260906010535');

rollback;
