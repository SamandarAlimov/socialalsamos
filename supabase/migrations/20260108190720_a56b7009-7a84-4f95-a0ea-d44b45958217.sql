-- Add story_id and shared_post_id columns to messages table for tracking story replies and shared posts
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_story_id ON public.messages(story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_shared_post_id ON public.messages(shared_post_id) WHERE shared_post_id IS NOT NULL;

-- Enable realtime for the new columns
COMMENT ON COLUMN public.messages.story_id IS 'Reference to the story this message is replying to';
COMMENT ON COLUMN public.messages.shared_post_id IS 'Reference to the shared post in this message';