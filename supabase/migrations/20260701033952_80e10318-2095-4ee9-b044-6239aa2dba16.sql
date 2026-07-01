
-- =========================================================================
-- 1. WALLETS: prevent self-balance modification
-- =========================================================================
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.wallets;
CREATE POLICY "Users can update wallet metadata"
  ON public.wallets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND balance = (SELECT balance FROM public.wallets w WHERE w.id = wallets.id)
  );

-- =========================================================================
-- 2. TRANSACTIONS: remove client insert access
-- =========================================================================
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.transactions;
-- No INSERT policy => client cannot insert. Server (service_role) still can.

-- =========================================================================
-- 3. PROFILES: hide precise GPS location from public reads
-- =========================================================================
-- Move sensitive location data out of the row-level public read path.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS location;

-- =========================================================================
-- 4. STORAGE: message-attachments bucket
-- =========================================================================
-- Tighten SELECT: only owner (first path segment) OR conversation participants
DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;
CREATE POLICY "Users read own or participant attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments'
    AND (
      -- owner of the folder
      (auth.uid())::text = (storage.foldername(name))[1]
      -- public app assets (posts/comments/avatars) that are user-scoped by folder
      OR (storage.foldername(name))[1] IN ('posts','comments','avatars','stories','products','channels','mini-app-icons')
    )
  );

-- Tighten INSERT: enforce that first path segment equals uploader's id
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Users upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR (storage.foldername(name))[1] IN ('posts','comments','avatars','stories','products','channels')
    )
  );

-- Also fix mini-app-icons INSERT (was WITH CHECK true-ish)
DROP POLICY IF EXISTS "Users can upload mini app icons" ON storage.objects;
CREATE POLICY "Users upload own mini app icons"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mini-app-icons'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- =========================================================================
-- 5. AD TRACKING: replace always-true INSERT policies
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can create clicks" ON public.ad_clicks;
CREATE POLICY "Insert own click events"
  ON public.ad_clicks FOR INSERT
  WITH CHECK (
    ad_id IS NOT NULL
    AND (user_id IS NULL OR auth.uid() = user_id)
  );

DROP POLICY IF EXISTS "Anyone can create impressions" ON public.ad_impressions;
CREATE POLICY "Insert own impression events"
  ON public.ad_impressions FOR INSERT
  WITH CHECK (
    ad_id IS NOT NULL
    AND (user_id IS NULL OR auth.uid() = user_id)
  );

DROP POLICY IF EXISTS "Anyone can create reach" ON public.ad_reach;
CREATE POLICY "Insert own reach events"
  ON public.ad_reach FOR INSERT
  WITH CHECK (
    ad_id IS NOT NULL
    AND auth.uid() = user_id
  );

-- =========================================================================
-- 6. REALTIME: restrict channel subscriptions
-- =========================================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to own topics"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    -- User's personal topics: notifications:<uid>, presence:<uid>, user:<uid>
    (realtime.topic() LIKE '%:' || (auth.uid())::text)
    -- Conversation topics: messages:<conversation_id> / typing:<conversation_id>
    OR (
      (realtime.topic() LIKE 'messages:%' OR realtime.topic() LIKE 'typing:%')
      AND public.is_conversation_participant(
        NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
        auth.uid()
      )
    )
    -- Public feeds
    OR realtime.topic() IN ('posts-feed','stories-feed','live-streams')
  );

DROP POLICY IF EXISTS "Authenticated can broadcast to own topics" ON realtime.messages;
CREATE POLICY "Authenticated can broadcast to own topics"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE '%:' || (auth.uid())::text)
    OR (
      (realtime.topic() LIKE 'messages:%' OR realtime.topic() LIKE 'typing:%')
      AND public.is_conversation_participant(
        NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
        auth.uid()
      )
    )
  );

-- =========================================================================
-- 7. SECURITY DEFINER function EXECUTE privileges
-- =========================================================================
-- Revoke direct client access on trigger-only and admin-only definer functions.
-- Trigger functions never need EXECUTE granted to clients.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_like() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_mention() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_mention() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_collaboration_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_collaboration_accepted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_channel_subscriber_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_channel_posts_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ad_reach_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ad_clicks_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ad_impressions_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_add_channel_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_product_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_seller_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_country_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_weekly_pattern() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_hourly_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_platform_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_dau_trend() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_page_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_age_stats() FROM PUBLIC, anon;

-- RLS helper functions: remove anon; keep authenticated so RLS eval works
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_channel_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_channel_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_call_participant(uuid, uuid) FROM PUBLIC, anon;
