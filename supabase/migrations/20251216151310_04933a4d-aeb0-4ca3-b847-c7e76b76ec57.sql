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