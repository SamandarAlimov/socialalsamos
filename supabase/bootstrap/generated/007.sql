-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260718100000_harden_post_collaboration.sql
-- SHA256 915a6fa9d765ce999ff28d81e95f6dc0e4b6bfcc68b411ee5b3605071fcab8b9
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.post_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_collaborators
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'collaborator',
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS post_collaborators_post_user_key
  ON public.post_collaborators(post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_post_collaborators_user_status
  ON public.post_collaborators(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_collaborators_post
  ON public.post_collaborators(post_id);

ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their collaborations" ON public.post_collaborators;
CREATE POLICY "Users can view their collaborations"
  ON public.post_collaborators
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Post owners can invite collaborators" ON public.post_collaborators;
CREATE POLICY "Post owners can invite collaborators"
  ON public.post_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = invited_by
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Invited users can respond" ON public.post_collaborators;
CREATE POLICY "Invited users can respond"
  ON public.post_collaborators
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('accepted', 'declined')
  );

DROP POLICY IF EXISTS "Post owners can remove collaborators" ON public.post_collaborators;
CREATE POLICY "Post owners can remove collaborators"
  ON public.post_collaborators
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = invited_by
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
  );

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
  INTO v_constraint_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.notifications'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type%'
    AND pg_get_constraintdef(c.oid) ILIKE '%message%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'message',
        'like',
        'comment',
        'follow',
        'mention',
        'collaboration_invite',
        'collaboration_accepted'
      ));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_collaboration_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_name text;
BEGIN
  SELECT COALESCE(display_name, username, 'Someone')
  INTO inviter_name
  FROM public.profiles
  WHERE id = NEW.invited_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id,
    'collaboration_invite',
    'Collaboration Request',
    COALESCE(inviter_name, 'Someone') || ' wants to collaborate on a post with you',
    jsonb_build_object(
      'post_id', NEW.post_id,
      'collaboration_id', NEW.id,
      'inviter_id', NEW.invited_by
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_collaboration_invite ON public.post_collaborators;
CREATE TRIGGER on_collaboration_invite
  AFTER INSERT ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_invite();

CREATE OR REPLACE FUNCTION public.notify_on_collaboration_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepter_name text;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT COALESCE(display_name, username, 'Someone')
    INTO accepter_name
    FROM public.profiles
    WHERE id = NEW.user_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.invited_by,
      'collaboration_accepted',
      'Collaboration Accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your collaboration request',
      jsonb_build_object(
        'post_id', NEW.post_id,
        'collaboration_id', NEW.id,
        'collaborator_id', NEW.user_id
      )
    );
  END IF;

  IF NEW.status IN ('accepted', 'declined') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.responded_at = COALESCE(NEW.responded_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_collaboration_accepted ON public.post_collaborators;
CREATE TRIGGER on_collaboration_accepted
  BEFORE UPDATE ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_accepted();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_collaborators'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_collaborators;
  END IF;
END $$;

-- RLS audit: post_collaborators is visible only to the post owner, inviter,
-- and invited collaborator; writes are limited to the owner/inviter and
-- invitee status response.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260718101000_harden_post_poll_votes.sql
-- SHA256 e951075b5ccd7518e991d116926d35a5b37eaf2854749781df5ed36b9ec1d0d8
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.poll_votes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.poll_votes
  ADD COLUMN IF NOT EXISTS post_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS option_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON public.poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON public.poll_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_updated ON public.poll_votes(updated_at DESC);

CREATE OR REPLACE FUNCTION public.is_post_poll_expired(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
  v_poll_json text;
  v_expires_at timestamptz;
BEGIN
  SELECT content INTO v_content
  FROM public.posts
  WHERE id = p_post_id;

  IF v_content IS NULL OR position('[POLL]' in v_content) = 0 THEN
    RETURN false;
  END IF;

  v_poll_json := substring(v_content from '\[POLL\](.*?)\[/POLL\]');
  IF v_poll_json IS NULL OR trim(v_poll_json) = '' THEN
    RETURN false;
  END IF;

  BEGIN
    v_expires_at := (v_poll_json::jsonb ->> 'expiresAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN v_expires_at IS NOT NULL AND now() > v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_post_poll_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_post_poll_expired(NEW.post_id) THEN
    RAISE EXCEPTION 'poll_expired';
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_poll_vote_trigger ON public.poll_votes;
CREATE TRIGGER enforce_post_poll_vote_trigger
  BEFORE INSERT OR UPDATE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_post_poll_vote();

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read poll votes" ON public.poll_votes;
CREATE POLICY "Users can read poll votes"
  ON public.poll_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = poll_votes.post_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can vote on polls" ON public.poll_votes;
CREATE POLICY "Users can vote on polls"
  ON public.poll_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_post_poll_expired(post_id)
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = poll_votes.post_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can change their vote" ON public.poll_votes;
CREATE POLICY "Users can change their vote"
  ON public.poll_votes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_post_poll_expired(post_id)
  );

DROP POLICY IF EXISTS "Users can delete their vote" ON public.poll_votes;
CREATE POLICY "Users can delete their vote"
  ON public.poll_votes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.is_post_poll_expired(uuid) TO authenticated, anon;

-- RLS audit: poll_votes are readable only through readable parent posts, while
-- writes are limited to the authenticated user's own vote and blocked after
-- the poll expires.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260718102000_public_accepted_post_collaborators.sql
-- SHA256 7132ac054fa1b217fefc1913f81ef8dc4c59d53436e27c1684a1079d9bf25d37
-- ============================================================================
BEGIN;

ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their collaborations" ON public.post_collaborators;
CREATE POLICY "Users can view their collaborations"
  ON public.post_collaborators
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
    OR (
      status = 'accepted'
      AND EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.id = post_collaborators.post_id
          AND (
            p.visibility = 'public'
            OR p.user_id = auth.uid()
          )
      )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_collaborators'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_collaborators;
  END IF;
END $$;

-- RLS audit: pending/declined collaboration invites stay visible only to the
-- involved users, while accepted collaborator metadata is readable through
-- public/readable parent posts for feed and profile display.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260718103000_fix_post_hashtag_extraction_trigger.sql
-- SHA256 4674326296d3195c5ad47d5e0862d850aae812fb7e816a9c457f87e6bd615e53
-- ============================================================================
BEGIN;

-- Fix legacy hashtag extraction for posts.
-- regexp_matches() returns text[], so the captured hashtag must be read from
-- the first array element before applying text operations.
CREATE OR REPLACE FUNCTION public.extract_hashtags(content text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tags text[];
BEGIN
  SELECT COALESCE(
    array_agg(DISTINCT lower((m.match)[1]) ORDER BY lower((m.match)[1])),
    ARRAY[]::text[]
  )
  INTO v_tags
  FROM regexp_matches(COALESCE(content, ''), '#([A-Za-z0-9_]+)', 'g') AS m(match);

  RETURN v_tags;
END;
$$;

COMMENT ON FUNCTION public.extract_hashtags(text) IS
  'Extracts hashtags from text content, returning lowercase tags without #';

CREATE OR REPLACE FUNCTION public.auto_extract_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep explicitly supplied tags. Only derive them when the array is missing
  -- or empty, which preserves the current Create UI publish payload.
  IF NEW.content IS NOT NULL
     AND (NEW.tags IS NULL OR cardinality(NEW.tags) = 0) THEN
    NEW.tags := public.extract_hashtags(NEW.content);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_extract_tags() IS
  'Automatically extracts hashtags from post content and populates tags array';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'tags'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_auto_extract_tags ON public.posts;
    CREATE TRIGGER trigger_auto_extract_tags
      BEFORE INSERT OR UPDATE OF content, tags
      ON public.posts
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_extract_tags();
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.extract_hashtags(text) TO authenticated, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260727000000_messages_rpc_functions.sql
-- SHA256 fefabf34b987a464fd71ace741efc147eecd3e854acb23700b5c74d8bc5ed07f
-- ============================================================================
BEGIN;

-- RPC: get_conversation_unreads
-- Returns unread count, mention count, and last message content per conversation
CREATE OR REPLACE FUNCTION public.get_conversation_unreads(
  p_user_id uuid,
  p_conversation_ids uuid[]
)
RETURNS TABLE(
  conversation_id uuid,
  unread_count bigint,
  mention_count bigint,
  last_message_content text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH participant_reads AS (
    SELECT
      cp.conversation_id AS conv_id,
      cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.user_id = p_user_id
      AND cp.conversation_id = ANY(p_conversation_ids)
  ),
  unreads AS (
    SELECT
      m.conversation_id AS conv_id,
      count(*) AS cnt,
      count(*) FILTER (
        WHERE m.content ILIKE '%@%'
      ) AS mention_cnt
    FROM messages m
    JOIN participant_reads pr ON pr.conv_id = m.conversation_id
    WHERE m.conversation_id = ANY(p_conversation_ids)
      AND m.sender_id != p_user_id
      AND m.created_at > COALESCE(pr.last_read_at, '1970-01-01'::timestamptz)
      AND m.is_deleted = false
    GROUP BY m.conversation_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id AS conv_id,
      m.content
    FROM messages m
    WHERE m.conversation_id = ANY(p_conversation_ids)
      AND m.is_deleted = false
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT
    cid.id AS conversation_id,
    COALESCE(u.cnt, 0) AS unread_count,
    COALESCE(u.mention_cnt, 0) AS mention_count,
    lm.content AS last_message_content
  FROM unnest(p_conversation_ids) AS cid(id)
  LEFT JOIN unreads u ON u.conv_id = cid.id
  LEFT JOIN last_msgs lm ON lm.conv_id = cid.id;
END;
$$;

COMMENT ON FUNCTION public.get_conversation_unreads(uuid, uuid[]) IS
  'Returns unread counts and last message for each conversation';

-- RPC: get_last_messages
-- Returns the most recent message content per conversation
CREATE OR REPLACE FUNCTION public.get_last_messages(
  p_conversation_ids uuid[]
)
RETURNS TABLE(
  conversation_id uuid,
  content text,
  sender_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.content,
    m.sender_id,
    m.created_at
  FROM messages m
  WHERE m.conversation_id = ANY(p_conversation_ids)
    AND m.is_deleted = false
  ORDER BY m.conversation_id, m.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_last_messages(uuid[]) IS
  'Returns the latest non-deleted message per conversation';

GRANT EXECUTE ON FUNCTION public.get_conversation_unreads(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_messages(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260727000001_collaboration_respond_policy.sql
-- SHA256 e8753cd7ea0e420dc1c05538d42174c8b41ed570ee957b31a333a742df6f5633
-- ============================================================================
BEGIN;

-- Allow invited users to accept or decline collaboration invites
DROP POLICY IF EXISTS "Users can respond to collaboration invites" ON public.post_collaborators;
CREATE POLICY "Users can respond to collaboration invites"
  ON public.post_collaborators
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('accepted', 'declined')
  );

-- Allow post owners to remove/cancel collaborators
DROP POLICY IF EXISTS "Post owners can remove collaborators" ON public.post_collaborators;
CREATE POLICY "Post owners can remove collaborators"
  ON public.post_collaborators
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = invited_by
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
  );

-- RPC: respond to a collaboration invite (accept or decline)
CREATE OR REPLACE FUNCTION public.respond_collaboration_invite(
  p_collaboration_id uuid,
  p_response text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collab record;
  v_post record;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'invalid_response: must be accepted or declined';
  END IF;

  SELECT * INTO v_collab
  FROM post_collaborators
  WHERE id = p_collaboration_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: collaboration invite not found';
  END IF;

  IF v_collab.status != 'pending' THEN
    RAISE EXCEPTION 'already_responded: invite already %', v_collab.status;
  END IF;

  UPDATE post_collaborators
  SET status = p_response, responded_at = now()
  WHERE id = p_collaboration_id;

  SELECT id, user_id INTO v_post
  FROM posts WHERE id = v_collab.post_id;

  -- Create notification for the post owner
  IF v_post.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, actor_id, reference_id, reference_type, content)
    VALUES (
      v_post.user_id,
      CASE WHEN p_response = 'accepted' THEN 'collaboration_accepted' ELSE 'collaboration_declined' END,
      auth.uid(),
      v_collab.post_id::text,
      'post',
      CASE WHEN p_response = 'accepted'
        THEN 'Hamkorlik qabul qilindi'
        ELSE 'Hamkorlik rad etildi'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', p_response,
    'collaboration_id', p_collaboration_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_collaboration_invite(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260728000000_collaboration_block_check.sql
-- SHA256 4921794e9de5192b656aec8848f2b34b93c283f85cf7cb1d1a1d560f6af5000a
-- ============================================================================
BEGIN;

-- Strengthen the INSERT policy on post_collaborators to prevent inviting blocked users
DROP POLICY IF EXISTS "Post owners can invite collaborators" ON public.post_collaborators;
CREATE POLICY "Post owners can invite collaborators"
  ON public.post_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = invited_by
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_collaborators.post_id
        AND p.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = post_collaborators.user_id)
         OR (ub.blocker_id = post_collaborators.user_id AND ub.blocked_id = auth.uid())
    )
  );

-- Strengthen the UPDATE (respond) policy to prevent accepting if blocked since invite
DROP POLICY IF EXISTS "Users can respond to collaboration invites" ON public.post_collaborators;
CREATE POLICY "Users can respond to collaboration invites"
  ON public.post_collaborators
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('accepted', 'declined')
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = post_collaborators.invited_by)
         OR (ub.blocker_id = post_collaborators.invited_by AND ub.blocked_id = auth.uid())
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260803000000_advanced_routing.sql
-- SHA256 613d552238d3d2847b9a92785e29316c3c4391ec4a42f35633d5ad9ba57a8f5d
-- ============================================================================
-- ═══════════════════════════════════════════════════════════════════════════
-- Advanced Routing Features Migration
-- Creates tables for: saved routes, live trips, route history
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: saved_routes (favorite/frequent routes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origin TEXT NOT NULL, -- "lat,lng"
  destination TEXT NOT NULL, -- "lat,lng"
  origin_name TEXT,
  destination_name TEXT,
  mode TEXT NOT NULL DEFAULT 'driving', -- driving|walking|cycling|transit|taxi
  preference TEXT NOT NULL DEFAULT 'fastest', -- fastest|shortest|balanced|avoidHighways|avoidTolls
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS origin_name TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS destination_name TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS preference TEXT;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS use_count INTEGER;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON public.saved_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_usage ON public.saved_routes(user_id, use_count DESC, last_used_at DESC);

-- RLS
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved routes" ON public.saved_routes;
CREATE POLICY "Users manage own saved routes"
  ON public.saved_routes
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: live_trips (active trips with ETA sharing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL, -- "lat,lng"
  destination TEXT NOT NULL, -- "lat,lng"
  planned_route JSONB, -- [[lat,lng],[lat,lng],...]
  current_location TEXT, -- "lat,lng"
  progress DOUBLE PRECISION DEFAULT 0, -- 0-1
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  estimated_arrival TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  shared_with TEXT[] DEFAULT '{}', -- Array of user IDs
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS planned_route JSONB;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS current_location TEXT;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS progress DOUBLE PRECISION;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS shared_with TEXT[];
ALTER TABLE public.live_trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_live_trips_user ON public.live_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_live_trips_active ON public.live_trips(is_active, started_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_live_trips_shared ON public.live_trips USING GIN(shared_with);

-- RLS
ALTER TABLE public.live_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own trips" ON public.live_trips;
CREATE POLICY "Users manage own trips"
  ON public.live_trips
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view shared trips" ON public.live_trips;
CREATE POLICY "Users view shared trips"
  ON public.live_trips FOR SELECT
  USING (
    auth.uid() = user_id 
    OR auth.uid()::text = ANY(shared_with)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: route_history (completed routes for analytics)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.route_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  origin_name TEXT,
  destination_name TEXT,
  mode TEXT NOT NULL DEFAULT 'driving',
  distance_meters DOUBLE PRECISION NOT NULL,
  duration_seconds INTEGER NOT NULL,
  actual_duration_seconds INTEGER, -- Real travel time if trip was tracked
  route_geometry JSONB, -- [[lat,lng],...]
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS origin_name TEXT;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS destination_name TEXT;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS actual_duration_seconds INTEGER;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS route_geometry JSONB;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.route_history ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_route_history_user ON public.route_history(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_history_mode ON public.route_history(user_id, mode);

-- RLS
ALTER TABLE public.route_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own route history" ON public.route_history;
CREATE POLICY "Users manage own route history"
  ON public.route_history
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Increment route use count
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_route_use_count(route_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.saved_routes
  SET 
    use_count = use_count + 1,
    last_used_at = now()
  WHERE id = route_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers for updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_saved_routes_updated_at ON public.saved_routes;
CREATE TRIGGER update_saved_routes_updated_at
  BEFORE UPDATE ON public.saved_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_live_trips_updated_at ON public.live_trips;
CREATE TRIGGER update_live_trips_updated_at
  BEFORE UPDATE ON public.live_trips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'live_trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_trips;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notify PostgREST to reload schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260803010000_privacy_features.sql
-- SHA256 926e4e6cc0a61e740d6a5244fe3b82ce102175c5a9ef8d75d82dd5547819513a
-- ============================================================================
-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy Features Migration
-- Creates tables for: privacy settings, privacy zones, location share tokens
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: privacy_settings (user privacy preferences)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.privacy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'followers', -- public|followers|friends|family|selected|nobody
  ghost_mode_enabled BOOLEAN DEFAULT false,
  incognito_mode_enabled BOOLEAN DEFAULT false,
  share_history BOOLEAN DEFAULT true,
  share_accurate_location BOOLEAN DEFAULT true,
  blocked_users TEXT[] DEFAULT '{}',
  allowed_users TEXT[] DEFAULT '{}',
  pause_tracking BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS visibility TEXT;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS ghost_mode_enabled BOOLEAN;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS incognito_mode_enabled BOOLEAN;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS share_history BOOLEAN;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS share_accurate_location BOOLEAN;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS blocked_users TEXT[];
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS allowed_users TEXT[];
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS pause_tracking BOOLEAN;
ALTER TABLE public.privacy_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_privacy_settings_user ON public.privacy_settings(user_id);

-- RLS
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users manage own privacy settings"
  ON public.privacy_settings
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: privacy_zones (areas where location is hidden)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.privacy_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  center TEXT NOT NULL, -- "lat,lng"
  radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS center TEXT;
ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS radius_meters DOUBLE PRECISION;
ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE public.privacy_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_privacy_zones_user ON public.privacy_zones(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_zones_active ON public.privacy_zones(user_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.privacy_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own privacy zones" ON public.privacy_zones;
CREATE POLICY "Users manage own privacy zones"
  ON public.privacy_zones
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: location_share_tokens (temporary location sharing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_share_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  allowed_users TEXT[], -- NULL = anyone with link, [] = specific users
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.location_share_tokens ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.location_share_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.location_share_tokens ADD COLUMN IF NOT EXISTS allowed_users TEXT[];
ALTER TABLE public.location_share_tokens ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_share_tokens_user ON public.location_share_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_active ON public.location_share_tokens(is_active, expires_at) WHERE is_active = true;

-- RLS
ALTER TABLE public.location_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own share tokens" ON public.location_share_tokens;
CREATE POLICY "Users manage own share tokens"
  ON public.location_share_tokens
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users with token can view shared location" ON public.location_share_tokens;
CREATE POLICY "Users with token can view shared location"
  ON public.location_share_tokens FOR SELECT
  USING (
    is_active = true 
    AND expires_at > now() 
    AND (
      allowed_users IS NULL 
      OR auth.uid()::text = ANY(allowed_users)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Check if user can see another user's location
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_see_user_location(
  target_user_id UUID,
  requester_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  settings RECORD;
  is_follower BOOLEAN;
  is_friend BOOLEAN;
  is_family BOOLEAN;
BEGIN
  -- Get privacy settings
  SELECT * INTO settings 
  FROM public.privacy_settings 
  WHERE user_id = target_user_id;
  
  -- Default to followers if no settings
  IF settings IS NULL THEN
    settings.visibility := 'followers';
    settings.ghost_mode_enabled := false;
    settings.blocked_users := '{}';
    settings.allowed_users := '{}';
  END IF;
  
  -- Ghost mode = nobody can see
  IF settings.ghost_mode_enabled THEN
    RETURN false;
  END IF;
  
  -- Blocked users
  IF requester_user_id::text = ANY(settings.blocked_users) THEN
    RETURN false;
  END IF;
  
  -- Check visibility level
  CASE settings.visibility
    WHEN 'nobody' THEN
      RETURN false;
      
    WHEN 'public' THEN
      RETURN true;
      
    WHEN 'selected' THEN
      RETURN requester_user_id::text = ANY(settings.allowed_users);
      
    WHEN 'followers' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.follows 
        WHERE follower_id = requester_user_id 
        AND following_id = target_user_id
      ) INTO is_follower;
      RETURN is_follower;
      
    WHEN 'friends' THEN
      -- Mutual follow = friends
      SELECT EXISTS(
        SELECT 1 FROM public.follows f1
        INNER JOIN public.follows f2 
          ON f1.following_id = f2.follower_id 
          AND f1.follower_id = f2.following_id
        WHERE f1.follower_id = requester_user_id 
        AND f1.following_id = target_user_id
      ) INTO is_friend;
      RETURN is_friend;
      
    WHEN 'family' THEN
      -- Check family circle membership
      SELECT EXISTS(
        SELECT 1 FROM public.family_circles fc1
        INNER JOIN public.family_circles fc2 
          ON fc1.circle_id = fc2.circle_id
        WHERE fc1.user_id = requester_user_id 
        AND fc2.user_id = target_user_id
      ) INTO is_family;
      RETURN is_family;
      
    ELSE
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers for updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_privacy_settings_updated_at ON public.privacy_settings;
CREATE TRIGGER update_privacy_settings_updated_at
  BEFORE UPDATE ON public.privacy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_privacy_zones_updated_at ON public.privacy_zones;
CREATE TRIGGER update_privacy_zones_updated_at
  BEFORE UPDATE ON public.privacy_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Create default privacy settings for existing users
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.privacy_settings (user_id, visibility)
SELECT id, 'followers'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.privacy_settings)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notify PostgREST to reload schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260803020000_social_map_features.sql
-- SHA256 4a3286b118c13f8f054dd71589a07994a1af51d3014831b1c7b90ec6de0c25bb
-- ============================================================================
-- Social Map Features Migration
-- Check-ins, Reviews, Location Posts, Meet Here, Circles, Groups

-- ============================================================================
-- CHECK-INS
-- ============================================================================

CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL, -- OSM place_id or custom place identifier
  place_name TEXT NOT NULL,
  place_category TEXT, -- restaurant, cafe, hotel, park, etc.
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  feeling TEXT, -- happy, excited, tired, hungry, etc.
  note TEXT,
  visibility TEXT NOT NULL DEFAULT 'friends', -- public, followers, friends, private
  photo_urls TEXT[], -- Array of photo URLs
  tagged_users UUID[], -- Array of user IDs tagged in check-in
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_place_id ON check_ins(place_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_created_at ON check_ins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_location ON check_ins USING gist(ll_to_earth(latitude, longitude));

-- RLS Policies
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own check-ins" ON check_ins;
CREATE POLICY "Users can create their own check-ins"
  ON check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own check-ins" ON check_ins;
CREATE POLICY "Users can view their own check-ins"
  ON check_ins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view public check-ins" ON check_ins;
CREATE POLICY "Users can view public check-ins"
  ON check_ins FOR SELECT
  USING (visibility = 'public');

DROP POLICY IF EXISTS "Users can view friends' check-ins" ON check_ins;
CREATE POLICY "Users can view friends' check-ins"
  ON check_ins FOR SELECT
  USING (
    visibility IN ('friends', 'followers') AND
    EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = auth.uid() AND followed_id = user_id
    )
  );

DROP POLICY IF EXISTS "Users can update their own check-ins" ON check_ins;
CREATE POLICY "Users can update their own check-ins"
  ON check_ins FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own check-ins" ON check_ins;
CREATE POLICY "Users can delete their own check-ins"
  ON check_ins FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- PLACE REVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS place_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  place_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  categories TEXT[], -- food, service, ambiance, cleanliness, etc.
  category_ratings JSONB, -- {"food": 5, "service": 4, "ambiance": 5}
  photo_urls TEXT[],
  helpful_count INTEGER NOT NULL DEFAULT 0,
  visit_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, place_id) -- One review per user per place
);

CREATE INDEX IF NOT EXISTS idx_place_reviews_user_id ON place_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_place_reviews_place_id ON place_reviews(place_id);
CREATE INDEX IF NOT EXISTS idx_place_reviews_rating ON place_reviews(rating DESC);
CREATE INDEX IF NOT EXISTS idx_place_reviews_created_at ON place_reviews(created_at DESC);

-- RLS Policies
ALTER TABLE place_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reviews" ON place_reviews;
CREATE POLICY "Anyone can view reviews"
  ON place_reviews FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create their own reviews" ON place_reviews;
CREATE POLICY "Users can create their own reviews"
  ON place_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON place_reviews;
CREATE POLICY "Users can update their own reviews"
  ON place_reviews FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON place_reviews;
CREATE POLICY "Users can delete their own reviews"
  ON place_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- REVIEW HELPFUL VOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES place_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(review_id, user_id) -- One vote per user per review
);

CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_review_id ON review_helpful_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_helpful_votes_user_id ON review_helpful_votes(user_id);

-- RLS Policies
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can vote reviews helpful" ON review_helpful_votes;
CREATE POLICY "Users can vote reviews helpful"
  ON review_helpful_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their votes" ON review_helpful_votes;
CREATE POLICY "Users can remove their votes"
  ON review_helpful_votes FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update helpful_count
CREATE OR REPLACE FUNCTION update_review_helpful_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE place_reviews
    SET helpful_count = helpful_count + 1
    WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE place_reviews
    SET helpful_count = GREATEST(0, helpful_count - 1)
    WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_review_helpful_count ON review_helpful_votes;
CREATE TRIGGER trigger_update_review_helpful_count
AFTER INSERT OR DELETE ON review_helpful_votes
FOR EACH ROW EXECUTE FUNCTION update_review_helpful_count();

-- ============================================================================
-- MEET HERE INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS meet_here_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  place_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  meeting_time TIMESTAMPTZ,
  message TEXT,
  invited_users UUID[] NOT NULL DEFAULT '{}',
  accepted_users UUID[] NOT NULL DEFAULT '{}',
  declined_users UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meet_here_creator_id ON meet_here_invitations(creator_id);
CREATE INDEX IF NOT EXISTS idx_meet_here_invited_users ON meet_here_invitations USING gin(invited_users);
CREATE INDEX IF NOT EXISTS idx_meet_here_status ON meet_here_invitations(status);
CREATE INDEX IF NOT EXISTS idx_meet_here_meeting_time ON meet_here_invitations(meeting_time);

-- RLS Policies
ALTER TABLE meet_here_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create invitations" ON meet_here_invitations;
CREATE POLICY "Users can create invitations"
  ON meet_here_invitations FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can view their invitations" ON meet_here_invitations;
CREATE POLICY "Users can view their invitations"
  ON meet_here_invitations FOR SELECT
  USING (
    auth.uid() = creator_id OR
    auth.uid() = ANY(invited_users)
  );

DROP POLICY IF EXISTS "Creator can update invitations" ON meet_here_invitations;
CREATE POLICY "Creator can update invitations"
  ON meet_here_invitations FOR UPDATE
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Invited users can respond" ON meet_here_invitations;
CREATE POLICY "Invited users can respond"
  ON meet_here_invitations FOR UPDATE
  USING (auth.uid() = ANY(invited_users));

-- ============================================================================
-- FAMILY CIRCLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS family_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  admin_ids UUID[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{"auto_share_location": true, "show_battery": true, "show_driving_status": true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_circles_creator_id ON family_circles(creator_id);
CREATE INDEX IF NOT EXISTS idx_family_circles_member_ids ON family_circles USING gin(member_ids);

-- RLS Policies
ALTER TABLE family_circles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create circles" ON family_circles;
CREATE POLICY "Users can create circles"
  ON family_circles FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Members can view their circles" ON family_circles;
CREATE POLICY "Members can view their circles"
  ON family_circles FOR SELECT
  USING (
    auth.uid() = creator_id OR
    auth.uid() = ANY(member_ids)
  );

DROP POLICY IF EXISTS "Admins can update circles" ON family_circles;
CREATE POLICY "Admins can update circles"
  ON family_circles FOR UPDATE
  USING (
    auth.uid() = creator_id OR
    auth.uid() = ANY(admin_ids)
  );

DROP POLICY IF EXISTS "Creator can delete circles" ON family_circles;
CREATE POLICY "Creator can delete circles"
  ON family_circles FOR DELETE
  USING (auth.uid() = creator_id);

-- ============================================================================
-- CIRCLE INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS circle_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES family_circles(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(circle_id, invited_user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_circle_id ON circle_invitations(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_invitations_invited_user_id ON circle_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_circle_invitations_status ON circle_invitations(status);

-- RLS Policies
ALTER TABLE circle_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can create invitations" ON circle_invitations;
CREATE POLICY "Admins can create invitations"
  ON circle_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_circles
      WHERE id = circle_id AND (
        creator_id = auth.uid() OR
        auth.uid() = ANY(admin_ids)
      )
    )
  );

DROP POLICY IF EXISTS "Users can view their invitations" ON circle_invitations;
CREATE POLICY "Users can view their invitations"
  ON circle_invitations FOR SELECT
  USING (
    auth.uid() = invited_user_id OR
    auth.uid() = invited_by_id OR
    EXISTS (
      SELECT 1 FROM family_circles
      WHERE id = circle_id AND (
        creator_id = auth.uid() OR
        auth.uid() = ANY(admin_ids)
      )
    )
  );

DROP POLICY IF EXISTS "Invited users can respond" ON circle_invitations;
CREATE POLICY "Invited users can respond"
  ON circle_invitations FOR UPDATE
  USING (auth.uid() = invited_user_id);

-- ============================================================================
-- PLACE STATISTICS (Materialized for performance)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS place_statistics AS
SELECT
  place_id,
  place_name,
  COUNT(DISTINCT check_ins.user_id) as check_in_count,
  COUNT(DISTINCT place_reviews.user_id) as review_count,
  COALESCE(AVG(place_reviews.rating), 0) as average_rating,
  MAX(check_ins.created_at) as last_check_in,
  MAX(place_reviews.created_at) as last_review
FROM check_ins
LEFT JOIN place_reviews USING (place_id)
GROUP BY place_id, place_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_place_statistics_place_id ON place_statistics(place_id);

-- Refresh function (call periodically via cron or edge function)
CREATE OR REPLACE FUNCTION refresh_place_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY place_statistics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE check_ins;
ALTER PUBLICATION supabase_realtime ADD TABLE place_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE meet_here_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE family_circles;
ALTER PUBLICATION supabase_realtime ADD TABLE circle_invitations;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get nearby check-ins
CREATE OR REPLACE FUNCTION get_nearby_check_ins(
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 5.0,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  place_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  feeling TEXT,
  note TEXT,
  distance_km DOUBLE PRECISION,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.place_name,
    c.latitude,
    c.longitude,
    c.feeling,
    c.note,
    earth_distance(ll_to_earth(lat, lon), ll_to_earth(c.latitude, c.longitude)) / 1000.0 as distance_km,
    c.created_at
  FROM check_ins c
  WHERE
    earth_box(ll_to_earth(lat, lon), radius_km * 1000) @> ll_to_earth(c.latitude, c.longitude)
    AND (
      c.visibility = 'public' OR
      (c.visibility IN ('friends', 'followers') AND EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = auth.uid() AND followed_id = c.user_id
      )) OR
      c.user_id = auth.uid()
    )
  ORDER BY earth_distance(ll_to_earth(lat, lon), ll_to_earth(c.latitude, c.longitude))
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get place reviews with user info
CREATE OR REPLACE FUNCTION get_place_reviews(place_id_param TEXT, limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  rating INTEGER,
  review_text TEXT,
  category_ratings JSONB,
  photo_urls TEXT[],
  helpful_count INTEGER,
  visit_date DATE,
  created_at TIMESTAMPTZ,
  user_has_voted BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.user_id,
    pr.rating,
    pr.review_text,
    pr.category_ratings,
    pr.photo_urls,
    pr.helpful_count,
    pr.visit_date,
    pr.created_at,
    EXISTS(
      SELECT 1 FROM review_helpful_votes
      WHERE review_id = pr.id AND user_id = auth.uid()
    ) as user_has_voted
  FROM place_reviews pr
  WHERE pr.place_id = place_id_param
  ORDER BY pr.helpful_count DESC, pr.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260803030000_messages_map_integration.sql
-- SHA256 dce5ce3cec6a36756d0080088cea8fc89afd6e9a52e09c0139662d659375cbe0
-- ============================================================================
-- Messages + Map Integration
-- Live location sharing, location messages, check-in sharing in chats

-- ============================================================================
-- LIVE LOCATION SHARES (Telegram/WhatsApp style)
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_live_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_latitude DOUBLE PRECISION NOT NULL,
  current_longitude DOUBLE PRECISION NOT NULL,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  destination_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  update_interval_seconds INTEGER NOT NULL DEFAULT 30,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_live_locations_message_id ON message_live_locations(message_id);
CREATE INDEX IF NOT EXISTS idx_message_live_locations_conversation_id ON message_live_locations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_live_locations_sender_id ON message_live_locations(sender_id);
CREATE INDEX IF NOT EXISTS idx_message_live_locations_expires_at ON message_live_locations(expires_at);
CREATE INDEX IF NOT EXISTS idx_message_live_locations_is_active ON message_live_locations(is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE message_live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create live location shares" ON message_live_locations;
CREATE POLICY "Users can create live location shares"
  ON message_live_locations FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Conversation members can view live locations" ON message_live_locations;
CREATE POLICY "Conversation members can view live locations"
  ON message_live_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = message_live_locations.conversation_id
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sender can update their live location" ON message_live_locations;
CREATE POLICY "Sender can update their live location"
  ON message_live_locations FOR UPDATE
  USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Sender can delete their live location" ON message_live_locations;
CREATE POLICY "Sender can delete their live location"
  ON message_live_locations FOR DELETE
  USING (auth.uid() = sender_id);

-- ============================================================================
-- LOCATION UPDATE HISTORY (for live location tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_location_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_location_id UUID NOT NULL REFERENCES message_live_locations(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery_level INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_location_updates_live_location_id ON live_location_updates(live_location_id);
CREATE INDEX IF NOT EXISTS idx_live_location_updates_created_at ON live_location_updates(created_at DESC);

-- RLS Policies
ALTER TABLE live_location_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sender can insert updates" ON live_location_updates;
CREATE POLICY "Sender can insert updates"
  ON live_location_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM message_live_locations
      WHERE id = live_location_id AND sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Conversation members can view updates" ON live_location_updates;
CREATE POLICY "Conversation members can view updates"
  ON live_location_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM message_live_locations mll
      JOIN conversation_participants cp ON cp.conversation_id = mll.conversation_id
      WHERE mll.id = live_location_id AND cp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- MESSAGE LOCATION METADATA HELPER FUNCTION
-- ============================================================================

-- Function to extract location from message metadata
CREATE OR REPLACE FUNCTION get_message_location(msg_metadata JSONB)
RETURNS TABLE (
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  location_type TEXT
) AS $$
BEGIN
  RETURN QUERY SELECT
    (msg_metadata->>'location_lat')::DOUBLE PRECISION,
    (msg_metadata->>'location_lon')::DOUBLE PRECISION,
    msg_metadata->>'location_name',
    msg_metadata->>'location_type';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- SHARED CHECK-INS IN MESSAGES
-- ============================================================================

-- No separate table needed - check-ins are shared via metadata:
-- metadata: {
--   "shared_checkin_id": "uuid",
--   "location_lat": 39.6270,
--   "location_lon": 66.9750,
--   "location_name": "Platan Restaurant",
--   "location_type": "checkin"
-- }

-- ============================================================================
-- SHARED PLACES IN MESSAGES
-- ============================================================================

-- Places shared via metadata:
-- metadata: {
--   "location_lat": 39.6270,
--   "location_lon": 66.9750,
--   "location_name": "Registan Square",
--   "location_address": "Samarkand, Uzbekistan",
--   "location_type": "place",
--   "place_id": "osm_12345",
--   "place_category": "landmark"
-- }

-- ============================================================================
-- AUTO-EXPIRE LIVE LOCATIONS
-- ============================================================================

-- Function to auto-deactivate expired live locations
CREATE OR REPLACE FUNCTION deactivate_expired_live_locations()
RETURNS void AS $$
BEGIN
  UPDATE message_live_locations
  SET is_active = false
  WHERE is_active = true AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- This should be called periodically via cron or edge function
-- Example: SELECT cron.schedule('deactivate-expired-locations', '*/1 * * * *', 'SELECT deactivate_expired_live_locations();');

-- ============================================================================
-- GET ACTIVE LIVE LOCATIONS IN CONVERSATION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_conversation_live_locations(conv_id UUID)
RETURNS TABLE (
  id UUID,
  message_id UUID,
  sender_id UUID,
  current_latitude DOUBLE PRECISION,
  current_longitude DOUBLE PRECISION,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  destination_name TEXT,
  expires_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  sender_name TEXT,
  sender_avatar TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mll.id,
    mll.message_id,
    mll.sender_id,
    mll.current_latitude,
    mll.current_longitude,
    mll.destination_latitude,
    mll.destination_longitude,
    mll.destination_name,
    mll.expires_at,
    mll.last_updated,
    p.display_name as sender_name,
    p.avatar_url as sender_avatar
  FROM message_live_locations mll
  JOIN profiles p ON p.id = mll.sender_id
  WHERE
    mll.conversation_id = conv_id
    AND mll.is_active = true
    AND mll.expires_at > now()
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = conv_id AND user_id = auth.uid()
    )
  ORDER BY mll.last_updated DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE LIVE LOCATION POSITION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_live_location_position(
  live_loc_id UUID,
  new_lat DOUBLE PRECISION,
  new_lon DOUBLE PRECISION,
  new_accuracy DOUBLE PRECISION DEFAULT NULL,
  new_speed DOUBLE PRECISION DEFAULT NULL,
  new_heading DOUBLE PRECISION DEFAULT NULL,
  new_battery INTEGER DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Check permission
  IF NOT EXISTS (
    SELECT 1 FROM message_live_locations
    WHERE id = live_loc_id AND sender_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this live location';
  END IF;

  -- Update current position in main table
  UPDATE message_live_locations
  SET
    current_latitude = new_lat,
    current_longitude = new_lon,
    last_updated = now()
  WHERE id = live_loc_id;

  -- Insert update history
  INSERT INTO live_location_updates (
    live_location_id,
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    battery_level
  ) VALUES (
    live_loc_id,
    new_lat,
    new_lon,
    new_accuracy,
    new_speed,
    new_heading,
    new_battery
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STOP LIVE LOCATION SHARING
-- ============================================================================

CREATE OR REPLACE FUNCTION stop_live_location_sharing(live_loc_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE message_live_locations
  SET is_active = false
  WHERE id = live_loc_id AND sender_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE message_live_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE live_location_updates;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260811073500_fix_message_preview_deleted_null.sql
-- SHA256 c4d95e3957bfdb4c17ea80f3df3c5c10133c065f6a1ac60161c801773285662b
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.get_conversation_unreads(
  p_user_id uuid,
  p_conversation_ids uuid[]
)
RETURNS TABLE(
  conversation_id uuid,
  unread_count bigint,
  mention_count bigint,
  last_message_content text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH participant_reads AS (
    SELECT
      cp.conversation_id AS conv_id,
      cp.last_read_at
    FROM public.conversation_participants cp
    WHERE cp.user_id = p_user_id
      AND cp.conversation_id = ANY(p_conversation_ids)
  ),
  unreads AS (
    SELECT
      m.conversation_id AS conv_id,
      count(*) AS cnt,
      count(*) FILTER (
        WHERE m.content ILIKE '%@%'
      ) AS mention_cnt
    FROM public.messages m
    JOIN participant_reads pr ON pr.conv_id = m.conversation_id
    WHERE m.conversation_id = ANY(p_conversation_ids)
      AND m.sender_id != p_user_id
      AND m.created_at > COALESCE(pr.last_read_at, '1970-01-01'::timestamptz)
      AND COALESCE(m.is_deleted, false) = false
    GROUP BY m.conversation_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id AS conv_id,
      m.content
    FROM public.messages m
    WHERE m.conversation_id = ANY(p_conversation_ids)
      AND COALESCE(m.is_deleted, false) = false
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT
    cid.id AS conversation_id,
    COALESCE(u.cnt, 0) AS unread_count,
    COALESCE(u.mention_cnt, 0) AS mention_count,
    lm.content AS last_message_content
  FROM unnest(p_conversation_ids) AS cid(id)
  LEFT JOIN unreads u ON u.conv_id = cid.id
  LEFT JOIN last_msgs lm ON lm.conv_id = cid.id;
END;
$$;

COMMENT ON FUNCTION public.get_conversation_unreads(uuid, uuid[]) IS
  'Returns unread counts and last message for each conversation, treating NULL is_deleted as not deleted';

CREATE OR REPLACE FUNCTION public.get_last_messages(
  p_conversation_ids uuid[]
)
RETURNS TABLE(
  conversation_id uuid,
  content text,
  sender_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.content,
    m.sender_id,
    m.created_at
  FROM public.messages m
  WHERE m.conversation_id = ANY(p_conversation_ids)
    AND COALESCE(m.is_deleted, false) = false
  ORDER BY m.conversation_id, m.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_last_messages(uuid[]) IS
  'Returns the latest non-deleted message per conversation, treating NULL is_deleted as not deleted';

GRANT EXECUTE ON FUNCTION public.get_conversation_unreads(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_messages(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260819045701_2a38dbcd-b06e-4e4a-9711-58063376e2fc.sql
-- SHA256 01b9fd74683b19ee8c46a692a6cde47e0c169f72e7265ebcf03a6aad9caa7bcf
-- ============================================================================
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

-- ============================================================================
-- SOURCE B-web: 20260820091027_899bf8c1-059c-4b4b-b491-30fc1feb84d8.sql
-- SHA256 b960dbbff6f2e61ea8b645fc4a06b8554f5cb27dba2738d4c874be25c232c4fe
-- ============================================================================
-- 1. mailbox_aliases: enable RLS, owner-scoped
ALTER TABLE public.mailbox_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mailbox_aliases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailbox_aliases TO authenticated;
GRANT ALL ON public.mailbox_aliases TO service_role;
DROP POLICY IF EXISTS "Users manage own mailbox aliases" ON public.mailbox_aliases;
CREATE POLICY "Users manage own mailbox aliases" ON public.mailbox_aliases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. search_cache: enable RLS, read-only for clients, writes via service role
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.search_cache FROM anon, authenticated;
GRANT SELECT ON public.search_cache TO anon, authenticated;
GRANT ALL ON public.search_cache TO service_role;
DROP POLICY IF EXISTS "Search cache is readable" ON public.search_cache;
CREATE POLICY "Search cache is readable" ON public.search_cache
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Prevent privilege escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_admin_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.is_admin := OLD.is_admin;
    NEW.role := OLD.role;
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_admin_self_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_admin_self_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_escalation();

-- 4. Materialized views out of the API
REVOKE ALL ON public.hashtags_aggregated FROM anon, authenticated;
REVOKE ALL ON public.popular_product_searches FROM anon, authenticated;

-- 5. Views run as invoker
ALTER VIEW public.hashtags SET (security_invoker = on);
ALTER VIEW public.seller_analytics SET (security_invoker = on);
ALTER VIEW public.product_performance SET (security_invoker = on);
ALTER VIEW public.seller_customer_demographics SET (security_invoker = on);

-- 6. Pin search_path on all SECURITY DEFINER functions missing it
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- 7. Lock down direct execution of SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Re-grant only what the app calls
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'block_user','unblock_user','report_content','respond_to_message_request',
        'join_video_call_guarded','leave_video_call','join_video_call','create_video_call','decline_video_call',
        'process_marketplace_order','create_message_report','change_username',
        'check_username_availability','is_username_available','conversation_stats',
        'effective_conversation_notification_settings','get_data_storage_settings',
        'get_visible_presence','get_unique_view_counts','check_rate_limit',
        'get_admin_age_stats','get_admin_country_stats','get_admin_dau_trend',
        'get_admin_hourly_activity','get_admin_page_stats','get_admin_platform_stats',
        'get_admin_weekly_pattern'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('get_email_for_identifier','check_username_availability','is_username_available')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
  END LOOP;
END $$;

-- ============================================================================
-- SOURCE B-web: 20260820091047_2fbf4dc0-46fb-4fe9-891a-8a2525e63321.sql
-- SHA256 a826be098574380ef77306542e42eda70f8a246f04b55fb5a57fd92133745a3a
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND d.objid IS NULL
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
