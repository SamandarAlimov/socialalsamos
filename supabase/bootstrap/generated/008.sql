-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260820092841_c1349c57-5569-4ac9-b079-fe0580bb357c.sql
-- SHA256 b947fc3a70a24744bddb2ed979f9c2b25b784407de7f8bacdcdc338a016503b4
-- ============================================================================
-- 1. Fix broken conversations SELECT policy (self-referencing join)
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_participant(id, auth.uid()));

-- 2. Restore EXECUTE for functions required by RLS policies and app RPCs
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_message_to_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_video_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_live_stream(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_post_poll_expired(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_presence(uuid) TO authenticated;

-- App-invoked RPCs
GRANT EXECUTE ON FUNCTION public.block_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_video_call_guarded(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_video_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_identifier(text) TO anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260820192410_32ee5ca6-f9e3-4e96-b671-554d6042742f.sql
-- SHA256 33d6c46a1cd05d7cddc5ddc3e99a0a5bbd9072b0ba5b20ab4293eb000826abeb
-- ============================================================================
-- 1. call_webrtc_config: server-side only
DROP POLICY IF EXISTS "Authenticated users read call config" ON public.call_webrtc_config;
REVOKE ALL ON public.call_webrtc_config FROM anon, authenticated;
GRANT ALL ON public.call_webrtc_config TO service_role;

-- 2. live_stream_viewers: owner or self
DROP POLICY IF EXISTS "Viewers are viewable by stream owner" ON public.live_stream_viewers;
CREATE POLICY "Stream owner or self can view viewers"
ON public.live_stream_viewers FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.live_streams s WHERE s.id = live_stream_viewers.stream_id AND s.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_live_stream_viewer_count(p_stream_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.live_stream_viewers
  WHERE stream_id = p_stream_id AND left_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_live_stream_viewer_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_stream_viewer_count(uuid) TO anon, authenticated, service_role;

-- 3. message_reads: conversation participants only
DROP POLICY IF EXISTS "Users can view read receipts" ON public.message_reads;
CREATE POLICY "Participants can view read receipts"
ON public.message_reads FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reads.message_id
      AND public.is_conversation_participant(m.conversation_id, auth.uid())
  )
);

-- 4. video_calls / call_participants: involved users only
DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;
CREATE POLICY "Calls viewable by involved users"
ON public.video_calls FOR SELECT TO authenticated
USING (
  host_id = auth.uid()
  OR public.is_call_participant(id, auth.uid())
  OR (conversation_id IS NOT NULL AND public.is_conversation_participant(conversation_id, auth.uid()))
);

DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;
CREATE POLICY "Call participants viewable by involved users"
ON public.call_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_call_participant(call_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.video_calls vc
    WHERE vc.id = call_participants.call_id
      AND (vc.host_id = auth.uid()
        OR (vc.conversation_id IS NOT NULL AND public.is_conversation_participant(vc.conversation_id, auth.uid())))
  )
);

-- 5. wallets: balance immutable from client updates
DROP POLICY IF EXISTS "Users can update wallet metadata" ON public.wallets;
CREATE POLICY "Users can update own wallet metadata"
ON public.wallets FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prevent_wallet_balance_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Wallet balance can only be changed by secure server functions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_wallet_balance_tampering ON public.wallets;
CREATE TRIGGER trg_prevent_wallet_balance_tampering
BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.prevent_wallet_balance_tampering();

-- 6. profiles: hide sensitive columns from public reads
REVOKE SELECT (birth_date, country, preferences, signatures, email_filters, notification_preferences, is_admin, role)
  ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_private(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  birth_date date,
  country text,
  preferences jsonb,
  signatures jsonb,
  email_filters jsonb,
  notification_preferences jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.birth_date, p.country, p.preferences::jsonb, p.signatures::jsonb,
         p.email_filters::jsonb, p.notification_preferences::jsonb
  FROM public.profiles p
  WHERE p.id = p_profile_id
    AND (auth.uid() = p.id OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE ALL ON FUNCTION public.get_profile_private(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_private(uuid) TO authenticated, service_role;

-- 7. conversation_stats: members / admins only
CREATE OR REPLACE FUNCTION public.conversation_stats(p_conversation_id uuid)
RETURNS TABLE(members integer, messages integer, views integer, reports integer, growth_7d integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::integer FROM public.conversation_participants WHERE conversation_id = p_conversation_id),
    (SELECT count(*)::integer FROM public.messages WHERE conversation_id = p_conversation_id),
    0, 0,
    (SELECT count(*)::integer FROM public.conversation_participants
      WHERE conversation_id = p_conversation_id AND joined_at > now() - interval '7 days')
  WHERE public.is_conversation_participant(p_conversation_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin');
$$;

-- 8. drop client access to superseded RPC
REVOKE ALL ON FUNCTION public.join_video_call(uuid, boolean) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260820201610_2facd623-7176-4d61-afed-7ababd0d2106.sql
-- SHA256 0f0e87eeb22ff97f11b9caca34d6b61eb11df02dfb6cc4e0931073dbc20d2140
-- ============================================================================
-- Close abandoned open calls before enforcing one open call per conversation.
UPDATE public.video_calls vc
SET status = 'ended',
    ended_at = COALESCE(vc.ended_at, now())
WHERE vc.status IN ('waiting', 'active')
  AND vc.ended_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.call_participants cp
    WHERE cp.call_id = vc.id
      AND cp.left_at IS NULL
  );

-- If historical retries produced multiple open calls, retain the newest valid one.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY conversation_id
           ORDER BY created_at DESC, id DESC
         ) AS position
  FROM public.video_calls
  WHERE conversation_id IS NOT NULL
    AND status IN ('waiting', 'active')
    AND ended_at IS NULL
)
UPDATE public.video_calls vc
SET status = 'ended',
    ended_at = COALESCE(vc.ended_at, now())
FROM ranked r
WHERE vc.id = r.id
  AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS video_calls_one_open_per_conversation_idx
ON public.video_calls (conversation_id)
WHERE conversation_id IS NOT NULL
  AND status IN ('waiting', 'active')
  AND ended_at IS NULL;

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

  -- Serialize starts per conversation, including near-simultaneous starts from different users.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

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
      conversation_id,
      host_id,
      call_type,
      status,
      started_at,
      ended_at,
      is_group_call,
      max_participants
    ) VALUES (
      p_conversation_id,
      v_user_id,
      p_call_type,
      'active',
      NULL,
      NULL,
      v_is_group,
      v_max_participants
    )
    RETURNING id INTO v_call_id;
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
    last_seen_at
  ) VALUES (
    v_call_id,
    v_user_id,
    now(),
    NULL,
    false,
    p_is_video_on,
    false,
    false,
    'connecting',
    now()
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
    call_id,
    user_id,
    role,
    connection_state,
    media_state,
    joined_at,
    left_at,
    updated_at
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

CREATE OR REPLACE FUNCTION public.decline_video_call(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_call
  FROM public.video_calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'not_call_participant';
  END IF;

  INSERT INTO public.call_participants (
    call_id, user_id, joined_at, left_at, is_muted, is_video_on,
    is_screen_sharing, is_hand_raised, connection_state, last_seen_at
  ) VALUES (
    p_call_id, v_user_id, NULL, now(), false, false,
    false, false, 'declined', now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    left_at = now(),
    connection_state = 'declined',
    last_seen_at = now();

  UPDATE public.call_room_members
  SET connection_state = 'declined',
      left_at = now(),
      updated_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  IF NOT COALESCE(v_call.is_group_call, false) THEN
    UPDATE public.video_calls
    SET status = 'ended',
        ended_at = COALESCE(ended_at, now())
    WHERE id = p_call_id
      AND status <> 'ended';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_call(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_video_call(uuid, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decline_video_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_video_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_call_participant(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- SOURCE B-web: 20260820201755_76d7c037-f4fe-428b-9b6d-18b212be49f1.sql
-- SHA256 0b590ac53da2bee0c4a0c68685802cb105d383698f7aacef5e9f1e0cebb97c7d
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260820202427_lovable_rtc_realtime_repair.sql
-- SHA256 36cb729fa064fb6194a6a3c51c7aa7dbdeaf6e055af02417d0a6a7154532a36c
-- ============================================================================
BEGIN;

-- Lovable RTC realtime repair.
-- This migration is intentionally additive/idempotent. It repairs the shared
-- WebRTC signaling contract used by the Lovable web app and the Flutter app:
--   - realtime broadcast/presence topic: webrtc:<call_id>
--   - durable fallback table: public.call_signals
--   - call ledger tables: public.video_calls, public.call_participants

CREATE TABLE IF NOT EXISTS public.video_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting',
  call_type text NOT NULL DEFAULT 'video',
  max_participants integer NOT NULL DEFAULT 8,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_group_call boolean NOT NULL DEFAULT false
);

ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS call_type text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS max_participants integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_group_call boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.video_calls'::regclass
      AND conname = 'video_calls_status_check'
  ) THEN
    ALTER TABLE public.video_calls DROP CONSTRAINT video_calls_status_check;
  END IF;

  ALTER TABLE public.video_calls
    ADD CONSTRAINT video_calls_status_check
    CHECK (
      status IN (
        'waiting',
        'ringing',
        'calling',
        'connecting',
        'active',
        'ended',
        'declined',
        'missed',
        'cancelled'
      )
    ) NOT VALID;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.video_calls'::regclass
      AND conname = 'video_calls_call_type_check'
  ) THEN
    ALTER TABLE public.video_calls DROP CONSTRAINT video_calls_call_type_check;
  END IF;

  ALTER TABLE public.video_calls
    ADD CONSTRAINT video_calls_call_type_check
    CHECK (call_type IN ('audio', 'video', 'screen')) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_calls_conversation_created
  ON public.video_calls(conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_calls_host_created
  ON public.video_calls(host_id, created_at DESC)
  WHERE host_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_calls_status_created
  ON public.video_calls(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_muted boolean NOT NULL DEFAULT false,
  is_video_on boolean NOT NULL DEFAULT true,
  is_screen_sharing boolean NOT NULL DEFAULT false,
  is_hand_raised boolean NOT NULL DEFAULT false,
  connection_state text NOT NULL DEFAULT 'joining',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.video_calls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_video_on boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_screen_sharing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hand_raised boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.call_participants'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(call_id, user_id)%'
  ) THEN
    ALTER TABLE public.call_participants
      ADD CONSTRAINT call_participants_call_user_unique
      UNIQUE (call_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_participants_call
  ON public.call_participants(call_id);

CREATE INDEX IF NOT EXISTS idx_call_participants_user
  ON public.call_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_call_participants_active
  ON public.call_participants(call_id, left_at)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS public.call_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  connection_state text NOT NULL DEFAULT 'joining',
  media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_room_members
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.video_calls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'joining',
  ADD COLUMN IF NOT EXISTS media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS left_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.call_room_members'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(call_id, user_id)%'
  ) THEN
    ALTER TABLE public.call_room_members
      ADD CONSTRAINT call_room_members_call_user_unique
      UNIQUE (call_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_room_members_call
  ON public.call_room_members(call_id);

CREATE INDEX IF NOT EXISTS idx_call_room_members_user
  ON public.call_room_members(user_id);

UPDATE public.video_calls vc
SET status = 'ended',
    ended_at = COALESCE(vc.ended_at, now())
WHERE vc.status IN ('waiting', 'active')
  AND vc.ended_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.call_participants cp
    WHERE cp.call_id = vc.id
      AND cp.left_at IS NULL
  );

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY conversation_id
           ORDER BY created_at DESC, id DESC
         ) AS position
  FROM public.video_calls
  WHERE conversation_id IS NOT NULL
    AND status IN ('waiting', 'active')
    AND ended_at IS NULL
)
UPDATE public.video_calls vc
SET status = 'ended',
    ended_at = COALESCE(vc.ended_at, now())
FROM ranked r
WHERE vc.id = r.id
  AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS video_calls_one_open_per_conversation_idx
  ON public.video_calls(conversation_id)
  WHERE conversation_id IS NOT NULL
    AND status IN ('waiting', 'active')
    AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_signals
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.video_calls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.call_signals'::regclass
      AND conname = 'call_signals_type_check'
  ) THEN
    ALTER TABLE public.call_signals DROP CONSTRAINT call_signals_type_check;
  END IF;

  ALTER TABLE public.call_signals
    ADD CONSTRAINT call_signals_type_check
    CHECK (
      type IN (
        'offer',
        'answer',
        'ice',
        'ice-candidate',
        'candidate',
        'media',
        'media-state',
        'mute',
        'unmute',
        'video-on',
        'video-off',
        'screen-on',
        'screen-off',
        'leave',
        'resync',
        'reconnect',
        'ring',
        'accept',
        'accepted',
        'reject',
        'decline',
        'hangup',
        'bye'
      )
    ) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_signals_call_created
  ON public.call_signals(call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_signals_target_created
  ON public.call_signals(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.call_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  inviter_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  call_type text NOT NULL DEFAULT 'video',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_invites
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.video_calls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS inviter_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS invitee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS call_type text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.call_invites'::regclass
      AND conname = 'call_invites_status_check'
  ) THEN
    ALTER TABLE public.call_invites DROP CONSTRAINT call_invites_status_check;
  END IF;

  ALTER TABLE public.call_invites
    ADD CONSTRAINT call_invites_status_check
    CHECK (
      status IN (
        'pending',
        'ringing',
        'accepted',
        'declined',
        'missed',
        'cancelled',
        'ended',
        'calling',
        'connecting',
        'active'
      )
    ) NOT VALID;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_invites_call_created
  ON public.call_invites(call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_invites_invitee_status
  ON public.call_invites(invitee_id, status, created_at DESC)
  WHERE invitee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._rtc_has_column(
  p_table text,
  p_column text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public._rtc_has_column(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._rtc_has_column(text, text)
  TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public._rtc_is_conversation_participant(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._rtc_is_conversation_participant(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_call_participant(
  _call_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.call_participants cp
    WHERE cp.call_id = _call_id
      AND cp.user_id = _user_id
      AND cp.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_call_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_call_participant(uuid, uuid)
  TO authenticated, service_role;

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
  v_column text;
BEGIN
  IF p_call_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.video_calls vc
    WHERE vc.id = p_call_id
      AND vc.host_id = p_user_id
  )
  INTO v_allowed;

  IF v_allowed THEN
    RETURN true;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.call_invites ci
    WHERE ci.call_id = p_call_id
      AND (ci.inviter_id = p_user_id OR ci.invitee_id = p_user_id)
      AND COALESCE(ci.status, 'pending') NOT IN ('declined', 'cancelled')
  )
  INTO v_allowed;

  IF v_allowed THEN
    RETURN true;
  END IF;

  SELECT vc.conversation_id
  INTO v_conversation_id
  FROM public.video_calls vc
  WHERE vc.id = p_call_id
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN public._rtc_is_conversation_participant(
      v_conversation_id,
      p_user_id
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_call(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_video_call(
  p_call_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_view_call(p_call_id, p_user_id);
$$;

REVOKE ALL ON FUNCTION public.can_access_video_call(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_video_call(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_call_is_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_group_call := COALESCE(NEW.max_participants, 1) > 2;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_call_is_group ON public.video_calls;
CREATE TRIGGER trg_set_call_is_group
  BEFORE INSERT OR UPDATE OF max_participants
  ON public.video_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_call_is_group();

CREATE OR REPLACE FUNCTION public.touch_call_invites_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_call_invites_updated_at_trigger
  ON public.call_invites;
CREATE TRIGGER touch_call_invites_updated_at_trigger
  BEFORE UPDATE ON public.call_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_call_invites_updated_at();

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

  IF v_call.status = 'ended' OR v_call.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'call_ended');
  END IF;

  v_cap := COALESCE(
    NULLIF(v_call.max_participants, 0),
    CASE WHEN COALESCE(v_call.is_group_call, false) THEN 8 ELSE 2 END
  );

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
      'max_participants', v_cap
    );
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
    'connecting',
    now()
  )
  ON CONFLICT (call_id, user_id)
  DO UPDATE SET
    joined_at = EXCLUDED.joined_at,
    left_at = NULL,
    is_muted = false,
    is_video_on = EXCLUDED.is_video_on,
    is_screen_sharing = false,
    is_hand_raised = false,
    connection_state = 'connecting',
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
    CASE WHEN v_call.host_id = v_user_id THEN 'host' ELSE 'participant' END,
    'connecting',
    jsonb_build_object(
      'is_muted', false,
      'is_video_on', COALESCE(p_is_video_on, true),
      'is_screen_sharing', false,
      'is_hand_raised', false
    ),
    now(),
    NULL,
    now()
  )
  ON CONFLICT (call_id, user_id)
  DO UPDATE SET
    connection_state = 'connecting',
    media_state = EXCLUDED.media_state,
    left_at = NULL,
    updated_at = now();

  UPDATE public.video_calls
  SET
    status = CASE WHEN status IN ('waiting', 'ringing', 'calling', 'connecting')
      THEN 'active'
      ELSE status
    END,
    started_at = COALESCE(started_at, now())
  WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'joined', true,
    'is_group_call', COALESCE(v_call.is_group_call, false),
    'call_type', v_call.call_type,
    'active_participants',
      v_active_count + CASE WHEN v_already_joined THEN 0 ELSE 1 END,
    'max_participants', v_cap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_video_call_guarded(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_video_call_guarded(uuid, boolean)
  TO authenticated, service_role;

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
  v_is_group boolean := false;
  v_max_participants integer := 2;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'User must be logged in to create a call';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_required';
  END IF;

  IF COALESCE(p_call_type, 'video') NOT IN ('audio', 'video') THEN
    RAISE EXCEPTION 'invalid_call_type'
      USING HINT = 'Call type must be audio or video';
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

  IF NOT public._rtc_is_conversation_participant(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'not_conversation_participant'
      USING HINT = 'User must be a participant in the conversation';
  END IF;

  v_is_group := v_conversation_type = 'group';
  v_max_participants := CASE WHEN v_is_group THEN 8 ELSE 2 END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

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
      conversation_id,
      host_id,
      call_type,
      status,
      started_at,
      ended_at,
      is_group_call,
      max_participants
    )
    VALUES (
      p_conversation_id,
      v_user_id,
      COALESCE(p_call_type, 'video'),
      'active',
      NULL,
      NULL,
      v_is_group,
      v_max_participants
    )
    RETURNING id INTO v_call_id;
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
    last_seen_at
  )
  VALUES (
    v_call_id,
    v_user_id,
    now(),
    NULL,
    false,
    COALESCE(p_is_video_on, true),
    false,
    false,
    'connecting',
    now()
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
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.video_calls vc
        WHERE vc.id = v_call_id
          AND vc.host_id = v_user_id
      ) THEN 'host'
      ELSE 'participant'
    END,
    'connecting',
    jsonb_build_object(
      'is_muted', false,
      'is_video_on', COALESCE(p_is_video_on, true),
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

REVOKE ALL ON FUNCTION public.create_video_call(uuid, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_video_call(uuid, text, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leave_video_call(
  p_call_id uuid
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
  v_ended boolean := false;
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
    RAISE EXCEPTION 'call_not_found';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'call_access_denied';
  END IF;

  UPDATE public.call_participants
  SET
    left_at = now(),
    connection_state = 'left',
    last_seen_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  UPDATE public.call_room_members
  SET
    left_at = now(),
    connection_state = 'left',
    updated_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  SELECT COUNT(*)::integer
  INTO v_active_count
  FROM public.call_participants
  WHERE call_id = p_call_id
    AND left_at IS NULL;

  IF NOT COALESCE(v_call.is_group_call, false)
     OR v_active_count <= 1 THEN
    UPDATE public.video_calls
    SET status = 'ended',
        ended_at = COALESCE(ended_at, now())
    WHERE id = p_call_id
      AND status <> 'ended';

    UPDATE public.call_participants
    SET left_at = COALESCE(left_at, now()),
        connection_state = 'left',
        last_seen_at = now()
    WHERE call_id = p_call_id
      AND left_at IS NULL;

    UPDATE public.call_room_members
    SET left_at = COALESCE(left_at, now()),
        connection_state = 'left',
        updated_at = now()
    WHERE call_id = p_call_id
      AND left_at IS NULL;

    v_ended := true;
  END IF;

  RETURN jsonb_build_object(
    'call_ended', v_ended,
    'active_participants',
      CASE WHEN v_ended THEN 0 ELSE v_active_count END,
    'is_group_call', COALESCE(v_call.is_group_call, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_video_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_video_call(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_video_call(
  p_call_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_call
  FROM public.video_calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'not_call_participant';
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
    last_seen_at
  )
  VALUES (
    p_call_id,
    v_user_id,
    now(),
    now(),
    false,
    false,
    false,
    false,
    'declined',
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    left_at = now(),
    connection_state = 'declined',
    last_seen_at = now();

  UPDATE public.call_room_members
  SET connection_state = 'declined',
      left_at = now(),
      updated_at = now()
  WHERE call_id = p_call_id
    AND user_id = v_user_id;

  UPDATE public.call_invites
  SET status = 'declined',
      updated_at = now()
  WHERE call_id = p_call_id
    AND invitee_id = v_user_id
    AND status IN ('pending', 'ringing', 'calling', 'connecting');

  IF NOT COALESCE(v_call.is_group_call, false) THEN
    UPDATE public.video_calls
    SET status = 'ended',
        ended_at = COALESCE(ended_at, now())
    WHERE id = p_call_id
      AND status <> 'ended';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_video_call(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_video_call(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_call_invite(
  p_call_id uuid,
  p_invitee_id uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_call_type text DEFAULT 'video',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_invitee_id IS NULL OR p_invitee_id = v_user_id THEN
    RAISE EXCEPTION 'invalid_invitee';
  END IF;

  IF NOT public.can_view_call(p_call_id, v_user_id) THEN
    RAISE EXCEPTION 'call_access_denied';
  END IF;

  UPDATE public.call_invites
  SET inviter_id = v_user_id,
      conversation_id = COALESCE(p_conversation_id, conversation_id),
      status = 'ringing',
      call_type = COALESCE(NULLIF(p_call_type, ''), call_type, 'video'),
      metadata = COALESCE(p_metadata, metadata, '{}'::jsonb),
      updated_at = now()
  WHERE call_id = p_call_id
    AND invitee_id = p_invitee_id
  RETURNING id INTO v_invite_id;

  IF v_invite_id IS NOT NULL THEN
    RETURN v_invite_id;
  END IF;

  INSERT INTO public.call_invites (
    call_id,
    conversation_id,
    inviter_id,
    invitee_id,
    status,
    call_type,
    metadata
  )
  VALUES (
    p_call_id,
    p_conversation_id,
    v_user_id,
    p_invitee_id,
    'ringing',
    COALESCE(NULLIF(p_call_type, ''), 'video'),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.call_invites
    SET inviter_id = v_user_id,
        conversation_id = COALESCE(p_conversation_id, conversation_id),
        status = 'ringing',
        call_type = COALESCE(NULLIF(p_call_type, ''), call_type, 'video'),
        metadata = COALESCE(p_metadata, metadata, '{}'::jsonb),
        updated_at = now()
    WHERE call_id = p_call_id
      AND invitee_id = p_invitee_id
    RETURNING id INTO v_invite_id;

    IF v_invite_id IS NULL THEN
      RAISE;
    END IF;

    RETURN v_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_call_invite(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_call_invite(uuid, uuid, uuid, text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_call_invite(
  p_call_id uuid
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

  UPDATE public.call_invites
  SET status = 'accepted',
      updated_at = now()
  WHERE call_id = p_call_id
    AND invitee_id = v_user_id
    AND status IN ('pending', 'ringing', 'calling', 'connecting');

  PERFORM public.join_video_call_guarded(p_call_id, true);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_call_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_call_invite(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_call_invite(
  p_call_id uuid
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

  UPDATE public.call_invites
  SET status = 'declined',
      updated_at = now()
  WHERE call_id = p_call_id
    AND invitee_id = v_user_id
    AND status IN ('pending', 'ringing', 'calling', 'connecting');

  UPDATE public.video_calls
  SET status = 'declined',
      ended_at = COALESCE(ended_at, now())
  WHERE id = p_call_id
    AND status <> 'ended'
    AND NOT EXISTS (
      SELECT 1
      FROM public.call_invites ci
      WHERE ci.call_id = p_call_id
        AND ci.status IN ('pending', 'ringing', 'calling', 'connecting', 'accepted')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_call_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_call_invite(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_call_invites(
  p_call_id uuid
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

  UPDATE public.call_invites
  SET status = 'cancelled',
      updated_at = now()
  WHERE call_id = p_call_id
    AND status IN ('pending', 'ringing', 'calling', 'connecting');

  UPDATE public.video_calls
  SET status = 'ended',
      ended_at = COALESCE(ended_at, now())
  WHERE id = p_call_id
    AND status <> 'ended';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_call_invites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_call_invites(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.active_call_participant_count(
  p_call_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.call_participants
  WHERE call_id = p_call_id
    AND left_at IS NULL
    AND public.can_view_call(p_call_id, (SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.active_call_participant_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_call_participant_count(uuid)
  TO authenticated, service_role;

ALTER TABLE public.video_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;
DROP POLICY IF EXISTS "Users can create calls" ON public.video_calls;
DROP POLICY IF EXISTS "Host can update calls" ON public.video_calls;
DROP POLICY IF EXISTS "RTC calls readable by members" ON public.video_calls;
DROP POLICY IF EXISTS "RTC callers can create calls" ON public.video_calls;
DROP POLICY IF EXISTS "RTC call members can update calls" ON public.video_calls;

CREATE POLICY "RTC calls readable by members"
  ON public.video_calls
  FOR SELECT
  TO authenticated
  USING (public.can_view_call(id, (SELECT auth.uid())));

CREATE POLICY "RTC callers can create calls"
  ON public.video_calls
  FOR INSERT
  TO authenticated
  WITH CHECK (host_id = (SELECT auth.uid()));

CREATE POLICY "RTC call members can update calls"
  ON public.video_calls
  FOR UPDATE
  TO authenticated
  USING (public.can_view_call(id, (SELECT auth.uid())))
  WITH CHECK (public.can_view_call(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;
DROP POLICY IF EXISTS "Users can join calls" ON public.call_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.call_participants;
DROP POLICY IF EXISTS "RTC participants readable by members" ON public.call_participants;
DROP POLICY IF EXISTS "RTC users can join calls" ON public.call_participants;
DROP POLICY IF EXISTS "RTC users can update own participation" ON public.call_participants;

CREATE POLICY "RTC participants readable by members"
  ON public.call_participants
  FOR SELECT
  TO authenticated
  USING (public.can_view_call(call_id, (SELECT auth.uid())));

CREATE POLICY "RTC users can join calls"
  ON public.call_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE POLICY "RTC users can update own participation"
  ON public.call_participants
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "RTC room members readable by call members"
  ON public.call_room_members;
DROP POLICY IF EXISTS "RTC room members can join"
  ON public.call_room_members;
DROP POLICY IF EXISTS "RTC room members can update own row"
  ON public.call_room_members;

CREATE POLICY "RTC room members readable by call members"
  ON public.call_room_members
  FOR SELECT
  TO authenticated
  USING (public.can_view_call(call_id, (SELECT auth.uid())));

CREATE POLICY "RTC room members can join"
  ON public.call_room_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE POLICY "RTC room members can update own row"
  ON public.call_room_members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Call signals readable by call members"
  ON public.call_signals;
DROP POLICY IF EXISTS "Call members can insert signals"
  ON public.call_signals;
DROP POLICY IF EXISTS "Users can delete own call signals"
  ON public.call_signals;

CREATE POLICY "Call signals readable by call members"
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

CREATE POLICY "Call members can insert signals"
  ON public.call_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE POLICY "Users can delete own call signals"
  ON public.call_signals
  FOR DELETE
  TO authenticated
  USING (sender_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Call invites readable by involved users"
  ON public.call_invites;
DROP POLICY IF EXISTS "Users can create call invites"
  ON public.call_invites;
DROP POLICY IF EXISTS "Involved users can update call invites"
  ON public.call_invites;
DROP POLICY IF EXISTS "Inviters can delete call invites"
  ON public.call_invites;

CREATE POLICY "Call invites readable by involved users"
  ON public.call_invites
  FOR SELECT
  TO authenticated
  USING (
    inviter_id = (SELECT auth.uid())
    OR invitee_id = (SELECT auth.uid())
    OR public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE POLICY "Users can create call invites"
  ON public.call_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    inviter_id = (SELECT auth.uid())
    OR public.can_view_call(call_id, (SELECT auth.uid()))
  );

CREATE POLICY "Involved users can update call invites"
  ON public.call_invites
  FOR UPDATE
  TO authenticated
  USING (
    inviter_id = (SELECT auth.uid())
    OR invitee_id = (SELECT auth.uid())
  )
  WITH CHECK (
    inviter_id = (SELECT auth.uid())
    OR invitee_id = (SELECT auth.uid())
  );

CREATE POLICY "Inviters can delete call invites"
  ON public.call_invites
  FOR DELETE
  TO authenticated
  USING (inviter_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.video_calls
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.call_participants
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.call_room_members
  TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.call_signals
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_invites
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "RTC call members can subscribe to webrtc topics" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "RTC call members can broadcast to webrtc topics" ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY "RTC call members can subscribe to webrtc topics"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.topic() LIKE 'webrtc:%'
          AND split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND public.can_view_call(
            split_part(realtime.topic(), ':', 2)::uuid,
            (SELECT auth.uid())
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "RTC call members can broadcast to webrtc topics"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.topic() LIKE 'webrtc:%'
          AND split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND public.can_view_call(
            split_part(realtime.topic(), ':', 2)::uuid,
            (SELECT auth.uid())
          )
        )
    $policy$;
  END IF;
END $$;

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

COMMENT ON TABLE public.call_signals IS
  'Durable WebRTC signaling fallback for offer/answer/ICE/media events shared by Flutter and web clients.';

COMMENT ON FUNCTION public.can_view_call(uuid, uuid) IS
  'Participant-scoped RTC access helper for video_calls, invites, participants, and conversation members.';

-- RLS audit: RTC tables are restricted to hosts, invited users, call
-- participants, or conversation members. Realtime webrtc:<call_id> topics are
-- allowed only when the authenticated user can view that call.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260820204136_ac31872b-888e-434b-8708-d68c72d13cda.sql
-- SHA256 227311bf9978994bdc341b952b34935d65f764a382a19054d22bbb6c69a95c0a
-- ============================================================================
-- 1. post_views: remove fully-open SELECT
DROP POLICY IF EXISTS "Anyone can view post views" ON public.post_views;

-- 2. profiles: hide sensitive columns from other signed-in users
REVOKE SELECT (birth_date, country, location, preferences, signatures, email_filters, notification_preferences, is_admin, role) ON public.profiles FROM authenticated;
REVOKE SELECT (birth_date, country, location, preferences, signatures, email_filters, notification_preferences, is_admin, role) ON public.profiles FROM anon;

-- 3. admin checks -> has_role()/user_roles
DROP POLICY IF EXISTS "Admins can view all security events" ON public.security_events;
CREATE POLICY "Admins can view all security events" ON public.security_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can read all reports" ON public.reports;
DROP POLICY IF EXISTS "reports_select_admin" ON public.reports;
CREATE POLICY "reports_select_admin" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "verification_requests_select" ON public.seller_verification_requests;
CREATE POLICY "verification_requests_select" ON public.seller_verification_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "product_reports_select" ON public.product_reports;
CREATE POLICY "product_reports_select" ON public.product_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Only admins can read audit log" ON public.admin_actions;
CREATE POLICY "Only admins can read audit log" ON public.admin_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can insert reserved usernames" ON public.reserved_usernames FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can update reserved usernames" ON public.reserved_usernames FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can delete reserved usernames" ON public.reserved_usernames FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. sellers: hide contact info, expose via guarded function
REVOKE SELECT (phone, email) ON public.sellers FROM authenticated;
REVOKE SELECT (phone, email) ON public.sellers FROM anon;

CREATE OR REPLACE FUNCTION public.get_seller_contact(p_seller_id uuid)
RETURNS TABLE(phone text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.phone, s.email
  FROM public.sellers s
  WHERE s.id = p_seller_id
    AND (
      s.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.seller_id = s.id AND o.buyer_id = auth.uid()
      )
    )
$$;
REVOKE ALL ON FUNCTION public.get_seller_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_contact(uuid) TO authenticated, service_role;

-- 5. search_cache: authenticated only
DROP POLICY IF EXISTS "Search cache is readable" ON public.search_cache;
CREATE POLICY "Search cache readable by signed-in users" ON public.search_cache FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.search_cache FROM anon;

-- 6. taxi_live_locations: authenticated only
DROP POLICY IF EXISTS "Public read access to available taxis" ON public.taxi_live_locations;
CREATE POLICY "Signed-in users can view available taxis" ON public.taxi_live_locations FOR SELECT TO authenticated USING (is_available = true);
REVOKE SELECT ON public.taxi_live_locations FROM anon;

-- 7. storage: private chat attachments
DROP POLICY IF EXISTS "Public can read chat media" ON storage.objects;
CREATE POLICY "Chat media owner or participant read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('chat-media','message-attachments')
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id::text = (storage.foldername(name))[1]
        AND cp.user_id = auth.uid()
    )
  )
);

-- 8. privileged functions: drop unnecessary anon/public execute
REVOKE ALL ON FUNCTION public.get_profile_private(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_private(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_live_stream_viewer_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_live_stream_viewer_count(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_wallet_balance_tampering() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_admin_self_escalation() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- SOURCE B-web: 20260822152257_70ba3fef-5eae-4d65-9b5d-aec032dc2d50.sql
-- SHA256 fe81ccca3cfa7819a8cde78a156e830f09f484009c0332bd857371fadd3ef6f9
-- ============================================================================
DROP POLICY IF EXISTS "Post media readable by signed-in users" ON storage.objects;
CREATE POLICY "Post media readable by signed-in users" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('chat-media','message-attachments')
  AND (name LIKE '%/create/post/%' OR name LIKE '%/create/story/%' OR name LIKE '%/create/reel/%')
);
