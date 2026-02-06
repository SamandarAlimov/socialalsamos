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