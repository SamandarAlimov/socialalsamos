-- Creator analytics read-path indexes.
-- These match get_post_insights timeline/session predicates and the engagement
-- trigger's latest-session lookup. They are intentionally narrow B-tree indexes
-- so analytics can scale without turning post interactions into table scans.

create index if not exists post_analytics_sessions_post_viewer_first_seen_idx
  on public.post_analytics_sessions (post_id, viewer_id, first_seen_at desc);

create index if not exists post_analytics_sessions_post_viewer_last_seen_idx
  on public.post_analytics_sessions (post_id, viewer_id, last_seen_at desc);

create index if not exists post_likes_post_created_idx
  on public.post_likes (post_id, created_at desc);

create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at desc);

create index if not exists reposts_post_created_idx
  on public.reposts (post_id, created_at desc);

create index if not exists bookmarks_post_created_idx
  on public.bookmarks (post_id, created_at desc);
