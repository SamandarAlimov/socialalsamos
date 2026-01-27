-- Create post_collaborators table for collaboration system
CREATE TABLE public.post_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view collaborations they're involved in
CREATE POLICY "Users can view their collaborations"
ON public.post_collaborators
FOR SELECT
USING (
  auth.uid() = user_id OR 
  auth.uid() = invited_by OR
  post_id IN (SELECT id FROM posts WHERE user_id = auth.uid())
);

-- Post owner can invite collaborators
CREATE POLICY "Post owners can invite collaborators"
ON public.post_collaborators
FOR INSERT
WITH CHECK (
  auth.uid() = invited_by AND
  post_id IN (SELECT id FROM posts WHERE user_id = auth.uid())
);

-- Invited user can update their response (accept/decline)
CREATE POLICY "Invited users can respond"
ON public.post_collaborators
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Post owner can delete collaboration invites
CREATE POLICY "Post owners can remove collaborators"
ON public.post_collaborators
FOR DELETE
USING (
  auth.uid() = invited_by OR
  auth.uid() = user_id
);

-- Enable realtime for collaboration updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_collaborators;

-- Create function to notify on collaboration invite
CREATE OR REPLACE FUNCTION public.notify_on_collaboration_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_name TEXT;
BEGIN
  SELECT display_name INTO inviter_name FROM profiles WHERE id = NEW.invited_by;
  
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id,
    'collaboration_invite',
    'Collaboration Request',
    COALESCE(inviter_name, 'Someone') || ' wants to collaborate on a post with you',
    jsonb_build_object(
      'post_id', NEW.post_id,
      'collaboration_id', NEW.id,
      'inviter_id', NEW.invited_by
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for collaboration invite notification
CREATE TRIGGER on_collaboration_invite
  AFTER INSERT ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_invite();

-- Create function to notify when collaboration is accepted
CREATE OR REPLACE FUNCTION public.notify_on_collaboration_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT display_name INTO accepter_name FROM profiles WHERE id = NEW.user_id;
    
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.invited_by,
      'collaboration_accepted',
      'Collaboration Accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your collaboration request',
      jsonb_build_object(
        'post_id', NEW.post_id,
        'collaboration_id', NEW.id,
        'collaborator_id', NEW.user_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for collaboration accepted notification
CREATE TRIGGER on_collaboration_accepted
  AFTER UPDATE ON public.post_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_collaboration_accepted();