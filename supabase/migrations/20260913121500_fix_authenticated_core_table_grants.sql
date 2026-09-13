-- Restore PostgREST privileges required by the authenticated client.
-- RLS policies still enforce per-user access; these grants only allow the
-- authenticated role to reach the tables so those policies can be evaluated.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.profiles
TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.user_settings
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.user_sessions
TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.call_invites
TO authenticated;
