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