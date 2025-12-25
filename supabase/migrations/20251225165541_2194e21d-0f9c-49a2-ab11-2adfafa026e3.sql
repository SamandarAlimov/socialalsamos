-- Create live_streams table
CREATE TABLE public.live_streams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  viewer_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create live_stream_viewers table for real-time viewer tracking
CREATE TABLE public.live_stream_viewers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(stream_id, user_id)
);

-- Create live_stream_comments table
CREATE TABLE public.live_stream_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create live_stream_reactions table
CREATE TABLE public.live_stream_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_stream_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_stream_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_stream_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for live_streams
CREATE POLICY "Live streams are viewable by everyone"
  ON public.live_streams FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own streams"
  ON public.live_streams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streams"
  ON public.live_streams FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streams"
  ON public.live_streams FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for live_stream_viewers
CREATE POLICY "Viewers are viewable by stream owner"
  ON public.live_stream_viewers FOR SELECT
  USING (true);

CREATE POLICY "Users can join streams"
  ON public.live_stream_viewers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave streams"
  ON public.live_stream_viewers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can remove themselves from streams"
  ON public.live_stream_viewers FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for live_stream_comments
CREATE POLICY "Comments are viewable by everyone"
  ON public.live_stream_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create comments"
  ON public.live_stream_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.live_stream_comments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for live_stream_reactions
CREATE POLICY "Reactions are viewable by everyone"
  ON public.live_stream_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can add reactions"
  ON public.live_stream_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for live features
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_viewers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_reactions;

-- Create indexes for performance
CREATE INDEX idx_live_streams_user_id ON public.live_streams(user_id);
CREATE INDEX idx_live_streams_status ON public.live_streams(status);
CREATE INDEX idx_live_stream_viewers_stream_id ON public.live_stream_viewers(stream_id);
CREATE INDEX idx_live_stream_comments_stream_id ON public.live_stream_comments(stream_id);
CREATE INDEX idx_live_stream_reactions_stream_id ON public.live_stream_reactions(stream_id);