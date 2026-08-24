CREATE OR REPLACE FUNCTION public.reap_stale_calls(p_stale_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(secs => GREATEST(COALESCE(p_stale_seconds, 90), 30));
  v_participants integer := 0;
  v_members integer := 0;
  v_calls integer := 0;
  v_invites integer := 0;
BEGIN
  WITH stale AS (
    UPDATE public.call_participants cp
    SET left_at = now(),
        connection_state = 'left'
    FROM public.video_calls vc
    WHERE vc.id = cp.call_id
      AND cp.left_at IS NULL
      AND COALESCE(cp.last_seen_at, cp.joined_at, vc.created_at) < v_cutoff
    RETURNING cp.call_id
  )
  SELECT count(*)::int INTO v_participants FROM stale;

  WITH stale_m AS (
    UPDATE public.call_room_members crm
    SET left_at = now(),
        connection_state = 'left',
        updated_at = now()
    WHERE crm.left_at IS NULL
      AND COALESCE(crm.updated_at, crm.joined_at) < v_cutoff
    RETURNING crm.call_id
  )
  SELECT count(*)::int INTO v_members FROM stale_m;

  WITH exp AS (
    UPDATE public.call_invites ci
    SET status = 'missed',
        updated_at = now()
    WHERE COALESCE(ci.status, 'pending') = 'pending'
      AND ci.created_at < now() - interval '60 seconds'
    RETURNING ci.id
  )
  SELECT count(*)::int INTO v_invites FROM exp;

  WITH dead AS (
    UPDATE public.video_calls vc
    SET status = 'ended',
        ended_at = now()
    WHERE vc.ended_at IS NULL
      AND vc.status NOT IN ('ended', 'declined', 'missed', 'cancelled')
      AND COALESCE(vc.last_heartbeat_at, vc.created_at) < v_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM public.call_participants p
        WHERE p.call_id = vc.id AND p.left_at IS NULL
      )
    RETURNING vc.id
  )
  SELECT count(*)::int INTO v_calls FROM dead;

  RETURN jsonb_build_object(
    'stale_participants', v_participants,
    'stale_members', v_members,
    'expired_invites', v_invites,
    'ended_calls', v_calls
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reap_stale_calls(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_calls(integer) TO service_role;