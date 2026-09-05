-- Marketplace -> Ads Attribution V4
--
-- A client-side checkout event is useful for funnel analysis, but a purchase is
-- counted only from trusted order state. Wallet-paid orders are attributed when
-- payment becomes paid; cash/card-on-delivery orders are attributed when the
-- order is actually delivered. Event IDs make the trigger idempotent.

CREATE OR REPLACE FUNCTION public.record_ad_conversion_for_user_v4(
  p_user_id uuid,
  p_event_name text,
  p_value numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touch public.ad_delivery_events;
  v_ad public.ads;
  v_conversion_id uuid;
  v_account_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(trim(p_event_name), '') = '' THEN RAISE EXCEPTION 'event_name_required'; END IF;

  -- Prefer click-through attribution using the campaign's configured window.
  SELECT e.* INTO v_touch
  FROM public.ad_delivery_events e
  JOIN public.ads a ON a.id = e.ad_id
  LEFT JOIN public.ad_campaigns_v2 c ON c.id = a.campaign_v2_id
  WHERE e.user_id = p_user_id
    AND e.event_type = 'click'
    AND e.is_invalid = false
    AND e.created_at >= now() - make_interval(days => COALESCE(c.attribution_click_days, 7))
  ORDER BY e.created_at DESC
  LIMIT 1;

  -- If there is no eligible click, fall back to a recent qualified impression.
  IF v_touch.id IS NULL THEN
    SELECT e.* INTO v_touch
    FROM public.ad_delivery_events e
    JOIN public.ads a ON a.id = e.ad_id
    LEFT JOIN public.ad_campaigns_v2 c ON c.id = a.campaign_v2_id
    WHERE e.user_id = p_user_id
      AND e.event_type = 'impression'
      AND e.is_invalid = false
      AND e.created_at >= now() - make_interval(days => COALESCE(c.attribution_view_days, 1))
    ORDER BY e.created_at DESC
    LIMIT 1;
  END IF;

  IF v_touch.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = v_touch.ad_id;
  IF v_ad.id IS NULL THEN RETURN NULL; END IF;

  v_account_id := v_ad.ad_account_id;

  INSERT INTO public.ad_conversion_events_v2 (
    event_id, ad_account_id, campaign_id, ad_set_id, delivery_item_id,
    legacy_ad_id, user_id, event_name, value, currency, source, source_url,
    click_event_key, impression_event_key, metadata, occurred_at
  ) VALUES (
    p_event_id,
    v_account_id,
    v_ad.campaign_v2_id,
    v_ad.ad_set_v2_id,
    v_ad.delivery_item_v2_id,
    v_ad.id,
    p_user_id,
    trim(p_event_name),
    p_value,
    p_currency,
    'alsamos_web',
    p_source_url,
    CASE WHEN v_touch.event_type = 'click' THEN v_touch.event_key ELSE NULL END,
    CASE WHEN v_touch.event_type = 'impression' THEN v_touch.event_key ELSE NULL END,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'attribution_type', CASE WHEN v_touch.event_type = 'click' THEN 'click_through' ELSE 'view_through' END,
      'touch_at', v_touch.created_at,
      'placement', v_touch.placement
    ),
    now()
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_conversion_id;

  IF v_conversion_id IS NOT NULL THEN
    INSERT INTO public.ad_daily_metrics_v3 (
      day, ad_id, placement, conversions, conversion_value, updated_at
    ) VALUES (
      CURRENT_DATE,
      v_ad.id,
      v_touch.placement,
      1,
      COALESCE(p_value, 0),
      now()
    )
    ON CONFLICT (day, ad_id, placement) DO UPDATE SET
      conversions = public.ad_daily_metrics_v3.conversions + 1,
      conversion_value = public.ad_daily_metrics_v3.conversion_value + COALESCE(EXCLUDED.conversion_value, 0),
      updated_at = now();

    PERFORM public.refresh_ad_quality_v3(v_ad.id);
  END IF;

  RETURN v_conversion_id;
END;
$$;

-- Internal function: only trusted SECURITY DEFINER code may attribute an event
-- for an arbitrary user. The public wrapper below always pins to auth.uid().
REVOKE ALL ON FUNCTION public.record_ad_conversion_for_user_v4(uuid, text, numeric, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ad_conversion_for_user_v4(uuid, text, numeric, text, text, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.record_ad_conversion_for_user_v4(uuid, text, numeric, text, text, text, jsonb) FROM anon;

CREATE OR REPLACE FUNCTION public.record_ad_conversion_v2(
  p_event_name text,
  p_value numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  RETURN public.record_ad_conversion_for_user_v4(
    v_user,
    p_event_name,
    p_value,
    p_currency,
    p_source_url,
    p_event_id,
    p_metadata
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.attribute_marketplace_purchase_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_paid boolean;
  v_was_paid boolean := false;
BEGIN
  v_is_paid :=
    NEW.payment_status = 'paid'
    OR (
      NEW.status = 'delivered'
      AND COALESCE(NEW.payment_method, '') IN ('cash', 'card_on_delivery')
    );

  IF TG_OP = 'UPDATE' THEN
    v_was_paid :=
      OLD.payment_status = 'paid'
      OR (
        OLD.status = 'delivered'
        AND COALESCE(OLD.payment_method, '') IN ('cash', 'card_on_delivery')
      );
  END IF;

  IF v_is_paid AND NOT v_was_paid THEN
    PERFORM public.record_ad_conversion_for_user_v4(
      NEW.buyer_id,
      'purchase',
      NEW.total,
      NEW.currency,
      '/marketplace?tab=orders',
      'marketplace-order:' || NEW.id::text || ':purchase',
      jsonb_build_object(
        'commerce', 'marketplace',
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'seller_id', NEW.seller_id,
        'payment_method', NEW.payment_method,
        'payment_status', NEW.payment_status,
        'order_status', NEW.status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_ads_purchase_attribution_v4 ON public.orders;
CREATE TRIGGER orders_ads_purchase_attribution_v4
AFTER INSERT OR UPDATE OF payment_status, status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.attribute_marketplace_purchase_v4();
