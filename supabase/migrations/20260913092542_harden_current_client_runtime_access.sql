-- Keep the browser-facing RPC surface explicit and reproducible.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('ensure_my_wallet','get_eligible_ads_v5','my_contact_suggestions','mini_apps_feed')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
  END LOOP;
END $$;

-- These client tables are protected by RLS; authenticated needs the SQL privilege
-- before RLS can evaluate the user-specific policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_settings,
  public.user_recommendation_interests,
  public.post_bookmarks,
  public.place_visits
TO authenticated;

-- Presence/profile writes are column-limited; counters and verification stay server-managed.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  username, display_name, avatar_url, bio, cover_url, website, location,
  is_online, last_seen, last_seen_at, updated_at
) ON TABLE public.profiles TO authenticated;
