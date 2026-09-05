-- Ads Campaign Studio V4
--
-- Completes normalized campaign CRUD for the advertiser UI. A campaign may own
-- multiple delivery variants in one ad set; each variant has its own creative
-- and compatibility public.ads row until all render surfaces read V4 directly.

CREATE OR REPLACE FUNCTION public.create_ad_variant_v4(
  p_campaign_id uuid,
  p_source_delivery_item_id uuid,
  p_payload jsonb
)
RETURNS public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign public.ad_campaigns_v2;
  v_source_delivery public.ad_delivery_items_v2;
  v_source_ad public.ads;
  v_ad_set public.ad_sets_v2;
  v_creative public.ad_creatives_v2;
  v_delivery public.ad_delivery_items_v2;
  v_ad public.ads;
  v_title text := trim(COALESCE(p_payload->>'title', ''));
  v_media_url text := trim(COALESCE(p_payload->>'media_url', ''));
  v_media_type text := lower(COALESCE(p_payload->>'media_type', 'image'));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF length(v_title) < 3 THEN RAISE EXCEPTION 'title_required'; END IF;
  IF v_media_url = '' THEN RAISE EXCEPTION 'media_required'; END IF;
  IF v_media_type NOT IN ('image', 'video') THEN RAISE EXCEPTION 'invalid_media_type'; END IF;

  SELECT * INTO v_campaign
  FROM public.ad_campaigns_v2
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_campaign.ad_account_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_source_delivery
  FROM public.ad_delivery_items_v2
  WHERE id = p_source_delivery_item_id
    AND campaign_id = v_campaign.id;
  IF v_source_delivery.id IS NULL THEN RAISE EXCEPTION 'source_delivery_not_found'; END IF;

  SELECT * INTO v_ad_set FROM public.ad_sets_v2 WHERE id = v_source_delivery.ad_set_id;
  IF v_ad_set.id IS NULL THEN RAISE EXCEPTION 'ad_set_not_found'; END IF;

  IF v_source_delivery.legacy_ad_id IS NOT NULL THEN
    SELECT * INTO v_source_ad FROM public.ads WHERE id = v_source_delivery.legacy_ad_id;
  END IF;

  INSERT INTO public.ad_creatives_v2 (
    ad_account_id, created_by, name, format, media_url, headline, body,
    call_to_action, destination_url, status, moderation_status, metadata
  ) VALUES (
    v_campaign.ad_account_id,
    v_user,
    v_title || ' · Creative',
    v_media_type,
    v_media_url,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'call_to_action', '')), ''), 'Batafsil'),
    NULLIF(trim(COALESCE(p_payload->>'destination_url', '')), ''),
    'ready',
    'pending',
    jsonb_build_object(
      'source', 'campaign_studio_v4',
      'source_delivery_item_id', v_source_delivery.id
    )
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
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'call_to_action', '')), ''), 'Batafsil'),
    COALESCE(v_source_ad.ad_type, CASE WHEN 'story' = ANY(v_ad_set.placements) THEN 'both' ELSE 'feed' END),
    'pending',
    COALESCE(v_source_ad.budget, v_campaign.lifetime_budget, v_ad_set.lifetime_budget, 1),
    COALESCE(v_source_ad.daily_budget, v_ad_set.daily_budget, v_campaign.daily_budget),
    COALESCE(v_source_ad.bid_amount, v_ad_set.bid_amount, 0.01),
    COALESCE(v_source_ad.billing_type, 'cpm'),
    COALESCE(v_source_ad.target_countries, ARRAY[]::text[]),
    COALESCE(v_source_ad.target_age_min, NULLIF(v_ad_set.targeting->>'age_min', '')::integer, 13),
    COALESCE(v_source_ad.target_age_max, NULLIF(v_ad_set.targeting->>'age_max', '')::integer, 65),
    COALESCE(v_source_ad.target_gender, NULLIF(v_ad_set.targeting->>'gender', ''), 'all'),
    COALESCE(v_source_ad.target_interests, ARRAY[]::text[]),
    COALESCE(v_source_ad.start_date, v_ad_set.start_at, v_campaign.start_at),
    COALESCE(v_source_ad.end_date, v_ad_set.end_at, v_campaign.end_at),
    v_campaign.ad_account_id,
    v_campaign.id,
    v_ad_set.id,
    v_creative.id
  ) RETURNING * INTO v_ad;

  INSERT INTO public.ad_delivery_items_v2 (
    ad_account_id, campaign_id, ad_set_id, creative_id, legacy_ad_id,
    name, status, delivery_weight, metadata
  ) VALUES (
    v_campaign.ad_account_id,
    v_campaign.id,
    v_ad_set.id,
    v_creative.id,
    v_ad.id,
    v_title,
    'pending_review',
    1,
    jsonb_build_object(
      'created_from', 'campaign_studio_v4',
      'source_delivery_item_id', v_source_delivery.id
    )
  ) RETURNING * INTO v_delivery;

  UPDATE public.ads
  SET delivery_item_v2_id = v_delivery.id,
      updated_at = now()
  WHERE id = v_ad.id
  RETURNING * INTO v_ad;

  RETURN v_ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ad_variant_v4(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_ad_campaign_v4(
  p_campaign_id uuid,
  p_patch jsonb
)
RETURNS public.ad_campaigns_v2
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign public.ad_campaigns_v2;
  v_name text;
  v_daily numeric;
  v_lifetime numeric;
  v_click_days integer;
  v_view_days integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_campaign
  FROM public.ad_campaigns_v2
  WHERE id = p_campaign_id
  FOR UPDATE;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_campaign.ad_account_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_name := COALESCE(NULLIF(trim(p_patch->>'name'), ''), v_campaign.name);
  v_daily := CASE
    WHEN p_patch ? 'daily_budget' THEN NULLIF(p_patch->>'daily_budget', '')::numeric
    ELSE v_campaign.daily_budget
  END;
  v_lifetime := CASE
    WHEN p_patch ? 'lifetime_budget' THEN NULLIF(p_patch->>'lifetime_budget', '')::numeric
    ELSE v_campaign.lifetime_budget
  END;
  v_click_days := COALESCE(NULLIF(p_patch->>'attribution_click_days', '')::integer, v_campaign.attribution_click_days);
  v_view_days := COALESCE(NULLIF(p_patch->>'attribution_view_days', '')::integer, v_campaign.attribution_view_days);

  IF v_daily IS NOT NULL AND v_daily < 0 THEN RAISE EXCEPTION 'invalid_daily_budget'; END IF;
  IF v_lifetime IS NOT NULL AND v_lifetime < 1 THEN RAISE EXCEPTION 'invalid_lifetime_budget'; END IF;
  IF v_click_days < 0 OR v_click_days > 30 THEN RAISE EXCEPTION 'invalid_click_window'; END IF;
  IF v_view_days < 0 OR v_view_days > 7 THEN RAISE EXCEPTION 'invalid_view_window'; END IF;

  UPDATE public.ad_campaigns_v2
  SET name = v_name,
      daily_budget = v_daily,
      lifetime_budget = v_lifetime,
      attribution_click_days = v_click_days,
      attribution_view_days = v_view_days,
      updated_at = now()
  WHERE id = v_campaign.id
  RETURNING * INTO v_campaign;

  -- Keep ad-set and compatibility rows aligned with campaign-level budget edits.
  UPDATE public.ad_sets_v2
  SET daily_budget = COALESCE(v_daily, daily_budget),
      lifetime_budget = COALESCE(v_lifetime, lifetime_budget),
      updated_at = now()
  WHERE campaign_id = v_campaign.id;

  UPDATE public.ads
  SET daily_budget = COALESCE(v_daily, daily_budget),
      budget = COALESCE(v_lifetime, budget),
      updated_at = now()
  WHERE campaign_v2_id = v_campaign.id;

  RETURN v_campaign;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ad_campaign_v4(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_ad_campaign_v4(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign public.ad_campaigns_v2;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_campaign
  FROM public.ad_campaigns_v2
  WHERE id = p_campaign_id
  FOR UPDATE;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_campaign.ad_account_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.ad_campaigns_v2 SET status = 'archived', updated_at = now() WHERE id = v_campaign.id;
  UPDATE public.ad_sets_v2 SET status = 'archived', updated_at = now() WHERE campaign_id = v_campaign.id;
  UPDATE public.ad_delivery_items_v2 SET status = 'archived', updated_at = now() WHERE campaign_id = v_campaign.id;

  UPDATE public.ad_creatives_v2 cr
  SET status = 'archived', updated_at = now()
  WHERE cr.id IN (
    SELECT d.creative_id FROM public.ad_delivery_items_v2 d WHERE d.campaign_id = v_campaign.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 other
    WHERE other.creative_id = cr.id
      AND other.campaign_id <> v_campaign.id
      AND other.status <> 'archived'
  );

  DELETE FROM public.ads WHERE campaign_v2_id = v_campaign.id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_ad_campaign_v4(uuid) TO authenticated;
