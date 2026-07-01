
-- Re-add location column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;

-- Restrict anon column-level access: no access to location
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, avatar_url, cover_url, bio,
  is_verified, followers_count, following_count, posts_count,
  is_online, last_seen, country, website, birth_date, created_at, updated_at
) ON public.profiles TO anon;

-- Authenticated still has full row+column access
GRANT SELECT ON public.profiles TO authenticated;
