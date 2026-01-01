-- Add DELETE policy for conversation_participants so users can leave/delete conversations
CREATE POLICY "Users can leave conversations"
ON public.conversation_participants
FOR DELETE
USING (user_id = auth.uid());