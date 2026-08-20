CREATE OR REPLACE FUNCTION public.create_video_call(
  p_conversation_id uuid,
  p_call_type text DEFAULT 'video',
  p_is_video_on boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call_id uuid;
  v_conversation_type text;
  v_is_group boolean;
  v_max_participants integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'User must be logged in to create a call';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_required';
  END IF;

  IF p_call_type NOT IN ('audio', 'video') THEN
    RAISE EXCEPTION 'invalid_call_type' USING HINT = 'Call type must be audio or video';
  END IF;

  SELECT c.type
  INTO v_conversation_type
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  IF v_conversation_type = 'channel' THEN
    RAISE EXCEPTION 'channel_calls_not_supported';
  END IF;

  IF NOT public.is_conversation_participant(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'not_conversation_participant' USING HINT = 'User must be a participant in the conversation';
  END IF;

  v_is_group := v_conversation_type = 'group';
  v_max_participants := CASE WHEN v_is_group THEN 8 ELSE 2 END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  -- A call without started_at has never established a peer connection.
  -- Expire unanswered/abandoned sessions so retries cannot join stale rooms.
  UPDATE public.video_calls
  SET status = 'ended',
      ended_at = COALESCE(ended_at, now())
  WHERE conversation_id = p_conversation_id
    AND status IN ('waiting', 'active')
    AND ended_at IS NULL
    AND started_at IS NULL
    AND created_at < now() - interval '2 minutes';

  UPDATE public.call_participants cp
  SET left_at = COALESCE(cp.left_at, now()),
      connection_state = 'expired',
      last_seen_at = now()
  WHERE cp.call_id IN (
    SELECT vc.id
    FROM public.video_calls vc
    WHERE vc.conversation_id = p_conversation_id
      AND vc.status = 'ended'
      AND vc.ended_at >= now() - interval '5 seconds'
  )
    AND cp.left_at IS NULL;

  UPDATE public.call_room_members crm
  SET left_at = COALESCE(crm.left_at, now()),
      connection_state = 'expired',
      updated_at = now()
  WHERE crm.call_id IN (
    SELECT vc.id
    FROM public.video_calls vc
    WHERE vc.conversation_id = p_conversation_id
      AND vc.status = 'ended'
      AND vc.ended_at >= now() - interval '5 seconds'
  )
    AND crm.left_at IS NULL;

  SELECT vc.id
  INTO v_call_id
  FROM public.video_calls vc
  WHERE vc.conversation_id = p_conversation_id
    AND vc.status IN ('waiting', 'active')
    AND vc.ended_at IS NULL
  ORDER BY vc.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_call_id IS NULL THEN
    INSERT INTO public.video_calls (
      conversation_id, host_id, call_type, status, started_at, ended_at,
      is_group_call, max_participants
    ) VALUES (
      p_conversation_id, v_user_id, p_call_type, 'active', NULL, NULL,
      v_is_group, v_max_participants
    )
    RETURNING id INTO v_call_id;
  END IF;

  INSERT INTO public.call_participants (
    call_id, user_id, joined_at, left_at, is_muted, is_video_on,
    is_screen_sharing, is_hand_raised, connection_state, last_seen_at
  ) VALUES (
    v_call_id, v_user_id, now(), NULL, false, p_is_video_on,
    false, false, 'connecting', now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    joined_at = excluded.joined_at,
    left_at = NULL,
    is_muted = false,
    is_video_on = excluded.is_video_on,
    is_screen_sharing = false,
    is_hand_raised = false,
    connection_state = 'connecting',
    last_seen_at = now();

  INSERT INTO public.call_room_members (
    call_id, user_id, role, connection_state, media_state,
    joined_at, left_at, updated_at
  ) VALUES (
    v_call_id,
    v_user_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.video_calls vc
        WHERE vc.id = v_call_id AND vc.host_id = v_user_id
      ) THEN 'host'
      ELSE 'participant'
    END,
    'connecting',
    jsonb_build_object(
      'is_muted', false,
      'is_video_on', p_is_video_on,
      'is_screen_sharing', false,
      'is_hand_raised', false
    ),
    now(),
    NULL,
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    connection_state = 'connecting',
    media_state = excluded.media_state,
    left_at = NULL,
    updated_at = now();

  RETURN v_call_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_call(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_video_call(uuid, text, boolean) TO authenticated, service_role;