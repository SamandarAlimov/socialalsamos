-- Repair video-call heartbeat authorization and keep liveness writes scoped
-- to the authenticated participant of an active call.
--
-- Why this exists:
--   * browser clients call public.call_heartbeat through PostgREST;
--   * direct table writes are intentionally restricted;
--   * function hardening can remove EXECUTE from authenticated unless it is
--     granted explicitly.
--
-- SECURITY DEFINER is safe here because the function never trusts a user id
-- supplied by the caller. It derives the actor exclusively from auth.uid().

create or replace function public.call_heartbeat(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  update public.call_participants as cp
  set last_seen_at = now()
  from public.video_calls as vc
  where cp.call_id = p_call_id
    and cp.user_id = v_user_id
    and cp.left_at is null
    and vc.id = cp.call_id
    and vc.status = 'active'
    and vc.ended_at is null;

  return found;
end;
$$;

revoke all on function public.call_heartbeat(uuid) from public, anon;
grant execute on function public.call_heartbeat(uuid) to authenticated;

comment on function public.call_heartbeat(uuid) is
  'Refreshes last_seen_at only for the authenticated user active in the specified open call.';
