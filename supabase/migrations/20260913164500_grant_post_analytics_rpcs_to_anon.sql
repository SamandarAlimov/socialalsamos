-- Allow feed analytics RPCs to be called before/without an authenticated session.
-- Both functions are SECURITY DEFINER and internally handle auth.uid() safely.

grant execute on function public.increment_post_views() to anon;
grant execute on function public.increment_post_views(uuid) to anon;
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
) to anon;
