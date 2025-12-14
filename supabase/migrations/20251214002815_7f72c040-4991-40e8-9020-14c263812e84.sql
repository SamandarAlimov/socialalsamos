-- Fix RLS policy on conversations to allow creating conversations without requiring existing participants

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

-- Recreate a safer INSERT policy that ties owner_id to the authenticated user
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);
