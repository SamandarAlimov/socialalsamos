-- Restore the authenticated PostgREST contract for video-call liveness.
--
-- Production audit on 2026-09-14 confirmed that public.call_heartbeat(uuid)
-- is already SECURITY DEFINER, but the authenticated role no longer has
-- EXECUTE after function-permission hardening. That produces the observed
-- HTTP 403 before the function body can run.
--
-- Keep the existing function body intact: it refreshes call_participants,
-- call_room_members and video_calls heartbeat state. This migration repairs
-- only the privilege regression.

revoke all on function public.call_heartbeat(uuid) from public, anon;
grant execute on function public.call_heartbeat(uuid) to authenticated;
