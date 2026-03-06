
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
