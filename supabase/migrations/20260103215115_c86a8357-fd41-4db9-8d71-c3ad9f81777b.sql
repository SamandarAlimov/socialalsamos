-- Create story_highlights table for saving stories permanently
CREATE TABLE public.story_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create story_highlight_items for stories in each highlight
CREATE TABLE public.story_highlight_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  highlight_id UUID NOT NULL REFERENCES public.story_highlights(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(highlight_id, story_id)
);

-- Enable RLS
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_highlight_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for story_highlights
CREATE POLICY "Highlights viewable by everyone"
ON public.story_highlights FOR SELECT
USING (true);

CREATE POLICY "Users can create own highlights"
ON public.story_highlights FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own highlights"
ON public.story_highlights FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own highlights"
ON public.story_highlights FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for story_highlight_items
CREATE POLICY "Highlight items viewable by everyone"
ON public.story_highlight_items FOR SELECT
USING (true);

CREATE POLICY "Users can add items to own highlights"
ON public.story_highlight_items FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.story_highlights
  WHERE id = highlight_id AND user_id = auth.uid()
));

CREATE POLICY "Users can update items in own highlights"
ON public.story_highlight_items FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.story_highlights
  WHERE id = highlight_id AND user_id = auth.uid()
));

CREATE POLICY "Users can delete items from own highlights"
ON public.story_highlight_items FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.story_highlights
  WHERE id = highlight_id AND user_id = auth.uid()
));

-- Trigger for updating updated_at
CREATE TRIGGER update_story_highlights_updated_at
BEFORE UPDATE ON public.story_highlights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_highlights;
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_highlight_items;