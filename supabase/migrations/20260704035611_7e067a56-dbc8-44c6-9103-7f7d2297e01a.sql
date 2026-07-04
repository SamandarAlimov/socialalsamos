
-- 1) Blocked users
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks view" ON public.blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
CREATE POLICY "own blocks insert" ON public.blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "own blocks delete" ON public.blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- 2) Reports
CREATE TABLE IF NOT EXISTS public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  target_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.message_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.message_reports(status);
GRANT SELECT, INSERT ON public.message_reports TO authenticated;
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports view" ON public.message_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own reports insert" ON public.message_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- 3) is_request flag on conversation_participants
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS is_request boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_cp_is_request ON public.conversation_participants(user_id, is_request) WHERE is_request = true;

-- 4) Block enforcement + auto-mark request on new private message
CREATE OR REPLACE FUNCTION public.enforce_message_safety()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ctype text;
  v_recipient uuid;
  v_blocked boolean;
  v_follows boolean;
BEGIN
  SELECT type INTO v_ctype FROM public.conversations WHERE id = NEW.conversation_id;
  IF v_ctype = 'private' AND NEW.sender_id IS NOT NULL THEN
    SELECT user_id INTO v_recipient
      FROM public.conversation_participants
      WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
      LIMIT 1;

    IF v_recipient IS NOT NULL THEN
      -- Block enforcement: either side has blocked the other
      SELECT EXISTS (
        SELECT 1 FROM public.blocked_users
         WHERE (blocker_id = v_recipient AND blocked_id = NEW.sender_id)
            OR (blocker_id = NEW.sender_id AND blocked_id = v_recipient)
      ) INTO v_blocked;
      IF v_blocked THEN
        RAISE EXCEPTION 'blocked' USING ERRCODE = 'P0001';
      END IF;

      -- Auto-mark as request if recipient does not follow sender
      SELECT EXISTS (
        SELECT 1 FROM public.follows
         WHERE follower_id = v_recipient AND following_id = NEW.sender_id
      ) INTO v_follows;

      IF NOT v_follows THEN
        UPDATE public.conversation_participants
           SET is_request = true
         WHERE conversation_id = NEW.conversation_id
           AND user_id = v_recipient
           AND is_request = false
           AND NOT EXISTS (
             SELECT 1 FROM public.messages m
              WHERE m.conversation_id = NEW.conversation_id
                AND m.sender_id = v_recipient
           );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_message_safety ON public.messages;
CREATE TRIGGER trg_enforce_message_safety
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_message_safety();

-- 5) RPCs
CREATE OR REPLACE FUNCTION public.respond_to_message_request(_conversation_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _accept THEN
    UPDATE public.conversation_participants
       SET is_request = false
     WHERE conversation_id = _conversation_id AND user_id = v_user;
    RETURN jsonb_build_object('accepted', true);
  ELSE
    DELETE FROM public.conversation_participants
     WHERE conversation_id = _conversation_id AND user_id = v_user;
    RETURN jsonb_build_object('accepted', false);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.block_user(_target uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_user = _target THEN RAISE EXCEPTION 'cannot_block_self'; END IF;
  INSERT INTO public.blocked_users (blocker_id, blocked_id, reason)
    VALUES (v_user, _target, _reason)
    ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET reason = EXCLUDED.reason;
  -- Also unfollow both directions
  DELETE FROM public.follows WHERE (follower_id = v_user AND following_id = _target) OR (follower_id = _target AND following_id = v_user);
  RETURN jsonb_build_object('blocked', true);
END; $$;

CREATE OR REPLACE FUNCTION public.unblock_user(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.blocked_users WHERE blocker_id = v_user AND blocked_id = _target;
  RETURN jsonb_build_object('unblocked', true);
END; $$;

CREATE OR REPLACE FUNCTION public.report_content(
  _target_user_id uuid,
  _target_conversation_id uuid,
  _target_message_id uuid,
  _reason text,
  _details text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.message_reports (reporter_id, target_user_id, target_conversation_id, target_message_id, reason, details)
    VALUES (v_user, _target_user_id, _target_conversation_id, _target_message_id, _reason, _details);
  RETURN jsonb_build_object('reported', true);
END; $$;
