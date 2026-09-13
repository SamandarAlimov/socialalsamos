alter view public.post_bookmarks set (security_invoker = true);
revoke all on table public.post_bookmarks from anon;
grant select, insert, update, delete on table public.post_bookmarks to authenticated;
