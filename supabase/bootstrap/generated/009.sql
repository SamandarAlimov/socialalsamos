-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260822183214_realtime_calls_telegram_grade.sql
-- SHA256 f0ef4cb5574e8f8ed14ac1efd7ba936087eb8b243cdfbf16b71cab30e45fb227
-- ============================================================================
BEGIN;

ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS call_mode text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

ALTER TABLE public.video_calls
  DROP CONSTRAINT IF EXISTS video_calls_call_mode_check;

ALTER TABLE public.video_calls
  ADD CONSTRAINT video_calls_call_mode_check CHECK (
    call_mode IN ('direct', 'group', 'conference', 'channel_stream')
  ) NOT VALID;

ALTER TABLE public.video_calls
  DROP CONSTRAINT IF EXISTS video_calls_call_type_check;

ALTER TABLE public.video_calls
  ADD CONSTRAINT video_calls_call_type_check CHECK (
    call_type IN ('audio', 'video', 'screen', 'stream')
  ) NOT VALID;

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS device_info jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_role_check;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_role_check CHECK (
    role IN ('host', 'speaker', 'member', 'viewer')
  ) NOT VALID;

ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_connection_state_check;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_connection_state_check CHECK (
    connection_state IN (
      'invited',
      'ringing',
      'joining',
      'connecting',
      'connected',
      'reconnecting',
      'left',
      'declined',
      'kicked',
      'closed',
      'expired'
    )
  ) NOT VALID;

ALTER TABLE public.call_room_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.call_signals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes');

CREATE INDEX IF NOT EXISTS idx_video_calls_mode_status_created
  ON public.video_calls(call_mode, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_calls_conversation_open
  ON public.video_calls(conversation_id, status, created_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_call_participants_active_call
  ON public.call_participants(call_id, left_at, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_signals_expires_at
  ON public.call_signals(expires_at);

CREATE TABLE IF NOT EXISTS public.call_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  quality text NOT NULL DEFAULT 'unknown',
  rtt_ms integer,
  jitter_ms integer,
  packets_lost integer,
  bitrate_kbps integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_quality_events_call_created
  ON public.call_quality_events(call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_quality_events_user_created
  ON public.call_quality_events(user_id, created_at DESC);

ALTER TABLE public.call_quality_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RTC quality readable by call members" ON public.call_quality_events;
CREATE POLICY "RTC quality readable by call members"
  ON public.call_quality_events
  FOR SELECT
  TO authenticated
  USING (public.can_view_call(call_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "RTC users insert own quality" ON public.call_quality_events;
CREATE POLICY "RTC users insert own quality"
  ON public.call_quality_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public._rtc_has_column(
  p_table text,
  p_column text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

CREATE OR REPLACE FUNCTION public._rtc_is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_column text;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF to_regclass('public.conversation_participants') IS NULL
     OR NOT public._rtc_has_column('conversation_participants', 'conversation_id') THEN
    RETURN false;
  END IF;

  FOREACH v_column IN ARRAY ARRAY['user_id', 'profile_id']
  LOOP
    IF public._rtc_has_column('conversation_participants', v_column) THEN
      EXECUTE format(
        'SELECT EXISTS (
           SELECT 1
           FROM public.conversation_participants
           WHERE conversation_id = $1
             AND %I = $2
         )',
        v_column
      )
      INTO v_allowed
      USING p_conversation_id, p_user_id;

      IF v_allowed THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._rtc_has_column(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rtc_is_conversation_participant(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._rtc_has_column(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._rtc_is_conversation_participant(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rtc_conversation_type(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT lower(COALESCE(c.type, 'direct'))
  INTO v_type
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  RETURN COALESCE(v_type, 'direct');
END;
$$;

REVOKE ALL ON FUNCTION public._rtc_conversation_type(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._rtc_conversation_type(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rtc_default_call_mode(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := public._rtc_conversation_type(p_conversation_id);
BEGIN
  RETURN CASE
    WHEN v_type IN ('channel', 'public_channel', 'private_channel') THEN 'channel_stream'
    WHEN v_type IN ('group', 'supergroup') THEN 'group'
    WHEN v_type IN ('conference', 'room') THEN 'conference'
    ELSE 'direct'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public._rtc_default_call_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._rtc_default_call_mode(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rtc_capacity_for_mode(p_call_mode text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_call_mode, 'direct')
    WHEN 'direct' THEN 2
    WHEN 'group' THEN 16
    WHEN 'conference' THEN 64
    WHEN 'channel_stream' THEN 200
    ELSE 8
  END;
$$;

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
  v_call_type text := COALESCE(NULLIF(lower(trim(p_call_type)), ''), 'video');
  v_call_mode text;
  v_max_participants integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'User must be logged in to create a call';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_required';
  END IF;

  IF v_call_type NOT IN ('audio', 'video', 'screen', 'stream') THEN
    RAISE EXCEPTION 'invalid_call_type'
      USING HINT = 'Call type must be audio, video, screen, or stream';
  END IF;

  IF NOT public._rtc_is_conversation_participant(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'not_conversation_participant'
      USING HINT = 'User must be a participant in the conversation';
  END IF;

  v_call_mode := public._rtc_default_call_mode(p_conversation_id);
  IF v_call_type = 'stream' THEN
    v_call_mode := 'channel_stream';
  END IF;
  v_max_participants := public._rtc_capacity_for_mode(v_call_mode);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  UPDATE public.video_calls
  SET status = 'ended',
      ended_at = COALESCE(ended_at, now()),
      last_heartbeat_at = now()
  WHERE conversation_id = p_conversation_id
    AND status IN ('waiting', 'ringing', 'calling', 'connecting', 'active')
    AND ended_at IS NULL
    AND (
      v_call_mode IN ('direct', 'group')
      OR started_at IS NULL
    );

  INSERT INTO public.video_calls (
    conversation_id,
    host_id,
    status,
    call_type,
    call_mode,
    is_group_call,
    max_participants,
    started_at,
    created_at,
    last_heartbeat_at,
    metadata
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    'ringing',
    v_call_type,
    v_call_mode,
    v_call_mode <> 'direct',
    v_max_participants,
    CASE WHEN v_call_mode = 'channel_stream' THEN now() ELSE NULL END,
    now(),
    now(),
    jsonb_build_object('created_by_rpc', true)
  )
  RETURNING id INTO v_call_id;

  INSERT INTO public.call_participants (
    call_id,
    user_id,
    joined_at,
    left_at,
    is_muted,
    is_video_on,
    is_screen_sharing,
    is_hand_raised,
    role,
    connection_state,
    last_seen_at
  )
  VALUES (
    v_call_id,
    v_user_id,
    now(),
    NULL,
    false,
    COALESCE(p_is_video_on, v_call_type <> 'audio'),
    false,
    false,
    'host',
    'joining',
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    left_at = NULL,
    is_video_on = EXCLUDED.is_video_on,
    role = 'host',
    connection_state = 'joining',
    last_seen_at = now();

  INSERT INTO public.call_room_members (
    call_id,
    user_id,
    role,
    connection_state,
    media_state,
    joined_at,
    left_at,
    updated_at
  )
  VALUES (
    v_call_id,
    v_user_id,
    'host',
    'joining',
    jsonb_build_object(
      'isMuted', false,
      'isVideoOn', COALESCE(p_is_video_on, v_call_type <> 'audio'),
      'isScreenSharing', false,
      'isHandRaised', false
    ),
    now(),
    NULL,
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    role = 'host',
    connection_state = 'joining',
    media_state = EXCLUDED.media_state,
    left_at = NULL,
    updated_at = now();

  INSERT INTO public.call_invites (
    call_id,
    inviter_id,
    invitee_id,
    conversation_id,
    call_type,
    status,
    created_at,
    updated_at
  )
  SELECT
    v_call_id,
    v_user_id,
    cp.user_id,
    p_conversation_id,
    v_call_type,
    'pending',
    now(),
    now()
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.user_id <> v_user_id
  ON CONFLICT DO NOTHING;

  RETURN v_call_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_video_call_guarded(
  p_call_id uuid,
  p_is_video_on boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_active_count integer := 0;
  v_already_joined boolean := false;
  v_cap integer := 8;
  v_role text := 'member';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_id::text, 0));

  SELECT *
  INTO v_call
  FROM public.video_calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_not_found');
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'call_access_denied';
  END IF;

  IF v_call.status IN ('ended', 'declined', 'missed', 'cancelled')
     OR v_call.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_ended');
  END IF;

  v_cap := COALESCE(NULLIF(v_call.max_participants, 0), public._rtc_capacity_for_mode(v_call.call_mode));

  SELECT EXISTS (
    SELECT 1
    FROM public.call_participants
    WHERE call_id = p_call_id
      AND user_id = v_user_id
      AND left_at IS NULL
  )
  INTO v_already_joined;

  SELECT COUNT(*)::integer
  INTO v_active_count
  FROM public.call_participants
  WHERE call_id = p_call_id
    AND left_at IS NULL;

  IF NOT v_already_joined AND v_active_count >= v_cap THEN
    RETURN jsonb_build_object(
      'joined', false,
      'reason', 'call_full',
      'active_count', v_active_count,
      'max_participants', v_cap
    );
  END IF;

  v_role := CASE
    WHEN v_call.host_id = v_user_id THEN 'host'
    WHEN v_call.call_mode = 'channel_stream' THEN 'viewer'
    ELSE 'member'
  END;

  INSERT INTO public.call_participants (
    call_id,
    user_id,
    joined_at,
    left_at,
    is_muted,
    is_video_on,
    is_screen_sharing,
    is_hand_raised,
    role,
    connection_state,
    last_seen_at
  )
  VALUES (
    p_call_id,
    v_user_id,
    now(),
    NULL,
    false,
    COALESCE(p_is_video_on, true),
    false,
    false,
    v_role,
    'joining',
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    left_at = NULL,
    is_video_on = EXCLUDED.is_video_on,
    role = EXCLUDED.role,
    connection_state = 'joining',
    last_seen_at = now();

  INSERT INTO public.call_room_members (
    call_id,
    user_id,
    role,
    connection_state,
    media_state,
    joined_at,
    left_at,
    updated_at
  )
  VALUES (
    p_call_id,
    v_user_id,
    v_role,
    'joining',
    jsonb_build_object(
      'isMuted', false,
      'isVideoOn', COALESCE(p_is_video_on, true),
      'isScreenSharing', false,
      'isHandRaised', false
    ),
    now(),
    NULL,
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    connection_state = 'joining',
    media_state = EXCLUDED.media_state,
    left_at = NULL,
    updated_at = now();

  UPDATE public.call_invites
  SET status = 'accepted',
      updated_at = now()
  WHERE call_id = p_call_id
    AND invitee_id = v_user_id
    AND status IN ('pending', 'ringing');

  UPDATE public.video_calls
  SET status = 'active',
      started_at = COALESCE(started_at, now()),
      last_heartbeat_at = now()
  WHERE id = p_call_id
    AND status IN ('waiting', 'ringing', 'calling', 'connecting');

  RETURN jsonb_build_object(
    'joined', true,
    'call_id', p_call_id,
    'role', v_role,
    'active_count', v_active_count + CASE WHEN v_already_joined THEN 0 ELSE 1 END,
    'max_participants', v_cap
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_video_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_active_count integer := 0;
  v_should_end boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_id::text, 0));

  SELECT *
  INTO v_call
  FROM public.video_calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('left', false, 'reason', 'call_not_found');
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'call_access_denied';
  END IF;

  UPDATE public.call_participants
  SET left_at = now(),
      connection_state = 'left',
      last_seen_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  UPDATE public.call_room_members
  SET left_at = now(),
      connection_state = 'left',
      updated_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  SELECT COUNT(*)::integer
  INTO v_active_count
  FROM public.call_participants
  WHERE call_id = p_call_id
    AND left_at IS NULL;

  v_should_end :=
    v_active_count = 0
    OR v_call.call_mode = 'direct'
    OR (v_call.call_mode = 'channel_stream' AND v_call.host_id = v_user_id);

  IF v_should_end THEN
    UPDATE public.video_calls
    SET status = 'ended',
        ended_at = COALESCE(ended_at, now()),
        last_heartbeat_at = now()
    WHERE id = p_call_id;

    UPDATE public.call_invites
    SET status = CASE
          WHEN status IN ('accepted') THEN status
          ELSE 'cancelled'
        END,
        updated_at = now()
    WHERE call_id = p_call_id
      AND status IN ('pending', 'ringing');

    DELETE FROM public.call_signals
    WHERE call_id = p_call_id;
  ELSE
    UPDATE public.video_calls
    SET last_heartbeat_at = now()
    WHERE id = p_call_id;
  END IF;

  RETURN jsonb_build_object(
    'left', true,
    'ended', v_should_end,
    'active_count', v_active_count
  );
END;
$$;

DROP FUNCTION IF EXISTS public.cleanup_expired_call_signals();

CREATE FUNCTION public.cleanup_expired_call_signals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.call_signals
  WHERE expires_at < now()
     OR created_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_call_quality(
  p_call_id uuid,
  p_peer_id uuid DEFAULT NULL,
  p_quality text DEFAULT 'unknown',
  p_rtt_ms integer DEFAULT NULL,
  p_jitter_ms integer DEFAULT NULL,
  p_packets_lost integer DEFAULT NULL,
  p_bitrate_kbps integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'call_access_denied';
  END IF;

  INSERT INTO public.call_quality_events (
    call_id,
    user_id,
    peer_id,
    quality,
    rtt_ms,
    jitter_ms,
    packets_lost,
    bitrate_kbps,
    metadata
  )
  VALUES (
    p_call_id,
    v_user_id,
    p_peer_id,
    COALESCE(NULLIF(p_quality, ''), 'unknown'),
    p_rtt_ms,
    p_jitter_ms,
    p_packets_lost,
    p_bitrate_kbps,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_call(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_video_call_guarded(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_video_call(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_call_signals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_call_quality(uuid, uuid, text, integer, integer, integer, integer, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_video_call(uuid, text, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_video_call_guarded(uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_video_call(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_signals()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_call_quality(uuid, uuid, text, integer, integer, integer, integer, jsonb)
  TO authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.call_quality_events
  TO authenticated, service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'video_calls',
    'call_participants',
    'call_room_members',
    'call_signals',
    'call_invites',
    'call_quality_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);

    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.video_calls.call_mode IS
  'RTC mode: direct 1:1, group calls, conference rooms, or channel livestreams.';
COMMENT ON TABLE public.call_quality_events IS
  'Best-effort WebRTC quality telemetry for call diagnostics and future adaptive routing.';
COMMENT ON FUNCTION public.create_video_call(uuid, text, boolean) IS
  'Creates Telegram-grade RTC calls for direct, group, conference, and channel stream conversations.';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260822191851_repair_realtime_calls_runtime_contract.sql
-- SHA256 fa4ede90db46f69fe7655f1f9e433e8340700f56221070eaba9905c8324e9821
-- ============================================================================
BEGIN;

-- Runtime contract repair for the Flutter WebRTC caller.
-- This migration is intentionally additive/idempotent because some Lovable
-- databases already have earlier RTC patches applied while others only have
-- the base call tables.

CREATE OR REPLACE FUNCTION public._rtc_has_column(
  p_table text,
  p_column text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

CREATE OR REPLACE FUNCTION public._rtc_is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_column text;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF to_regclass('public.conversation_participants') IS NULL
     OR NOT public._rtc_has_column('conversation_participants', 'conversation_id') THEN
    RETURN false;
  END IF;

  FOREACH v_column IN ARRAY ARRAY['user_id', 'profile_id']
  LOOP
    IF public._rtc_has_column('conversation_participants', v_column) THEN
      EXECUTE format(
        'SELECT EXISTS (
           SELECT 1
           FROM public.conversation_participants
           WHERE conversation_id = $1
             AND %I = $2
         )',
        v_column
      )
      INTO v_allowed
      USING p_conversation_id, p_user_id;

      IF v_allowed THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS call_mode text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS max_participants integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.video_calls
  DROP CONSTRAINT IF EXISTS video_calls_call_mode_check;

ALTER TABLE public.video_calls
  ADD CONSTRAINT video_calls_call_mode_check CHECK (
    call_mode IN ('direct', 'group', 'conference', 'channel_stream')
  ) NOT VALID;

ALTER TABLE public.video_calls
  DROP CONSTRAINT IF EXISTS video_calls_call_type_check;

ALTER TABLE public.video_calls
  ADD CONSTRAINT video_calls_call_type_check CHECK (
    call_type IN ('audio', 'video', 'screen', 'stream')
  ) NOT VALID;

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS device_info jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_connection_state_check;

ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_role_check;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_role_check CHECK (
    role IN ('host', 'speaker', 'member', 'viewer')
  ) NOT VALID;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_connection_state_check CHECK (
    connection_state IN (
      'invited',
      'ringing',
      'joining',
      'connecting',
      'connected',
      'reconnecting',
      'left',
      'declined',
      'kicked',
      'closed',
      'expired'
    )
  ) NOT VALID;

DO $$
BEGIN
  IF to_regclass('public.call_room_members') IS NOT NULL THEN
    ALTER TABLE public.call_room_members
      ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
      ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
      ADD COLUMN IF NOT EXISTS media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    ALTER TABLE public.call_room_members
      DROP CONSTRAINT IF EXISTS call_room_members_connection_state_check;

    ALTER TABLE public.call_room_members
      ADD CONSTRAINT call_room_members_connection_state_check CHECK (
        connection_state IN (
          'invited',
          'ringing',
          'joining',
          'connecting',
          'connected',
          'reconnecting',
          'left',
          'declined',
          'kicked',
          'closed',
          'expired'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.call_signals
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes');

ALTER TABLE public.call_signals
  DROP CONSTRAINT IF EXISTS call_signals_type_check;

ALTER TABLE public.call_signals
  ADD CONSTRAINT call_signals_type_check CHECK (
    type IN (
      'offer',
      'answer',
      'ice',
      'ice-candidate',
      'media',
      'media-state',
      'leave',
      'resync'
    )
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_call_signals_call_created
  ON public.call_signals(call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_signals_target_created
  ON public.call_signals(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_signals_expires_at
  ON public.call_signals(expires_at);

CREATE OR REPLACE FUNCTION public.can_view_call(
  p_call_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_conversation_id uuid;
BEGIN
  IF p_call_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.call_participants cp
    WHERE cp.call_id = p_call_id
      AND cp.user_id = p_user_id
  )
  INTO v_allowed;

  IF v_allowed THEN
    RETURN true;
  END IF;

  SELECT vc.conversation_id
  INTO v_conversation_id
  FROM public.video_calls vc
  WHERE vc.id = p_call_id;

  RETURN public._rtc_is_conversation_participant(v_conversation_id, p_user_id);
END;
$$;

DROP FUNCTION IF EXISTS public.cleanup_expired_call_signals();

CREATE FUNCTION public.cleanup_expired_call_signals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.call_signals
  WHERE expires_at < now()
     OR created_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RTC call signals readable by members" ON public.call_signals;
CREATE POLICY "RTC call signals readable by members"
  ON public.call_signals
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_call(call_id, (SELECT auth.uid()))
    AND (
      target_user_id IS NULL
      OR target_user_id = (SELECT auth.uid())
      OR sender_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "RTC call members can insert signals" ON public.call_signals;
CREATE POLICY "RTC call members can insert signals"
  ON public.call_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "RTC users can delete own expired signals" ON public.call_signals;
CREATE POLICY "RTC users can delete own expired signals"
  ON public.call_signals
  FOR DELETE
  TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    OR expires_at < now()
  );

GRANT EXECUTE ON FUNCTION public._rtc_has_column(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._rtc_is_conversation_participant(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_signals()
  TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.call_signals
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.call_participants
  TO authenticated, service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'video_calls',
    'call_participants',
    'call_signals',
    'call_invites'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);

      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
         AND NOT EXISTS (
           SELECT 1
           FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = v_table
         ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260822192154_ee5b7328-dcf4-4aa0-b6b4-a17462217269.sql
-- SHA256 4c167eef8d818d1e3c4c6b5405f6e59b0c9682bc6c61c3fe386dc7597c857f38
-- ============================================================================
GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;

ALTER TABLE public.call_signals REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS call_signals_call_created_idx
  ON public.call_signals (call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS call_signals_target_idx
  ON public.call_signals (target_user_id, created_at DESC);

DROP FUNCTION IF EXISTS public.cleanup_expired_call_signals();

CREATE FUNCTION public.cleanup_expired_call_signals()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.call_signals WHERE expires_at < now();
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_call_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_signals() TO service_role;

-- ============================================================================
-- SOURCE B-web: 20260823005340_242c2a2d-0a1f-49b1-b8fe-f995ab1f7b78.sql
-- SHA256 113d86a971d36ab4b609d9b783b8e50b0e43cb9f2dfd83a1cda4bcf1a6dc12f4
-- ============================================================================
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

-- ============================================================================
-- SOURCE B-web: 20260823005437_f76afbdd-8e08-4d64-be42-64553641d200.sql
-- SHA256 ffa0883015cf7d51079a9102e0fb738db939f45e097b513cfb44ca8b3d22f897
-- ============================================================================
-- Mesh (P2P) topology has no SFU/media server: each publisher uploads one
-- stream per viewer. These caps reflect what a browser can actually sustain.
CREATE OR REPLACE FUNCTION public._rtc_capacity_for_mode(p_call_mode text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_call_mode, 'direct')
    WHEN 'direct' THEN 2
    WHEN 'group' THEN 8
    WHEN 'conference' THEN 12
    WHEN 'channel_stream' THEN 30
    ELSE 8
  END;
$$;

-- ============================================================================
-- SOURCE B-web: 20260824050454_a4577232-12eb-4e37-b789-b0c6f5ebdc45.sql
-- SHA256 33b12c23a1bc99bf8efc6cbec0a43f564be0468e28cb8ed0bcdbd12e463d79d7
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260824061802_harden_realtime_calls_professional_runtime.sql
-- SHA256 1a0cd1ed400dcd11812ab4748d21ef5dbe6fb89b2dfa3397c33ce817705247ed
-- ============================================================================
BEGIN;

-- Professional RTC runtime hardening.
-- Additive/idempotent: this migration strengthens the already-created call
-- schema without renaming existing tables or invalidating older clients.

ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS device_info jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.call_participants
  DROP CONSTRAINT IF EXISTS call_participants_connection_state_check;

ALTER TABLE public.call_participants
  ADD CONSTRAINT call_participants_connection_state_check CHECK (
    connection_state IN (
      'invited',
      'ringing',
      'joining',
      'connecting',
      'connected',
      'reconnecting',
      'left',
      'declined',
      'kicked',
      'closed',
      'expired'
    )
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_video_calls_runtime_active
  ON public.video_calls(status, last_heartbeat_at DESC, created_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_call_participants_runtime_seen
  ON public.call_participants(call_id, left_at, last_seen_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'call_participants_call_user_unique'
      AND conrelid = 'public.call_participants'::regclass
  ) THEN
    ALTER TABLE public.call_participants
      ADD CONSTRAINT call_participants_call_user_unique
      UNIQUE (call_id, user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.heartbeat_video_call(
  p_call_id uuid,
  p_is_muted boolean DEFAULT false,
  p_is_video_on boolean DEFAULT true,
  p_is_screen_sharing boolean DEFAULT false,
  p_is_hand_raised boolean DEFAULT false,
  p_device_info jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'Not authorized to heartbeat this call';
  END IF;

  INSERT INTO public.call_participants (
    call_id,
    user_id,
    joined_at,
    left_at,
    is_muted,
    is_video_on,
    is_screen_sharing,
    is_hand_raised,
    connection_state,
    last_seen_at,
    device_info
  )
  VALUES (
    p_call_id,
    v_user_id,
    now(),
    NULL,
    COALESCE(p_is_muted, false),
    COALESCE(p_is_video_on, true),
    COALESCE(p_is_screen_sharing, false),
    COALESCE(p_is_hand_raised, false),
    'connected',
    now(),
    COALESCE(p_device_info, '{}'::jsonb)
  )
  ON CONFLICT (call_id, user_id) DO UPDATE
  SET left_at = NULL,
      is_muted = EXCLUDED.is_muted,
      is_video_on = EXCLUDED.is_video_on,
      is_screen_sharing = EXCLUDED.is_screen_sharing,
      is_hand_raised = EXCLUDED.is_hand_raised,
      connection_state = 'connected',
      last_seen_at = now(),
      device_info = COALESCE(EXCLUDED.device_info, public.call_participants.device_info);

  UPDATE public.video_calls
  SET last_heartbeat_at = now(),
      status = CASE
        WHEN status IN ('waiting', 'ringing', 'calling', 'connecting') THEN 'active'
        ELSE status
      END,
      started_at = COALESCE(started_at, now())
  WHERE id = p_call_id
    AND ended_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_video_call(uuid, boolean, boolean, boolean, boolean, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_video_call(uuid, boolean, boolean, boolean, boolean, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_video_calls(
  p_stale_after interval DEFAULT interval '90 seconds'
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE public.call_participants cp
  SET left_at = COALESCE(cp.left_at, now()),
      connection_state = 'expired',
      last_seen_at = COALESCE(cp.last_seen_at, now())
  FROM public.video_calls vc
  WHERE cp.call_id = vc.id
    AND cp.left_at IS NULL
    AND COALESCE(cp.last_seen_at, vc.last_heartbeat_at, vc.created_at)
      < now() - COALESCE(p_stale_after, interval '90 seconds')
    AND vc.ended_at IS NULL;

  UPDATE public.video_calls vc
  SET status = 'ended',
      ended_at = COALESCE(vc.ended_at, now()),
      last_heartbeat_at = COALESCE(vc.last_heartbeat_at, now())
  WHERE vc.ended_at IS NULL
    AND vc.status IN ('waiting', 'ringing', 'calling', 'connecting', 'active')
    AND NOT EXISTS (
      SELECT 1
      FROM public.call_participants cp
      WHERE cp.call_id = vc.id
        AND cp.left_at IS NULL
        AND COALESCE(cp.last_seen_at, vc.last_heartbeat_at, vc.created_at)
          >= now() - COALESCE(p_stale_after, interval '90 seconds')
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_video_calls(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_video_calls(interval)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.cleanup_expired_call_signals();

CREATE FUNCTION public.cleanup_expired_call_signals()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.call_signals
  WHERE expires_at < now()
     OR created_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_call_signals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_signals()
  TO service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'video_calls',
    'call_participants',
    'call_room_members',
    'call_signals',
    'call_invites'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);

      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
         AND NOT EXISTS (
           SELECT 1
           FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = v_table
         ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260824093749_repair_video_calls_status_contract.sql
-- SHA256 16cfe524766f4b15c27d0e63f758d41ed9209e9d4b99da5fa2bd9089696d12ab
-- ============================================================================
BEGIN;

-- Repair the runtime contract used by create_video_call().
-- Some production databases still have the original narrow check:
-- CHECK (status IN ('waiting', 'active', 'ended')).
-- The Flutter/Web call flow needs transitional statuses such as ringing and
-- connecting before a peer accepts and real RTC media connects.

ALTER TABLE public.video_calls
  DROP CONSTRAINT IF EXISTS video_calls_status_check;

ALTER TABLE public.video_calls
  ADD CONSTRAINT video_calls_status_check CHECK (
    status IN (
      'waiting',
      'pending',
      'ringing',
      'calling',
      'connecting',
      'active',
      'reconnecting',
      'ended',
      'declined',
      'missed',
      'cancelled',
      'failed',
      'expired'
    )
  ) NOT VALID;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260824102459_repair_call_runtime_contract_gaps.sql
-- SHA256 b2fd39a9889c3f1a2d0f16062c4d27d504b5ed9c4a2f1a9f5f744762f52f7651
-- ============================================================================
BEGIN;

-- Close the remaining production contract gaps found during call runtime audit.
-- This migration is additive/idempotent and safe to run after the earlier RTC
-- repair migrations.

CREATE OR REPLACE FUNCTION public._rtc_has_column(
  p_table text,
  p_column text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.call_invites') IS NOT NULL THEN
    IF public._rtc_has_column('call_invites', 'call_id')
       AND public._rtc_has_column('call_invites', 'invitee_id') THEN
      -- Older databases may already have duplicate fallback-created invite rows.
      -- Keep the newest row per call/invitee so PostgREST upsert can use the
      -- unique contract reliably.
      IF public._rtc_has_column('call_invites', 'created_at') THEN
        DELETE FROM public.call_invites old_invite
        USING public.call_invites keep_invite
        WHERE old_invite.call_id = keep_invite.call_id
          AND old_invite.invitee_id = keep_invite.invitee_id
          AND old_invite.id <> keep_invite.id
          AND (
            old_invite.created_at < keep_invite.created_at
            OR (
              old_invite.created_at = keep_invite.created_at
              AND old_invite.id::text < keep_invite.id::text
            )
          );
      ELSE
        DELETE FROM public.call_invites old_invite
        USING public.call_invites keep_invite
        WHERE old_invite.call_id = keep_invite.call_id
          AND old_invite.invitee_id = keep_invite.invitee_id
          AND old_invite.id::text < keep_invite.id::text;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.call_invites'::regclass
          AND conname = 'call_invites_call_invitee_unique'
      ) THEN
        ALTER TABLE public.call_invites
          ADD CONSTRAINT call_invites_call_invitee_unique
          UNIQUE (call_id, invitee_id);
      END IF;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.call_webrtc_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.call_webrtc_config ENABLE ROW LEVEL SECURITY';

    EXECUTE
      'DROP POLICY IF EXISTS "Authenticated users read call config" ON public.call_webrtc_config';
    EXECUTE
      'DROP POLICY IF EXISTS "RTC config readable by authenticated users" ON public.call_webrtc_config';
    EXECUTE
      'CREATE POLICY "RTC config readable by authenticated users"
         ON public.call_webrtc_config
         FOR SELECT
         TO authenticated
         USING (true)';

    EXECUTE 'GRANT SELECT ON TABLE public.call_webrtc_config TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.call_participants') IS NOT NULL THEN
    IF public._rtc_has_column('call_participants', 'call_id')
       AND public._rtc_has_column('call_participants', 'user_id')
       AND public._rtc_has_column('call_participants', 'id') THEN
      DELETE FROM public.call_participants old_participant
      USING public.call_participants keep_participant
      WHERE old_participant.call_id = keep_participant.call_id
        AND old_participant.user_id = keep_participant.user_id
        AND old_participant.id::text < keep_participant.id::text;
    END IF;

    IF public._rtc_has_column('call_participants', 'call_id')
       AND public._rtc_has_column('call_participants', 'user_id')
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = 'public.call_participants'::regclass
           AND conname = 'call_participants_call_user_unique'
       ) THEN
      ALTER TABLE public.call_participants
        ADD CONSTRAINT call_participants_call_user_unique
        UNIQUE (call_id, user_id);
    END IF;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260824165000_speed_up_messages_initial_load.sql
-- SHA256 2a6f48fbe00aa8f9f358fa2a676e4a39e9e3237644767cf90f369e92022ecab9
-- ============================================================================
BEGIN;

-- The Flutter chat opens the newest messages in a conversation:
--   WHERE conversation_id = ?
--   ORDER BY created_at DESC
--   LIMIT 50/100
-- Without this exact index, large conversations can timeout before the UI gets
-- even a small initial page.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc
  ON public.messages(conversation_id, created_at DESC);

-- Keeps the common non-deleted/latest-message path fast as conversations grow.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_visible_created_desc
  ON public.messages(conversation_id, created_at DESC)
  WHERE is_deleted = false OR is_deleted IS NULL;

-- Helps participant lookups used by chat list queries and RLS predicates on
-- databases that do not already have the original UNIQUE(conversation_id,user_id)
-- index in place.
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_user
  ON public.conversation_participants(conversation_id, user_id);

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260824182232_repair_heartbeat_video_call_rpc_signature.sql
-- SHA256 3e55abb6e29e974cd603b3868694c233b7c804b7d33c104dd4e2efcd7c9487d6
-- ============================================================================
-- Repair PostgREST RPC lookup for the WebRTC heartbeat call used by Flutter.
-- Some deployed databases still miss the latest heartbeat_video_call signature,
-- and the client sends named params in the order logged by PostgREST as:
-- p_call_id, p_device_info, p_is_hand_raised, p_is_muted,
-- p_is_screen_sharing, p_is_video_on.

CREATE OR REPLACE FUNCTION public.heartbeat_video_call(
  p_call_id uuid,
  p_device_info jsonb DEFAULT '{}'::jsonb,
  p_is_hand_raised boolean DEFAULT false,
  p_is_muted boolean DEFAULT false,
  p_is_screen_sharing boolean DEFAULT false,
  p_is_video_on boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'Not authorized to heartbeat this call';
  END IF;

  INSERT INTO public.call_participants (
    call_id,
    user_id,
    joined_at,
    left_at,
    is_muted,
    is_video_on,
    is_screen_sharing,
    is_hand_raised,
    connection_state,
    last_seen_at,
    device_info
  )
  VALUES (
    p_call_id,
    v_user_id,
    now(),
    NULL,
    COALESCE(p_is_muted, false),
    COALESCE(p_is_video_on, true),
    COALESCE(p_is_screen_sharing, false),
    COALESCE(p_is_hand_raised, false),
    'connected',
    now(),
    COALESCE(p_device_info, '{}'::jsonb)
  )
  ON CONFLICT (call_id, user_id) DO UPDATE
  SET left_at = NULL,
      is_muted = EXCLUDED.is_muted,
      is_video_on = EXCLUDED.is_video_on,
      is_screen_sharing = EXCLUDED.is_screen_sharing,
      is_hand_raised = EXCLUDED.is_hand_raised,
      connection_state = 'connected',
      last_seen_at = now(),
      device_info = COALESCE(EXCLUDED.device_info, public.call_participants.device_info);

  UPDATE public.video_calls
  SET last_heartbeat_at = now(),
      status = CASE
        WHEN status IN ('waiting', 'ringing', 'calling', 'connecting') THEN 'active'
        ELSE status
      END,
      started_at = COALESCE(started_at, now())
  WHERE id = p_call_id
    AND ended_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_video_call(
  uuid,
  jsonb,
  boolean,
  boolean,
  boolean,
  boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.heartbeat_video_call(
  uuid,
  jsonb,
  boolean,
  boolean,
  boolean,
  boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260827180000_group_channel_premium.sql
-- SHA256 910894d180b72f197e49283b01d690dbb204897a59820fdf08e01fa2fdc3b7b8
-- ============================================================================
-- =============================================================
-- Guruh va kanallar uchun Telegram (Premium) darajasidagi imkoniyatlar
-- =============================================================

-- 1) conversations jadvaliga qo'shimcha sozlamalar
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_delete_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sign_messages BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hide_members BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS join_by_request BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_forum BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anti_spam BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aggressive_anti_spam BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restrict_saving_content BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linked_chat_id UUID,
  ADD COLUMN IF NOT EXISTS reactions_mode TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS allowed_reactions TEXT[],
  ADD COLUMN IF NOT EXISTS boost_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boosts_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS wallpaper_url TEXT,
  ADD COLUMN IF NOT EXISTS emoji_status TEXT,
  ADD COLUMN IF NOT EXISTS custom_emoji_pack TEXT,
  ADD COLUMN IF NOT EXISTS profile_color TEXT,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{
    "send_messages": true,
    "send_media": true,
    "send_stickers": true,
    "send_polls": true,
    "send_voice": true,
    "send_video_messages": true,
    "embed_links": true,
    "add_members": true,
    "pin_messages": false,
    "change_info": false,
    "manage_topics": false
  }'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_username_key
  ON public.conversations (lower(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_linked_chat_idx
  ON public.conversations (linked_chat_id);

-- 2) Taklif havolalari (invite links)
CREATE TABLE IF NOT EXISTS public.conversation_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  member_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_links_conversation_idx
  ON public.conversation_invite_links (conversation_id, is_revoked);

-- 3) Qo'shilish so'rovlari (join requests)
CREATE TABLE IF NOT EXISTS public.conversation_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_link_id UUID REFERENCES public.conversation_invite_links(id) ON DELETE SET NULL,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS join_requests_pending_idx
  ON public.conversation_join_requests (conversation_id, status);

-- 4) Admin huquqlari (granular)
CREATE TABLE IF NOT EXISTS public.conversation_admin_rights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_title TEXT,
  can_change_info BOOLEAN NOT NULL DEFAULT FALSE,
  can_post_messages BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_messages BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_messages BOOLEAN NOT NULL DEFAULT FALSE,
  can_restrict_members BOOLEAN NOT NULL DEFAULT FALSE,
  can_invite_users BOOLEAN NOT NULL DEFAULT TRUE,
  can_pin_messages BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_video_chats BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_topics BOOLEAN NOT NULL DEFAULT FALSE,
  can_promote_members BOOLEAN NOT NULL DEFAULT FALSE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- 5) Cheklovlar va banlar
CREATE TABLE IF NOT EXISTS public.conversation_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  is_banned BOOLEAN NOT NULL DEFAULT TRUE,
  restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  until_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- 6) Boostlar (Telegram Premium boost tizimi)
CREATE TABLE IF NOT EXISTS public.conversation_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slots INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- 7) Forum topiklari
CREATE TABLE IF NOT EXISTS public.conversation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  icon_emoji TEXT,
  color TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_general BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topics_conversation_idx
  ON public.conversation_topics (conversation_id, is_pinned DESC, last_message_at DESC);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.conversation_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forwards_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS author_signature TEXT,
  ADD COLUMN IF NOT EXISTS auto_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_silent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS effect_id TEXT;

CREATE INDEX IF NOT EXISTS messages_topic_idx ON public.messages (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_auto_delete_idx ON public.messages (auto_delete_at)
  WHERE auto_delete_at IS NOT NULL;

-- 8) Kanal postlari ko'rishlari
CREATE TABLE IF NOT EXISTS public.channel_post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- Ko'rishlar sonini avtomatik oshirish
CREATE OR REPLACE FUNCTION public.increment_post_views()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channel_post_views_increment ON public.channel_post_views;
CREATE TRIGGER channel_post_views_increment
  AFTER INSERT ON public.channel_post_views
  FOR EACH ROW EXECUTE FUNCTION public.increment_post_views();

-- Boost sonini yangilash
CREATE OR REPLACE FUNCTION public.refresh_boost_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target UUID;
  total INTEGER;
BEGIN
  target := COALESCE(NEW.conversation_id, OLD.conversation_id);
  SELECT COALESCE(SUM(slots), 0) INTO total
    FROM public.conversation_boosts
   WHERE conversation_id = target
     AND (expires_at IS NULL OR expires_at > now());

  UPDATE public.conversations
     SET boosts_count = total,
         boost_level = CASE
           WHEN total >= 100 THEN 5
           WHEN total >= 50 THEN 4
           WHEN total >= 25 THEN 3
           WHEN total >= 10 THEN 2
           WHEN total >= 1 THEN 1
           ELSE 0
         END
   WHERE id = target;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS conversation_boosts_stats ON public.conversation_boosts;
CREATE TRIGGER conversation_boosts_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.conversation_boosts
  FOR EACH ROW EXECUTE FUNCTION public.refresh_boost_stats();

-- 9) RLS
ALTER TABLE public.conversation_invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_admin_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_post_views ENABLE ROW LEVEL SECURITY;

-- Yordamchi funksiyalar
CREATE OR REPLACE FUNCTION public.is_conversation_member(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = target
       AND cp.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = target AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = target
       AND cp.user_id = auth.uid()
       AND cp.role IN ('admin', 'owner')
  );
$$;

-- Invite links
DROP POLICY IF EXISTS invite_links_select ON public.conversation_invite_links;
CREATE POLICY invite_links_select ON public.conversation_invite_links
  FOR SELECT USING (public.is_conversation_member(conversation_id) OR NOT is_revoked);

DROP POLICY IF EXISTS invite_links_manage ON public.conversation_invite_links;
CREATE POLICY invite_links_manage ON public.conversation_invite_links
  FOR ALL USING (public.is_conversation_admin(conversation_id))
  WITH CHECK (public.is_conversation_admin(conversation_id));

-- Join requests
DROP POLICY IF EXISTS join_requests_select ON public.conversation_join_requests;
CREATE POLICY join_requests_select ON public.conversation_join_requests
  FOR SELECT USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id));

DROP POLICY IF EXISTS join_requests_insert ON public.conversation_join_requests;
CREATE POLICY join_requests_insert ON public.conversation_join_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS join_requests_update ON public.conversation_join_requests;
CREATE POLICY join_requests_update ON public.conversation_join_requests
  FOR UPDATE USING (public.is_conversation_admin(conversation_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS join_requests_delete ON public.conversation_join_requests;
CREATE POLICY join_requests_delete ON public.conversation_join_requests
  FOR DELETE USING (public.is_conversation_admin(conversation_id) OR user_id = auth.uid());

-- Admin rights
DROP POLICY IF EXISTS admin_rights_select ON public.conversation_admin_rights;
CREATE POLICY admin_rights_select ON public.conversation_admin_rights
  FOR SELECT USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS admin_rights_manage ON public.conversation_admin_rights;
CREATE POLICY admin_rights_manage ON public.conversation_admin_rights
  FOR ALL USING (public.is_conversation_admin(conversation_id))
  WITH CHECK (public.is_conversation_admin(conversation_id));

-- Bans
DROP POLICY IF EXISTS bans_select ON public.conversation_bans;
CREATE POLICY bans_select ON public.conversation_bans
  FOR SELECT USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id));

DROP POLICY IF EXISTS bans_manage ON public.conversation_bans;
CREATE POLICY bans_manage ON public.conversation_bans
  FOR ALL USING (public.is_conversation_admin(conversation_id))
  WITH CHECK (public.is_conversation_admin(conversation_id));

-- Boosts
DROP POLICY IF EXISTS boosts_select ON public.conversation_boosts;
CREATE POLICY boosts_select ON public.conversation_boosts
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS boosts_manage_own ON public.conversation_boosts;
CREATE POLICY boosts_manage_own ON public.conversation_boosts
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Topics
DROP POLICY IF EXISTS topics_select ON public.conversation_topics;
CREATE POLICY topics_select ON public.conversation_topics
  FOR SELECT USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS topics_manage ON public.conversation_topics;
CREATE POLICY topics_manage ON public.conversation_topics
  FOR ALL USING (public.is_conversation_admin(conversation_id))
  WITH CHECK (public.is_conversation_admin(conversation_id));

-- Post views
DROP POLICY IF EXISTS post_views_select ON public.channel_post_views;
CREATE POLICY post_views_select ON public.channel_post_views
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS post_views_insert ON public.channel_post_views;
CREATE POLICY post_views_insert ON public.channel_post_views
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 10) Avtomatik o'chadigan xabarlarni tozalash
CREATE OR REPLACE FUNCTION public.cleanup_auto_delete_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.messages
     SET is_deleted = TRUE
   WHERE auto_delete_at IS NOT NULL
     AND auto_delete_at <= now()
     AND is_deleted = FALSE;
$$;

