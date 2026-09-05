-- Ads Hierarchy CRUD V4
--
-- New campaigns are created atomically across account -> campaign -> ad set ->
-- creative -> delivery item. public.ads remains a compatibility projection for
-- existing feed/rendering code, but it is no longer the only write target.

CREATE OR REPLACE FUNCTION public.create_ad_campaign_v4(p_payload jsonb)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_account public.ad_accounts;
  v_campaign public.ad_campaigns_v2;
  v_set public.ad_sets_v2;
  v_creative public.ad_creatives_v2;
  v_delivery public.ad_delivery_items_v2;
  v_ad public.ads;
  v_title text := trim(COALESCE(p_payload->>'title', ''));
  v_media_url text := trim(COALESCE(p_payload->>'media_url', ''));
  v_media_type text := lower(COALESCE(p_payload->>'media_type', 'image'));
  v_ad_type text := lower(COALESCE(p_payload->>'ad_type', 'feed'));
  v_billing text := lower(COALESCE(p_payload->>'billing_type', 'cpm'));
  v_objective text := lower(COALESCE(p_payload->>'objective', ''));
  v_budget numeric := GREATEST(COALESCE(NULLIF(p_payload->>'budget', '')::numeric, 0), 0);
  v_daily numeric := NULLIF(p_payload->>'daily_budget', '')::numeric;
  v_bid numeric := GREATEST(COALESCE(NULLIF(p_payload->>'bid_amount', '')::numeric, 0.01), 0.01);
  v_placements text[];
  v_countries text[] := ARRAY[]::text[];
  v_interests text[] := ARRAY[]::text[];
  v_targeting jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF length(v_title) < 3 THEN RAISE EXCEPTION 'title_required'; END IF;
  IF v_media_url = '' THEN RAISE EXCEPTION 'media_required'; END IF;
  IF v_media_type NOT IN ('image', 'video') THEN RAISE EXCEPTION 'invalid_media_type'; END IF;
  IF v_ad_type NOT IN ('feed', 'story', 'both') THEN RAISE EXCEPTION 'invalid_ad_type'; END IF;
  IF v_billing NOT IN ('cpm', 'cpc') THEN RAISE EXCEPTION 'invalid_billing_type'; END IF;
  IF v_budget < 1 THEN RAISE EXCEPTION 'budget_too_small'; END IF;

  IF jsonb_typeof(p_payload->'target_countries') = 'array' THEN
    SELECT ARRAY(SELECT value FROM jsonb_array_elements_text(p_payload->'target_countries')) INTO v_countries;
  END IF;
  IF jsonb_typeof(p_payload->'target_interests') = 'array' THEN
    SELECT ARRAY(SELECT value FROM jsonb_array_elements_text(p_payload->'target_interests')) INTO v_interests;
  END IF;

  v_placements := CASE v_ad_type
    WHEN 'story' THEN ARRAY['story']::text[]
    WHEN 'both' THEN ARRAY['feed','discover','video','story']::text[]
    ELSE ARRAY['feed','discover','video']::text[]
  END;

  IF v_objective NOT IN ('awareness', 'traffic', 'engagement', 'video_views', 'leads', 'sales', 'app_installs') THEN
    v_objective := CASE
      WHEN lower(COALESCE(p_payload->>'call_to_action', '')) LIKE '%xarid%' THEN 'sales'
      WHEN NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), '') IS NOT NULL THEN 'traffic'
      WHEN v_media_type = 'video' THEN 'video_views'
      ELSE 'awareness'
    END;
  END IF;

  SELECT * INTO v_account
  FROM public.ad_accounts
  WHERE owner_user_id = v_user
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_account.id IS NULL THEN
    INSERT INTO public.ad_accounts (
      owner_user_id, name, currency, timezone, business_name
    )
    SELECT
      v_user,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Alsamos') || ' Ads',
      COALESCE(NULLIF(upper(p_payload->>'currency'), ''), 'USD'),
      COALESCE(NULLIF(p_payload->>'timezone', ''), 'UTC'),
      NULLIF(trim(p.display_name), '')
    FROM public.profiles p
    WHERE p.id = v_user
    RETURNING * INTO v_account;
  END IF;

  INSERT INTO public.ad_campaigns_v2 (
    ad_account_id, created_by, name, objective, buying_type, status,
    optimization_goal, daily_budget, lifetime_budget, start_at, end_at,
    metadata
  ) VALUES (
    v_account.id,
    v_user,
    v_title,
    v_objective,
    'auction',
    'pending_review',
    CASE v_objective
      WHEN 'sales' THEN 'conversions'
      WHEN 'traffic' THEN 'landing_page_views'
      WHEN 'video_views' THEN 'thruplay'
      ELSE 'reach'
    END,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_budget,
    NULLIF(p_payload->>'start_date', '')::timestamptz,
    NULLIF(p_payload->>'end_date', '')::timestamptz,
    jsonb_build_object('created_from', 'ads_manager_v4')
  ) RETURNING * INTO v_campaign;

  v_targeting := jsonb_build_object(
    'countries', to_jsonb(v_countries),
    'interests', to_jsonb(v_interests),
    'age_min', COALESCE(NULLIF(p_payload->>'target_age_min', '')::integer, 13),
    'age_max', COALESCE(NULLIF(p_payload->>'target_age_max', '')::integer, 65),
    'gender', COALESCE(NULLIF(p_payload->>'target_gender', ''), 'all')
  );

  INSERT INTO public.ad_sets_v2 (
    ad_account_id, campaign_id, created_by, name, status,
    bid_strategy, bid_amount, daily_budget, lifetime_budget,
    optimization_event, targeting, placements, frequency_cap,
    start_at, end_at, metadata
  ) VALUES (
    v_account.id,
    v_campaign.id,
    v_user,
    v_title || ' · Audience',
    'pending_review',
    'lowest_cost',
    v_bid,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_budget,
    v_campaign.optimization_goal,
    v_targeting,
    v_placements,
    jsonb_build_object('per_user_per_day', 2, 'minimum_gap_minutes', 45),
    v_campaign.start_at,
    v_campaign.end_at,
    jsonb_build_object('created_from', 'ads_manager_v4')
  ) RETURNING * INTO v_set;

  INSERT INTO public.ad_creatives_v2 (
    ad_account_id, created_by, name, format, media_url, headline, body,
    call_to_action, destination_url, status, moderation_status, metadata
  ) VALUES (
    v_account.id,
    v_user,
    v_title || ' · Creative',
    v_media_type,
    v_media_url,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    COALESCE(NULLIF(trim(p_payload->>'call_to_action'), ''), 'Batafsil'),
    NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), ''),
    'ready',
    'pending',
    jsonb_build_object('source', 'ads_manager_v4')
  ) RETURNING * INTO v_creative;

  INSERT INTO public.ads (
    user_id, title, description, media_url, media_type, destination_url,
    call_to_action, ad_type, status, budget, daily_budget, bid_amount,
    billing_type, target_countries, target_age_min, target_age_max,
    target_gender, target_interests, start_date, end_date,
    ad_account_id, campaign_v2_id, ad_set_v2_id, creative_v2_id
  ) VALUES (
    v_user,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    v_media_url,
    v_media_type,
    NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), ''),
    COALESCE(NULLIF(trim(p_payload->>'call_to_action'), ''), 'Batafsil'),
    v_ad_type,
    'pending',
    v_budget,
    CASE WHEN v_daily IS NOT NULL AND v_daily > 0 THEN v_daily ELSE NULL END,
    v_bid,
    v_billing,
    v_countries,
    COALESCE(NULLIF(p_payload->>'target_age_min', '')::integer, 13),
    COALESCE(NULLIF(p_payload->>'target_age_max', '')::integer, 65),
    COALESCE(NULLIF(p_payload->>'target_gender', ''), 'all'),
    v_interests,
    NULLIF(p_payload->>'start_date', '')::timestamptz,
    NULLIF(p_payload->>'end_date', '')::timestamptz,
    v_account.id,
    v_campaign.id,
    v_set.id,
    v_creative.id
  ) RETURNING * INTO v_ad;

  INSERT INTO public.ad_delivery_items_v2 (
    ad_account_id, campaign_id, ad_set_id, creative_id, legacy_ad_id,
    name, status, delivery_weight, metadata
  ) VALUES (
    v_account.id,
    v_campaign.id,
    v_set.id,
    v_creative.id,
    v_ad.id,
    v_title,
    'pending_review',
    1,
    jsonb_build_object('compatibility_surface', 'public.ads')
  ) RETURNING * INTO v_delivery;

  UPDATE public.ads
  SET delivery_item_v2_id = v_delivery.id,
      updated_at = now()
  WHERE id = v_ad.id
  RETURNING * INTO v_ad;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ad_campaign_v4(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ad_delivery_status_v4(
  p_ad_id uuid,
  p_status text
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ad public.ads;
  v_delivery_status text;
  v_moderation text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'unsupported_status'; END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id AND user_id = v_user
  FOR UPDATE;

  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  IF p_status = 'active' AND v_ad.creative_v2_id IS NOT NULL THEN
    SELECT moderation_status INTO v_moderation
    FROM public.ad_creatives_v2
    WHERE id = v_ad.creative_v2_id;
    IF v_moderation NOT IN ('approved', 'limited') THEN
      RAISE EXCEPTION 'creative_not_approved';
    END IF;
  END IF;

  UPDATE public.ads
  SET status = p_status, updated_at = now()
  WHERE id = p_ad_id
  RETURNING * INTO v_ad;

  v_delivery_status := CASE WHEN p_status = 'active' THEN 'active' ELSE 'paused' END;
  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = v_delivery_status, updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ad_delivery_status_v4(uuid, text) TO authenticated;

-- Upgrade the review workflow so approval activates the normalized hierarchy,
-- not only the legacy compatibility row.
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
  v_creative_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_admin_permission(v_actor, 'ads.review') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected', 'limited', 'needs_changes') THEN
    RAISE EXCEPTION 'unsupported_decision';
  END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = p_ad_id FOR UPDATE;
  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  v_status := CASE WHEN p_decision IN ('approved', 'limited') THEN 'active' ELSE 'rejected' END;
  v_creative_status := CASE
    WHEN p_decision = 'approved' THEN 'approved'
    WHEN p_decision = 'limited' THEN 'limited'
    ELSE 'rejected'
  END;

  UPDATE public.ads SET status = v_status, updated_at = now()
  WHERE id = p_ad_id RETURNING * INTO v_ad;

  IF v_ad.creative_v2_id IS NOT NULL THEN
    UPDATE public.ad_creatives_v2
    SET moderation_status = v_creative_status,
        policy_labels = COALESCE(p_policy_labels, ARRAY[]::text[]),
        updated_at = now()
    WHERE id = v_ad.creative_v2_id;
  END IF;

  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = CASE WHEN p_decision IN ('approved', 'limited') THEN 'active' ELSE 'rejected' END,
        metadata = CASE
          WHEN p_decision = 'limited' THEN COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('limited_delivery', true)
          ELSE COALESCE(metadata, '{}'::jsonb) - 'limited_delivery'
        END,
        updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  IF p_decision IN ('approved', 'limited') THEN
    IF v_ad.ad_set_v2_id IS NOT NULL THEN
      UPDATE public.ad_sets_v2
      SET status = 'active', updated_at = now()
      WHERE id = v_ad.ad_set_v2_id AND status IN ('draft', 'pending_review', 'paused');
    END IF;
    IF v_ad.campaign_v2_id IS NOT NULL THEN
      UPDATE public.ad_campaigns_v2
      SET status = 'active', updated_at = now()
      WHERE id = v_ad.campaign_v2_id AND status IN ('draft', 'pending_review', 'paused');
    END IF;
  ELSE
    IF v_ad.ad_set_v2_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.ad_delivery_items_v2 d
      WHERE d.ad_set_id = v_ad.ad_set_v2_id AND d.status NOT IN ('rejected', 'archived')
    ) THEN
      UPDATE public.ad_sets_v2 SET status = 'rejected', updated_at = now() WHERE id = v_ad.ad_set_v2_id;
    END IF;
  END IF;

  IF v_ad.creative_v2_id IS NOT NULL AND v_ad.ad_account_id IS NOT NULL THEN
    INSERT INTO public.ad_moderation_reviews_v2 (
      ad_account_id, creative_id, reviewer_id, decision, reason_code,
      notes, policy_labels, metadata
    ) VALUES (
      v_ad.ad_account_id,
      v_ad.creative_v2_id,
      v_actor,
      p_decision,
      NULLIF(trim(COALESCE(p_reason_code, '')), ''),
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      COALESCE(p_policy_labels, ARRAY[]::text[]),
      jsonb_build_object('legacy_ad_id', v_ad.id, 'hierarchy_synced', true)
    );
  END IF;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_ad_v2(uuid, text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_ads_workspace_v4()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.ad_accounts a
      WHERE public.has_ad_account_access(a.id, auth.uid())
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
      FROM public.ad_campaigns_v2 c
      WHERE public.has_ad_account_access(c.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'ad_sets', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM public.ad_sets_v2 s
      WHERE public.has_ad_account_access(s.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'creatives', COALESCE((
      SELECT jsonb_agg(to_jsonb(cr) ORDER BY cr.created_at DESC)
      FROM public.ad_creatives_v2 cr
      WHERE public.has_ad_account_access(cr.ad_account_id, auth.uid())
    ), '[]'::jsonb),
    'delivery_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
      FROM public.ad_delivery_items_v2 d
      WHERE public.has_ad_account_access(d.ad_account_id, auth.uid())
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_ads_workspace_v4() TO authenticated;
