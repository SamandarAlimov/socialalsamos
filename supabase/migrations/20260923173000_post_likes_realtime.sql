-- Realtime post-like state for Home and Videos.
--
-- UI counters subscribe to public.post_likes, but production did not publish
-- this table through supabase_realtime. INSERT/DELETE therefore only became
-- visible after a later refetch/navigation. DELETE also needs the full old row
-- so clients can recover post_id/user_id when a like is removed.

alter table public.post_likes replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_likes'
  ) then
    alter publication supabase_realtime add table public.post_likes;
  end if;
end;
$$;
