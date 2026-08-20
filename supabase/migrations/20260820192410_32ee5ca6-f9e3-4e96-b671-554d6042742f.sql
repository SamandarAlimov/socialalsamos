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
