-- Create story_views table to track who viewed each story
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

-- Enable RLS
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Story owner can view who viewed their stories
CREATE POLICY "Story owners can view their story views"
ON public.story_views
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.stories
    WHERE stories.id = story_views.story_id
    AND stories.user_id = auth.uid()
  )
);

-- Users can mark stories as viewed
CREATE POLICY "Users can mark stories as viewed"
ON public.story_views
FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Index for quick lookups
CREATE INDEX idx_story_views_story_id ON public.story_views(story_id);
CREATE INDEX idx_story_views_viewer_id ON public.story_views(viewer_id);

-- Enable realtime for story_views
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;