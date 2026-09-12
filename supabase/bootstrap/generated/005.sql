-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260712130000_add_search_indexes_and_tags.sql
-- SHA256 fb0d3bbfb16f9c6b9ae9a1e0ff55a628b2cfefd07a22f8c68d34ed597f5b77eb
-- ============================================================================
-- Search Enhancement Migration
-- Adds full-text search indexes and tags/hashtags functionality
-- Project: mbhjganbihamoiqmankv.supabase.co
-- Date: 2026-07-12
-- Run AFTER: 20260712120000_comprehensive_schema_sync.sql

-- ============================================================================
-- Full-text search indexes for posts
-- ============================================================================

-- Add tsvector column for efficient full-text search
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS content_search tsvector 
GENERATED ALWAYS AS (to_tsvector('english', COALESCE(content, ''))) STORED;

-- Create GIN index on tsvector column
CREATE INDEX IF NOT EXISTS idx_posts_content_search 
ON posts USING GIN(content_search);

-- Index for tag-based search (already exists from previous migration but ensuring it's there)
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin 
ON posts USING GIN(tags) 
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

COMMENT ON COLUMN posts.content_search IS 'Generated tsvector for full-text search on content';

-- ============================================================================
-- Products table: Ensure search-compatible columns exist
-- ============================================================================

-- Verify products table has required columns (add if missing)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' 
CHECK (status IN ('active', 'draft', 'sold', 'deleted'));

-- Add tsvector for products search
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(description, '')
  )
) STORED;

-- Create GIN index on products search vector
CREATE INDEX IF NOT EXISTS idx_products_search_vector 
ON products USING GIN(search_vector);

-- Index for products status (for active filtering)
CREATE INDEX IF NOT EXISTS idx_products_status 
ON products(status);

COMMENT ON COLUMN products.search_vector IS 'Generated tsvector for full-text search on title and description';

-- ============================================================================
-- Materialized view for hashtags/tags aggregation
-- ============================================================================

-- Create materialized view that aggregates tags from posts
CREATE MATERIALIZED VIEW IF NOT EXISTS hashtags_aggregated AS
SELECT 
  UNNEST(tags) AS tag,
  COUNT(*) AS post_count,
  MAX(created_at) AS last_used_at
FROM posts
WHERE 
  tags IS NOT NULL 
  AND array_length(tags, 1) > 0
  AND visibility = 'public'
  AND (moderation_status IS NULL OR moderation_status = 'approved')
GROUP BY UNNEST(tags)
ORDER BY post_count DESC;

-- Create unique index on tag for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_hashtags_aggregated_tag 
ON hashtags_aggregated(tag);

-- Index for sorting by popularity
CREATE INDEX IF NOT EXISTS idx_hashtags_aggregated_count 
ON hashtags_aggregated(post_count DESC);

-- Index for sorting by recency
CREATE INDEX IF NOT EXISTS idx_hashtags_aggregated_last_used 
ON hashtags_aggregated(last_used_at DESC);

COMMENT ON MATERIALIZED VIEW hashtags_aggregated IS 'Aggregated hashtag statistics from posts.tags array';

-- ============================================================================
-- Function to refresh hashtags (call after bulk post operations)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_hashtags_aggregated()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY hashtags_aggregated;
END;
$$;

COMMENT ON FUNCTION refresh_hashtags_aggregated() IS 'Refreshes the hashtags_aggregated materialized view. Call periodically or after bulk operations.';

-- Initial refresh
REFRESH MATERIALIZED VIEW hashtags_aggregated;

-- ============================================================================
-- RLS for hashtags_aggregated (read-only, public)
-- ============================================================================

ALTER MATERIALIZED VIEW hashtags_aggregated OWNER TO postgres;

-- Note: Materialized views don't support RLS directly, but we can create a view wrapper
CREATE OR REPLACE VIEW hashtags AS
SELECT tag, post_count, last_used_at
FROM hashtags_aggregated
ORDER BY post_count DESC;

COMMENT ON VIEW hashtags IS 'Public read-only view of aggregated hashtags';

-- ============================================================================
-- Helper function: Extract hashtags from text
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_hashtags(content text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  matches text[];
BEGIN
  -- Extract all words starting with # (excluding the #)
  SELECT array_agg(DISTINCT LOWER(SUBSTRING(match FROM 2)))
  INTO matches
  FROM regexp_matches(content, '#([a-zA-Z0-9_]+)', 'g') AS match;
  
  RETURN COALESCE(matches, ARRAY[]::text[]);
END;
$$;

COMMENT ON FUNCTION extract_hashtags(text) IS 'Extracts hashtags from text content, returning array of lowercase tags without #';

-- ============================================================================
-- Trigger to auto-populate posts.tags from content
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_extract_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-extract tags from content if tags not explicitly set
  IF NEW.content IS NOT NULL AND (NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL) THEN
    NEW.tags := extract_hashtags(NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_extract_tags ON posts;
CREATE TRIGGER trigger_auto_extract_tags
  BEFORE INSERT OR UPDATE OF content
  ON posts
  FOR EACH ROW
  EXECUTE FUNCTION auto_extract_tags();

COMMENT ON FUNCTION auto_extract_tags() IS 'Automatically extracts hashtags from post content and populates tags array';

-- ============================================================================
-- Reload API schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712131000_add_search_tags_rpc.sql
-- SHA256 7c5215d54daa02eacdc4c753355ba0ad54917ff11f2f8d2149bc9bbce5fca63e
-- ============================================================================
-- RPC function for tag search (fallback when materialized view not available)
-- Project: mbhjganbihamoiqmankv.supabase.co
-- Date: 2026-07-12

CREATE OR REPLACE FUNCTION search_tags(search_term text)
RETURNS TABLE (
  tag text,
  post_count bigint,
  last_used_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    UNNEST(posts.tags) AS tag,
    COUNT(*) AS post_count,
    MAX(posts.created_at) AS last_used_at
  FROM posts
  WHERE 
    posts.tags IS NOT NULL 
    AND array_length(posts.tags, 1) > 0
    AND posts.visibility = 'public'
    AND (posts.moderation_status IS NULL OR posts.moderation_status = 'approved')
    AND UNNEST(posts.tags) ILIKE ('%' || search_term || '%')
  GROUP BY UNNEST(posts.tags)
  ORDER BY post_count DESC
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION search_tags(text) IS 'Searches for hashtags matching the search term, returns tag statistics';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION search_tags(text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_tags(text) TO anon;

-- Reload schema
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712140000_add_admin_role_system.sql
-- SHA256 f90f61a7914f2142c4fced8cf2d163279e9435fbd2206f8401469ed820f16e30
-- ============================================================================
-- Admin Role System Migration - CORRECTED
-- Adds is_admin column to profiles and sets up admin management
-- Project: mbhjganbihamoiqmankv.supabase.co
-- Date: 2026-07-12
-- IMPORTANT: Does NOT enable RLS on profiles (would break cross-user reads)

-- ============================================================================
-- Add is_admin column to profiles table
-- ============================================================================

-- Add is_admin boolean column (defaults to false for all users)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;

-- Create index for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin 
ON profiles(is_admin) 
WHERE is_admin = true;

COMMENT ON COLUMN profiles.is_admin IS 'Whether the user has admin privileges (admin panel access, moderation tools, etc.)';

-- ============================================================================
-- NOTE: We do NOT enable RLS on profiles table
-- Reason: Would break reading other users' profiles (search, creators, etc.)
-- Security: is_admin changes are protected via trigger (see end of file)
-- ============================================================================

-- ============================================================================
-- Admin management functions
-- ============================================================================

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_user_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  admin_status boolean;
BEGIN
  SELECT is_admin INTO admin_status
  FROM profiles
  WHERE id = user_id;
  
  RETURN COALESCE(admin_status, false);
END;
$$;

COMMENT ON FUNCTION is_user_admin(uuid) IS 'Checks if a user has admin privileges';

-- Grant execute to authenticated users (so they can check their own status)
GRANT EXECUTE ON FUNCTION is_user_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_admin(uuid) TO anon;

-- Function to grant admin role (only callable by existing admins)
CREATE OR REPLACE FUNCTION grant_admin_role(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO caller_is_admin
  FROM profiles
  WHERE id = auth.uid();
  
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Only admins can grant admin privileges';
  END IF;
  
  -- Grant admin to target user
  UPDATE profiles
  SET is_admin = true
  WHERE id = target_user_id;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION grant_admin_role(uuid) IS 'Grants admin role to a user. Only callable by existing admins.';

-- Grant execute to authenticated users (function enforces admin check internally)
GRANT EXECUTE ON FUNCTION grant_admin_role(uuid) TO authenticated;

-- Function to revoke admin role (only callable by existing admins)
CREATE OR REPLACE FUNCTION revoke_admin_role(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- Prevent revoking your own admin status
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own admin privileges';
  END IF;
  
  -- Check if caller is admin
  SELECT is_admin INTO caller_is_admin
  FROM profiles
  WHERE id = auth.uid();
  
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Only admins can revoke admin privileges';
  END IF;
  
  -- Revoke admin from target user
  UPDATE profiles
  SET is_admin = false
  WHERE id = target_user_id;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION revoke_admin_role(uuid) IS 'Revokes admin role from a user. Only callable by existing admins. Cannot revoke own admin.';

-- Grant execute to authenticated users (function enforces admin check internally)
GRANT EXECUTE ON FUNCTION revoke_admin_role(uuid) TO authenticated;

-- ============================================================================
-- Set initial admin (CHANGE THIS TO YOUR ADMIN USER ID)
-- ============================================================================

-- IMPORTANT: Replace 'YOUR_ADMIN_USER_ID_HERE' with the actual UUID of your admin user
-- You can find your user ID by running: SELECT id FROM auth.users WHERE email = 'your_email@example.com';
-- 
-- Example:
-- UPDATE profiles SET is_admin = true WHERE id = '12345678-1234-1234-1234-123456789012';
--
-- OR set by username:
-- UPDATE profiles SET is_admin = true WHERE username = 'admin';

-- Uncomment and modify one of these lines after determining your admin user:
-- UPDATE profiles SET is_admin = true WHERE id = 'YOUR_ADMIN_USER_ID_HERE';
-- UPDATE profiles SET is_admin = true WHERE username = 'YOUR_USERNAME_HERE';

-- ============================================================================
-- Admin audit log table (separate table, safe to enable RLS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for querying actions by admin
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id 
ON admin_actions(admin_id, created_at DESC);

-- Index for querying actions by target
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_id 
ON admin_actions(target_id, created_at DESC);

COMMENT ON TABLE admin_actions IS 'Audit log for admin actions (for accountability and debugging)';

-- RLS: Only admins can read the audit log
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Drop old policy if it exists, then create new one
-- Note: PostgreSQL does NOT support CREATE POLICY IF NOT EXISTS
DROP POLICY IF EXISTS "Only admins can read audit log" ON admin_actions;

CREATE POLICY "Only admins can read audit log"
ON admin_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Function to log admin actions (automatically called by admin functions)
CREATE OR REPLACE FUNCTION log_admin_action(
  action_type text,
  target_user_id uuid DEFAULT NULL,
  action_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO admin_actions (admin_id, action, target_id, details)
  VALUES (auth.uid(), action_type, target_user_id, action_details);
END;
$$;

COMMENT ON FUNCTION log_admin_action(text, uuid, jsonb) IS 'Logs admin actions for audit trail';

-- ============================================================================
-- Security: Prevent self-escalation (users cannot set their own is_admin)
-- ============================================================================

-- Trigger function to block unauthorized is_admin changes
CREATE OR REPLACE FUNCTION prevent_admin_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- If is_admin column is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Check if caller is already an admin
    SELECT is_admin INTO caller_is_admin
    FROM profiles
    WHERE id = auth.uid();
    
    -- If caller is not an admin, block the change
    IF NOT COALESCE(caller_is_admin, false) THEN
      RAISE EXCEPTION 'Only admins can change admin status. Use grant_admin_role() or revoke_admin_role() functions.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_admin_self_escalation() IS 'Prevents non-admins from setting their own is_admin flag';

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS trigger_prevent_admin_self_escalation ON profiles;

CREATE TRIGGER trigger_prevent_admin_self_escalation
  BEFORE UPDATE OF is_admin ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_self_escalation();

-- ============================================================================
-- Reload API schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712150000_batch3_media_content.sql
-- SHA256 053ffcbbea713c6ea71638a782978dac2f5cf1b23454ef3b910c7a7d96a87e71
-- ============================================================================
BEGIN;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin ON public.messages USING gin (metadata);

CREATE TABLE IF NOT EXISTS public.message_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  album_id text,
  url text NOT NULL,
  thumbnail_url text,
  media_type text NOT NULL,
  file_name text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_ms integer,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_media_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_media_items_message_pos ON public.message_media_items(message_id, position);
CREATE INDEX IF NOT EXISTS idx_message_media_items_album ON public.message_media_items(album_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_media_items_message_url ON public.message_media_items(message_id, url);
DROP POLICY IF EXISTS "Participants view media items" ON public.message_media_items;
CREATE POLICY "Participants view media items" ON public.message_media_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE m.id = message_media_items.message_id AND cp.user_id = auth.uid()
));
DROP POLICY IF EXISTS "Sender manages media items" ON public.message_media_items;
CREATE POLICY "Sender manages media items" ON public.message_media_items FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_media_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_quality integer NOT NULL DEFAULT 85 CHECK (image_quality BETWEEN 40 AND 100),
  video_quality text NOT NULL DEFAULT 'balanced',
  auto_download_images boolean NOT NULL DEFAULT true,
  auto_download_videos boolean NOT NULL DEFAULT false,
  auto_download_files boolean NOT NULL DEFAULT false,
  auto_download_images_mobile boolean NOT NULL DEFAULT true,
  auto_download_videos_mobile boolean NOT NULL DEFAULT false,
  auto_download_files_mobile boolean NOT NULL DEFAULT false,
  auto_download_roaming boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_media_settings ADD COLUMN IF NOT EXISTS auto_download_images_mobile boolean NOT NULL DEFAULT true;
ALTER TABLE public.user_media_settings ADD COLUMN IF NOT EXISTS auto_download_videos_mobile boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_media_settings ADD COLUMN IF NOT EXISTS auto_download_files_mobile boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_media_settings ADD COLUMN IF NOT EXISTS auto_download_roaming boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_media_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own media settings" ON public.user_media_settings;
CREATE POLICY "Users manage own media settings" ON public.user_media_settings FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.media_thumbnail_cache (
  media_url text PRIMARY KEY,
  thumbnail_url text NOT NULL,
  media_type text NOT NULL,
  width integer,
  height integer,
  duration_ms integer,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_thumbnail_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_media_thumbnail_cache_type ON public.media_thumbnail_cache(media_type, updated_at DESC);
DROP POLICY IF EXISTS "Authenticated users read thumbnail cache" ON public.media_thumbnail_cache;
CREATE POLICY "Authenticated users read thumbnail cache" ON public.media_thumbnail_cache FOR SELECT
USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users write generated thumbnail cache" ON public.media_thumbnail_cache;
CREATE POLICY "Users write generated thumbnail cache" ON public.media_thumbnail_cache FOR INSERT
WITH CHECK (generated_by = auth.uid());
DROP POLICY IF EXISTS "Users update own thumbnail cache" ON public.media_thumbnail_cache;
CREATE POLICY "Users update own thumbnail cache" ON public.media_thumbnail_cache FOR UPDATE
USING (generated_by = auth.uid())
WITH CHECK (generated_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_polls (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_anonymous boolean NOT NULL DEFAULT true,
  allows_multiple boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants view polls" ON public.message_polls;
CREATE POLICY "Participants view polls" ON public.message_polls FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE m.id = message_polls.message_id AND cp.user_id = auth.uid()
));
DROP POLICY IF EXISTS "Creators manage polls" ON public.message_polls;
CREATE POLICY "Creators manage polls" ON public.message_polls FOR ALL
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_poll_votes (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, option_id)
);
ALTER TABLE public.message_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_poll_votes_message ON public.message_poll_votes(message_id);
DROP POLICY IF EXISTS "Participants view poll votes" ON public.message_poll_votes;
CREATE POLICY "Participants view poll votes" ON public.message_poll_votes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE m.id = message_poll_votes.message_id AND cp.user_id = auth.uid()
));
DROP POLICY IF EXISTS "Participants vote polls" ON public.message_poll_votes;
CREATE POLICY "Participants vote polls" ON public.message_poll_votes FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_poll_votes.message_id AND cp.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Users update own poll votes" ON public.message_poll_votes;
CREATE POLICY "Users update own poll votes" ON public.message_poll_votes FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  cover_url text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sticker_packs_public ON public.sticker_packs(is_public, updated_at DESC);
DROP POLICY IF EXISTS "Public or owner sticker packs readable" ON public.sticker_packs;
CREATE POLICY "Public or owner sticker packs readable" ON public.sticker_packs FOR SELECT
USING (is_public OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners manage sticker packs" ON public.sticker_packs;
CREATE POLICY "Owners manage sticker packs" ON public.sticker_packs FOR ALL
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  emoji text,
  image_url text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stickers_pack_pos ON public.stickers(pack_id, position);
CREATE INDEX IF NOT EXISTS idx_stickers_keywords ON public.stickers USING gin (keywords);
DROP POLICY IF EXISTS "Readable stickers through packs" ON public.stickers;
CREATE POLICY "Readable stickers through packs" ON public.stickers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.sticker_packs p
  WHERE p.id = stickers.pack_id AND (p.is_public OR p.owner_id = auth.uid())
));
DROP POLICY IF EXISTS "Pack owners manage stickers" ON public.stickers;
CREATE POLICY "Pack owners manage stickers" ON public.stickers FOR ALL
USING (EXISTS (SELECT 1 FROM public.sticker_packs p WHERE p.id = stickers.pack_id AND p.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.sticker_packs p WHERE p.id = stickers.pack_id AND p.owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_sticker_packs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);
ALTER TABLE public.user_sticker_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sticker packs" ON public.user_sticker_packs;
CREATE POLICY "Users manage own sticker packs" ON public.user_sticker_packs FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_text text,
  target_language text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, target_language)
);
ALTER TABLE public.message_translations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_translations_message ON public.message_translations(message_id);
DROP POLICY IF EXISTS "Participants view translations" ON public.message_translations;
CREATE POLICY "Participants view translations" ON public.message_translations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE m.id = message_translations.message_id AND cp.user_id = auth.uid()
));
DROP POLICY IF EXISTS "Users create own translations" ON public.message_translations;
CREATE POLICY "Users create own translations" ON public.message_translations FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE UNIQUE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_url text,
  text text NOT NULL,
  language text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_transcriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants view transcriptions" ON public.message_transcriptions;
CREATE POLICY "Participants view transcriptions" ON public.message_transcriptions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE m.id = message_transcriptions.message_id AND cp.user_id = auth.uid()
));
DROP POLICY IF EXISTS "Users create transcriptions for visible messages" ON public.message_transcriptions;
CREATE POLICY "Users create transcriptions for visible messages" ON public.message_transcriptions FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_transcriptions.message_id AND cp.user_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.saved_message_tags (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, tag)
);
ALTER TABLE public.saved_message_tags ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_saved_message_tags_user_tag ON public.saved_message_tags(user_id, tag);
DROP POLICY IF EXISTS "Users manage own saved message tags" ON public.saved_message_tags;
CREATE POLICY "Users manage own saved message tags" ON public.saved_message_tags FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.search_visible_messages(
  p_user_id uuid,
  p_query text,
  p_media_type text DEFAULT NULL
)
RETURNS SETOF public.messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = p_user_id
    AND m.is_deleted = false
    AND (p_media_type IS NULL OR m.media_type = p_media_type)
    AND (
      p_query IS NULL OR p_query = ''
      OR m.content ILIKE '%' || p_query || '%'
      OR m.metadata::text ILIKE '%' || p_query || '%'
    )
  ORDER BY m.created_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.search_visible_messages(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_media_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_media_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_poll_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_poll_votes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_polls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_polls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'media_thumbnail_cache') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.media_thumbnail_cache;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saved_message_tags') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_message_tags;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260712170000_batch4_admin_reliability.sql
-- SHA256 99206a54c799a99c2f56ec5a82907a2fde3517c229018db3f4419ad5425eb153
-- ============================================================================
-- Migration: Messaging moderation + analytics (ROBUST — handles pre-existing tables + fixes 42P13)
BEGIN;

-- Fix 42P13: drop functions whose parameter defaults changed, so recreation can't conflict.
-- (is_conversation_admin and can_send_message_to_conversation are used by RLS policies, so they
--  are intentionally NOT dropped — CREATE OR REPLACE below is safe for them.)
DROP FUNCTION IF EXISTS public.is_conversation_restricted(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.check_rate_limit(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.log_admin_action(uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_message_report(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.conversation_stats(uuid);

-- Core tables (verified: columns already exist / safe to add)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS slow_mode_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- conversation_admin_actions
CREATE TABLE IF NOT EXISTS public.conversation_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_admin_actions
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.conversation_admin_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_actions_conversation_created
  ON public.conversation_admin_actions(conversation_id, created_at DESC);

-- conversation_restrictions
CREATE TABLE IF NOT EXISTS public.conversation_restrictions (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ban','restrict','mute')),
  reason text,
  until_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id, kind)
);
ALTER TABLE public.conversation_restrictions
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS until_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.conversation_restrictions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conversation_restrictions_user
  ON public.conversation_restrictions(user_id, updated_at DESC);

-- message_reports
CREATE TABLE IF NOT EXISTS public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);
ALTER TABLE public.message_reports
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS message_id uuid,
  ADD COLUMN IF NOT EXISTS reporter_id uuid,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_reports_conversation_status
  ON public.message_reports(conversation_id, status, created_at DESC);

-- app_analytics_events
CREATE TABLE IF NOT EXISTS public.app_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_analytics_events
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.app_analytics_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_analytics_user_created
  ON public.app_analytics_events(user_id, created_at DESC);

-- crash_logs
CREATE TABLE IF NOT EXISTS public.crash_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  context text,
  error text NOT NULL,
  stack text,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crash_logs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS stack text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.crash_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_crash_logs_created ON public.crash_logs(created_at DESC);

-- rate_limit_events
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_events
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_scope_key_created
  ON public.rate_limit_events(scope, key, created_at DESC);

-- user_data_exports
CREATE TABLE IF NOT EXISTS public.user_data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
ALTER TABLE public.user_data_exports
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS manifest jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '7 days');
ALTER TABLE public.user_data_exports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_data_exports_user_created
  ON public.user_data_exports(user_id, created_at DESC);

-- call_room_members
CREATE TABLE IF NOT EXISTS public.call_room_members (
  call_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant',
  connection_state text NOT NULL DEFAULT 'connecting',
  media_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);
ALTER TABLE public.call_room_members
  ADD COLUMN IF NOT EXISTS call_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'participant',
  ADD COLUMN IF NOT EXISTS connection_state text DEFAULT 'connecting',
  ADD COLUMN IF NOT EXISTS media_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS left_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.call_room_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_call_room_members_call
  ON public.call_room_members(call_id, updated_at DESC);

-- Functions (columns they read are now guaranteed to exist)
CREATE OR REPLACE FUNCTION public.is_conversation_admin(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
      AND COALESCE(role, 'member') IN ('owner','admin','moderator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_restricted(p_conversation_id uuid, p_user_id uuid, p_kind text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_restrictions
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id AND kind = p_kind
      AND (until_at IS NULL OR until_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.rate_limit_events
  WHERE created_at < now() - make_interval(secs => greatest(p_window_seconds, 1));
  SELECT count(*) INTO v_count FROM public.rate_limit_events
  WHERE scope = p_scope AND key = p_key
    AND created_at >= now() - make_interval(secs => greatest(p_window_seconds, 1));
  IF v_count >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_events(user_id, scope, key) VALUES (auth.uid(), p_scope, p_key);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_message_to_conversation(p_conversation_id uuid, p_sender_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slow integer := 0; v_last_sent timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_sender_id) THEN RETURN false; END IF;
  IF public.is_conversation_restricted(p_conversation_id, p_sender_id, 'ban')
     OR public.is_conversation_restricted(p_conversation_id, p_sender_id, 'restrict') THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id AND cp.user_id <> p_sender_id
      AND public.is_blocked_between(cp.user_id, p_sender_id)) THEN RETURN false; END IF;
  SELECT COALESCE(slow_mode_seconds, 0) INTO v_slow FROM public.conversations WHERE id = p_conversation_id;
  IF COALESCE(v_slow, 0) > 0 AND NOT public.is_conversation_admin(p_conversation_id, p_sender_id) THEN
    SELECT max(created_at) INTO v_last_sent FROM public.messages
    WHERE conversation_id = p_conversation_id AND sender_id = p_sender_id;
    IF v_last_sent IS NOT NULL AND v_last_sent > now() - make_interval(secs => v_slow) THEN RETURN false; END IF;
  END IF;
  RETURN public.check_rate_limit('message_send', p_sender_id::text || ':' || p_conversation_id::text, 40, 60);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_action(p_conversation_id uuid, p_action text, p_target_user_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_conversation_admin(p_conversation_id, auth.uid()) THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.conversation_admin_actions(conversation_id, actor_id, target_user_id, action, details)
  VALUES (p_conversation_id, auth.uid(), p_target_user_id, p_action, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_message_report(p_conversation_id uuid, p_message_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.check_rate_limit('message_report', auth.uid()::text, 10, 3600) THEN RAISE EXCEPTION 'rate_limited'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'not_participant'; END IF;
  INSERT INTO public.message_reports(conversation_id, message_id, reporter_id, reason, details)
  VALUES (p_conversation_id, p_message_id, auth.uid(), p_reason, p_details)
  ON CONFLICT (message_id, reporter_id)
  DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open'
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.conversation_stats(p_conversation_id uuid)
RETURNS TABLE(members integer, messages integer, views integer, reports integer, growth_7d integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::integer FROM public.conversation_participants WHERE conversation_id = p_conversation_id),
    (SELECT count(*)::integer FROM public.messages WHERE conversation_id = p_conversation_id AND COALESCE(is_deleted, false) = false),
    (SELECT COALESCE(sum(view_count), 0)::integer FROM public.messages WHERE conversation_id = p_conversation_id),
    (SELECT count(*)::integer FROM public.message_reports WHERE conversation_id = p_conversation_id AND status = 'open'),
    (SELECT count(*)::integer FROM public.conversation_participants WHERE conversation_id = p_conversation_id AND joined_at >= now() - interval '7 days');
$$;

-- Policies
DROP POLICY IF EXISTS "Admins read admin actions" ON public.conversation_admin_actions;
CREATE POLICY "Admins read admin actions" ON public.conversation_admin_actions
  FOR SELECT USING (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Admins create admin actions" ON public.conversation_admin_actions;
CREATE POLICY "Admins create admin actions" ON public.conversation_admin_actions
  FOR INSERT WITH CHECK (public.is_conversation_admin(conversation_id, auth.uid()) AND actor_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage restrictions" ON public.conversation_restrictions;
CREATE POLICY "Admins manage restrictions" ON public.conversation_restrictions
  FOR ALL USING (public.is_conversation_admin(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Participants create own reports" ON public.message_reports;
CREATE POLICY "Participants create own reports" ON public.message_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Reporter or admins read reports" ON public.message_reports;
CREATE POLICY "Reporter or admins read reports" ON public.message_reports
  FOR SELECT USING (reporter_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Admins update reports" ON public.message_reports;
CREATE POLICY "Admins update reports" ON public.message_reports
  FOR UPDATE USING (public.is_conversation_admin(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Users insert own analytics" ON public.app_analytics_events;
CREATE POLICY "Users insert own analytics" ON public.app_analytics_events
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own crash logs" ON public.crash_logs;
CREATE POLICY "Users insert own crash logs" ON public.crash_logs
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own exports" ON public.user_data_exports;
CREATE POLICY "Users read own exports" ON public.user_data_exports
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own exports" ON public.user_data_exports;
CREATE POLICY "Users create own exports" ON public.user_data_exports
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users write own call room member state" ON public.call_room_members;
CREATE POLICY "Users write own call room member state" ON public.call_room_members
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Call participants read room members" ON public.call_room_members;
CREATE POLICY "Call participants read room members" ON public.call_room_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.call_room_members crm
      WHERE crm.call_id = call_room_members.call_id AND crm.user_id = auth.uid())
  );

-- Realtime publication
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversation_admin_actions','conversation_restrictions','message_reports','call_room_members'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SOURCE A-superapp: 20260712193000_polish_mvp_critical.sql
-- SHA256 f04ab15240298a038bda2889d4de75634673a4566a07003dcd1d5436eb4a0187
-- ============================================================================
BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS live_location_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_location_stopped_at timestamptz;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS two_factor_recovery_hint text,
  ADD COLUMN IF NOT EXISTS two_factor_recovery_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_live_location_active
  ON public.messages(conversation_id, live_location_expires_at)
  WHERE media_type = 'live_location' AND live_location_stopped_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_media_download_policy (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  images_wifi boolean NOT NULL DEFAULT true,
  images_mobile boolean NOT NULL DEFAULT true,
  videos_wifi boolean NOT NULL DEFAULT false,
  videos_mobile boolean NOT NULL DEFAULT false,
  files_wifi boolean NOT NULL DEFAULT false,
  files_mobile boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_media_download_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own media download policy" ON public.user_media_download_policy;
CREATE POLICY "Users manage own media download policy"
  ON public.user_media_download_policy FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_conversation_restricted(
  p_conversation_id uuid,
  p_user_id uuid,
  p_kind text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_restrictions r
    WHERE r.conversation_id = p_conversation_id
      AND r.user_id = p_user_id
      AND (p_kind IS NULL OR r.kind = p_kind)
      AND (r.until_at IS NULL OR r.until_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = p_user_id
  )
  AND NOT public.is_conversation_restricted(p_conversation_id, p_user_id, 'banned');
$$;

CREATE OR REPLACE FUNCTION public.can_join_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_conversation_restricted(p_conversation_id, p_user_id, 'banned')
  AND NOT public.is_conversation_restricted(p_conversation_id, p_user_id, 'join_blocked');
$$;

CREATE OR REPLACE FUNCTION public.can_send_message_to_conversation(
  p_conversation_id uuid,
  p_sender_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  IF NOT public.can_read_conversation(p_conversation_id, p_sender_id) THEN
    RETURN false;
  END IF;
  IF public.is_conversation_restricted(p_conversation_id, p_sender_id, 'muted') THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.user_blocks b
      ON (b.blocker_id = p_sender_id AND b.blocked_user_id = cp.user_id)
      OR (b.blocker_id = cp.user_id AND b.blocked_user_id = p_sender_id)
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id <> p_sender_id
  ) INTO v_blocked;
  RETURN NOT COALESCE(v_blocked, false);
END;
$$;

DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages"
  ON public.messages FOR SELECT
  USING (public.can_read_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_message_to_conversation(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Participants can update own live location metadata" ON public.messages;
CREATE POLICY "Participants can update own live location metadata"
  ON public.messages FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND media_type = 'live_location'
    AND public.can_read_conversation(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND media_type = 'live_location'
    AND public.can_read_conversation(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Participants can join when not restricted" ON public.conversation_participants;
CREATE POLICY "Participants can join when not restricted"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_join_conversation(conversation_id, auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_conversation_restrictions_active
  ON public.conversation_restrictions(conversation_id, user_id, kind, until_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_media_download_policy'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_media_download_policy;
  END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- RLS audit: read/send/join are now guarded by derived conversation restriction RPCs; user media policy is own-row only.


-- ============================================================================
-- SOURCE A-superapp: 20260712200000_map_p0_features.sql
-- SHA256 6aaeb586c5240a08700b9a0c397e3571e5bc426b9bdd3c42f216ec692e54859e
-- ============================================================================
-- ═══════════════════════════════════════════════════════════════════════════
-- Alsamos Map P0 Features Migration
-- Creates tables for: POI caching, saved places, step history, taxi live locations
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: map_pois (OSM Overpass cache)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.map_pois (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  osm_id TEXT NOT NULL UNIQUE,
  osm_type TEXT NOT NULL, -- node/way/relation
  category TEXT NOT NULL, -- restaurant|cafe|gas|atm|bank|pharmacy|hospital|shop
  name TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  tags JSONB DEFAULT '{}'::jsonb,
  address TEXT,
  phone TEXT,
  website TEXT,
  opening_hours TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (for idempotency)
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS osm_id TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS osm_type TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS opening_hours TEXT;
ALTER TABLE public.map_pois ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- Indexes for efficient spatial queries
CREATE INDEX IF NOT EXISTS idx_map_pois_category ON public.map_pois(category);
CREATE INDEX IF NOT EXISTS idx_map_pois_location ON public.map_pois(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_map_pois_updated ON public.map_pois(updated_at DESC);

-- RLS: Public read access (cached OSM data), no write from client
ALTER TABLE public.map_pois ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to POI cache" ON public.map_pois;
CREATE POLICY "Public read access to POI cache"
  ON public.map_pois FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: saved_place_lists (user's custom place collections)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_place_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS is_default BOOLEAN;
ALTER TABLE public.saved_place_lists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_saved_place_lists_user ON public.saved_place_lists(user_id);

ALTER TABLE public.saved_place_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own place lists" ON public.saved_place_lists;
CREATE POLICY "Users manage own place lists"
  ON public.saved_place_lists
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: saved_places (bookmarked locations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_places (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID REFERENCES public.saved_place_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  notes TEXT,
  icon TEXT,
  is_favorite BOOLEAN DEFAULT false,
  visited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS list_id UUID;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS visited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_saved_places_user ON public.saved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_places_list ON public.saved_places(list_id);
CREATE INDEX IF NOT EXISTS idx_saved_places_favorite ON public.saved_places(user_id, is_favorite) WHERE is_favorite = true;

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved places" ON public.saved_places;
CREATE POLICY "Users manage own saved places"
  ON public.saved_places
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: step_history (pedometer daily tracking)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.step_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  calories_burned INTEGER DEFAULT 0,
  active_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS steps INTEGER;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS calories_burned INTEGER;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS active_minutes INTEGER;
ALTER TABLE public.step_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_step_history_user_date ON public.step_history(user_id, date DESC);

ALTER TABLE public.step_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own step history" ON public.step_history;
CREATE POLICY "Users manage own step history"
  ON public.step_history
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: taxi_live_locations (real-time driver positions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.taxi_live_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION, -- bearing in degrees
  speed_kmh DOUBLE PRECISION,
  is_available BOOLEAN DEFAULT true,
  is_on_trip BOOLEAN DEFAULT false,
  vehicle_type TEXT, -- sedan|suv|van|etc
  license_plate TEXT,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS driver_id UUID;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS speed_kmh DOUBLE PRECISION;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS is_available BOOLEAN;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS is_on_trip BOOLEAN;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS license_plate TEXT;
ALTER TABLE public.taxi_live_locations ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxi_locations_driver ON public.taxi_live_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_taxi_locations_available ON public.taxi_live_locations(is_available, is_on_trip) WHERE is_available = true AND is_on_trip = false;
CREATE INDEX IF NOT EXISTS idx_taxi_locations_updated ON public.taxi_live_locations(last_updated DESC);

ALTER TABLE public.taxi_live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to available taxis" ON public.taxi_live_locations;
CREATE POLICY "Public read access to available taxis"
  ON public.taxi_live_locations FOR SELECT
  USING (is_available = true);

DROP POLICY IF EXISTS "Drivers manage own location" ON public.taxi_live_locations;
CREATE POLICY "Drivers manage own location"
  ON public.taxi_live_locations
  USING (auth.uid() = driver_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: map_incidents (user-generated content: traffic, hazards, police, etc)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.map_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- accident|hazard|police|roadwork|traffic|closure|other
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium', -- low|medium|high
  photo_url TEXT,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS reporter_id UUID;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS upvotes INTEGER;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS downvotes INTEGER;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.map_incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_map_incidents_location ON public.map_incidents(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_map_incidents_kind ON public.map_incidents(kind);
CREATE INDEX IF NOT EXISTS idx_map_incidents_expires ON public.map_incidents(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_map_incidents_active ON public.map_incidents(created_at DESC);

ALTER TABLE public.map_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active incidents" ON public.map_incidents;
CREATE POLICY "Public read active incidents"
  ON public.map_incidents FOR SELECT
  USING (expires_at IS NULL OR expires_at > now());

DROP POLICY IF EXISTS "Authenticated users create incidents" ON public.map_incidents;
CREATE POLICY "Authenticated users create incidents"
  ON public.map_incidents FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reporters update own incidents" ON public.map_incidents;
CREATE POLICY "Reporters update own incidents"
  ON public.map_incidents FOR UPDATE
  USING (auth.uid() = reporter_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers for updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_map_pois_updated_at ON public.map_pois;
CREATE TRIGGER update_map_pois_updated_at
  BEFORE UPDATE ON public.map_pois
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_place_lists_updated_at ON public.saved_place_lists;
CREATE TRIGGER update_saved_place_lists_updated_at
  BEFORE UPDATE ON public.saved_place_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_places_updated_at ON public.saved_places;
CREATE TRIGGER update_saved_places_updated_at
  BEFORE UPDATE ON public.saved_places
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_step_history_updated_at ON public.step_history;
CREATE TRIGGER update_step_history_updated_at
  BEFORE UPDATE ON public.step_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_map_incidents_updated_at ON public.map_incidents;
CREATE TRIGGER update_map_incidents_updated_at
  BEFORE UPDATE ON public.map_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime subscriptions for live updates
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'taxi_live_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_live_locations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'map_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.map_incidents;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notify PostgREST to reload schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260713000000_channel_discussion_groups.sql
-- SHA256 b4d0b5e4074e8cd36d843ca73b278c5cf6266f2afe8942978e94a1453bc82c9e
-- ============================================================================
BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS linked_group_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_post_id uuid REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conversations_linked_group_id
  ON public.conversations(linked_group_id)
  WHERE linked_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_original_post_id
  ON public.messages(original_post_id)
  WHERE original_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_message_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_message_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reply_to_id IS NOT NULL THEN
    SELECT COALESCE(original_post_id, id)
      INTO target_message_id
      FROM public.messages
      WHERE id = NEW.reply_to_id;

    IF target_message_id IS NOT NULL THEN
      UPDATE public.messages
      SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = target_message_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.reply_to_id IS NOT NULL THEN
    SELECT COALESCE(original_post_id, id)
      INTO target_message_id
      FROM public.messages
      WHERE id = OLD.reply_to_id;

    IF target_message_id IS NOT NULL THEN
      UPDATE public.messages
      SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
      WHERE id = target_message_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS update_message_comment_count_trigger ON public.messages;
CREATE TRIGGER update_message_comment_count_trigger
AFTER INSERT OR DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_message_comment_count();

CREATE OR REPLACE FUNCTION public.forward_channel_message_to_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_group uuid;
BEGIN
  SELECT linked_group_id
    INTO linked_group
    FROM public.conversations
    WHERE id = NEW.conversation_id
      AND type = 'channel'
      AND linked_group_id IS NOT NULL;

  IF linked_group IS NOT NULL
      AND COALESCE(NEW.is_deleted, false) = false
      AND NEW.reply_to_id IS NULL
      AND NEW.original_post_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.messages
        WHERE conversation_id = linked_group
          AND original_post_id = NEW.id
      ) THEN
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      media_url,
      media_type,
      metadata,
      original_post_id
    ) VALUES (
      linked_group,
      NEW.sender_id,
      NEW.content,
      NEW.media_url,
      NEW.media_type,
      COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
        'discussion_anchor', true,
        'channel_message_id', NEW.id,
        'channel_conversation_id', NEW.conversation_id
      ),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forward_channel_message_trigger ON public.messages;
CREATE TRIGGER forward_channel_message_trigger
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.reply_to_id IS NULL)
EXECUTE FUNCTION public.forward_channel_message_to_group();

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

-- RLS audit: linked discussions reuse existing conversation/message policies; trigger runs as definer and only mirrors channel posts into their configured linked group.


-- ============================================================================
-- SOURCE A-superapp: 20260713010000_user_settings_sync_columns.sql
-- SHA256 1cd5074acfcb5c708aac7b18351fe58eec15b3870bf69ac33251ba24ea558089
-- ============================================================================
-- Migration: Add chat background + font size sync columns to user_settings.
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS chat_background TEXT,
  ADD COLUMN IF NOT EXISTS font_size TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS msg_text_size DOUBLE PRECISION DEFAULT 16.0;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: no new table; existing user_settings owner-only policies cover chat_background/font_size/msg_text_size.


-- ============================================================================
-- SOURCE A-superapp: 20260713020000_profile_photo_history.sql
-- SHA256 790a6261c4589cbe140d3f210fa648917e7b387c6bf8e2a24105c479a3bb53be
-- ============================================================================
-- Migration: Profile photo history table
BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_photo_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url     TEXT        NOT NULL,
  is_current    BOOLEAN     NOT NULL DEFAULT FALSE,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_photo_history_user
  ON public.profile_photo_history (user_id, uploaded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_photo_history_user_photo
  ON public.profile_photo_history (user_id, photo_url);

-- RLS
ALTER TABLE public.profile_photo_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own photo history" ON public.profile_photo_history;
CREATE POLICY "Users can see their own photo history"
  ON public.profile_photo_history FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own photo history" ON public.profile_photo_history;
CREATE POLICY "Users can insert their own photo history"
  ON public.profile_photo_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own photo history" ON public.profile_photo_history;
CREATE POLICY "Users can update their own photo history"
  ON public.profile_photo_history FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own photo history" ON public.profile_photo_history;
CREATE POLICY "Users can delete their own photo history"
  ON public.profile_photo_history FOR DELETE
  USING (user_id = auth.uid());

-- Backfill current avatar into history for existing profiles
INSERT INTO public.profile_photo_history (user_id, photo_url, is_current, uploaded_at)
SELECT id, avatar_url, TRUE, NOW()
FROM public.profiles
WHERE avatar_url IS NOT NULL AND avatar_url != ''
ON CONFLICT (user_id, photo_url) DO UPDATE
SET is_current = TRUE;

-- RPC to atomically change current photo and update profile
CREATE OR REPLACE FUNCTION public.set_current_profile_photo(p_user_id UUID, p_photo_id UUID, p_photo_url TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify ownership
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reset all to false
  IF NOT EXISTS (
    SELECT 1
    FROM public.profile_photo_history
    WHERE id = p_photo_id
      AND user_id = p_user_id
      AND photo_url = p_photo_url
  ) THEN
    RAISE EXCEPTION 'Photo not found';
  END IF;

  UPDATE public.profile_photo_history
  SET is_current = FALSE
  WHERE user_id = p_user_id;

  -- Set target to true
  UPDATE public.profile_photo_history
  SET is_current = TRUE
  WHERE id = p_photo_id AND user_id = p_user_id;

  -- Update profiles table
  UPDATE public.profiles
  SET avatar_url = p_photo_url
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_current_profile_photo(UUID, UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profile_photo_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_photo_history;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: users can only read/write their own photo history; current-photo RPC verifies ownership before updating profiles.avatar_url.


-- ============================================================================
-- SOURCE A-superapp: 20260713030000_message_mentions.sql
-- SHA256 56dbd250147a7ce2a300bdccf4e5bed9e751fb9c14f2a7a757d4cd03e7220115
-- ============================================================================
BEGIN;

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_on_message_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned_username text;
  mentioned_user_id uuid;
  author_name text;
  content_preview text;
BEGIN
  IF COALESCE(NEW.content, '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username)
    INTO author_name
    FROM public.profiles
    WHERE id = NEW.sender_id;

  content_preview := LEFT(NEW.content, 160);

  FOR mentioned_username IN
    SELECT DISTINCT lower((regexp_matches(NEW.content, '@([a-zA-Z0-9_]{3,32})', 'g'))[1])
  LOOP
    SELECT id
      INTO mentioned_user_id
      FROM public.profiles
      WHERE lower(username) = mentioned_username
      LIMIT 1;

    IF mentioned_user_id IS NOT NULL
       AND mentioned_user_id <> NEW.sender_id
       AND EXISTS (
         SELECT 1
         FROM public.conversation_participants cp
         WHERE cp.conversation_id = NEW.conversation_id
           AND cp.user_id = mentioned_user_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.notifications n
         WHERE n.user_id = mentioned_user_id
           AND n.type = 'mention'
           AND n.data->>'message_id' = NEW.id::text
       ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        mentioned_user_id,
        'mention',
        'Yangi eslatish',
        COALESCE(author_name, 'Kimdir') || ' sizni xabarda eslatdi',
        jsonb_build_object(
          'message_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'mentioner_id', NEW.sender_id,
          'content_preview', content_preview
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_mention ON public.messages;
CREATE TRIGGER on_message_mention
AFTER INSERT OR UPDATE OF content ON public.messages
FOR EACH ROW
WHEN (NEW.is_deleted = false)
EXECUTE FUNCTION public.notify_on_message_mention();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- RLS audit: mention notifications are inserted by a SECURITY DEFINER trigger only for users who are participants in the message conversation; notifications SELECT remains owner-only.

