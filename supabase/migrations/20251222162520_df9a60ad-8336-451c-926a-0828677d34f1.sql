-- Add pinned_messages table for tracking pinned messages per conversation
CREATE TABLE public.pinned_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES public.profiles(id),
  pinned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, message_id)
);

-- Enable RLS
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for pinned_messages
CREATE POLICY "Users can view pinned messages in their conversations"
ON public.pinned_messages FOR SELECT
USING (is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can pin messages in their conversations"
ON public.pinned_messages FOR INSERT
WITH CHECK (is_conversation_participant(conversation_id, auth.uid()) AND auth.uid() = pinned_by);

CREATE POLICY "Users can unpin messages they pinned or admins"
ON public.pinned_messages FOR DELETE
USING (pinned_by = auth.uid() OR EXISTS (
  SELECT 1 FROM conversation_participants 
  WHERE conversation_id = pinned_messages.conversation_id 
  AND user_id = auth.uid() 
  AND role = 'admin'
));

-- Add call_history table for tracking call events
CREATE TABLE public.call_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id),
  callee_id UUID REFERENCES public.profiles(id),
  call_type TEXT NOT NULL DEFAULT 'audio',
  status TEXT NOT NULL DEFAULT 'initiated',
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for call_history
CREATE POLICY "Users can view their call history"
ON public.call_history FOR SELECT
USING (caller_id = auth.uid() OR callee_id = auth.uid() OR is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can create call history"
ON public.call_history FOR INSERT
WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Participants can update call history"
ON public.call_history FOR UPDATE
USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Add user_sessions table for device management
CREATE TABLE public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name TEXT,
  device_type TEXT,
  os_name TEXT,
  browser_name TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_current BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_sessions
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sessions"
ON public.user_sessions FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sessions"
ON public.user_sessions FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sessions"
ON public.user_sessions FOR DELETE
USING (user_id = auth.uid());

-- Add user_settings table for preferences
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  last_seen_visibility TEXT DEFAULT 'everyone',
  read_receipts_enabled BOOLEAN DEFAULT true,
  call_permissions TEXT DEFAULT 'everyone',
  group_invite_permissions TEXT DEFAULT 'everyone',
  two_factor_enabled BOOLEAN DEFAULT false,
  notification_sounds BOOLEAN DEFAULT true,
  notification_preview BOOLEAN DEFAULT true,
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_settings
CREATE POLICY "Users can view their own settings"
ON public.user_settings FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own settings"
ON public.user_settings FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own settings"
ON public.user_settings FOR UPDATE
USING (user_id = auth.uid());

-- Add columns to messages table for edit tracking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS original_content TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- Add columns to conversations for channels
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS subscribers_count INTEGER DEFAULT 0;

-- Add columns to conversation_participants for archive/pin
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_history;