-- Remove legacy post media URLs that point at storage objects no longer
-- available from Supabase. These URLs make the feed render a large failed
-- video player even though the post text itself is still valid.

with broken_urls(url) as (
  values
    ('https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/message-attachments/e71015f8-3c32-4359-afa8-b118ed7f8fac/1769427345709-02tsye.mp4')
),
updated_posts as (
  update public.posts p
     set media_urls = coalesce(
           (
             select array_agg(item.url order by item.ordinality)
             from unnest(coalesce(p.media_urls, array[]::text[]))
               with ordinality as item(url, ordinality)
             where item.url not in (select url from broken_urls)
           ),
           array[]::text[]
         ),
         media_type = case
           when not exists (
             select 1
             from unnest(coalesce(p.media_urls, array[]::text[])) as item(url)
             where item.url not in (select url from broken_urls)
           ) and p.media_type in ('video', 'reel', 'short')
             then 'text'
           else p.media_type
         end
   where exists (
     select 1
     from unnest(coalesce(p.media_urls, array[]::text[])) as item(url)
     where item.url in (select url from broken_urls)
   )
   returning p.id
)
delete from public.post_media pm
using broken_urls b
where pm.storage_url = b.url;

update public.posts
   set media_type = 'text'
 where media_type in ('video', 'reel', 'short')
   and coalesce(array_length(media_urls, 1), 0) = 0
   and nullif(btrim(coalesce(content, '')), '') is not null;

notify pgrst, 'reload schema';
