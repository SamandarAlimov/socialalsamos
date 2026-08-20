-- 1. mailbox_aliases: enable RLS, owner-scoped
ALTER TABLE public.mailbox_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mailbox_aliases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailbox_aliases TO authenticated;
GRANT ALL ON public.mailbox_aliases TO service_role;
DROP POLICY IF EXISTS "Users manage own mailbox aliases" ON public.mailbox_aliases;
CREATE POLICY "Users manage own mailbox aliases" ON public.mailbox_aliases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. search_cache: enable RLS, read-only for clients, writes via service role
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.search_cache FROM anon, authenticated;
GRANT SELECT ON public.search_cache TO anon, authenticated;
GRANT ALL ON public.search_cache TO service_role;
DROP POLICY IF EXISTS "Search cache is readable" ON public.search_cache;
CREATE POLICY "Search cache is readable" ON public.search_cache
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Prevent privilege escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_admin_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.is_admin := OLD.is_admin;
    NEW.role := OLD.role;
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_admin_self_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_admin_self_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_escalation();

-- 4. Materialized views out of the API
REVOKE ALL ON public.hashtags_aggregated FROM anon, authenticated;
REVOKE ALL ON public.popular_product_searches FROM anon, authenticated;

-- 5. Views run as invoker
ALTER VIEW public.hashtags SET (security_invoker = on);
ALTER VIEW public.seller_analytics SET (security_invoker = on);
ALTER VIEW public.product_performance SET (security_invoker = on);
ALTER VIEW public.seller_customer_demographics SET (security_invoker = on);

-- 6. Pin search_path on all SECURITY DEFINER functions missing it
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- 7. Lock down direct execution of SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Re-grant only what the app calls
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'block_user','unblock_user','report_content','respond_to_message_request',
        'join_video_call_guarded','leave_video_call','join_video_call','create_video_call','decline_video_call',
        'process_marketplace_order','create_message_report','change_username',
        'check_username_availability','is_username_available','conversation_stats',
        'effective_conversation_notification_settings','get_data_storage_settings',
        'get_visible_presence','get_unique_view_counts','check_rate_limit',
        'get_admin_age_stats','get_admin_country_stats','get_admin_dau_trend',
        'get_admin_hourly_activity','get_admin_page_stats','get_admin_platform_stats',
        'get_admin_weekly_pattern'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('get_email_for_identifier','check_username_availability','is_username_available')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
  END LOOP;
END $$;