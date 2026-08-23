CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1) Heartbeat: client marks itself alive
CREATE OR REPLACE FUNCTION public.call_heartbeat(p_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_call_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.call_participants
  SET last_seen_at = now(),
      connection_state = CASE WHEN connection_state = 'joining' THEN 'connected' ELSE connection_state END
  WHERE call_id = p_call_id AND user_id = v_user_id AND left_at IS NULL;

  UPDATE public.call_room_members
  SET updated_at = now()
  WHERE call_id = p_call_id AND user_id = v_user_id AND left_at IS NULL;

  UPDATE public.video_calls
  SET last_heartbeat_at = now()
  WHERE id = p_call_id AND ended_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.call_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_heartbeat(uuid) TO authenticated;

-- 2) Reaper: drop stale participants and end empty calls
CREATE OR REPLACE FUNCTION public.reap_stale_calls(p_stale_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        connection_state = 'disconnected'
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
        connection_state = 'disconnected',
        updated_at = now()
    WHERE crm.left_at IS NULL
      AND COALESCE(crm.updated_at, crm.joined_at) < v_cutoff
    RETURNING crm.call_id
  )
  SELECT count(*)::int INTO v_members FROM stale_m;

  -- expire never-answered ringing invites
  WITH exp AS (
    UPDATE public.call_invites ci
    SET status = 'missed',
        updated_at = now()
    WHERE COALESCE(ci.status, 'pending') = 'pending'
      AND ci.created_at < now() - interval '60 seconds'
    RETURNING ci.id
  )
  SELECT count(*)::int INTO v_invites FROM exp;

  -- end calls with no active participants left
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

REVOKE ALL ON FUNCTION public.reap_stale_calls(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_calls(integer) TO service_role;

-- 3) Combined maintenance entry point used by cron
CREATE OR REPLACE FUNCTION public.rtc_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_signals integer := 0;
  v_reaped jsonb;
BEGIN
  v_reaped := public.reap_stale_calls(90);
  BEGIN
    v_signals := public.cleanup_expired_call_signals();
  EXCEPTION WHEN undefined_function THEN
    v_signals := 0;
  END;
  RETURN v_reaped || jsonb_build_object('deleted_signals', v_signals);
END;
$$;

REVOKE ALL ON FUNCTION public.rtc_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rtc_maintenance() TO service_role;

-- helpful indexes for the reaper
CREATE INDEX IF NOT EXISTS idx_call_participants_active
  ON public.call_participants (call_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_call_participants_last_seen
  ON public.call_participants (last_seen_at) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_calls_open
  ON public.video_calls (last_heartbeat_at) WHERE ended_at IS NULL;

-- 4) Schedule every minute
SELECT cron.unschedule('rtc-maintenance-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtc-maintenance-every-minute');

SELECT cron.schedule(
  'rtc-maintenance-every-minute',
  '* * * * *',
  $cron$ SELECT public.rtc_maintenance(); $cron$
);