
-- Create tables first without cross-referencing policies

-- Channels table
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  username text UNIQUE,
  description text,
  avatar_url text,
  cover_url text,
  channel_type text NOT NULL DEFAULT 'public',
  is_paid boolean NOT NULL DEFAULT false,
  subscription_price numeric DEFAULT 0,
  subscriber_count integer NOT NULL DEFAULT 0,
  posts_count integer NOT NULL DEFAULT 0,
  invite_code text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  linked_group_id uuid REFERENCES public.conversations(id),
  allow_comments boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Channel members table
CREATE TABLE public.channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check channel membership
CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_channel_admin(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id AND role IN ('admin', 'moderator')
  )
$$;

-- Now add policies using security definer functions
CREATE POLICY "Channels viewable" ON public.channels
  FOR SELECT USING (
    channel_type = 'public' OR owner_id = auth.uid() OR public.is_channel_member(id, auth.uid())
  );

CREATE POLICY "Users can create channels" ON public.channels
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update channels" ON public.channels
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete channels" ON public.channels
  FOR DELETE USING (auth.uid() = owner_id);

-- Channel members policies
CREATE POLICY "Members viewable" ON public.channel_members
  FOR SELECT USING (
    public.is_channel_member(channel_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND c.channel_type = 'public')
  );

CREATE POLICY "Users can join channels" ON public.channel_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave or admins remove" ON public.channel_members
  FOR DELETE USING (
    auth.uid() = user_id OR public.is_channel_admin(channel_id, auth.uid())
  );

-- Channel invite links
CREATE TABLE public.channel_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invite links viewable by admins" ON public.channel_invite_links
  FOR SELECT USING (public.is_channel_admin(channel_id, auth.uid()));

CREATE POLICY "Admins can create invite links" ON public.channel_invite_links
  FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_channel_admin(channel_id, auth.uid()));

CREATE POLICY "Admins can update invite links" ON public.channel_invite_links
  FOR UPDATE USING (public.is_channel_admin(channel_id, auth.uid()));

CREATE POLICY "Admins can delete invite links" ON public.channel_invite_links
  FOR DELETE USING (public.is_channel_admin(channel_id, auth.uid()));

-- Channel join requests
CREATE TABLE public.channel_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.channel_join_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_channel_admin(channel_id, auth.uid()));

CREATE POLICY "Users can create join requests" ON public.channel_join_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update requests" ON public.channel_join_requests
  FOR UPDATE USING (public.is_channel_admin(channel_id, auth.uid()));

-- Add channel_id to posts
ALTER TABLE public.posts ADD COLUMN channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_posts_channel_id ON public.posts(channel_id);
CREATE INDEX idx_channel_members_channel_id ON public.channel_members(channel_id);
CREATE INDEX idx_channel_members_user_id ON public.channel_members(user_id);
CREATE INDEX idx_channels_channel_type ON public.channels(channel_type);
CREATE INDEX idx_channels_username ON public.channels(username);

-- Triggers
CREATE OR REPLACE FUNCTION public.sync_channel_subscriber_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels SET subscriber_count = subscriber_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels SET subscriber_count = GREATEST(0, subscriber_count - 1) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_channel_subscribers
AFTER INSERT OR DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.sync_channel_subscriber_count();

CREATE OR REPLACE FUNCTION public.sync_channel_posts_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.channel_id IS NOT NULL THEN
    UPDATE public.channels SET posts_count = posts_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.channel_id IS NOT NULL THEN
    UPDATE public.channels SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_channel_posts
AFTER INSERT OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.sync_channel_posts_count();

CREATE OR REPLACE FUNCTION public.auto_add_channel_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.channel_members (channel_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_add_channel_owner_trigger
AFTER INSERT ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.auto_add_channel_owner();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
