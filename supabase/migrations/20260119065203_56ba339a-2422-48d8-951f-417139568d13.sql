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