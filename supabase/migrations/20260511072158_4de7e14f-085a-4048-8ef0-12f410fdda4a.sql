
-- Restrict sellers SELECT to authenticated users to prevent scraping of business email/phone
DROP POLICY IF EXISTS "Sellers viewable by everyone" ON public.sellers;
CREATE POLICY "Sellers viewable by authenticated users"
ON public.sellers
FOR SELECT
TO authenticated
USING (true);

-- Lock down direct INSERTs to notifications by clients.
-- SECURITY DEFINER triggers (notify_on_*) bypass RLS so they keep working.
DROP POLICY IF EXISTS "Users can receive notifications" ON public.notifications;
CREATE POLICY "Block direct client notification inserts"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);
