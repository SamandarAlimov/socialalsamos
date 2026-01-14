-- Create scheduled_messages table
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own scheduled messages
CREATE POLICY "Users can view their own scheduled messages"
ON public.scheduled_messages
FOR SELECT
USING (auth.uid() = sender_id);

-- Users can create their own scheduled messages
CREATE POLICY "Users can create their own scheduled messages"
ON public.scheduled_messages
FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Users can update their own scheduled messages
CREATE POLICY "Users can update their own scheduled messages"
ON public.scheduled_messages
FOR UPDATE
USING (auth.uid() = sender_id);

-- Users can delete their own scheduled messages
CREATE POLICY "Users can delete their own scheduled messages"
ON public.scheduled_messages
FOR DELETE
USING (auth.uid() = sender_id);

-- Create index for efficient querying
CREATE INDEX idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_scheduled_messages_sender ON public.scheduled_messages(sender_id);
CREATE INDEX idx_scheduled_messages_conversation ON public.scheduled_messages(conversation_id);