-- Alsamos Platform Feedback Center
--
-- Professional, privacy-conscious feedback/support workflow:
--   user -> case -> public/internal conversation -> staff triage -> resolution.
-- The schema is additive and protected by RLS. Support agents receive a
-- dedicated least-privilege permission instead of broad admin access.

INSERT INTO public.admin_permissions (key, category, label, description) VALUES
  ('feedback.view', 'support', 'Feedback navbatini ko‘rish', 'Platform feedback va support murojaatlarini ko‘rish.'),
  ('feedback.review', 'support', 'Feedbackni boshqarish', 'Feedbackni triage qilish, javob berish, assign qilish va yakunlash.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

INSERT INTO public.admin_role_permissions (role_key, permission_key) VALUES
  ('support', 'feedback.view'),
  ('support', 'feedback.review'),
  ('trust_safety', 'feedback.view'),
  ('trust_safety', 'feedback.review')
ON CONFLICT (role_key, permission_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL UNIQUE DEFAULT (
    'FB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    category IN ('bug', 'feature', 'experience', 'content', 'safety', 'payments', 'marketplace', 'other')
  ),
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'closed')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 140),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 10 AND 6000),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  contact_allowed boolean NOT NULL DEFAULT true,
  source_route text,
  source_url text,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments text[] NOT NULL DEFAULT ARRAY[]::text[],
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,
  last_response_by text CHECK (last_response_by IS NULL OR last_response_by IN ('user', 'staff')),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_feedback_user_time_idx
  ON public.platform_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_feedback_queue_idx
  ON public.platform_feedback(status, priority, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS platform_feedback_category_idx
  ON public.platform_feedback(category, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_feedback_assignee_idx
  ON public.platform_feedback(assigned_to, status, last_activity_at DESC)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.platform_feedback(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('user', 'staff')),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 6000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_feedback_messages_case_time_idx
  ON public.platform_feedback_messages(feedback_id, created_at ASC);

ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_feedback_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own feedback cases" ON public.platform_feedback;
CREATE POLICY "Users can view own feedback cases"
  ON public.platform_feedback FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_admin_permission(auth.uid(), 'feedback.view')
    OR public.has_admin_permission(auth.uid(), 'feedback.review')
  );

DROP POLICY IF EXISTS "Users can create own feedback cases" ON public.platform_feedback;
CREATE POLICY "Users can create own feedback cases"
  ON public.platform_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Feedback staff can update cases" ON public.platform_feedback;
CREATE POLICY "Feedback staff can update cases"
  ON public.platform_feedback FOR UPDATE TO authenticated
  USING (public.has_admin_permission(auth.uid(), 'feedback.review'))
  WITH CHECK (public.has_admin_permission(auth.uid(), 'feedback.review'));

DROP POLICY IF EXISTS "Users can view feedback conversation" ON public.platform_feedback_messages;
CREATE POLICY "Users can view feedback conversation"
  ON public.platform_feedback_messages FOR SELECT TO authenticated
  USING (
    public.has_admin_permission(auth.uid(), 'feedback.view')
    OR public.has_admin_permission(auth.uid(), 'feedback.review')
    OR (
      is_internal = false
      AND EXISTS (
        SELECT 1
        FROM public.platform_feedback f
        WHERE f.id = feedback_id
          AND f.user_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT ON public.platform_feedback TO authenticated;
GRANT SELECT ON public.platform_feedback_messages TO authenticated;

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

  -- User-submitted priority is intentionally not accepted. Safety starts high;
  -- all other cases are triaged by staff to prevent queue gaming.
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
    last_response_by
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
    COALESCE(p_attachments, ARRAY[]::text[]),
    'user'
  )
  RETURNING * INTO v_case;

  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_platform_feedback(
  p_feedback_id uuid,
  p_body text,
  p_internal boolean DEFAULT false
)
RETURNS public.platform_feedback_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.platform_feedback;
  v_staff boolean := false;
  v_message public.platform_feedback_messages;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF char_length(trim(COALESCE(p_body, ''))) < 1
     OR char_length(trim(COALESCE(p_body, ''))) > 6000 THEN
    RAISE EXCEPTION 'invalid_feedback_message';
  END IF;

  SELECT * INTO v_case
  FROM public.platform_feedback
  WHERE id = p_feedback_id
  FOR UPDATE;

  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;

  v_staff := public.has_admin_permission(v_actor, 'feedback.review');

  IF NOT v_staff AND v_case.user_id <> v_actor THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT v_staff AND COALESCE(p_internal, false) THEN
    RAISE EXCEPTION 'internal_note_not_allowed';
  END IF;

  IF NOT v_staff AND v_case.status = 'closed' THEN
    RAISE EXCEPTION 'feedback_closed';
  END IF;

  INSERT INTO public.platform_feedback_messages (
    feedback_id,
    author_user_id,
    author_role,
    body,
    is_internal
  ) VALUES (
    v_case.id,
    v_actor,
    CASE WHEN v_staff THEN 'staff' ELSE 'user' END,
    trim(p_body),
    CASE WHEN v_staff THEN COALESCE(p_internal, false) ELSE false END
  )
  RETURNING * INTO v_message;

  UPDATE public.platform_feedback
  SET
    status = CASE
      WHEN NOT v_staff AND status IN ('waiting_user', 'resolved') THEN 'in_progress'
      ELSE status
    END,
    last_response_by = CASE WHEN v_staff THEN 'staff' ELSE 'user' END,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = v_case.id;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_platform_feedback(
  p_feedback_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_set_assignment boolean DEFAULT false,
  p_resolution_note text DEFAULT NULL
)
RETURNS public.platform_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.platform_feedback;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'feedback.review') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'invalid_feedback_status';
  END IF;

  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'invalid_feedback_priority';
  END IF;

  IF p_set_assignment AND p_assigned_to IS NOT NULL AND NOT public.is_admin_staff(p_assigned_to) THEN
    RAISE EXCEPTION 'assignee_must_be_admin_staff';
  END IF;

  UPDATE public.platform_feedback
  SET
    status = COALESCE(p_status, status),
    priority = COALESCE(p_priority, priority),
    assigned_to = CASE WHEN p_set_assignment THEN p_assigned_to ELSE assigned_to END,
    resolution_note = CASE
      WHEN p_resolution_note IS NOT NULL THEN NULLIF(trim(p_resolution_note), '')
      ELSE resolution_note
    END,
    last_activity_at = CASE
      WHEN p_status IS NOT NULL OR p_priority IS NOT NULL OR p_set_assignment OR p_resolution_note IS NOT NULL
        THEN now()
      ELSE last_activity_at
    END,
    updated_at = now()
  WHERE id = p_feedback_id
  RETURNING * INTO v_case;

  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;

  RETURN v_case;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_platform_feedback(text, text, text, smallint, boolean, text, text, jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_platform_feedback(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_platform_feedback(uuid, text, text, uuid, boolean, text) TO authenticated;
