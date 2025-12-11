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