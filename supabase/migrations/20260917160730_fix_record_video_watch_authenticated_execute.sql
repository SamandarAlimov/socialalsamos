-- Keep anonymous callers out, while allowing signed-in clients to record their own
-- video watch sessions. The function itself derives the actor from auth.uid().
revoke all on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) from public;
revoke all on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) from anon;
grant execute on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) to authenticated;
grant execute on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) to service_role;
