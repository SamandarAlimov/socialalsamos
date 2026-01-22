-- Drop the security definer view as we use secure functions instead
DROP VIEW IF EXISTS admin_user_stats;

-- Add RLS policy for admins to read user_activity_logs
CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));