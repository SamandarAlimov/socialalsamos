-- Home recommendation retrieval + personalization signal indexes.
-- No new user profiling table is needed: ranking uses first-party behavior that
-- already exists (likes, comments, saves, reposts, views, follows, hides,
-- hashtags and video retention).

create index if not exists posts_home_recommendation_fresh_idx
  on public.posts (created_at desc)
  where visibility = 'public';

create index if not exists posts_home_recommendation_quality_idx
  on public.posts (likes_count desc, comments_count desc, created_at desc)
  where visibility = 'public';

create index if not exists follows_home_affinity_idx
  on public.follows (follower_id, following_id);

create index if not exists post_likes_home_affinity_idx
  on public.post_likes (user_id, created_at desc, post_id);

create index if not exists comments_home_affinity_idx
  on public.comments (user_id, created_at desc, post_id);

create index if not exists bookmarks_home_affinity_idx
  on public.bookmarks (user_id, created_at desc, post_id);

create index if not exists reposts_home_affinity_idx
  on public.reposts (user_id, created_at desc, post_id);

create index if not exists post_views_home_affinity_idx
  on public.post_views (user_id, viewed_at desc, post_id);

create index if not exists content_hides_home_affinity_idx
  on public.content_hides (user_id, created_at desc, post_id);

create index if not exists post_hashtags_home_affinity_idx
  on public.post_hashtags (post_id, hashtag);

create index if not exists video_watch_sessions_home_affinity_idx
  on public.video_watch_sessions (user_id, created_at desc, post_id);
