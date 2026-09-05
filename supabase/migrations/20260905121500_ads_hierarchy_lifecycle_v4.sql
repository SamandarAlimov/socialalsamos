-- Ads hierarchy lifecycle helpers.

CREATE OR REPLACE FUNCTION public.archive_ad_delivery_v4(p_ad_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ad public.ads;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_ad
  FROM public.ads
  WHERE id = p_ad_id AND user_id = v_user
  FOR UPDATE;

  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'ad_not_found'; END IF;

  IF v_ad.delivery_item_v2_id IS NOT NULL THEN
    UPDATE public.ad_delivery_items_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.delivery_item_v2_id;
  END IF;

  IF v_ad.creative_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.creative_id = v_ad.creative_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_creatives_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.creative_v2_id;
  END IF;

  IF v_ad.ad_set_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.ad_set_id = v_ad.ad_set_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_sets_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.ad_set_v2_id;
  END IF;

  IF v_ad.campaign_v2_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ad_delivery_items_v2 d
    WHERE d.campaign_id = v_ad.campaign_v2_id
      AND d.id IS DISTINCT FROM v_ad.delivery_item_v2_id
      AND d.status <> 'archived'
  ) THEN
    UPDATE public.ad_campaigns_v2
    SET status = 'archived', updated_at = now()
    WHERE id = v_ad.campaign_v2_id;
  END IF;

  DELETE FROM public.ads WHERE id = p_ad_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_ad_delivery_v4(uuid) TO authenticated;
