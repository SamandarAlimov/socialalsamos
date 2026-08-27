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
