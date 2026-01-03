-- Update stories RLS policy to allow users to view their own expired stories
DROP POLICY IF EXISTS "Stories viewable by authenticated" ON public.stories;

CREATE POLICY "Stories viewable by authenticated or owner" 
ON public.stories 
FOR SELECT 
USING (
  (expires_at > now()) OR (auth.uid() = user_id)
);