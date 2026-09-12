-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260713031000_message_hashtags.sql
-- SHA256 373b450a90b24287279184e07cc1f02ad44b08e6e9cf212b9dbc546e717748ca
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.message_hashtags (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, tag)
);

ALTER TABLE public.message_hashtags ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_message_hashtags_conversation_tag
  ON public.message_hashtags(conversation_id, tag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_hashtags_tag_created
  ON public.message_hashtags(tag, created_at DESC);

DROP POLICY IF EXISTS "Participants view message hashtags" ON public.message_hashtags;
CREATE POLICY "Participants view message hashtags"
  ON public.message_hashtags FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = message_hashtags.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.sync_message_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tag_value text;
BEGIN
  DELETE FROM public.message_hashtags WHERE message_id = NEW.id;

  IF COALESCE(NEW.is_deleted, false) OR COALESCE(NEW.content, '') = '' THEN
    RETURN NEW;
  END IF;

  FOR tag_value IN
    SELECT DISTINCT lower((regexp_matches(NEW.content, '#([a-zA-Z0-9_]{1,64})', 'g'))[1])
  LOOP
    INSERT INTO public.message_hashtags(message_id, conversation_id, tag, created_at)
    VALUES (NEW.id, NEW.conversation_id, tag_value, COALESCE(NEW.created_at, now()))
    ON CONFLICT (message_id, tag) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_hashtags_sync ON public.messages;
CREATE TRIGGER on_message_hashtags_sync
AFTER INSERT OR UPDATE OF content, is_deleted ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_message_hashtags();

CREATE OR REPLACE FUNCTION public.search_conversation_hashtag(
  p_conversation_id uuid,
  p_tag text
)
RETURNS TABLE(message_id uuid, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mh.message_id, mh.created_at
  FROM public.message_hashtags mh
  WHERE mh.conversation_id = p_conversation_id
    AND mh.tag = lower(trim(leading '#' from p_tag))
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = p_conversation_id
        AND cp.user_id = auth.uid()
    )
  ORDER BY mh.created_at DESC;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_hashtags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_hashtags;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: message_hashtags is trigger-maintained and readable only by participants of the owning conversation.


-- ============================================================================
-- SOURCE A-superapp: 20260713032000_username_change_rules.sql
-- SHA256 34647e94ce8bb0aed3fb3a41f207dd0acf1e45c088d07949f70ce361aebc73eb
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.username_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_username text,
  new_username text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.username_change_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_username_change_history_user_changed
  ON public.username_change_history(user_id, changed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

DROP POLICY IF EXISTS "Users view own username changes" ON public.username_change_history;
CREATE POLICY "Users view own username changes"
  ON public.username_change_history FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_reserved_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(p_username)) = ANY (ARRAY[
    'admin','administrator','root','support','help','system','official',
    'alsamos','api','auth','login','signup','settings','profile','user',
    'channel','group','messages','market','payment','wallet','security'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.is_username_available(
  p_username text,
  p_current_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_username ~ '^[a-z0-9_]{3,20}$'
    AND NOT public.is_reserved_username(p_username)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(p.username) = lower(p_username)
        AND (p_current_user_id IS NULL OR p.id <> p_current_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.change_username(p_username text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(p_username));
  v_old text;
  v_profile public.profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NOT public.is_username_available(v_username, v_user_id) THEN
    RAISE EXCEPTION 'username unavailable';
  END IF;
  SELECT username INTO v_old FROM public.profiles WHERE id = v_user_id;
  IF lower(coalesce(v_old, '')) = v_username THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    RETURN v_profile;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_change_history
    WHERE user_id = v_user_id
      AND changed_at > now() - interval '14 days'
  ) THEN
    RAISE EXCEPTION 'username can be changed once every 14 days';
  END IF;

  UPDATE public.profiles
  SET username = v_username,
      updated_at = now()
  WHERE id = v_user_id
  RETURNING * INTO v_profile;

  INSERT INTO public.username_change_history(user_id, old_username, new_username)
  VALUES (v_user_id, v_old, v_username);

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: username history is owner-readable only; username changes execute through RPC as auth.uid() with uniqueness, reserved-name and cooldown checks.


-- ============================================================================
-- SOURCE A-superapp: 20260713033000_granular_privacy_settings.sql
-- SHA256 1d5f42e91fd80800fd47e42d5640319fdac31188ce9f09c2261b46c42e160c4a
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS phone_visibility text NOT NULL DEFAULT 'contacts',
  ADD COLUMN IF NOT EXISTS profile_photo_visibility text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS forwards_visibility text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS private_account boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_view_profile_field(
  target_user_id uuid,
  field_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  visibility text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF auth.uid() = target_user_id THEN RETURN true; END IF;
  IF public.is_blocked_between(auth.uid(), target_user_id) THEN RETURN false; END IF;

  SELECT CASE field_name
    WHEN 'phone' THEN coalesce(phone_visibility, 'contacts')
    WHEN 'photo' THEN coalesce(profile_photo_visibility, 'everyone')
    WHEN 'forwards' THEN coalesce(forwards_visibility, 'everyone')
    WHEN 'calls' THEN coalesce(call_permissions, 'everyone')
    WHEN 'group_invites' THEN coalesce(group_invite_permissions, 'everyone')
    ELSE 'nobody'
  END INTO visibility
  FROM public.user_settings
  WHERE user_id = target_user_id;

  visibility := coalesce(visibility, 'everyone');
  IF visibility = 'nobody' THEN RETURN false; END IF;
  IF visibility = 'contacts' THEN RETURN public.are_contacts(auth.uid(), target_user_id); END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_profile_field(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: privacy values remain owner-only in user_settings; cross-user checks are exposed only via can_view_profile_field RPC.


-- ============================================================================
-- SOURCE A-superapp: 20260713034000_active_session_devices.sql
-- SHA256 6edb4c66cb8ba13f1a20722b990ba2b0e62f881aa46dbbb7a06a5339b221ac64
-- ============================================================================
BEGIN;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS app_name text DEFAULT 'Alsamos',
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS accept_secret_chats boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_incoming_calls boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS session_autoterminate_days integer NOT NULL DEFAULT 180;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON public.user_sessions(user_id, last_active_at DESC);

CREATE OR REPLACE FUNCTION public.terminate_old_user_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.user_sessions s
  USING public.user_settings us
  WHERE us.user_id = s.user_id
    AND s.is_current IS NOT TRUE
    AND s.last_active_at < now() - make_interval(days => coalesce(us.session_autoterminate_days, 180));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.terminate_old_user_sessions() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: user_sessions remains protected by existing owner-only policies; new metadata columns are writable only by the owning authenticated user.


-- ============================================================================
-- SOURCE A-superapp: 20260713035000_notification_settings.sql
-- SHA256 b0cd25dbef6485dc0d3a88f350e289224c372bc56d495bbce497400fbb2c1dfb
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notif_likes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_followers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_mentions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_sound text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS notif_vibration boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_badge_count boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dnd_start_time text,
  ADD COLUMN IF NOT EXISTS dnd_end_time text;

CREATE TABLE IF NOT EXISTS public.conversation_notification_settings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  muted_until timestamptz,
  mute_forever boolean NOT NULL DEFAULT false,
  mentions_only boolean NOT NULL DEFAULT false,
  preview_enabled boolean NOT NULL DEFAULT true,
  sound text NOT NULL DEFAULT 'default',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE public.conversation_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_conversation_notification_settings_conversation
  ON public.conversation_notification_settings(conversation_id, updated_at DESC);

DROP POLICY IF EXISTS "Users manage own conversation notification settings"
  ON public.conversation_notification_settings;
CREATE POLICY "Users manage own conversation notification settings"
  ON public.conversation_notification_settings
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_notification_settings.conversation_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_notification_settings.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.effective_conversation_notification_settings(
  p_conversation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  muted_until timestamptz,
  mute_forever boolean,
  mentions_only boolean,
  preview_enabled boolean,
  sound text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cns.muted_until,
    COALESCE(cns.mute_forever, false),
    COALESCE(cns.mentions_only, false),
    COALESCE(cns.preview_enabled, true),
    COALESCE(cns.sound, us.notif_sound, 'default')
  FROM public.conversation_participants cp
  LEFT JOIN public.conversation_notification_settings cns
    ON cns.conversation_id = cp.conversation_id
   AND cns.user_id = cp.user_id
  LEFT JOIN public.user_settings us ON us.user_id = cp.user_id
  WHERE cp.conversation_id = p_conversation_id
    AND cp.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.effective_conversation_notification_settings(uuid, uuid)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_notification_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.conversation_notification_settings;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713036000_data_storage_settings.sql
-- SHA256 8c31af095883e4a360127c077b43c058dbe459365ef1c6ad7d9f764e8f948519
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS data_image_quality integer NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS auto_download_images_wifi boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_download_images_mobile boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_download_images_roaming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_videos_wifi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_videos_mobile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_videos_roaming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_files_wifi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_files_mobile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_download_files_roaming boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_data_storage_settings(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  data_image_quality integer,
  auto_download_images_wifi boolean,
  auto_download_images_mobile boolean,
  auto_download_images_roaming boolean,
  auto_download_videos_wifi boolean,
  auto_download_videos_mobile boolean,
  auto_download_videos_roaming boolean,
  auto_download_files_wifi boolean,
  auto_download_files_mobile boolean,
  auto_download_files_roaming boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    us.data_image_quality,
    us.auto_download_images_wifi,
    us.auto_download_images_mobile,
    us.auto_download_images_roaming,
    us.auto_download_videos_wifi,
    us.auto_download_videos_mobile,
    us.auto_download_videos_roaming,
    us.auto_download_files_wifi,
    us.auto_download_files_mobile,
    us.auto_download_files_roaming
  FROM public.user_settings us
  WHERE us.user_id = p_user_id
    AND p_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_data_storage_settings(uuid)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713037000_trending_public_posts.sql
-- SHA256 69d40fa25118dfefc51b8e1ee0f357c2fb65bf6f40845a9093bac2ef798f017e
-- ============================================================================
BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_public_source_trending
  ON public.posts (
    visibility,
    source_type,
    likes_count DESC,
    comments_count DESC,
    views_count DESC,
    created_at DESC
  )
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_posts_source_conversation
  ON public.posts(source_conversation_id, created_at DESC)
  WHERE source_conversation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trending_public_posts(p_limit integer DEFAULT 12)
RETURNS SETOF public.posts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.posts p
  WHERE p.visibility = 'public'
    AND COALESCE(p.moderation_status, 'approved') <> 'rejected'
    AND p.source_type IN ('channel', 'group', 'public_channel', 'public_group')
  ORDER BY
    COALESCE(p.likes_count, 0) DESC,
    COALESCE(p.comments_count, 0) DESC,
    COALESCE(p.views_count, 0) DESC,
    p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 50));
$$;

GRANT EXECUTE ON FUNCTION public.trending_public_posts(integer)
  TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713038000_rls_audit_report.sql
-- SHA256 a9c042155e83d11a14a3d891441024c9e7eea60b9bfa5abc7c61d1327e7db990
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.get_rls_audit_report()
RETURNS TABLE (
  schema_name text,
  table_name text,
  rls_enabled boolean,
  rls_forced boolean,
  policy_count integer,
  audit_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can run the RLS audit report';
  END IF;

  RETURN QUERY
  SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COUNT(p.polname)::integer AS policy_count,
    CASE
      WHEN NOT c.relrowsecurity THEN 'missing_rls'
      WHEN COUNT(p.polname) = 0 THEN 'missing_policy'
      ELSE 'ok'
    END AS audit_status
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT LIKE 'pg_%'
    AND c.relname NOT LIKE 'supabase_%'
  GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  ORDER BY
    CASE
      WHEN NOT c.relrowsecurity THEN 0
      WHEN COUNT(p.polname) = 0 THEN 1
      ELSE 2
    END,
    c.relname;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rls_audit_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rls_audit_report() TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713039000_chat_wallpaper_system.sql
-- SHA256 8cb707a76ab71a6a99ce444928473c7384cc41cdf69624ebc93bc638beb2f787
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS chat_wallpaper_type text,
  ADD COLUMN IF NOT EXISTS chat_wallpaper_value text,
  ADD COLUMN IF NOT EXISTS chat_wallpaper_dim double precision NOT NULL DEFAULT 0.16,
  ADD COLUMN IF NOT EXISTS chat_wallpaper_blur double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_wallpaper_updated_at timestamptz;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS wallpaper_type text,
  ADD COLUMN IF NOT EXISTS wallpaper_value text,
  ADD COLUMN IF NOT EXISTS wallpaper_dim double precision,
  ADD COLUMN IF NOT EXISTS wallpaper_blur double precision,
  ADD COLUMN IF NOT EXISTS wallpaper_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_wallpaper_user
  ON public.conversation_participants(user_id, wallpaper_updated_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-wallpapers',
  'chat-wallpapers',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Users read own chat wallpapers" ON storage.objects;
CREATE POLICY "Users read own chat wallpapers"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users upload own chat wallpapers" ON storage.objects;
CREATE POLICY "Users upload own chat wallpapers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own chat wallpapers" ON storage.objects;
CREATE POLICY "Users update own chat wallpapers"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'chat-wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own chat wallpapers" ON storage.objects;
CREATE POLICY "Users delete own chat wallpapers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON COLUMN public.user_settings.chat_wallpaper_type IS
  'Global chat wallpaper kind: preset, color, gradient, or image.';
COMMENT ON COLUMN public.conversation_participants.wallpaper_type IS
  'Nullable per-user per-chat wallpaper override; null inherits global wallpaper.';

-- RLS audit: global wallpaper remains protected by existing user_settings owner policies; per-chat wallpaper is stored on the authenticated user participant row; storage policies restrict custom images to auth.uid() folder owners.

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713102000_chat_voice_video_messages.sql
-- SHA256 7de5d24ad7aa9e4b796f0210d7313ae13a28bd3550bf338e509d8772951a1227
-- ============================================================================
BEGIN;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_path text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS thumb_path text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS waveform jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mime_type text;

CREATE INDEX IF NOT EXISTS idx_messages_chat_media_type_created
  ON public.messages(conversation_id, media_type, created_at DESC)
  WHERE media_type IN ('voice', 'audio', 'video', 'video_note');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('chat-audio', 'chat-audio', false, 15728640,
   ARRAY['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm']),
  ('chat-video', 'chat-video', false, 157286400,
   ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
  ('chat-thumbs', 'chat-thumbs', false, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Chat media participants read" ON storage.objects;
CREATE POLICY "Chat media participants read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id IN ('chat-audio', 'chat-video', 'chat-thumbs')
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id::text = (storage.foldername(name))[1]
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat media participants upload" ON storage.objects;
CREATE POLICY "Chat media participants upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('chat-audio', 'chat-video', 'chat-thumbs')
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id::text = (storage.foldername(name))[1]
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat media owner update" ON storage.objects;
CREATE POLICY "Chat media owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id IN ('chat-audio', 'chat-video', 'chat-thumbs')
    AND owner = auth.uid()
  )
  WITH CHECK (
    bucket_id IN ('chat-audio', 'chat-video', 'chat-thumbs')
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS "Chat media owner delete" ON storage.objects;
CREATE POLICY "Chat media owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('chat-audio', 'chat-video', 'chat-thumbs')
    AND owner = auth.uid()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';



-- ============================================================================
-- SOURCE A-superapp: 20260713114500_show_deleted_messages_setting.sql
-- SHA256 eefdc0ade1b4de9bf1b1cf3180a4cba2c3f78d76d835b4b192826d12d20c48fb
-- ============================================================================
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS show_deleted_messages boolean NOT NULL DEFAULT false;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260714000000_username_reservation_system.sql
-- SHA256 eb8fcfb328d15251046d6d25778e778e6acc3c4c0ebf53851e4285de5ca3fd4f
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ============================================================
-- 1. reserved_usernames table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reserved_usernames (
  username citext PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('celebrity','brand','short','system','custom')),
  reason text,
  reserved_by uuid REFERENCES public.profiles(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_to uuid REFERENCES public.profiles(id),
  released_by uuid REFERENCES public.profiles(id),
  released_at timestamptz
);

ALTER TABLE public.reserved_usernames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Anyone can read reserved usernames"
  ON public.reserved_usernames FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can insert reserved usernames"
  ON public.reserved_usernames FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can update reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can update reserved usernames"
  ON public.reserved_usernames FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can delete reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can delete reserved usernames"
  ON public.reserved_usernames FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- 2. username_rules config table (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.username_rules (
  id boolean PRIMARY KEY DEFAULT true,
  reserved_max_short_length int NOT NULL DEFAULT 4,
  min_username_length int NOT NULL DEFAULT 3,
  max_username_length int NOT NULL DEFAULT 32,
  allowed_pattern text NOT NULL DEFAULT '^[a-z0-9_]+$',
  CHECK (id)
);

INSERT INTO public.username_rules (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.username_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read username rules" ON public.username_rules;
CREATE POLICY "Anyone can read username rules"
  ON public.username_rules FOR SELECT
  USING (true);

-- ============================================================
-- 3. check_username_availability — returns JSON with reason
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_username_availability(
  p_username text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text := lower(trim(p_username));
  v_rules public.username_rules;
  v_reserved public.reserved_usernames;
  v_count int;
BEGIN
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'empty');
  END IF;

  SELECT * INTO v_rules FROM public.username_rules WHERE id = true;

  IF length(v_normalized) < v_rules.min_username_length THEN
    RETURN jsonb_build_object('available', false, 'reason', 'too_short');
  END IF;

  IF length(v_normalized) > v_rules.max_username_length THEN
    RETURN jsonb_build_object('available', false, 'reason', 'too_long');
  END IF;

  IF NOT v_normalized ~ v_rules.allowed_pattern THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid');
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles p
  WHERE lower(p.username) = v_normalized
    AND (p_user_id IS NULL OR p.id <> p_user_id);

  IF v_count > 0 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'taken');
  END IF;

  SELECT * INTO v_reserved FROM public.reserved_usernames
  WHERE username = v_normalized;

  IF FOUND THEN
    IF v_reserved.released_to IS NOT NULL AND v_reserved.released_to = p_user_id THEN
      RETURN jsonb_build_object('available', true, 'reason', 'ok');
    END IF;

    RETURN jsonb_build_object(
      'available', false,
      'reason', CASE v_reserved.category
        WHEN 'celebrity' THEN 'reserved_celebrity'
        WHEN 'brand' THEN 'reserved_brand'
        WHEN 'short' THEN 'reserved_short'
        WHEN 'system' THEN 'reserved_system'
        ELSE 'reserved'
      END,
      'category', v_reserved.category
    );
  END IF;

  IF length(v_normalized) <= v_rules.reserved_max_short_length THEN
    RETURN jsonb_build_object('available', false, 'reason', 'reserved_short');
  END IF;

  RETURN jsonb_build_object('available', true, 'reason', 'ok');
END;
$$;

-- ============================================================
-- 4. Updated is_reserved_username — queries table instead of hardcoded array
-- ============================================================
DROP FUNCTION IF EXISTS public.is_reserved_username(text);

CREATE OR REPLACE FUNCTION public.is_reserved_username(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reserved_usernames
    WHERE username = lower(trim(p_username))
  );
$$;

-- ============================================================
-- 5. Updated is_username_available — delegates to check_username_availability
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_username_available(
  p_username text,
  p_current_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (public.check_username_availability(p_username, p_current_user_id)->>'available')::boolean,
    false
  );
$$;

-- ============================================================
-- 6. Updated change_username — better error messages
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_username(p_username text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(p_username));
  v_old text;
  v_profile public.profiles;
  v_check jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_check := public.check_username_availability(v_username, v_user_id);

  IF NOT COALESCE((v_check->>'available')::boolean, false) THEN
    RAISE EXCEPTION 'username_unavailable: %', v_check->>'reason';
  END IF;

  SELECT username INTO v_old FROM public.profiles WHERE id = v_user_id;
  IF lower(coalesce(v_old, '')) = v_username THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    RETURN v_profile;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.username_change_history
    WHERE user_id = v_user_id
      AND changed_at > now() - interval '14 days'
  ) THEN
    RAISE EXCEPTION 'username_cooldown';
  END IF;

  UPDATE public.profiles
  SET username = v_username,
      updated_at = now()
  WHERE id = v_user_id
  RETURNING * INTO v_profile;

  INSERT INTO public.username_change_history(user_id, old_username, new_username)
  VALUES (v_user_id, v_old, v_username);

  RETURN v_profile;
END;
$$;

-- ============================================================
-- 7. Trigger — enforce reservation on profiles INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_username_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
  v_is_admin boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  v_check := public.check_username_availability(NEW.username, NEW.id);

  IF NOT COALESCE((v_check->>'available')::boolean, false) THEN
    RAISE EXCEPTION 'username_reserved: %', v_check->>'reason';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_username_reservation_trigger ON public.profiles;
CREATE TRIGGER enforce_username_reservation_trigger
  BEFORE INSERT OR UPDATE OF username
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_reservation();

-- ============================================================
-- 8. Admin functions
-- ============================================================

-- admin_reserve_username
CREATE OR REPLACE FUNCTION public.admin_reserve_username(
  p_username text,
  p_category text,
  p_reason text DEFAULT NULL
)
RETURNS public.reserved_usernames
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved public.reserved_usernames;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  INSERT INTO public.reserved_usernames (username, category, reason, reserved_by)
  VALUES (lower(trim(p_username)), p_category, p_reason, auth.uid())
  ON CONFLICT (username) DO UPDATE SET
    category = EXCLUDED.category,
    reason = COALESCE(p_reason, public.reserved_usernames.reason),
    reserved_by = auth.uid(),
    reserved_at = now(),
    released_to = NULL,
    released_by = NULL,
    released_at = NULL
  RETURNING * INTO v_reserved;

  RETURN v_reserved;
END;
$$;

-- admin_bulk_reserve (drop first for safe idempotent recreate)
DROP FUNCTION IF EXISTS public.admin_bulk_reserve(text[], text, text);

CREATE OR REPLACE FUNCTION public.admin_bulk_reserve(
  p_usernames text[],
  p_category text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(inserted int, skipped int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  FOREACH v_username IN ARRAY p_usernames
  LOOP
    BEGIN
      INSERT INTO public.reserved_usernames (username, category, reason, reserved_by)
      VALUES (lower(trim(v_username)), p_category, p_reason, auth.uid())
      ON CONFLICT (username) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_skipped;
END;
$$;

-- admin_release_username_to_user
CREATE OR REPLACE FUNCTION public.admin_release_username_to_user(
  p_username text,
  p_target_user_id uuid
)
RETURNS public.reserved_usernames
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved public.reserved_usernames;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.reserved_usernames
  SET released_to = p_target_user_id,
      released_by = auth.uid(),
      released_at = now()
  WHERE username = lower(trim(p_username))
  RETURNING * INTO v_reserved;

  IF NOT FOUND THEN
    INSERT INTO public.reserved_usernames (username, category, reason, reserved_by, released_to, released_by, released_at)
    VALUES (lower(trim(p_username)), 'custom', 'Released to specific user', auth.uid(), p_target_user_id, auth.uid(), now())
    RETURNING * INTO v_reserved;
  END IF;

  RETURN v_reserved;
END;
$$;

-- admin_unreserve_username
CREATE OR REPLACE FUNCTION public.admin_unreserve_username(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  DELETE FROM public.reserved_usernames WHERE username = lower(trim(p_username));
  RETURN FOUND;
END;
$$;

-- ============================================================
-- 9. Seed system reserved usernames
-- ============================================================
INSERT INTO public.reserved_usernames (username, category, reason) VALUES
  ('admin', 'system', 'System reserved'),
  ('administrator', 'system', 'System reserved'),
  ('root', 'system', 'System reserved'),
  ('support', 'system', 'System reserved'),
  ('help', 'system', 'System reserved'),
  ('official', 'system', 'System reserved'),
  ('alsamos', 'system', 'System reserved'),
  ('api', 'system', 'System reserved'),
  ('auth', 'system', 'System reserved'),
  ('login', 'system', 'System reserved'),
  ('signup', 'system', 'System reserved'),
  ('settings', 'system', 'System reserved'),
  ('profile', 'system', 'System reserved'),
  ('user', 'system', 'System reserved'),
  ('channel', 'system', 'System reserved'),
  ('group', 'system', 'System reserved'),
  ('messages', 'system', 'System reserved'),
  ('market', 'system', 'System reserved'),
  ('payment', 'system', 'System reserved'),
  ('wallet', 'system', 'System reserved'),
  ('security', 'system', 'System reserved'),
  ('null', 'system', 'System reserved'),
  ('everyone', 'system', 'System reserved'),
  ('all', 'system', 'System reserved'),
  ('moderator', 'system', 'System reserved'),
  ('staff', 'system', 'System reserved'),
  ('test', 'system', 'System reserved')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 10. Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.check_username_availability(text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;
GRANT SELECT ON TABLE public.reserved_usernames TO authenticated, anon;
GRANT SELECT ON TABLE public.username_rules TO authenticated, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260714000001_seed_reserved_usernames.sql
-- SHA256 02adc3973ef8a43b5c7de316c1fb45fc28e12ba38cb93781c6c1eb1a13d59ef9
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.reserved_usernames (
  username citext PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('celebrity','brand','short','system','custom')),
  reason text,
  reserved_by uuid REFERENCES public.profiles(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_to uuid REFERENCES public.profiles(id),
  released_by uuid REFERENCES public.profiles(id),
  released_at timestamptz
);

ALTER TABLE public.reserved_usernames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Anyone can read reserved usernames"
  ON public.reserved_usernames FOR SELECT
  USING (true);

-- Seed reserved usernames from the curated list (celebrity + brand).
-- The authoritative source is assets/data/reserved_usernames_seed.json.
-- The corporation can extend this at any time via admin_bulk_reserve().
--
-- Insertion is idempotent (ON CONFLICT DO NOTHING) so it's safe to re-run.
-- Handles already-owned handles: if a real Alsamos user already registered
-- one of these names, the INSERT is silently skipped.

INSERT INTO public.reserved_usernames (username, category, reason) VALUES
  -- Celebrity accounts
  ('cristiano', 'celebrity', 'famous_account'),
  ('leomessi', 'celebrity', 'famous_account'),
  ('selenagomez', 'celebrity', 'famous_account'),
  ('therock', 'celebrity', 'famous_account'),
  ('kyliejenner', 'celebrity', 'famous_account'),
  ('arianagrande', 'celebrity', 'famous_account'),
  ('kimkardashian', 'celebrity', 'famous_account'),
  ('beyonce', 'celebrity', 'famous_account'),
  ('khloekardashian', 'celebrity', 'famous_account'),
  ('justinbieber', 'celebrity', 'famous_account'),
  ('kendalljenner', 'celebrity', 'famous_account'),
  ('taylorswift', 'celebrity', 'famous_account'),
  ('virat.kohli', 'celebrity', 'famous_account'),
  ('jlo', 'celebrity', 'famous_account'),
  ('nickiminaj', 'celebrity', 'famous_account'),
  ('kourtneykardash', 'celebrity', 'famous_account'),
  ('mileycyrus', 'celebrity', 'famous_account'),
  ('katyperry', 'celebrity', 'famous_account'),
  ('kevinhart4real', 'celebrity', 'famous_account'),
  ('ddlovato', 'celebrity', 'famous_account'),
  ('neymarjr', 'celebrity', 'famous_account'),
  ('rihanna', 'celebrity', 'famous_account'),
  ('zendaya', 'celebrity', 'famous_account'),
  ('drake', 'celebrity', 'famous_account'),
  ('shakira', 'celebrity', 'famous_account'),
  ('davidbeckham', 'celebrity', 'famous_account'),
  ('ladygaga', 'celebrity', 'famous_account'),
  ('eminem', 'celebrity', 'famous_account'),
  ('kanyewest', 'celebrity', 'famous_account'),
  ('snoopdogg', 'celebrity', 'famous_account'),
  ('travisscott', 'celebrity', 'famous_account'),
  ('billieeilish', 'celebrity', 'famous_account'),
  ('dualipa', 'celebrity', 'famous_account'),
  ('theweeknd', 'celebrity', 'famous_account'),
  ('postmalone', 'celebrity', 'famous_account'),
  ('iamcardib', 'celebrity', 'famous_account'),
  ('oliviarodrigo', 'celebrity', 'famous_account'),
  ('dojacat', 'celebrity', 'famous_account'),
  ('lizzo', 'celebrity', 'famous_account'),
  ('shawnmendes', 'celebrity', 'famous_account'),
  ('camila_cabello', 'celebrity', 'famous_account'),
  ('edsheeran', 'celebrity', 'famous_account'),
  ('brunomars', 'celebrity', 'famous_account'),
  ('kingjames', 'celebrity', 'famous_account'),
  ('stephencurry30', 'celebrity', 'famous_account'),
  ('willsmith', 'celebrity', 'famous_account'),
  ('oprah', 'celebrity', 'famous_account'),
  ('britneyspears', 'celebrity', 'famous_account'),
  ('elonmusk', 'celebrity', 'famous_account'),
  ('barackobama', 'celebrity', 'famous_account'),
  ('khaby.lame', 'celebrity', 'famous_account'),
  ('charlidamelio', 'celebrity', 'famous_account'),
  ('bellapoarch', 'celebrity', 'famous_account'),
  ('addisonre', 'celebrity', 'famous_account'),
  ('zachking', 'celebrity', 'famous_account'),
  ('mrbeast', 'celebrity', 'famous_account'),
  ('pewdiepie', 'celebrity', 'famous_account'),
  ('jungkook', 'celebrity', 'famous_account'),
  ('lalalalisa_m', 'celebrity', 'famous_account'),
  ('vinijr', 'celebrity', 'famous_account'),
  ('badgalriri', 'celebrity', 'famous_account'),
  ('chrisbrownofficial', 'celebrity', 'famous_account'),
  ('vindiesel', 'celebrity', 'famous_account'),
  ('ye', 'celebrity', 'famous_account'),
  ('usainbolt', 'celebrity', 'famous_account'),
  ('sergioramos', 'celebrity', 'famous_account'),
  ('kevindurant', 'celebrity', 'famous_account'),
  ('jimmyfallon', 'celebrity', 'famous_account'),
  ('narendramodi', 'celebrity', 'famous_account'),
  ('realdonaldtrump', 'celebrity', 'famous_account'),
  ('dixiedamelio', 'celebrity', 'famous_account'),
  ('kimberly.loaiza', 'celebrity', 'famous_account'),

  -- Brand / organisation accounts
  ('nike', 'brand', 'famous_account'),
  ('adidas', 'brand', 'famous_account'),
  ('gucci', 'brand', 'famous_account'),
  ('louisvuitton', 'brand', 'famous_account'),
  ('zara', 'brand', 'famous_account'),
  ('hm', 'brand', 'famous_account'),
  ('cocacola', 'brand', 'famous_account'),
  ('pepsi', 'brand', 'famous_account'),
  ('mcdonalds', 'brand', 'famous_account'),
  ('starbucks', 'brand', 'famous_account'),
  ('google', 'brand', 'famous_account'),
  ('apple', 'brand', 'famous_account'),
  ('microsoft', 'brand', 'famous_account'),
  ('amazon', 'brand', 'famous_account'),
  ('samsung', 'brand', 'famous_account'),
  ('tesla', 'brand', 'famous_account'),
  ('netflix', 'brand', 'famous_account'),
  ('spotify', 'brand', 'famous_account'),
  ('youtube', 'brand', 'famous_account'),
  ('facebook', 'brand', 'famous_account'),
  ('meta', 'brand', 'famous_account'),
  ('whatsapp', 'brand', 'famous_account'),
  ('telegram', 'brand', 'famous_account'),
  ('twitter', 'brand', 'famous_account'),
  ('tiktok', 'brand', 'famous_account'),
  ('snapchat', 'brand', 'famous_account'),
  ('playstation', 'brand', 'famous_account'),
  ('xbox', 'brand', 'famous_account'),
  ('nintendo', 'brand', 'famous_account'),
  ('marvel', 'brand', 'famous_account'),
  ('disney', 'brand', 'famous_account'),
  ('pixar', 'brand', 'famous_account'),
  ('nasa', 'brand', 'famous_account'),
  ('natgeo', 'brand', 'famous_account'),
  ('cnn', 'brand', 'famous_account'),
  ('bbc', 'brand', 'famous_account'),
  ('nba', 'brand', 'famous_account'),
  ('nfl', 'brand', 'famous_account'),
  ('fifa', 'brand', 'famous_account'),
  ('realmadrid', 'brand', 'famous_account'),
  ('fcbarcelona', 'brand', 'famous_account'),
  ('manchesterunited', 'brand', 'famous_account'),
  ('formula1', 'brand', 'famous_account'),
  ('ferrari', 'brand', 'famous_account'),
  ('lamborghini', 'brand', 'famous_account'),
  ('bmw', 'brand', 'famous_account'),
  ('mercedesbenz', 'brand', 'famous_account'),
  ('toyota', 'brand', 'famous_account'),
  ('coldplay', 'brand', 'famous_account'),
  ('maroon5', 'brand', 'famous_account'),
  ('imaginedragons', 'brand', 'famous_account'),
  ('chanel', 'brand', 'famous_account'),
  ('victoriassecret', 'brand', 'famous_account'),
  ('hbo', 'brand', 'famous_account'),
  ('wwe', 'brand', 'famous_account'),
  ('spacex', 'brand', 'famous_account'),
  ('uefa', 'brand', 'famous_account'),
  ('championsleague', 'brand', 'famous_account'),
  ('nytimes', 'brand', 'famous_account'),
  ('bts_official', 'brand', 'famous_account'),
  ('blackpinkofficial', 'brand', 'famous_account'),
  ('chanelofficial', 'brand', 'famous_account'),
  ('disneyplus', 'brand', 'famous_account'),
  ('warnerbros', 'brand', 'famous_account'),
  ('tseries', 'brand', 'famous_account'),
  ('cocomelon', 'brand', 'famous_account'),
  ('setindia', 'brand', 'famous_account')
ON CONFLICT (username) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260716000000_telegram_stickers.sql
-- SHA256 53f8063dcffeaa4bdefb1927daaaebb785b356be1fd25d43b24eecfa2ab84d43
-- ============================================================================
-- Telegram-style animated stickers system
BEGIN;

CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  cover_url text,
  cover_lottie_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_animated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT ':)',
  image_url text,
  lottie_url text,
  video_url text,
  thumbnail_url text,
  type text NOT NULL CHECK (type IN ('static', 'animated', 'video')),
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_sticker_packs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE TABLE IF NOT EXISTS public.recent_stickers (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  use_count integer DEFAULT 1,
  last_used timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, sticker_id)
);

CREATE INDEX IF NOT EXISTS idx_stickers_pack_id ON public.stickers(pack_id);
CREATE INDEX IF NOT EXISTS idx_stickers_position ON public.stickers(pack_id, position);
CREATE INDEX IF NOT EXISTS idx_user_sticker_packs_user ON public.user_sticker_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sticker_packs_updated ON public.user_sticker_packs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_stickers_user ON public.recent_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_recent_stickers_last_used ON public.recent_stickers(user_id, last_used DESC);

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sticker packs are viewable by everyone" ON public.sticker_packs;
CREATE POLICY "Sticker packs are viewable by everyone"
ON public.sticker_packs
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Sticker packs insertable by authenticated users" ON public.sticker_packs;
CREATE POLICY "Sticker packs insertable by authenticated users"
ON public.sticker_packs
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Sticker packs updatable by creator" ON public.sticker_packs;
CREATE POLICY "Sticker packs updatable by creator"
ON public.sticker_packs
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Stickers are viewable by everyone" ON public.stickers;
CREATE POLICY "Stickers are viewable by everyone"
ON public.stickers
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Stickers insertable by pack creator" ON public.stickers;
CREATE POLICY "Stickers insertable by pack creator"
ON public.stickers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sticker_packs
    WHERE id = pack_id AND created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "User sticker packs viewable by owner" ON public.user_sticker_packs;
CREATE POLICY "User sticker packs viewable by owner"
ON public.user_sticker_packs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User sticker packs insertable by owner" ON public.user_sticker_packs;
CREATE POLICY "User sticker packs insertable by owner"
ON public.user_sticker_packs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User sticker packs deletable by owner" ON public.user_sticker_packs;
CREATE POLICY "User sticker packs deletable by owner"
ON public.user_sticker_packs
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Recent stickers viewable by owner" ON public.recent_stickers;
CREATE POLICY "Recent stickers viewable by owner"
ON public.recent_stickers
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Recent stickers insertable by owner" ON public.recent_stickers;
CREATE POLICY "Recent stickers insertable by owner"
ON public.recent_stickers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Recent stickers updatable by owner" ON public.recent_stickers;
CREATE POLICY "Recent stickers updatable by owner"
ON public.recent_stickers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Recent stickers deletable by owner" ON public.recent_stickers;
CREATE POLICY "Recent stickers deletable by owner"
ON public.recent_stickers
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sticker_packs_updated_at ON public.sticker_packs;
CREATE TRIGGER update_sticker_packs_updated_at
BEFORE UPDATE ON public.sticker_packs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_sticker_packs_updated_at ON public.user_sticker_packs;
CREATE TRIGGER update_user_sticker_packs_updated_at
BEFORE UPDATE ON public.user_sticker_packs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260716100000_fix_calls_realtime.sql
-- SHA256 217586d82daa0b42a6670a331486208183e592864d18ba337016e6ff125a5030
-- ============================================================================
-- Fix video/audio calls realtime issues
-- 1. Add missing foreign key for call_room_members
-- 2. Add missing error handling and logging
-- 3. Ensure all RLS policies are correct
-- 4. Add realtime publication for critical tables

BEGIN;

-- Fix call_room_members foreign key (missing in previous migration)
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'call_room_members_call_id_fkey'
  ) THEN
    ALTER TABLE public.call_room_members
      ADD CONSTRAINT call_room_members_call_id_fkey
      FOREIGN KEY (call_id)
      REFERENCES public.video_calls(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure call_room_members has proper indexes
CREATE INDEX IF NOT EXISTS idx_call_room_members_call_id
  ON public.call_room_members(call_id);

CREATE INDEX IF NOT EXISTS idx_call_room_members_user_id
  ON public.call_room_members(user_id);

-- Fix RLS policies for call_room_members
DROP POLICY IF EXISTS "Users write own call room member state" ON public.call_room_members;
CREATE POLICY "Users write own call room member state"
  ON public.call_room_members
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Call participants read room members" ON public.call_room_members;
CREATE POLICY "Call participants read room members"
  ON public.call_room_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.video_calls vc
      JOIN public.conversation_participants cp
        ON cp.conversation_id = vc.conversation_id
      WHERE vc.id = call_room_members.call_id
        AND cp.user_id = auth.uid()
    )
  );

-- Ensure call_participants has proper RLS for SELECT
DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;
CREATE POLICY "Call participants viewable"
  ON public.call_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.video_calls vc
      JOIN public.conversation_participants cp
        ON cp.conversation_id = vc.conversation_id
      WHERE vc.id = call_participants.call_id
        AND cp.user_id = auth.uid()
    )
  );

-- Fix video_calls RLS policy
DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;
CREATE POLICY "Calls viewable by participants"
  ON public.video_calls
  FOR SELECT
  TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = video_calls.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- Ensure video_calls can be updated by host
DROP POLICY IF EXISTS "Call host can update call" ON public.video_calls;
CREATE POLICY "Call host can update call"
  ON public.video_calls
  FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- Add realtime publication for call_room_members if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_room_members;
  END IF;
END $$;

-- Create helper function to check if user can view call
CREATE OR REPLACE FUNCTION public.can_view_call(p_call_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.video_calls vc
    JOIN public.conversation_participants cp
      ON cp.conversation_id = vc.conversation_id
    WHERE vc.id = p_call_id
      AND (vc.host_id = p_user_id OR cp.user_id = p_user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid) TO authenticated;

-- Improve create_video_call function with better error handling
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
BEGIN
  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'User must be logged in to create a call';
  END IF;

  -- Validate call type
  IF p_call_type NOT IN ('audio', 'video', 'screen') THEN
    RAISE EXCEPTION 'invalid_call_type' USING HINT = 'Call type must be audio, video, or screen';
  END IF;

  -- Validate user is conversation participant
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_conversation_participant' USING HINT = 'User must be a participant in the conversation';
  END IF;

  -- Create video call
  INSERT INTO public.video_calls (
    conversation_id,
    host_id,
    call_type,
    status,
    started_at
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    p_call_type,
    'active',
    now()
  )
  RETURNING id INTO v_call_id;

  -- Add host as participant
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
    p_is_video_on,
    false,
    false,
    'connecting',
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    joined_at = excluded.joined_at,
    left_at = NULL,
    is_video_on = excluded.is_video_on,
    connection_state = 'connecting',
    last_seen_at = now();

  -- Add to call_room_members
  INSERT INTO public.call_room_members (
    call_id,
    user_id,
    role,
    connection_state,
    media_state,
    joined_at,
    updated_at
  )
  VALUES (
    v_call_id,
    v_user_id,
    'host',
    'connecting',
    jsonb_build_object(
      'is_muted', false,
      'is_video_on', p_is_video_on,
      'is_screen_sharing', false,
      'is_hand_raised', false
    ),
    now(),
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    connection_state = 'connecting',
    left_at = NULL,
    updated_at = now();

  RETURN v_call_id;
END;
$$;

-- Add trigger to sync call_participants to call_room_members
CREATE OR REPLACE FUNCTION public.sync_call_participant_to_room_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
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
      NEW.call_id,
      NEW.user_id,
      COALESCE(
        (SELECT 'host' FROM public.video_calls WHERE id = NEW.call_id AND host_id = NEW.user_id),
        'participant'
      ),
      COALESCE(NEW.connection_state, 'connecting'),
      jsonb_build_object(
        'is_muted', COALESCE(NEW.is_muted, false),
        'is_video_on', COALESCE(NEW.is_video_on, true),
        'is_screen_sharing', COALESCE(NEW.is_screen_sharing, false),
        'is_hand_raised', COALESCE(NEW.is_hand_raised, false)
      ),
      NEW.joined_at,
      NEW.left_at,
      now()
    )
    ON CONFLICT (call_id, user_id) DO UPDATE SET
      connection_state = COALESCE(NEW.connection_state, call_room_members.connection_state),
      media_state = jsonb_build_object(
        'is_muted', COALESCE(NEW.is_muted, false),
        'is_video_on', COALESCE(NEW.is_video_on, true),
        'is_screen_sharing', COALESCE(NEW.is_screen_sharing, false),
        'is_hand_raised', COALESCE(NEW.is_hand_raised, false)
      ),
      left_at = NEW.left_at,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_call_participant_trigger ON public.call_participants;
CREATE TRIGGER sync_call_participant_trigger
  AFTER INSERT OR UPDATE ON public.call_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_call_participant_to_room_member();

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260716110000_add_default_turn_servers.sql
-- SHA256 2d2be156176d04ff01c073837c212ef9b73b9dd1f0231e2a7978a786aa48be53
-- ============================================================================
-- Add default TURN/STUN servers for WebRTC calls
-- This ensures calls work across NAT/firewalls without env config

BEGIN;

-- Insert default ICE servers configuration
-- Uses free public STUN servers + Metered TURN (free tier)
INSERT INTO public.call_webrtc_config (key, value, updated_at)
VALUES (
  'ice_servers',
  '{
    "iceServers": [
      {
        "urls": "stun:stun.l.google.com:19302"
      },
      {
        "urls": "stun:stun1.l.google.com:19302"
      },
      {
        "urls": "stun:stun2.l.google.com:19302"
      },
      {
        "urls": [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp"
        ],
        "username": "openrelayproject",
        "credential": "openrelayproject"
      },
      {
        "urls": [
          "turn:a.relay.metered.ca:80",
          "turn:a.relay.metered.ca:80?transport=tcp",
          "turn:a.relay.metered.ca:443",
          "turn:a.relay.metered.ca:443?transport=tcp",
          "turns:a.relay.metered.ca:443?transport=tcp"
        ],
        "username": "e46d064e3c1b60019d6052e1",
        "credential": "BGmFZmMFZ2rQnPCP"
      }
    ]
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- Add comment explaining the configuration
COMMENT ON TABLE public.call_webrtc_config IS
'WebRTC ICE server configuration for video/audio calls.
Contains STUN servers (for discovering public IP) and TURN servers (for relaying traffic through NAT/firewalls).
Default config uses free public servers - replace with your own for production.';

COMMIT;

-- IMPORTANT NOTES FOR PRODUCTION:
-- 1. Replace Metered TURN credentials with your own (get free tier at https://www.metered.ca/tools/openrelay/)
-- 2. Or use Twilio TURN (https://www.twilio.com/stun-turn)
-- 3. Or host your own Coturn server (https://github.com/coturn/coturn)
-- 4. Monitor TURN usage - free tiers have bandwidth limits
-- 5. For high-traffic production, use dedicated TURN infrastructure

-- To update ICE servers via SQL:
-- UPDATE call_webrtc_config
-- SET value = '{"iceServers": [...your servers...]}'::jsonb
-- WHERE key = 'ice_servers';

-- To verify current config:
-- SELECT value FROM call_webrtc_config WHERE key = 'ice_servers';


-- ============================================================================
-- SOURCE A-superapp: 20260716120000_fix_call_room_members_rls.sql
-- SHA256 e3876874e93f135e9bbd1d71f7f99c4c2b5d665a3c8096b426b8abcd2ff8806c
-- ============================================================================
-- Fix infinite recursion in call_room_members RLS policy
-- The previous policy referenced video_calls -> conversation_participants
-- which could trigger recursive policy evaluation.
-- Solution: use the SECURITY DEFINER helper function can_view_call() which
-- bypasses RLS internally, or simplify to direct user_id check.

BEGIN;

-- Drop the problematic SELECT policy that causes infinite recursion
DROP POLICY IF EXISTS "Call participants read room members" ON public.call_room_members;

-- Replace with a simple policy: users can read room members for calls they participate in
-- Uses the existing SECURITY DEFINER function to avoid RLS recursion
CREATE POLICY "Call participants read room members"
  ON public.call_room_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_view_call(call_id, auth.uid())
  );

-- Also fix the FOR ALL policy — split into specific operations to be explicit
DROP POLICY IF EXISTS "Users write own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users insert own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users update own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users delete own call room member state" ON public.call_room_members;

CREATE POLICY "Users insert own call room member state"
  ON public.call_room_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own call room member state"
  ON public.call_room_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own call room member state"
  ON public.call_room_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260716133000_fix_call_accept_rpc.sql
-- SHA256 d6cdaf44fcecad9ec6dcf3cd373947cc2e809abf1af9f02c094008a7ab210b46
-- ============================================================================
BEGIN;

ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'connecting',
  ADD COLUMN IF NOT EXISTS network_quality text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS screen_share_track_id text;

CREATE INDEX IF NOT EXISTS idx_call_participants_call_user
  ON public.call_participants(call_id, user_id);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_state
  ON public.call_participants(call_id, connection_state, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.call_room_members (
  call_id uuid NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant',
  connection_state text NOT NULL DEFAULT 'connecting',
  media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

ALTER TABLE public.call_room_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_call_room_members_call_id
  ON public.call_room_members(call_id);

CREATE INDEX IF NOT EXISTS idx_call_room_members_user_id
  ON public.call_room_members(user_id);

CREATE OR REPLACE FUNCTION public.can_view_call(p_call_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.video_calls vc
    JOIN public.conversation_participants cp
      ON cp.conversation_id = vc.conversation_id
    WHERE vc.id = p_call_id
      AND (vc.host_id = p_user_id OR cp.user_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.join_video_call(
  p_call_id uuid,
  p_is_video_on boolean DEFAULT true
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
    NULL,
    false,
    p_is_video_on,
    false,
    false,
    'connecting',
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    joined_at = COALESCE(public.call_participants.joined_at, excluded.joined_at),
    left_at = NULL,
    is_video_on = excluded.is_video_on,
    connection_state = 'connecting',
    last_seen_at = now();
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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
    NULL,
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_video_call(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_video_call(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_call_participant_to_room_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    NEW.call_id,
    NEW.user_id,
    COALESCE(
      (
        SELECT 'host'
        FROM public.video_calls
        WHERE id = NEW.call_id
          AND host_id = NEW.user_id
      ),
      'participant'
    ),
    COALESCE(NEW.connection_state, 'connecting'),
    jsonb_build_object(
      'is_muted', COALESCE(NEW.is_muted, false),
      'is_video_on', COALESCE(NEW.is_video_on, true),
      'is_screen_sharing', COALESCE(NEW.is_screen_sharing, false),
      'is_hand_raised', COALESCE(NEW.is_hand_raised, false)
    ),
    NEW.joined_at,
    NEW.left_at,
    now()
  )
  ON CONFLICT (call_id, user_id) DO UPDATE SET
    connection_state = EXCLUDED.connection_state,
    media_state = EXCLUDED.media_state,
    left_at = EXCLUDED.left_at,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_call_participant_trigger ON public.call_participants;
CREATE TRIGGER sync_call_participant_trigger
  AFTER INSERT OR UPDATE ON public.call_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_call_participant_to_room_member();

DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;
CREATE POLICY "Call participants viewable"
  ON public.call_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_view_call(call_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can join calls" ON public.call_participants;
CREATE POLICY "Users can join calls"
  ON public.call_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_view_call(call_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own participation" ON public.call_participants;
CREATE POLICY "Users can update own participation"
  ON public.call_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Call host can invite conversation participants" ON public.call_participants;
CREATE POLICY "Call host can invite conversation participants"
  ON public.call_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.video_calls vc
      JOIN public.conversation_participants cp
        ON cp.conversation_id = vc.conversation_id
       AND cp.user_id = call_participants.user_id
      WHERE vc.id = call_participants.call_id
        AND vc.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;
CREATE POLICY "Calls viewable by participants"
  ON public.video_calls
  FOR SELECT
  TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = video_calls.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Call participants read room members" ON public.call_room_members;
CREATE POLICY "Call participants read room members"
  ON public.call_room_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_view_call(call_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users write own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users insert own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users update own call room member state" ON public.call_room_members;
DROP POLICY IF EXISTS "Users delete own call room member state" ON public.call_room_members;

CREATE POLICY "Users insert own call room member state"
  ON public.call_room_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own call room member state"
  ON public.call_room_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own call room member state"
  ON public.call_room_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'video_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_calls;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_room_members;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260716150000_content_engine_foundation.sql
-- SHA256 64afd932e9bd3b0eda4f2954cb39d871a34d8b69f4ac566e7a523291b6097912
-- ============================================================================
BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS effects_used text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_lat double precision,
  ADD COLUMN IF NOT EXISTS location_lng double precision,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_geohash text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'tags'
  ) THEN
    UPDATE public.posts
    SET hashtags = tags
    WHERE (hashtags IS NULL OR hashtags = '{}'::text[])
      AND tags IS NOT NULL
      AND tags <> '{}'::text[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_content_type_created
  ON public.posts(content_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_hashtags_gin
  ON public.posts USING GIN(hashtags)
  WHERE hashtags IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_location_lat_lng
  ON public.posts(location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_location_geohash
  ON public.posts(location_geohash)
  WHERE location_geohash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.post_product_tags (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  tagged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  position jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_id)
);

ALTER TABLE public.post_product_tags
  ADD COLUMN IF NOT EXISTS position jsonb;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'post_product_tags_product_id_fkey'
         AND conrelid = 'public.post_product_tags'::regclass
     ) THEN
    ALTER TABLE public.post_product_tags
      ADD CONSTRAINT post_product_tags_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.products(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_product_tags_product
  ON public.post_product_tags(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_product_tags_post
  ON public.post_product_tags(post_id);

ALTER TABLE public.post_product_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public product tags are readable" ON public.post_product_tags;
CREATE POLICY "Public product tags are readable"
  ON public.post_product_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_product_tags.post_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Post owners manage product tags" ON public.post_product_tags;
CREATE POLICY "Post owners manage product tags"
  ON public.post_product_tags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_product_tags.post_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_product_tags.post_id
        AND p.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.post_hashtags (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  hashtag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, hashtag)
);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_created
  ON public.post_hashtags(hashtag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_post
  ON public.post_hashtags(post_id);

ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public hashtags are readable" ON public.post_hashtags;
CREATE POLICY "Public hashtags are readable"
  ON public.post_hashtags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_hashtags.post_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Post owners manage hashtags" ON public.post_hashtags;
CREATE POLICY "Post owners manage hashtags"
  ON public.post_hashtags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_hashtags.post_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_hashtags.post_id
        AND p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.sync_post_hashtags_from_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag text;
  v_hashtags text[];
BEGIN
  DELETE FROM public.post_hashtags WHERE post_id = NEW.id;

  SELECT array_agg(value)
  INTO v_hashtags
  FROM jsonb_array_elements_text(COALESCE(to_jsonb(NEW)->'hashtags', '[]'::jsonb)) AS value;

  IF (v_hashtags IS NULL OR v_hashtags = '{}'::text[]) THEN
    SELECT array_agg(value)
    INTO v_hashtags
    FROM jsonb_array_elements_text(COALESCE(to_jsonb(NEW)->'tags', '[]'::jsonb)) AS value;
  END IF;

  IF v_hashtags IS NOT NULL THEN
    FOREACH v_tag IN ARRAY v_hashtags
    LOOP
      v_tag := lower(regexp_replace(trim(v_tag), '^#', ''));
      IF v_tag <> '' THEN
        INSERT INTO public.post_hashtags(post_id, hashtag)
        VALUES (NEW.id, v_tag)
        ON CONFLICT (post_id, hashtag) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_post_hashtags_trigger ON public.posts;
CREATE TRIGGER sync_post_hashtags_trigger
  AFTER INSERT OR UPDATE
  ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_post_hashtags_from_posts();

INSERT INTO public.post_hashtags(post_id, hashtag)
SELECT p.id, lower(regexp_replace(trim(tag), '^#', ''))
FROM public.posts p
CROSS JOIN LATERAL unnest(p.hashtags) AS tag
WHERE p.hashtags IS NOT NULL
  AND trim(tag) <> ''
ON CONFLICT (post_id, hashtag) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_product_tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_product_tags;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_hashtags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_hashtags;
  END IF;
END $$;

-- RLS audit: post_product_tags and post_hashtags expose public post metadata
-- publicly, while write access remains limited to the owner of the parent post.

COMMIT;

NOTIFY pgrst, 'reload schema';

