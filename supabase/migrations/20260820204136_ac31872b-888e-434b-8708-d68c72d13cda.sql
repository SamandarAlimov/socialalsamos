-- 1. post_views: remove fully-open SELECT
DROP POLICY IF EXISTS "Anyone can view post views" ON public.post_views;

-- 2. profiles: hide sensitive columns from other signed-in users
REVOKE SELECT (birth_date, country, location, preferences, signatures, email_filters, notification_preferences, is_admin, role) ON public.profiles FROM authenticated;
REVOKE SELECT (birth_date, country, location, preferences, signatures, email_filters, notification_preferences, is_admin, role) ON public.profiles FROM anon;

-- 3. admin checks -> has_role()/user_roles
DROP POLICY IF EXISTS "Admins can view all security events" ON public.security_events;
CREATE POLICY "Admins can view all security events" ON public.security_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can read all reports" ON public.reports;
DROP POLICY IF EXISTS "reports_select_admin" ON public.reports;
CREATE POLICY "reports_select_admin" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "verification_requests_select" ON public.seller_verification_requests;
CREATE POLICY "verification_requests_select" ON public.seller_verification_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "product_reports_select" ON public.product_reports;
CREATE POLICY "product_reports_select" ON public.product_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Only admins can read audit log" ON public.admin_actions;
CREATE POLICY "Only admins can read audit log" ON public.admin_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can insert reserved usernames" ON public.reserved_usernames FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can update reserved usernames" ON public.reserved_usernames FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete reserved usernames" ON public.reserved_usernames;
CREATE POLICY "Admins can delete reserved usernames" ON public.reserved_usernames FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. sellers: hide contact info, expose via guarded function
REVOKE SELECT (phone, email) ON public.sellers FROM authenticated;
REVOKE SELECT (phone, email) ON public.sellers FROM anon;

CREATE OR REPLACE FUNCTION public.get_seller_contact(p_seller_id uuid)
RETURNS TABLE(phone text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.phone, s.email
  FROM public.sellers s
  WHERE s.id = p_seller_id
    AND (
      s.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.seller_id = s.id AND o.buyer_id = auth.uid()
      )
    )
$$;
REVOKE ALL ON FUNCTION public.get_seller_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_contact(uuid) TO authenticated, service_role;

-- 5. search_cache: authenticated only
DROP POLICY IF EXISTS "Search cache is readable" ON public.search_cache;
CREATE POLICY "Search cache readable by signed-in users" ON public.search_cache FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.search_cache FROM anon;

-- 6. taxi_live_locations: authenticated only
DROP POLICY IF EXISTS "Public read access to available taxis" ON public.taxi_live_locations;
CREATE POLICY "Signed-in users can view available taxis" ON public.taxi_live_locations FOR SELECT TO authenticated USING (is_available = true);
REVOKE SELECT ON public.taxi_live_locations FROM anon;

-- 7. storage: private chat attachments
DROP POLICY IF EXISTS "Public can read chat media" ON storage.objects;
CREATE POLICY "Chat media owner or participant read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('chat-media','message-attachments')
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id::text = (storage.foldername(name))[1]
        AND cp.user_id = auth.uid()
    )
  )
);

-- 8. privileged functions: drop unnecessary anon/public execute
REVOKE ALL ON FUNCTION public.get_profile_private(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_private(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_live_stream_viewer_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_live_stream_viewer_count(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_wallet_balance_tampering() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_admin_self_escalation() FROM PUBLIC, anon, authenticated;