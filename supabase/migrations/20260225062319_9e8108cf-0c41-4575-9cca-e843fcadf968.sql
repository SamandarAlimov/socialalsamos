
-- Allow admins to view all verification requests
CREATE POLICY "Admins can view all verification requests"
ON public.verification_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update verification requests (approve/reject)
CREATE POLICY "Admins can update verification requests"
ON public.verification_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));
