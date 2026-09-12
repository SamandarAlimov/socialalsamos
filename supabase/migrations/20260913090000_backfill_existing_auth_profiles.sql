-- Users may have been created in Supabase Auth before the Alsamos public schema
-- was restored. The auth.users -> public.profiles trigger only runs for future
-- inserts, so backfill any already-existing Auth users after profiles exists.
--
-- Username is intentionally left NULL for backfilled rows to avoid colliding
-- with an existing unique username. The normal profile/onboarding flow can set
-- it later. public.profiles.id is the critical FK used by posts/messages/etc.

INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'display_name', ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Foydalanuvchi'
  ) AS display_name,
  NULLIF(u.raw_user_meta_data ->> 'avatar_url', '') AS avatar_url
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
