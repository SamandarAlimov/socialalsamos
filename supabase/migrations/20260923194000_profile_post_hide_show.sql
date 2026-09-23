-- Reversible profile-only post visibility.
-- NULL = shown on the author's profile, timestamp = hidden from that profile.
-- The post itself is not deleted and keeps its likes/comments/media so the owner
-- can restore it at any time.
alter table public.posts
  add column if not exists profile_hidden_at timestamptz null;

create index if not exists posts_profile_visible_idx
  on public.posts (user_id, is_pinned desc, created_at desc)
  where profile_hidden_at is null;

create index if not exists posts_profile_hidden_idx
  on public.posts (user_id, profile_hidden_at desc, created_at desc)
  where profile_hidden_at is not null;

comment on column public.posts.profile_hidden_at is
  'Owner-controlled profile visibility. NULL means shown on profile; non-NULL hides it from the author profile until restored.';
