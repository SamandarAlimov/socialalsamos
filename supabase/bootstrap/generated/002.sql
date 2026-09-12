-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20260117122601_baa8ed92-f6e0-4348-b387-b58db704b7f2.sql
-- SHA256 0523d6e1c1552af69b1200e4f22cb6d56378057d00199be523acb2f9253cfc3d
-- ============================================================================
-- Fix function search paths for security
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 8));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_product_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products SET likes_count = likes_count + 1 WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products SET likes_count = likes_count - 1 WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_seller_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE public.sellers SET total_sales = total_sales + 1 WHERE id = NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- SOURCE A-superapp: 20260119065203_56ba339a-2422-48d8-951f-417139568d13.sql
-- SHA256 269823dcc3128bfbd0810ddbc3f110d4e5508172168134a20710afe9b1c32157
-- ============================================================================
-- Create table to track messages deleted for specific users only
CREATE TABLE public.message_deletions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

-- Users can view their own deletions
CREATE POLICY "Users can view their own message deletions"
  ON public.message_deletions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own deletions
CREATE POLICY "Users can delete messages for themselves"
  ON public.message_deletions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own deletions (undo)
CREATE POLICY "Users can undo their own message deletions"
  ON public.message_deletions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_deletions;

-- ============================================================================
-- SOURCE A-superapp: 20260120050132_e807879f-1fa8-4ddb-bb83-f9cd0f4c5d21.sql
-- SHA256 1a93243f7ae7c023a7c7240298a6326471cd797e5c05a51b1ac674bfa66d8065
-- ============================================================================
-- Create table to store location history points
CREATE TABLE public.location_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_location_history_user_recorded ON public.location_history(user_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access their own location history
CREATE POLICY "Users can view their own location history"
  ON public.location_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own location history"
  ON public.location_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own location history"
  ON public.location_history FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for identified frequent places (home, work, etc.)
CREATE TABLE public.frequent_places (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  place_type TEXT NOT NULL DEFAULT 'other',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  average_stay_minutes INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMP WITH TIME ZONE,
  is_auto_detected BOOLEAN DEFAULT true,
  confidence_score DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for frequent places
CREATE INDEX idx_frequent_places_user ON public.frequent_places(user_id);
CREATE INDEX idx_frequent_places_type ON public.frequent_places(user_id, place_type);

-- Enable RLS
ALTER TABLE public.frequent_places ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own frequent places"
  ON public.frequent_places FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own frequent places"
  ON public.frequent_places FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own frequent places"
  ON public.frequent_places FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own frequent places"
  ON public.frequent_places FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for daily routes summary
CREATE TABLE public.daily_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_date DATE NOT NULL,
  total_distance_km DOUBLE PRECISION DEFAULT 0,
  total_duration_minutes INTEGER DEFAULT 0,
  places_visited INTEGER DEFAULT 0,
  route_geometry JSONB,
  visits_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, route_date)
);

-- Create index for daily routes
CREATE INDEX idx_daily_routes_user_date ON public.daily_routes(user_id, route_date DESC);

-- Enable RLS
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own daily routes"
  ON public.daily_routes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily routes"
  ON public.daily_routes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily routes"
  ON public.daily_routes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily routes"
  ON public.daily_routes FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at on frequent_places
CREATE TRIGGER update_frequent_places_updated_at
  BEFORE UPDATE ON public.frequent_places
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updating updated_at on daily_routes
CREATE TRIGGER update_daily_routes_updated_at
  BEFORE UPDATE ON public.daily_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.frequent_places;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_routes;

-- ============================================================================
-- SOURCE A-superapp: 20260122030012_ba2f99a5-185f-4136-9c60-4e4395cbdfa6.sql
-- SHA256 754d1f4270b238d7ffc2f84eed97d8504379b808fd03e1c5a3e80c6a432028fe
-- ============================================================================
-- Add country and birth_date columns to profiles for demographics
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Create admin analytics view for aggregated stats
CREATE OR REPLACE VIEW admin_user_stats AS
SELECT 
  COUNT(DISTINCT id) as total_users,
  COUNT(DISTINCT CASE WHEN is_online = true THEN id END) as online_users,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN id END) as new_users_24h,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN id END) as new_users_7d,
  COUNT(DISTINCT CASE WHEN is_verified = true THEN id END) as verified_users
FROM public.profiles;

-- Create RLS policy for admin analytics view access
-- Note: Views inherit table RLS, so we need a function to get stats securely

CREATE OR REPLACE FUNCTION public.get_admin_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'online_users', (SELECT COUNT(*) FROM profiles WHERE is_online = true),
    'new_users_24h', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '24 hours'),
    'new_users_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days'),
    'verified_users', (SELECT COUNT(*) FROM profiles WHERE is_verified = true),
    'total_posts', (SELECT COUNT(*) FROM posts),
    'posts_24h', (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '24 hours'),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_24h', (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours')
  ) INTO result;

  RETURN result;
END;
$$;

-- Function to get hourly activity distribution
CREATE OR REPLACE FUNCTION public.get_admin_hourly_activity()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      EXTRACT(HOUR FROM created_at) as hour,
      COUNT(*) as activity_count,
      SUM(duration_seconds) as total_duration
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY hour
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get page/feature usage stats
CREATE OR REPLACE FUNCTION public.get_admin_page_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      page,
      COUNT(*) as visit_count,
      COUNT(DISTINCT user_id) as unique_users,
      SUM(duration_seconds) as total_duration,
      AVG(duration_seconds) as avg_duration
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    AND page IS NOT NULL
    GROUP BY page
    ORDER BY visit_count DESC
    LIMIT 20
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get country distribution
CREATE OR REPLACE FUNCTION public.get_admin_country_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      COALESCE(country, 'Unknown') as country,
      COUNT(*) as user_count
    FROM profiles
    GROUP BY country
    ORDER BY user_count DESC
    LIMIT 20
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get age distribution
CREATE OR REPLACE FUNCTION public.get_admin_age_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      CASE 
        WHEN birth_date IS NULL THEN 'Unknown'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 18 THEN '13-17'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 55 THEN '45-54'
        ELSE '55+'
      END as age_group,
      COUNT(*) as user_count
    FROM profiles
    GROUP BY 
      CASE 
        WHEN birth_date IS NULL THEN 'Unknown'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 18 THEN '13-17'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 25 THEN '18-24'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 35 THEN '25-34'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 45 THEN '35-44'
        WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 55 THEN '45-54'
        ELSE '55+'
      END
    ORDER BY 
      CASE age_group
        WHEN '13-17' THEN 1
        WHEN '18-24' THEN 2
        WHEN '25-34' THEN 3
        WHEN '35-44' THEN 4
        WHEN '45-54' THEN 5
        WHEN '55+' THEN 6
        ELSE 7
      END
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get daily active users trend
CREATE OR REPLACE FUNCTION public.get_admin_dau_trend()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      DATE(created_at) as date,
      COUNT(DISTINCT user_id) as dau
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get weekly activity by day of week
CREATE OR REPLACE FUNCTION public.get_admin_weekly_pattern()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT 
      EXTRACT(DOW FROM created_at) as day_of_week,
      COUNT(*) as activity_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY EXTRACT(DOW FROM created_at)
    ORDER BY day_of_week
  ) t INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================================
-- SOURCE A-superapp: 20260122030148_63b29770-ec18-4edd-9c70-638667b9c83c.sql
-- SHA256 54e9f31e35c18da5d7078c5b762dcb0e2a5046e71c859df25dd054067aac9658
-- ============================================================================
-- Drop the security definer view as we use secure functions instead
DROP VIEW IF EXISTS admin_user_stats;

-- Add RLS policy for admins to read user_activity_logs
CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- SOURCE A-superapp: 20260127175807_bb147917-839f-4bbc-90d8-74c7dec39b6a.sql
-- SHA256 1fccd4a861845c9e6193a602e1b9ca2eb71be0c4ed9140d5c0e2a191db1fbe96
-- ============================================================================
-- Create post_collaborators table for collaboration system
CREATE TABLE public.post_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view collaborations they're involved in
CREATE POLICY "Users can view their collaborations"
ON public.post_collaborators
FOR SELECT
USING (
  auth.uid() = user_id OR 
  auth.uid() = invited_by OR
  post_id IN (SELECT id FROM posts WHERE user_id = auth.uid())
);

-- Post owner can invite collaborators
CREATE POLICY "Post owners can invite collaborators"
ON public.post_collaborators
FOR INSERT
WITH CHECK (
  auth.uid() = invited_by AND
  post_id IN (SELECT id FROM posts WHERE user_id = auth.uid())
);

-- Invited user can update their response (accept/decline)
CREATE POLICY "Invited users can respond"
ON public.post_collaborators
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Post owner can delete collaboration invites
CREATE POLICY "Post owners can remove collaborators"
ON public.post_collaborators
FOR DELETE
USING (
  auth.uid() = invited_by OR
  auth.uid() = user_id
);

-- Enable realtime for collaboration updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_collaborators;

-- Create function to notify on collaboration invite
CREATE OR REPLACE FUNCTION public.notify_on_collaboration_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_name TEXT;
BEGIN
  SELECT display_name INTO inviter_name FROM profiles WHERE id = NEW.invited_by;
  
  INSERT INTO notifications (user_id, type, title, body, data)
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

-- Create trigger for collaboration invite notification
CREATE TRIGGER on_collaboration_invite
  AFTER INSERT ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_invite();

-- Create function to notify when collaboration is accepted
CREATE OR REPLACE FUNCTION public.notify_on_collaboration_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT display_name INTO accepter_name FROM profiles WHERE id = NEW.user_id;
    
    INSERT INTO notifications (user_id, type, title, body, data)
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
  
  RETURN NEW;
END;
$$;

-- Create trigger for collaboration accepted notification
CREATE TRIGGER on_collaboration_accepted
  AFTER UPDATE ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_accepted();

-- ============================================================================
-- SOURCE A-superapp: 20260205072519_5a6c24d7-08bf-4bb2-b897-61debb32ce54.sql
-- SHA256 e0ab3caae3833d128a377113d033033c308b8fdd59941b821a802b7b8104ed6f
-- ============================================================================
-- Create reposts table
CREATE TABLE public.reposts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  quote TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view reposts" 
ON public.reposts 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own reposts" 
ON public.reposts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reposts" 
ON public.reposts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add reposts_count to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposts_count INTEGER NOT NULL DEFAULT 0;

-- Create trigger function for reposts count
CREATE OR REPLACE FUNCTION public.sync_post_reposts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS sync_reposts_count ON public.reposts;
CREATE TRIGGER sync_reposts_count
AFTER INSERT OR DELETE ON public.reposts
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_reposts_count();

-- Enable realtime for reposts
ALTER PUBLICATION supabase_realtime ADD TABLE public.reposts;

-- ============================================================================
-- SOURCE A-superapp: 20260206031601_660bf48d-c9ba-4a90-986b-3117f3beb251.sql
-- SHA256 10f0a8a4636d02577bad1680ca92043ba62a97d178b046b112eaf4ca27ae921d
-- ============================================================================
-- Create trigger function to sync story views count
CREATE OR REPLACE FUNCTION public.sync_story_views_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.stories
    SET views_count = COALESCE(views_count, 0) + 1
    WHERE id = NEW.story_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.stories
    SET views_count = GREATEST(COALESCE(views_count, 0) - 1, 0)
    WHERE id = OLD.story_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on story_views table
DROP TRIGGER IF EXISTS trigger_sync_story_views_count ON public.story_views;
CREATE TRIGGER trigger_sync_story_views_count
AFTER INSERT OR DELETE ON public.story_views
FOR EACH ROW
EXECUTE FUNCTION public.sync_story_views_count();

-- Sync existing views count to be accurate
UPDATE public.stories s
SET views_count = (
  SELECT COUNT(*)
  FROM public.story_views sv
  WHERE sv.story_id = s.id
);

-- Enable realtime for stories table to catch views_count updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

-- ============================================================================
-- SOURCE A-superapp: 20260207023030_66f70f6b-f022-4089-9871-efbcdb30730b.sql
-- SHA256 cc070121b1264353114b7662222faaad0d22b7366e86356c4c810c449c225c9e
-- ============================================================================
-- Ads system: YouTube/Instagram style advertising platform

-- Main ads table
CREATE TABLE public.ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image', -- image, video
  destination_url TEXT, -- where user goes when clicking
  call_to_action TEXT DEFAULT 'Learn More', -- CTA button text
  ad_type TEXT NOT NULL DEFAULT 'feed', -- feed, story, both
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, paused, rejected, completed
  budget NUMERIC NOT NULL DEFAULT 0, -- total budget in USD
  spent NUMERIC NOT NULL DEFAULT 0, -- amount spent
  daily_budget NUMERIC, -- optional daily limit
  bid_amount NUMERIC DEFAULT 0.01, -- cost per impression/click
  billing_type TEXT NOT NULL DEFAULT 'cpm', -- cpm (per 1000 impressions), cpc (per click)
  
  -- Targeting options
  target_countries TEXT[] DEFAULT '{}',
  target_age_min INTEGER,
  target_age_max INTEGER,
  target_gender TEXT, -- male, female, all
  target_interests TEXT[] DEFAULT '{}',
  
  -- Schedule
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  
  -- Stats (denormalized for performance)
  impressions_count INTEGER NOT NULL DEFAULT 0,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  reach_count INTEGER NOT NULL DEFAULT 0, -- unique users who saw
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ad impressions tracking
CREATE TABLE public.ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id UUID, -- can be null for anonymous users
  placement TEXT NOT NULL, -- feed, story
  device_type TEXT, -- mobile, desktop, tablet
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ad clicks tracking
CREATE TABLE public.ad_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id UUID,
  placement TEXT NOT NULL,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ad reach tracking (unique users)
CREATE TABLE public.ad_reach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ad_id, user_id)
);

-- Enable RLS
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_reach ENABLE ROW LEVEL SECURITY;

-- Ads policies
CREATE POLICY "Users can view active ads"
ON public.ads FOR SELECT
USING (status = 'active' OR user_id = auth.uid());

CREATE POLICY "Users can create their own ads"
ON public.ads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ads"
ON public.ads FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ads"
ON public.ads FOR DELETE
USING (auth.uid() = user_id);

-- Impressions policies
CREATE POLICY "Users can view their ad impressions"
ON public.ad_impressions FOR SELECT
USING (ad_id IN (SELECT id FROM public.ads WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can create impressions"
ON public.ad_impressions FOR INSERT
WITH CHECK (true);

-- Clicks policies
CREATE POLICY "Users can view their ad clicks"
ON public.ad_clicks FOR SELECT
USING (ad_id IN (SELECT id FROM public.ads WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can create clicks"
ON public.ad_clicks FOR INSERT
WITH CHECK (true);

-- Reach policies
CREATE POLICY "Users can view their ad reach"
ON public.ad_reach FOR SELECT
USING (ad_id IN (SELECT id FROM public.ads WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can create reach"
ON public.ad_reach FOR INSERT
WITH CHECK (true);

-- Triggers for stats sync
CREATE OR REPLACE FUNCTION public.sync_ad_impressions_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ads 
  SET impressions_count = impressions_count + 1,
      updated_at = now()
  WHERE id = NEW.ad_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.sync_ad_clicks_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ads 
  SET clicks_count = clicks_count + 1,
      updated_at = now()
  WHERE id = NEW.ad_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.sync_ad_reach_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ads 
  SET reach_count = reach_count + 1,
      updated_at = now()
  WHERE id = NEW.ad_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_ad_impression_insert
AFTER INSERT ON public.ad_impressions
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_impressions_count();

CREATE TRIGGER on_ad_click_insert
AFTER INSERT ON public.ad_clicks
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_clicks_count();

CREATE TRIGGER on_ad_reach_insert
AFTER INSERT ON public.ad_reach
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_reach_count();

-- Updated at trigger
CREATE TRIGGER update_ads_updated_at
BEFORE UPDATE ON public.ads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for ads stats
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads;

-- Index for faster ad retrieval
CREATE INDEX idx_ads_status ON public.ads(status);
CREATE INDEX idx_ads_type ON public.ads(ad_type);
CREATE INDEX idx_ads_user_id ON public.ads(user_id);
CREATE INDEX idx_ad_impressions_ad_id ON public.ad_impressions(ad_id);
CREATE INDEX idx_ad_clicks_ad_id ON public.ad_clicks(ad_id);

-- ============================================================================
-- SOURCE A-superapp: 20260221160719_4c3c1d1f-37f9-444f-90de-9a1d49b5c973.sql
-- SHA256 37505e4828a4a4e287c0508b4f9d5c4eeffdfe4287fe0913482b30cadff7dc02
-- ============================================================================

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


-- ============================================================================
-- SOURCE A-superapp: 20260225062319_9e8108cf-0c41-4575-9cca-e843fcadf968.sql
-- SHA256 e8441ab230cfbe56f23f85475c0f1da6a3bc8247c874f80cf3e77d8df1ed4e6b
-- ============================================================================

-- Allow admins to view all verification requests
CREATE POLICY "Admins can view all verification requests"
ON public.verification_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update verification requests (approve/reject)
CREATE POLICY "Admins can update verification requests"
ON public.verification_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));


-- ============================================================================
-- SOURCE A-superapp: 20260225062547_26db02f3-2209-4583-9801-d4934e089b89.sql
-- SHA256 ba64e9844ef7330421a10a03dcb0c9707ba543aff552b0636ff8ee3762783b40
-- ============================================================================

-- Allow admins to update any profile (for verification toggle)
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));


-- ============================================================================
-- SOURCE A-superapp: 20260225070620_915e9c9e-9a68-4e0e-ae38-f84941cf87b2.sql
-- SHA256 e7dd4dbb307f0d5144baf07e07879ce71fcc3cb639babc038678c713a3a5d3bf
-- ============================================================================

-- Create mini_apps table for user-created mini applications
CREATE TABLE public.mini_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  is_approved BOOLEAN NOT NULL DEFAULT true,
  users_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

-- Everyone can view approved mini apps
CREATE POLICY "Anyone can view approved mini apps"
ON public.mini_apps FOR SELECT
USING (is_approved = true OR user_id = auth.uid());

-- Users can create their own mini apps
CREATE POLICY "Users can create mini apps"
ON public.mini_apps FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own mini apps
CREATE POLICY "Users can update own mini apps"
ON public.mini_apps FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own mini apps
CREATE POLICY "Users can delete own mini apps"
ON public.mini_apps FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_mini_apps_updated_at
BEFORE UPDATE ON public.mini_apps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert islom.uz as the first real mini app (for user islomuz)
-- We'll do this after finding the user


-- ============================================================================
-- SOURCE A-superapp: 20260302060130_f10c5378-c8f1-4998-8d9b-e4b3215c69ff.sql
-- SHA256 c31d408097d4f481c9332ddb8f39ddb1ab067ffd70e31fd613640efe3aca5c70
-- ============================================================================

-- Create storage bucket for mini app icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('mini-app-icons', 'mini-app-icons', true);

-- Allow authenticated users to upload icons
CREATE POLICY "Users can upload mini app icons"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mini-app-icons');

-- Allow everyone to view icons
CREATE POLICY "Anyone can view mini app icons"
ON storage.objects FOR SELECT
USING (bucket_id = 'mini-app-icons');

-- Allow users to delete their own icons
CREATE POLICY "Users can delete their own mini app icons"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mini-app-icons' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- SOURCE A-superapp: 20260306062221_c5244b2e-87bf-4e8d-a53c-c0ea48887726.sql
-- SHA256 7d4c06c0ef6406c4f3b1b34b84ff2c9508e69367e3454d7ec6fc74713bf4e248
-- ============================================================================

-- Create post_views table
CREATE TABLE public.post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Add views_count to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

-- Enable RLS
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view post views" ON public.post_views FOR SELECT USING (true);
CREATE POLICY "Authenticated users can record views" ON public.post_views FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger to sync views count
CREATE OR REPLACE FUNCTION public.sync_post_views_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET views_count = GREATEST(COALESCE(views_count, 0) - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_post_views_count_trigger
AFTER INSERT OR DELETE ON public.post_views
FOR EACH ROW EXECUTE FUNCTION public.sync_post_views_count();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_views;


-- ============================================================================
-- SOURCE A-superapp: 20260511072158_4de7e14f-085a-4048-8ef0-12f410fdda4a.sql
-- SHA256 526c1c2696575c5c37fefd43aaeeaa2a9e6f5ff382b4202141ece3bad726c6f4
-- ============================================================================

-- Restrict sellers SELECT to authenticated users to prevent scraping of business email/phone
DROP POLICY IF EXISTS "Sellers viewable by everyone" ON public.sellers;
CREATE POLICY "Sellers viewable by authenticated users"
ON public.sellers
FOR SELECT
TO authenticated
USING (true);

-- Lock down direct INSERTs to notifications by clients.
-- SECURITY DEFINER triggers (notify_on_*) bypass RLS so they keep working.
DROP POLICY IF EXISTS "Users can receive notifications" ON public.notifications;
CREATE POLICY "Block direct client notification inserts"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);


-- ============================================================================
-- SOURCE A-superapp: 20260514035454_810fba86-13f6-46b0-b6b3-f76bcaf457c0.sql
-- SHA256 0de7c785d8d7b425f858de8fde0575e93d6bd5474b16c96207e17ec7e1d31c45
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_email_for_identifier(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF _identifier IS NULL OR length(trim(_identifier)) = 0 THEN
    RETURN NULL;
  END IF;

  -- If it already looks like an email, just return it (lowercased)
  IF position('@' in _identifier) > 0 THEN
    RETURN lower(trim(_identifier));
  END IF;

  -- Try username via profiles table
  SELECT id INTO v_id FROM public.profiles
  WHERE lower(username) = lower(trim(_identifier))
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_id LIMIT 1;
    IF v_email IS NOT NULL THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Try phone match in auth.users
  SELECT email INTO v_email FROM auth.users
  WHERE phone = regexp_replace(_identifier, '[^0-9]', '', 'g')
     OR phone = trim(_identifier)
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_for_identifier(text) TO anon, authenticated;

-- ============================================================================
-- SOURCE A-superapp: 20260518090000_fix_post_views_profile_lookup.sql
-- SHA256 b61f6b201ca6045ad51b0ff854c57b613fec622ac2e5a965b1ef2816a035e047
-- ============================================================================
-- Make post and story viewer lists fast and safely joinable with public profiles.
CREATE INDEX IF NOT EXISTS idx_post_views_post_id_viewed_at
ON public.post_views (post_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_views_user_id
ON public.post_views (user_id);

CREATE INDEX IF NOT EXISTS idx_story_views_story_id_viewed_at
ON public.story_views (story_id, viewed_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_views_user_id_profiles_fkey'
      AND conrelid = 'public.post_views'::regclass
  ) THEN
    ALTER TABLE public.post_views
      ADD CONSTRAINT post_views_user_id_profiles_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_views_viewer_id_profiles_fkey'
      AND conrelid = 'public.story_views'::regclass
  ) THEN
    ALTER TABLE public.story_views
      ADD CONSTRAINT story_views_viewer_id_profiles_fkey
      FOREIGN KEY (viewer_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;


-- ============================================================================
-- SOURCE B-web: 20260603053040_8cb6ec82-77d2-43e6-8d61-46599d26765a.sql
-- SHA256 8927b1e97af51bb6a0b3435a0a434d7d78973c3cf3e7f02131594502b573d8e0
-- ============================================================================
-- Drop duplicate notification triggers (keep one per event)
DROP TRIGGER IF EXISTS on_new_like ON public.post_likes;
DROP TRIGGER IF EXISTS on_new_comment ON public.comments;
DROP TRIGGER IF EXISTS on_new_follow ON public.follows;

-- Clean up existing duplicate notification rows (keep oldest)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, type, data, date_trunc('second', created_at)
           ORDER BY created_at ASC
         ) AS rn
  FROM public.notifications
  WHERE created_at > now() - interval '30 days'
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id AND r.rn > 1;

-- ============================================================================
-- SOURCE A-superapp: 20260625000000_fix_unique_view_counts.sql
-- SHA256 fddc46c9c76233fa9ccf83d452eab4126c25c02e7ad1b24ed9a47b9691048368
-- ============================================================================
-- Function to get unique viewer counts for multiple posts
CREATE OR REPLACE FUNCTION public.get_unique_view_counts(post_ids uuid[])
RETURNS TABLE(post_id uuid, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.post_id,
    COUNT(DISTINCT pv.user_id) as count
  FROM public.post_views pv
  WHERE pv.post_id = ANY(post_ids)
  GROUP BY pv.post_id;
END;
$$;

-- Update the sync function to count distinct users
CREATE OR REPLACE FUNCTION public.sync_post_views_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  unique_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Count distinct users for this post
    SELECT COUNT(DISTINCT user_id) INTO unique_count
    FROM public.post_views
    WHERE post_id = NEW.post_id;
    
    UPDATE public.posts 
    SET views_count = unique_count 
    WHERE id = NEW.post_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Recalculate distinct users for this post
    SELECT COUNT(DISTINCT user_id) INTO unique_count
    FROM public.post_views
    WHERE post_id = OLD.post_id;
    
    UPDATE public.posts 
    SET views_count = unique_count 
    WHERE id = OLD.post_id;
    
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Recalculate distinct users for this post
    SELECT COUNT(DISTINCT user_id) INTO unique_count
    FROM public.post_views
    WHERE post_id = NEW.post_id;
    
    UPDATE public.posts 
    SET views_count = unique_count 
    WHERE id = NEW.post_id;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS sync_post_views_count_trigger ON public.post_views;
CREATE TRIGGER sync_post_views_count_trigger
AFTER INSERT OR DELETE OR UPDATE ON public.post_views
FOR EACH ROW EXECUTE FUNCTION public.sync_post_views_count();

-- Fix all existing view counts to be accurate (count distinct users)
UPDATE public.posts p
SET views_count = (
  SELECT COUNT(DISTINCT user_id)
  FROM public.post_views pv
  WHERE pv.post_id = p.id
);


-- ============================================================================
-- SOURCE B-web: 20260701033952_80e10318-2095-4ee9-b044-6239aa2dba16.sql
-- SHA256 0827fed489e1f7d8ada713e7e65f5e17e06929e2c8aa7adfb430dc680c8f93ef
-- ============================================================================

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


-- ============================================================================
-- SOURCE B-web: 20260701034016_19ba840e-6eac-4dec-b31f-e8aae5d0f184.sql
-- SHA256 f500dd48985b95f19a7df89fd467dcbf4f4a959fc4f3b8bd7685a0e88aee1251
-- ============================================================================

-- Re-add location column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;

-- Restrict anon column-level access: no access to location
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, avatar_url, cover_url, bio,
  is_verified, followers_count, following_count, posts_count,
  is_online, last_seen, country, website, birth_date, created_at, updated_at
) ON public.profiles TO anon;

-- Authenticated still has full row+column access
GRANT SELECT ON public.profiles TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260703072929_1076f68b-1454-46e9-8fb6-0097adc3d057.sql
-- SHA256 ac195d4797486cb5be5638e0bddec1b30279534665571d443d4705c51b407651
-- ============================================================================

-- 1. Add payment tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- 2. Atomic order-processing RPC
CREATE OR REPLACE FUNCTION public.process_marketplace_order(
  _shipping_address jsonb,
  _payment_method text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet_balance numeric;
  v_wallet_id uuid;
  v_seller record;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_subtotal numeric;
  v_shipping numeric;
  v_total numeric;
  v_grand_total numeric := 0;
  v_receipt text;
  v_cart_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _payment_method NOT IN ('wallet','card_on_delivery','cash') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  SELECT count(*) INTO v_cart_count FROM public.cart_items WHERE user_id = v_user;
  IF v_cart_count = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  -- Compute grand total across all cart items
  SELECT COALESCE(SUM((p.price * ci.quantity) + COALESCE(p.shipping_price,0)), 0)
    INTO v_grand_total
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user;

  -- Wallet path: check + deduct
  IF _payment_method = 'wallet' THEN
    SELECT id, balance INTO v_wallet_id, v_wallet_balance
      FROM public.wallets WHERE user_id = v_user
      FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, balance) VALUES (v_user, 0)
      RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
    END IF;

    IF v_wallet_balance < v_grand_total THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  END IF;

  -- Create one order per seller
  FOR v_seller IN
    SELECT p.seller_id AS seller_id
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user
      GROUP BY p.seller_id
  LOOP
    SELECT COALESCE(SUM(p.price * ci.quantity),0),
           COALESCE(SUM(COALESCE(p.shipping_price,0)),0)
      INTO v_subtotal, v_shipping
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user AND p.seller_id = v_seller.seller_id;

    v_total := v_subtotal + v_shipping;
    v_receipt := 'RCP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6));

    INSERT INTO public.orders (
      buyer_id, seller_id, order_number,
      subtotal, shipping_cost, total,
      shipping_address, notes,
      payment_status, payment_method, receipt_number,
      paid_at, status
    ) VALUES (
      v_user, v_seller.seller_id, 'TMP',
      v_subtotal, v_shipping, v_total,
      _shipping_address, _notes,
      CASE WHEN _payment_method = 'wallet' THEN 'paid' ELSE 'pending' END,
      _payment_method, v_receipt,
      CASE WHEN _payment_method = 'wallet' THEN now() ELSE NULL END,
      'pending'
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, title, quantity, price, total)
    SELECT v_order_id, p.id, p.title, ci.quantity, p.price, p.price * ci.quantity
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user AND p.seller_id = v_seller.seller_id;

    v_order_ids := v_order_ids || v_order_id;
  END LOOP;

  -- Wallet deduction + transaction log
  IF _payment_method = 'wallet' THEN
    UPDATE public.wallets
      SET balance = balance - v_grand_total, updated_at = now()
      WHERE id = v_wallet_id;

    INSERT INTO public.transactions (wallet_id, user_id, amount, type, status, description, reference_id, metadata)
    VALUES (
      v_wallet_id, v_user, -v_grand_total, 'purchase', 'completed',
      'Marketplace buyurtma',
      v_order_ids[1]::text,
      jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'method', 'wallet')
    );
  END IF;

  -- Clear cart
  DELETE FROM public.cart_items WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'success', true,
    'order_ids', to_jsonb(v_order_ids),
    'payment_status', CASE WHEN _payment_method = 'wallet' THEN 'paid' ELSE 'pending' END,
    'total', v_grand_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_marketplace_order(jsonb, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_marketplace_order(jsonb, text, text) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260704035611_7e067a56-dbc8-44c6-9103-7f7d2297e01a.sql
-- SHA256 4e9ca7bf2434f9806152b390df925eb4e4db671b29a40b621517a602c55cde28
-- ============================================================================

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

