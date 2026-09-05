-- Permissioned Ads moderation workflow.
-- Specialized ads_reviewer users can review creatives without receiving broad
-- platform-admin powers. super_admin remains an implicit wildcard through
-- has_admin_permission().

CREATE OR REPLACE FUNCTION public.review_ad_v2(
  p_ad_id uuid,
  p_decision text,
  p_reason_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_policy_labels text[] DEFAULT ARRAY[]::text[]
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ad public.ads;
  v_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'ads.review') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'limited', 'needs_changes') THEN
    RAISE EXCEPTION 'unsupported_decision';
  END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id
  FOR UPDATE;

  IF v_ad.id IS NULL THEN
    RAISE EXCEPTION 'ad_not_found';
  END IF;

  v_status := CASE
    WHEN p_decision = 'approved' THEN 'active'
    WHEN p_decision = 'limited' THEN 'active'
    WHEN p_decision IN ('rejected', 'needs_changes') THEN 'rejected'
    ELSE v_ad.status
  END;

  UPDATE public.ads
  SET status = v_status,
      updated_at = now()
  WHERE id = p_ad_id
  RETURNING * INTO v_ad;

  IF v_ad.creative_v2_id IS NOT NULL AND v_ad.ad_account_id IS NOT NULL THEN
    UPDATE public.ad_creatives_v2
    SET moderation_status = CASE
          WHEN p_decision = 'approved' THEN 'approved'
          WHEN p_decision = 'limited' THEN 'limited'
          ELSE 'rejected'
        END,
        policy_labels = COALESCE(p_policy_labels, ARRAY[]::text[]),
        updated_at = now()
    WHERE id = v_ad.creative_v2_id;

    INSERT INTO public.ad_moderation_reviews_v2 (
      ad_account_id,
      creative_id,
      reviewer_id,
      decision,
      reason_code,
      notes,
      policy_labels,
      metadata
    ) VALUES (
      v_ad.ad_account_id,
      v_ad.creative_v2_id,
      v_actor,
      p_decision,
      NULLIF(trim(COALESCE(p_reason_code, '')), ''),
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      COALESCE(p_policy_labels, ARRAY[]::text[]),
      jsonb_build_object('legacy_ad_id', v_ad.id)
    );
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_ad_v2(uuid, text, text, text, text[]) TO authenticated;
