-- 1. Explicit call type
ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS is_group_call boolean NOT NULL DEFAULT false;

UPDATE public.video_calls vc
SET is_group_call = true
FROM public.conversations c
WHERE c.id = vc.conversation_id
  AND c.type IS DISTINCT FROM 'private';

ALTER TABLE public.video_calls ALTER COLUMN max_participants SET DEFAULT 8;

UPDATE public.video_calls
SET max_participants = 8
WHERE max_participants IS NULL OR max_participants < 2;

-- Derive is_group_call automatically for direct inserts
CREATE OR REPLACE FUNCTION public.set_call_is_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT (c.type IS DISTINCT FROM 'private')
      INTO NEW.is_group_call
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  IF NEW.is_group_call IS NULL THEN
    NEW.is_group_call := false;
  END IF;
  IF NEW.max_participants IS NULL OR NEW.max_participants < 2 THEN
    NEW.max_participants := 8;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_call_is_group ON public.video_calls;
CREATE TRIGGER trg_set_call_is_group
BEFORE INSERT ON public.video_calls
FOR EACH ROW EXECUTE FUNCTION public.set_call_is_group();

-- 2. Atomic leave with correct group semantics
CREATE OR REPLACE FUNCTION public.leave_video_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_active int;
  v_ended boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_call FROM public.video_calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'call_not_found';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'not_call_participant';
  END IF;

  UPDATE public.call_participants
  SET left_at = now(), connection_state = 'left', last_seen_at = now()
  WHERE call_id = p_call_id AND user_id = v_user_id AND left_at IS NULL;

  UPDATE public.call_room_members
  SET connection_state = 'left', left_at = now(), updated_at = now()
  WHERE call_id = p_call_id AND user_id = v_user_id AND left_at IS NULL;

  SELECT count(*) INTO v_active
  FROM public.call_participants
  WHERE call_id = p_call_id AND left_at IS NULL;

  IF NOT COALESCE(v_call.is_group_call, false) OR v_active <= 1 THEN
    UPDATE public.video_calls
    SET status = 'ended', ended_at = COALESCE(ended_at, now())
    WHERE id = p_call_id AND status <> 'ended';

    UPDATE public.call_participants
    SET left_at = now(), connection_state = 'left'
    WHERE call_id = p_call_id AND left_at IS NULL;

    v_ended := true;
  END IF;

  RETURN jsonb_build_object(
    'call_ended', v_ended,
    'active_participants', GREATEST(v_active - (CASE WHEN v_ended THEN v_active ELSE 0 END), 0),
    'is_group_call', COALESCE(v_call.is_group_call, false)
  );
END;
$$;

-- 3. Atomic join with participant cap enforcement
CREATE OR REPLACE FUNCTION public.join_video_call_guarded(p_call_id uuid, p_is_video_on boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_active int;
  v_already boolean;
  v_cap int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_call FROM public.video_calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_not_found');
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'not_call_participant';
  END IF;

  IF v_call.status = 'ended' THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_ended');
  END IF;

  v_cap := COALESCE(v_call.max_participants, 8);

  SELECT EXISTS (
    SELECT 1 FROM public.call_participants
    WHERE call_id = p_call_id AND user_id = v_user_id AND left_at IS NULL
  ) INTO v_already;

  SELECT count(*) INTO v_active
  FROM public.call_participants
  WHERE call_id = p_call_id AND left_at IS NULL;

  IF NOT v_already AND v_active >= v_cap THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_full', 'max_participants', v_cap);
  END IF;

  INSERT INTO public.call_participants (
    call_id, user_id, joined_at, left_at, is_muted, is_video_on,
    is_screen_sharing, is_hand_raised, connection_state, last_seen_at
  ) VALUES (
    p_call_id, v_user_id, now(), NULL, false, p_is_video_on,
    false, false, 'connecting', now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    joined_at = now(),
    left_at = NULL,
    is_video_on = excluded.is_video_on,
    connection_state = 'connecting',
    last_seen_at = now();

  INSERT INTO public.call_room_members (
    call_id, user_id, role, connection_state, media_state, joined_at, updated_at
  ) VALUES (
    p_call_id, v_user_id,
    CASE WHEN v_call.host_id = v_user_id THEN 'host' ELSE 'participant' END,
    'connecting',
    jsonb_build_object('is_muted', false, 'is_video_on', p_is_video_on, 'is_screen_sharing', false, 'is_hand_raised', false),
    now(), now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    connection_state = 'connecting',
    left_at = NULL,
    updated_at = now();

  RETURN jsonb_build_object(
    'joined', true,
    'is_group_call', COALESCE(v_call.is_group_call, false),
    'call_type', v_call.call_type,
    'active_participants', v_active + (CASE WHEN v_already THEN 0 ELSE 1 END)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_video_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_video_call_guarded(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_video_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_video_call_guarded(uuid, boolean) TO authenticated;