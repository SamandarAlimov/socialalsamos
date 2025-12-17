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