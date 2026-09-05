-- Feedback Center hardening.
-- Submission must go through the validated RPC; direct table INSERT is removed
-- so callers cannot forge priority/status. Request size and spam guards protect
-- the queue while preserving a fast user experience.

DROP POLICY IF EXISTS "Users can create own feedback cases" ON public.platform_feedback;
REVOKE INSERT ON public.platform_feedback FROM authenticated;

ALTER TABLE public.platform_feedback
  ADD COLUMN IF NOT EXISTS user_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_last_viewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.submit_platform_feedback(
  p_category text,
  p_title text,
  p_description text,
  p_rating smallint DEFAULT NULL,
  p_contact_allowed boolean DEFAULT true,
  p_source_route text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_diagnostics jsonb DEFAULT '{}'::jsonb,
  p_attachments text[] DEFAULT ARRAY[]::text[]
)
RETURNS public.platform_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.platform_feedback;
  v_priority text := 'normal';
  v_recent_count integer;
  v_daily_count integer;
  v_attachments text[] := COALESCE(p_attachments, ARRAY[]::text[]);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_category NOT IN ('bug', 'feature', 'experience', 'content', 'safety', 'payments', 'marketplace', 'other') THEN
    RAISE EXCEPTION 'invalid_feedback_category';
  END IF;

  IF char_length(trim(COALESCE(p_title, ''))) < 3
     OR char_length(trim(COALESCE(p_title, ''))) > 140 THEN
    RAISE EXCEPTION 'invalid_feedback_title';
  END IF;

  IF char_length(trim(COALESCE(p_description, ''))) < 10
     OR char_length(trim(COALESCE(p_description, ''))) > 6000 THEN
    RAISE EXCEPTION 'invalid_feedback_description';
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'invalid_feedback_rating';
  END IF;

  IF cardinality(v_attachments) > 3 THEN
    RAISE EXCEPTION 'too_many_feedback_attachments';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_attachments) AS attachment
    WHERE char_length(attachment) > 1200
  ) THEN
    RAISE EXCEPTION 'invalid_feedback_attachment';
  END IF;

  IF pg_column_size(COALESCE(p_diagnostics, '{}'::jsonb)) > 65536 THEN
    RAISE EXCEPTION 'feedback_diagnostics_too_large';
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.platform_feedback
  WHERE user_id = v_actor
    AND created_at > now() - interval '10 minutes';

  SELECT count(*) INTO v_daily_count
  FROM public.platform_feedback
  WHERE user_id = v_actor
    AND created_at > now() - interval '24 hours';

  IF v_recent_count >= 5 OR v_daily_count >= 20 THEN
    RAISE EXCEPTION 'feedback_rate_limited';
  END IF;

  -- Safety starts high. Every other priority remains staff-controlled so the
  -- support queue cannot be gamed by a client request.
  IF p_category = 'safety' THEN
    v_priority := 'high';
  END IF;

  INSERT INTO public.platform_feedback (
    user_id,
    category,
    priority,
    title,
    description,
    rating,
    contact_allowed,
    source_route,
    source_url,
    diagnostics,
    attachments,
    last_response_by,
    user_last_viewed_at
  ) VALUES (
    v_actor,
    p_category,
    v_priority,
    trim(p_title),
    trim(p_description),
    p_rating,
    COALESCE(p_contact_allowed, true),
    NULLIF(trim(COALESCE(p_source_route, '')), ''),
    NULLIF(trim(COALESCE(p_source_url, '')), ''),
    COALESCE(p_diagnostics, '{}'::jsonb),
    v_attachments,
    'user',
    now()
  )
  RETURNING * INTO v_case;

  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_platform_feedback_viewed(
  p_feedback_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_staff boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT user_id INTO v_owner
  FROM public.platform_feedback
  WHERE id = p_feedback_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;

  v_staff := public.has_admin_permission(v_actor, 'feedback.view')
    OR public.has_admin_permission(v_actor, 'feedback.review');

  IF v_owner <> v_actor AND NOT v_staff THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.platform_feedback
  SET
    user_last_viewed_at = CASE WHEN v_owner = v_actor THEN now() ELSE user_last_viewed_at END,
    staff_last_viewed_at = CASE WHEN v_staff THEN now() ELSE staff_last_viewed_at END
  WHERE id = p_feedback_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_platform_feedback_viewed(uuid) TO authenticated;
