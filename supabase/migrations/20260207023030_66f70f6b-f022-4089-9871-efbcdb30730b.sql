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