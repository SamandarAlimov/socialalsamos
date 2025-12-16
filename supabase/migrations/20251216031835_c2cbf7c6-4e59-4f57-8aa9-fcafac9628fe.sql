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
