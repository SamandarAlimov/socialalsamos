-- Allow signed-in clients to use the atomic post publisher.
-- The function is SECURITY DEFINER and validates auth.uid() before writing.

grant execute on function public.publish_post_draft(jsonb) to authenticated;
