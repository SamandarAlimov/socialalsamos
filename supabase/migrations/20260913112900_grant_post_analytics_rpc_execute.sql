-- Restore client access to post analytics RPCs.
-- Both functions are SECURITY DEFINER and validate auth.uid() internally,
-- so authenticated clients may execute them without granting direct table writes.

grant execute on function public.increment_post_views(uuid) to authenticated;

grant execute on function public.track_post_analytics_session(
  uuid,
  text,
  text,
  text,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
  boolean
) to authenticated;
