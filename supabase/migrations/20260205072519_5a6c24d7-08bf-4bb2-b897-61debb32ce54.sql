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