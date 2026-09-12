-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE A-superapp: 20251211165034_0d7c8977-8db5-4c99-a2fc-5e268289bb1b.sql
-- SHA256 1e5bc7208d3af792dc7cfeb194fef76acfb534aee3e5506d9d9253928c9f8f42
-- ============================================================================
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to handle new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'username', SPLIT_PART(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'display_name', SPLIT_PART(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create stories table
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT,
  views_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories viewable by authenticated" ON public.stories
  FOR SELECT TO authenticated USING (expires_at > now());

CREATE POLICY "Users can create own stories" ON public.stories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories" ON public.stories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  media_urls TEXT[] DEFAULT '{}',
  media_type TEXT DEFAULT 'text',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  visibility TEXT DEFAULT 'public',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public posts viewable by everyone" ON public.posts
  FOR SELECT USING (visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "Users can create posts" ON public.posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create post likes table
CREATE TABLE public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes viewable by everyone" ON public.post_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like posts" ON public.post_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts" ON public.post_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by everyone" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "Users can create comments" ON public.comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT DEFAULT 'private' CHECK (type IN ('private', 'group', 'channel')),
  name TEXT,
  avatar_url TEXT,
  description TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_encrypted BOOLEAN DEFAULT true,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Create conversation participants
CREATE TABLE public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_muted BOOLEAN DEFAULT false,
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Participants can view participation" ON public.conversation_participants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can join conversations" ON public.conversation_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can edit own messages" ON public.messages
  FOR UPDATE TO authenticated USING (auth.uid() = sender_id);

-- Create message read receipts
CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view read receipts" ON public.message_reads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can mark as read" ON public.message_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create follows table
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows viewable by everyone" ON public.follows
  FOR SELECT USING (true);

CREATE POLICY "Users can follow" ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" ON public.follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Enable realtime for messages and typing
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

-- Create typing indicators table (ephemeral)
CREATE TABLE public.typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Typing indicators viewable by participants" ON public.typing_indicators
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = typing_indicators.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can set typing" ON public.typing_indicators
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove typing" ON public.typing_indicators
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Create video calls table
CREATE TABLE public.video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  call_type TEXT DEFAULT 'video' CHECK (call_type IN ('audio', 'video', 'screen')),
  max_participants INTEGER DEFAULT 50,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.video_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Calls viewable by participants" ON public.video_calls
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create calls" ON public.video_calls
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update calls" ON public.video_calls
  FOR UPDATE TO authenticated USING (auth.uid() = host_id);

-- Create call participants table
CREATE TABLE public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.video_calls(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_muted BOOLEAN DEFAULT false,
  is_video_on BOOLEAN DEFAULT true,
  is_screen_sharing BOOLEAN DEFAULT false,
  is_hand_raised BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(call_id, user_id)
);

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Call participants viewable" ON public.call_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can join calls" ON public.call_participants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation" ON public.call_participants
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.video_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;

-- ============================================================================
-- SOURCE A-superapp: 20251211171344_ef706006-3a7c-4674-afd6-b0d0b1457b72.sql
-- SHA256 371bb3c2140ae51bd1be23e38482b23fccc48253daa18d855209b5debe29ca68
-- ============================================================================
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'like', 'comment', 'follow', 'mention')),
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- System can create notifications (via trigger or edge function)
CREATE POLICY "Users can receive notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('message-attachments', 'message-attachments', true, 10485760);

-- Storage policies for message attachments
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'message-attachments');

CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create function to trigger notification on new follow
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT display_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    NEW.following_id,
    'follow',
    'New Follower',
    COALESCE(follower_name, 'Someone') || ' started following you',
    jsonb_build_object('follower_id', NEW.follower_id)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for follow notifications
CREATE TRIGGER on_new_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_follow();

-- Create function to trigger notification on new like
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  liker_name TEXT;
  post_owner_id UUID;
BEGIN
  SELECT display_name INTO liker_name FROM profiles WHERE id = NEW.user_id;
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;
  
  IF post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      post_owner_id,
      'like',
      'New Like',
      COALESCE(liker_name, 'Someone') || ' liked your post',
      jsonb_build_object('post_id', NEW.post_id, 'liker_id', NEW.user_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for like notifications
CREATE TRIGGER on_new_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_like();

-- Create function to trigger notification on new comment
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commenter_name TEXT;
  post_owner_id UUID;
BEGIN
  SELECT display_name INTO commenter_name FROM profiles WHERE id = NEW.user_id;
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;
  
  IF post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      post_owner_id,
      'comment',
      'New Comment',
      COALESCE(commenter_name, 'Someone') || ' commented on your post',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'commenter_id', NEW.user_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for comment notifications
CREATE TRIGGER on_new_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment();

-- ============================================================================
-- SOURCE A-superapp: 20251212021032_65131156-c702-4719-9aa9-36c5bbcf3148.sql
-- SHA256 17e3daab1d41cae1dbd18965be40963affff0a6adbba884258445d2f2d37cc65
-- ============================================================================
-- Fix conversations RLS policy bug
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
    )
  );

-- Fix message_reads RLS policy - restrict to conversation participants
DROP POLICY IF EXISTS "Users can view read receipts" ON public.message_reads;
CREATE POLICY "Users can view read receipts" ON public.message_reads
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_reads.message_id AND cp.user_id = auth.uid()
    )
  );

-- Fix video_calls RLS policy - restrict to participants or conversation members
DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;
CREATE POLICY "Calls viewable by participants" ON public.video_calls
  FOR SELECT TO authenticated USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM call_participants
      WHERE call_id = video_calls.id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = video_calls.conversation_id AND user_id = auth.uid()
    )
  );

-- Fix call_participants RLS policy - restrict to fellow participants
DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;
CREATE POLICY "Call participants viewable" ON public.call_participants
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM call_participants cp2
      WHERE cp2.call_id = call_participants.call_id AND cp2.user_id = auth.uid()
    )
  );

-- Create message_reactions table for emoji reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on message_reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
CREATE POLICY "Users can view reactions in their conversations" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add reactions to messages in their conversations" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove their own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime for message_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- ============================================================================
-- SOURCE A-superapp: 20251214002035_4a9181f9-7a02-4fc3-b2f5-f00ccace723b.sql
-- SHA256 d261f1a715081372879ae670bb4c5a00c1f5254057784c728405971a069789eb
-- ============================================================================
-- Add parent_id column for replies to comments
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

-- Create comment_likes table if not exists
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes viewable" ON public.comment_likes;
CREATE POLICY "Comment likes viewable"
ON public.comment_likes FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments"
ON public.comment_likes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike comments" ON public.comment_likes;
CREATE POLICY "Users can unlike comments"
ON public.comment_likes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================================
-- SOURCE A-superapp: 20251214002815_7f72c040-4991-40e8-9020-14c263812e84.sql
-- SHA256 d5b9af4e91c0c43ace300c9337d4f6495e78372f66a7e9285b0340ff9bdf59c3
-- ============================================================================
-- Fix RLS policy on conversations to allow creating conversations without requiring existing participants

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

-- Recreate a safer INSERT policy that ties owner_id to the authenticated user
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);


-- ============================================================================
-- SOURCE A-superapp: 20251216031835_c2cbf7c6-4e59-4f57-8aa9-fcafac9628fe.sql
-- SHA256 dfc4ae3cef22a94f29c882f645808fc2b78a44af431269f0623f0bfed72b4abd
-- ============================================================================
-- Update RLS policy on conversation_participants to allow conversation owners
-- to add other users as participants while still preventing arbitrary inserts.

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

-- Recreate INSERT policy with additional owner check
CREATE POLICY "Users can join conversations"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  -- User can always insert their own participation
  user_id = auth.uid()
  OR
  -- Conversation owner can add any participants to their conversation
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.owner_id = auth.uid()
  )
);


-- ============================================================================
-- SOURCE A-superapp: 20251216151310_04933a4d-aeb0-4ca3-b847-c7e76b76ec57.sql
-- SHA256 ae9df94da26f6542188cc4a4f478f083ac08c7722122808e88c64b2f21562fee
-- ============================================================================
-- Fix the SELECT policy on conversations to also allow owners to view
-- This fixes the issue where we can't return the created conversation
-- because the user isn't a participant yet

DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Users can view their conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  -- User is a participant in the conversation
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
  )
  OR
  -- User is the owner of the conversation
  owner_id = auth.uid()
);

-- Also add UPDATE policy for conversations so owners can update last_message_at
CREATE POLICY "Owners can update their conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- SOURCE A-superapp: 20251216155745_556f6986-ff39-47c1-a679-a41b75a12120.sql
-- SHA256 ec798c6b3265fbe53c273d6c7c5b864e451cb1da68f83dd4adfad19f48448d51
-- ============================================================================
-- Fix conversation_participants SELECT policy to allow viewing all participants
-- in conversations the user is part of (required for showing other user's name/avatar)

DROP POLICY IF EXISTS "Participants can view participation" ON public.conversation_participants;

CREATE POLICY "Users can view participants in their conversations"
ON public.conversation_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
    AND cp.user_id = auth.uid()
  )
);

-- Also add UPDATE policy for participants to update their own participation (e.g., last_read_at)
CREATE POLICY "Users can update own participation"
ON public.conversation_participants
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- SOURCE A-superapp: 20251217045158_a6aca7a0-7896-42e5-a605-0a72e6b91225.sql
-- SHA256 a9ddc5ff282fd9d9b8105fe0addb58de24fb3b416e027bafef5512494bdcd345
-- ============================================================================
-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;

-- Create a security definer function to check conversation membership
-- This bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
    AND user_id = _user_id
  )
$$;

-- Create the fixed policy using the function
CREATE POLICY "Users can view participants in their conversations"
ON public.conversation_participants
FOR SELECT
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
);

-- ============================================================================
-- SOURCE A-superapp: 20251217051914_aab8a104-88d4-4de5-adf0-ad5a364b005c.sql
-- SHA256 9ee9bea2dcb73a0d65ab1ef42d511e32498de28a74b853f5315d1f54a5f3dfe7
-- ============================================================================
-- Create a security definer function to check call participation
CREATE OR REPLACE FUNCTION public.is_call_participant(_call_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.call_participants
    WHERE call_id = _call_id
    AND user_id = _user_id
  )
$$;

-- Drop the old policy that causes recursion
DROP POLICY IF EXISTS "Call participants viewable" ON public.call_participants;

-- Create new policy using the security definer function
CREATE POLICY "Call participants viewable"
ON public.call_participants
FOR SELECT
USING (
  is_call_participant(call_id, auth.uid())
);

-- Also fix the video_calls SELECT policy that references call_participants
DROP POLICY IF EXISTS "Calls viewable by participants" ON public.video_calls;

CREATE POLICY "Calls viewable by participants"
ON public.video_calls
FOR SELECT
USING (
  host_id = auth.uid()
  OR is_call_participant(id, auth.uid())
  OR is_conversation_participant(conversation_id, auth.uid())
);

-- ============================================================================
-- SOURCE A-superapp: 20251222162520_df9a60ad-8336-451c-926a-0828677d34f1.sql
-- SHA256 3ae2859031dbbde7f9c23a8b1b9ffa16e9c65bb25498fd563358129a642014be
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20251225165541_2194e21d-0f9c-49a2-ab11-2adfafa026e3.sql
-- SHA256 b89d9e398239da73b5337f5032d617e54507887bbb854340c09f5129a38bb43e
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20251226203515_a6144d44-5715-49a4-aaeb-35a33b4e0f94.sql
-- SHA256 95a21b2af51b835df5bb3e5de1ae8779703bb1f257f3b57f21bd1ccb6e38c743
-- ============================================================================
-- Create verification_requests table for Instagram-like verification system
CREATE TABLE public.verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  known_as TEXT,
  category TEXT NOT NULL, -- 'creator', 'business', 'news', 'government', 'other'
  bio_link TEXT,
  id_document_url TEXT,
  additional_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own verification requests"
ON public.verification_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create their own verification requests"
ON public.verification_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their pending requests
CREATE POLICY "Users can update their pending verification requests"
ON public.verification_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Create index for faster lookups
CREATE INDEX idx_verification_requests_user_id ON public.verification_requests(user_id);
CREATE INDEX idx_verification_requests_status ON public.verification_requests(status);

-- Update profiles table for the @alsamos account verification
UPDATE public.profiles 
SET is_verified = true 
WHERE username = 'alsamos';

-- ============================================================================
-- SOURCE A-superapp: 20251227175352_f3be08a9-21ad-43d3-8052-50f938f2dd69.sql
-- SHA256 2cf74ea84f4e98725acf2c2ec73710192769561aa9d18d39ecacf1b7eee0bb63
-- ============================================================================
-- Create user roles system
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Function to check if user has a role (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Grant admin role to @alsamos and @samandar
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles WHERE username IN ('alsamos', 'samandar')
ON CONFLICT (user_id, role) DO NOTHING;

-- Enable realtime for profiles table (for online status)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================================================
-- SOURCE A-superapp: 20260101225639_565f8833-377a-40c5-94c7-ab1b3986bf9b.sql
-- SHA256 bd575441619a89240eb5dd222b6e836a6139c0538161a5dd9f5218db994b5e03
-- ============================================================================
-- Add DELETE policy for conversation_participants so users can leave/delete conversations
CREATE POLICY "Users can leave conversations"
ON public.conversation_participants
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- SOURCE A-superapp: 20260102013741_acf62f1f-b460-46ea-ba6f-7c66d3cfa41f.sql
-- SHA256 fb30bcf8cdabf8cace5eec281cff27ea2cce4d6447f0b2d4f4f8ac227bc7b43f
-- ============================================================================
-- Create the update_updated_at_column function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create wallets table for Payment feature
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transactions table for Payment history
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'purchase', 'refund')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  description TEXT,
  reference_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Wallets policies (Only owner can see their wallet)
CREATE POLICY "Users can view their own wallet"
ON public.wallets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wallet"
ON public.wallets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet"
ON public.wallets FOR UPDATE
USING (auth.uid() = user_id);

-- Transactions policies (Only owner can see their transactions)
CREATE POLICY "Users can view their own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transactions"
ON public.transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create indexes for faster queries
CREATE INDEX idx_transactions_wallet_id ON public.transactions(wallet_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);

-- Trigger to update wallet updated_at
CREATE TRIGGER update_wallets_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SOURCE A-superapp: 20260102161544_ae7478a9-794d-4e15-a38a-4c5d2a4ed28a.sql
-- SHA256 f586b9bed499066d954941239e24ab8a6606fa418be1013d9d1d1f3c1ac4af69
-- ============================================================================
-- Create trigger for likes notifications
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  liker_name TEXT;
  post_owner_id UUID;
BEGIN
  SELECT display_name INTO liker_name FROM profiles WHERE id = NEW.user_id;
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;
  
  IF post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      post_owner_id,
      'like',
      'New Like',
      COALESCE(liker_name, 'Someone') || ' liked your post',
      jsonb_build_object('post_id', NEW.post_id, 'liker_id', NEW.user_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for comments notifications
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commenter_name TEXT;
  post_owner_id UUID;
BEGIN
  SELECT display_name INTO commenter_name FROM profiles WHERE id = NEW.user_id;
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;
  
  IF post_owner_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      post_owner_id,
      'comment',
      'New Comment',
      COALESCE(commenter_name, 'Someone') || ' commented on your post',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'commenter_id', NEW.user_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for follow notifications
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT display_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    NEW.following_id,
    'follow',
    'New Follower',
    COALESCE(follower_name, 'Someone') || ' started following you',
    jsonb_build_object('follower_id', NEW.follower_id)
  );
  
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist and recreate
DROP TRIGGER IF EXISTS on_post_like ON public.post_likes;
CREATE TRIGGER on_post_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

DROP TRIGGER IF EXISTS on_comment ON public.comments;
CREATE TRIGGER on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

DROP TRIGGER IF EXISTS on_follow ON public.follows;
CREATE TRIGGER on_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- ============================================================================
-- SOURCE A-superapp: 20260102162218_c7e6594a-89f5-4c0e-9505-af6095dddf77.sql
-- SHA256 0ff29ba03e94fb410da448ca2b4a34ae450fc10c0cd3a8d75a4a91d10a899faf
-- ============================================================================

-- Function to extract mentioned usernames and create notifications
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mentioned_username TEXT;
  mentioned_user_id UUID;
  author_name TEXT;
  content_preview TEXT;
BEGIN
  -- Get author name
  SELECT display_name INTO author_name FROM profiles WHERE id = NEW.user_id;
  
  -- Extract @mentions using regex and loop through them
  FOR mentioned_username IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  LOOP
    -- Find user by username
    SELECT id INTO mentioned_user_id FROM profiles WHERE username = mentioned_username;
    
    -- Only notify if user exists and is not the author
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
      content_preview := LEFT(NEW.content, 100);
      
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        mentioned_user_id,
        'mention',
        'New Mention',
        COALESCE(author_name, 'Someone') || ' mentioned you',
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'mentioner_id', NEW.user_id,
          'content_preview', content_preview
        )
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Function for post mentions
CREATE OR REPLACE FUNCTION public.notify_on_post_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mentioned_username TEXT;
  mentioned_user_id UUID;
  author_name TEXT;
  content_preview TEXT;
BEGIN
  -- Get author name
  SELECT display_name INTO author_name FROM profiles WHERE id = NEW.user_id;
  
  -- Extract @mentions using regex
  FOR mentioned_username IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  LOOP
    SELECT id INTO mentioned_user_id FROM profiles WHERE username = mentioned_username;
    
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
      content_preview := LEFT(NEW.content, 100);
      
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        mentioned_user_id,
        'mention',
        'New Mention',
        COALESCE(author_name, 'Someone') || ' mentioned you in a post',
        jsonb_build_object(
          'post_id', NEW.id,
          'mentioner_id', NEW.user_id,
          'content_preview', content_preview
        )
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Create triggers for mentions
DROP TRIGGER IF EXISTS on_comment_mention ON comments;
CREATE TRIGGER on_comment_mention
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_mention();

DROP TRIGGER IF EXISTS on_post_mention ON posts;
CREATE TRIGGER on_post_mention
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_post_mention();


-- ============================================================================
-- SOURCE A-superapp: 20260102182535_70e95ad2-c647-459f-ac50-a506e534b071.sql
-- SHA256 2d48c363d24da2c793ec7a49f900b24d0600a367e1ada5bacb9a17e747ec3bac
-- ============================================================================
-- Add notification preference columns to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notify_likes boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_comments boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_follows boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_mentions boolean DEFAULT true;

-- ============================================================================
-- SOURCE A-superapp: 20260102190506_865831a4-af96-4a49-a842-7c60f2c33796.sql
-- SHA256 f6556a2f62d8fff769ca380a3bd0b0fbf1bc77a850a8ca6db6ce2f09e5013046
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260103215115_c86a8357-fd41-4db9-8d71-c3ad9f81777b.sql
-- SHA256 b598f397f64be9deeb42ba17184360d3de8ccedbd5ce32d80ce99dd93810b9b0
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260103220242_30145c8b-7b41-4f60-8832-e6a410401bd5.sql
-- SHA256 b14dd8531657821694b7d877e3bd4ac428cc0842bdf6af05c5b286aa1678f7fa
-- ============================================================================
-- Update stories RLS policy to allow users to view their own expired stories
DROP POLICY IF EXISTS "Stories viewable by authenticated" ON public.stories;

CREATE POLICY "Stories viewable by authenticated or owner" 
ON public.stories 
FOR SELECT 
USING (
  (expires_at > now()) OR (auth.uid() = user_id)
);

-- ============================================================================
-- SOURCE A-superapp: 20260108183237_8631b4e3-3739-4fc6-8e55-7bb0f44f7586.sql
-- SHA256 583f67606e3018f8fed461c11e0bea496327f3b465077959d3ee2bfec7e12026
-- ============================================================================
-- Ensure post counters never stay NULL
UPDATE public.posts
SET likes_count = COALESCE(likes_count, 0),
    comments_count = COALESCE(comments_count, 0),
    shares_count = COALESCE(shares_count, 0),
    bookmarks_count = COALESCE(bookmarks_count, 0);

ALTER TABLE public.posts ALTER COLUMN likes_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN comments_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN shares_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN bookmarks_count SET DEFAULT 0;

-- Backfill accurate counts for existing posts
UPDATE public.posts p
SET likes_count = COALESCE(l.like_count, 0)
FROM (
  SELECT post_id, COUNT(*)::int AS like_count
  FROM public.post_likes
  GROUP BY post_id
) l
WHERE p.id = l.post_id;

UPDATE public.posts p
SET comments_count = COALESCE(c.comment_count, 0)
FROM (
  SELECT post_id, COUNT(*)::int AS comment_count
  FROM public.comments
  GROUP BY post_id
) c
WHERE p.id = c.post_id;

-- Trigger function: keep posts.likes_count in sync with post_likes
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_sync_post_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_likes_count();

-- Trigger function: keep posts.comments_count in sync with comments
CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comments_count ON public.comments;
CREATE TRIGGER trg_sync_post_comments_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_comments_count();


-- ============================================================================
-- SOURCE A-superapp: 20260108190720_a56b7009-7a84-4f95-a0ea-d44b45958217.sql
-- SHA256 aefe083948cf2eb3812f323e5b41c11f9a8a3fdd8d08c32b247df646b9e39b7d
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260110201319_b50aa8fd-c997-4ebe-860e-aec97df87b72.sql
-- SHA256 0f065862a3dc3f1251d345ab7999b2511f4232a4116f231f71ded490ec444164
-- ============================================================================
-- Add autoplay settings columns to user_settings table
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS autoplay_voice_messages boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS autoplay_video_messages boolean DEFAULT true;

-- ============================================================================
-- SOURCE A-superapp: 20260111_admin_and_history_tables.sql
-- SHA256 c3728a7a7684d30eca2e1bd4cb0c684488887c831bc6a8002197e409353697a4
-- ============================================================================
-- Migration: Admin role and history tracking tables
-- Created: 2026-01-11
-- Description: Adds admin role support and security/audit event tables for history tracking

-- ============================================================================
-- PART 1: Add admin role to profiles table
-- ============================================================================

-- Add is_admin and role columns to profiles if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'user';
  END IF;
END $$;

-- Create index on admin columns for performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role IN ('admin', 'alsamos_admin');

-- ============================================================================
-- PART 2: Create security_events table for audit logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'password_change', 'two_factor_enable', 'two_factor_disable', 'email_change', 'phone_change', 'account_recovery'
  description TEXT NOT NULL,
  metadata JSONB, -- Additional event data
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);

-- ============================================================================
-- PART 3: Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on security_events
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Users can only view their own security events
CREATE POLICY "Users can view own security events" ON security_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only the system/backend can insert security events (not users directly)
-- This prevents users from creating fake security events
CREATE POLICY "System can insert security events" ON security_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Admins can view all security events for monitoring
CREATE POLICY "Admins can view all security events" ON security_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = TRUE OR profiles.role IN ('admin', 'alsamos_admin'))
    )
  );

-- ============================================================================
-- PART 4: Admin access control function
-- ============================================================================

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_admin = TRUE OR role IN ('admin', 'alsamos_admin'))
  );
$$;

-- ============================================================================
-- PART 5: Trigger to log security events automatically
-- ============================================================================

-- Function to log password changes
CREATE OR REPLACE FUNCTION log_password_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    INSERT INTO security_events (user_id, event_type, description, ip_address)
    VALUES (
      NEW.id,
      'password_change',
      'Parol o''zgartirildi',
      inet_client_addr()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for password changes
DROP TRIGGER IF EXISTS on_password_change ON auth.users;
CREATE TRIGGER on_password_change
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION log_password_change();

-- ============================================================================
-- PART 6: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE security_events IS 'Audit log for security-related events (password changes, 2FA, etc.)';
COMMENT ON COLUMN profiles.is_admin IS 'Boolean flag indicating if user is an Alsamos Corporation admin';
COMMENT ON COLUMN profiles.role IS 'User role (user, admin, alsamos_admin, moderator, etc.)';
COMMENT ON FUNCTION is_admin() IS 'Returns true if the current user has admin privileges';

-- ============================================================================
-- PART 7: Grant appropriate permissions
-- ============================================================================

-- Grant select on profiles to authenticated users (for role checking)
GRANT SELECT ON profiles TO authenticated;

-- Grant usage on security_events to authenticated (RLS will control access)
GRANT SELECT ON security_events TO authenticated;

-- ============================================================================
-- PART 8: Seed data (optional - set yourself as admin for testing)
-- ============================================================================

-- Uncomment and replace with your user ID to make yourself admin:
-- UPDATE profiles SET is_admin = TRUE, role = 'alsamos_admin' 
-- WHERE id = 'YOUR_USER_ID_HERE';

-- Example: Set admin by email (safer):
-- UPDATE profiles SET is_admin = TRUE, role = 'alsamos_admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@alsamos.uz');



-- ============================================================================
-- SOURCE A-superapp: 20260114044103_1035b408-ec92-41e6-95e7-3c9dfdbad14f.sql
-- SHA256 39c2a727ba410221b45db4a3f289cc30bd1d4f4a491a83d2cacfdaad4153dc54
-- ============================================================================
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

-- ============================================================================
-- SOURCE A-superapp: 20260114071155_7053a55e-5f60-4dd2-8fd9-f43d6fa556f3.sql
-- SHA256 c675370bcd6555f463c59f970d48cadaa61102a130b27a436b12a68ff36a938f
-- ============================================================================
-- AI Assistant preferences and alerts for users
CREATE TABLE public.ai_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_filter TEXT[] DEFAULT '{}',
  daily_time_limit_minutes INTEGER DEFAULT NULL,
  recommendation_topics TEXT[] DEFAULT '{}',
  alerts_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- AI conversation history
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  context TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User activity tracking for AI alerts
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  page TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  content_category TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_preferences
CREATE POLICY "Users can view their own AI preferences" 
ON public.ai_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI preferences" 
ON public.ai_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI preferences" 
ON public.ai_preferences FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS policies for ai_conversations
CREATE POLICY "Users can view their own AI conversations" 
ON public.ai_conversations FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI conversations" 
ON public.ai_conversations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI conversations" 
ON public.ai_conversations FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI conversations" 
ON public.ai_conversations FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for user_activity_logs
CREATE POLICY "Users can view their own activity logs" 
ON public.user_activity_logs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own activity logs" 
ON public.user_activity_logs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_preferences_updated_at
BEFORE UPDATE ON public.ai_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SOURCE A-superapp: 20260117122528_09a281de-8384-45c7-9c37-6b730c45ca29.sql
-- SHA256 a12cb7dd0ec60536d6eb0b3fc27bbd6deab6b6b906d7675347c652ea2525e6ca
-- ============================================================================
-- Product categories table
CREATE TABLE public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  parent_id UUID REFERENCES public.product_categories(id),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sellers table (easy seller registration for B2B, B2C, C2C)
CREATE TABLE public.sellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'individual', -- individual, business, enterprise
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  location TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  is_verified BOOLEAN DEFAULT false,
  rating NUMERIC(2,1) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, suspended, pending
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.product_categories(id),
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  compare_at_price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  quantity INTEGER DEFAULT 1,
  sku TEXT,
  condition TEXT DEFAULT 'new', -- new, like_new, good, fair
  location TEXT,
  shipping_available BOOLEAN DEFAULT true,
  shipping_price NUMERIC(10,2) DEFAULT 0,
  is_negotiable BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- active, sold, draft, deleted
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product images table
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product likes/favorites
CREATE TABLE public.product_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

-- Shopping cart
CREATE TABLE public.cart_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id),
  seller_id UUID NOT NULL REFERENCES public.sellers(id),
  subtotal NUMERIC(12,2) NOT NULL,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled, refunded
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Order items
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  title TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product reviews
CREATE TABLE public.product_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  order_id UUID REFERENCES public.orders(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

-- Messages between buyer and seller
CREATE TABLE public.product_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  receiver_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Categories: viewable by everyone
CREATE POLICY "Categories viewable by everyone" ON public.product_categories FOR SELECT USING (true);

-- Sellers policies
CREATE POLICY "Sellers viewable by everyone" ON public.sellers FOR SELECT USING (true);
CREATE POLICY "Users can create their seller profile" ON public.sellers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their seller profile" ON public.sellers FOR UPDATE USING (auth.uid() = user_id);

-- Products policies
CREATE POLICY "Active products viewable by everyone" ON public.products FOR SELECT USING (status = 'active' OR seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can create products" ON public.products FOR INSERT WITH CHECK (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can update their products" ON public.products FOR UPDATE USING (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can delete their products" ON public.products FOR DELETE USING (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));

-- Product images policies
CREATE POLICY "Product images viewable by everyone" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Sellers can manage product images" ON public.product_images FOR INSERT WITH CHECK (product_id IN (SELECT id FROM products WHERE seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid())));
CREATE POLICY "Sellers can delete product images" ON public.product_images FOR DELETE USING (product_id IN (SELECT id FROM products WHERE seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid())));

-- Product likes policies
CREATE POLICY "Users can view likes" ON public.product_likes FOR SELECT USING (true);
CREATE POLICY "Users can like products" ON public.product_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike products" ON public.product_likes FOR DELETE USING (auth.uid() = user_id);

-- Cart policies
CREATE POLICY "Users can view their cart" ON public.cart_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to cart" ON public.cart_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their cart" ON public.cart_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove from cart" ON public.cart_items FOR DELETE USING (auth.uid() = user_id);

-- Orders policies
CREATE POLICY "Users can view their orders" ON public.orders FOR SELECT USING (auth.uid() = buyer_id OR seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Order participants can update orders" ON public.orders FOR UPDATE USING (auth.uid() = buyer_id OR seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));

-- Order items policies
CREATE POLICY "Users can view their order items" ON public.order_items FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE buyer_id = auth.uid() OR seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid())));
CREATE POLICY "Users can create order items" ON public.order_items FOR INSERT WITH CHECK (order_id IN (SELECT id FROM orders WHERE buyer_id = auth.uid()));

-- Reviews policies
CREATE POLICY "Reviews viewable by everyone" ON public.product_reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON public.product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their reviews" ON public.product_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their reviews" ON public.product_reviews FOR DELETE USING (auth.uid() = user_id);

-- Product messages policies
CREATE POLICY "Users can view their messages" ON public.product_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send messages" ON public.product_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can mark messages as read" ON public.product_messages FOR UPDATE USING (auth.uid() = receiver_id);

-- Insert default categories
INSERT INTO public.product_categories (name, slug, icon, position) VALUES
  ('Electronics', 'electronics', '📱', 1),
  ('Fashion', 'fashion', '👕', 2),
  ('Home & Garden', 'home-garden', '🏠', 3),
  ('Sports & Outdoors', 'sports-outdoors', '⚽', 4),
  ('Vehicles', 'vehicles', '🚗', 5),
  ('Books & Media', 'books-media', '📚', 6),
  ('Health & Beauty', 'health-beauty', '💄', 7),
  ('Toys & Games', 'toys-games', '🎮', 8),
  ('Services', 'services', '🔧', 9),
  ('Other', 'other', '📦', 10);

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 8));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for order number
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- Trigger to update product likes count
CREATE OR REPLACE FUNCTION update_product_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products SET likes_count = likes_count + 1 WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET likes_count = likes_count - 1 WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER product_likes_count_trigger
  AFTER INSERT OR DELETE ON public.product_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_product_likes_count();

-- Trigger to update seller stats
CREATE OR REPLACE FUNCTION update_seller_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE sellers SET total_sales = total_sales + 1 WHERE id = NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER seller_stats_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_stats();

-- Enable realtime for products and orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
