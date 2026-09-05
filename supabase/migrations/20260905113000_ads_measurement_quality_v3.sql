-- Ads Measurement & Quality V3
--
-- High-volume raw events are intentionally kept separate from long-lived
-- reporting. Daily rollups power dashboards while raw delivery rows can be
-- pruned after a short attribution/fraud window. This matters for Alsamos
-- because media lives outside Supabase and database storage should stay lean.

CREATE TABLE IF NOT EXISTS public.ad_daily_metrics_v3 (
  day date NOT NULL,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  dismissals bigint NOT NULL DEFAULT 0,
  reports bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  conversion_value numeric NOT NULL DEFAULT 0,
  estimated_spend numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, ad_id, placement)
);

CREATE INDEX IF NOT EXISTS ad_daily_metrics_v3_ad_day_idx
  ON public.ad_daily_metrics_v3(ad_id, day DESC);
CREATE INDEX IF NOT EXISTS ad_daily_metrics_v3_day_placement_idx
  ON public.ad_daily_metrics_v3(day DESC, placement);

CREATE TABLE IF NOT EXISTS public.ad_quality_state_v3 (
  ad_id uuid PRIMARY KEY REFERENCES public.ads(id) ON DELETE CASCADE,
  quality_score numeric NOT NULL DEFAULT 1 CHECK (quality_score >= 0 AND quality_score <= 2),
  ctr_30d numeric NOT NULL DEFAULT 0,
  hide_rate_30d numeric NOT NULL DEFAULT 0,
  report_rate_30d numeric NOT NULL DEFAULT 0,
  conversion_rate_30d numeric NOT NULL DEFAULT 0,
  sample_impressions_30d bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'learning' CHECK (status IN ('learning', 'healthy', 'limited', 'poor')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_daily_metrics_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_quality_state_v3 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advertisers can view own daily ad metrics" ON public.ad_daily_metrics_v3;
CREATE POLICY "Advertisers can view own daily ad metrics"
  ON public.ad_daily_metrics_v3 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()));

DROP POLICY IF EXISTS "Advertisers can view own ad quality" ON public.ad_quality_state_v3;
CREATE POLICY "Advertisers can view own ad quality"
  ON public.ad_quality_state_v3 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()));

GRANT SELECT ON public.ad_daily_metrics_v3 TO authenticated;
GRANT SELECT ON public.ad_quality_state_v3 TO authenticated;

CREATE OR REPLACE FUNCTION public.rollup_ad_delivery_event_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing text;
  v_bid numeric;
  v_spend numeric := 0;
  v_reports bigint := 0;
BEGIN
  SELECT billing_type, COALESCE(bid_amount, 0)
    INTO v_billing, v_bid
  FROM public.ads
  WHERE id = NEW.ad_id;

  IF NEW.event_type = 'impression' AND v_billing = 'cpm' THEN
    v_spend := v_bid / 1000.0;
  ELSIF NEW.event_type = 'click' AND v_billing = 'cpc' THEN
    v_spend := v_bid;
  END IF;

  IF NEW.event_type = 'feedback' AND NEW.metadata->>'feedback_type' = 'report' THEN
    v_reports := 1;
  END IF;

  INSERT INTO public.ad_daily_metrics_v3 (
    day,
    ad_id,
    placement,
    impressions,
    clicks,
    dismissals,
    reports,
    estimated_spend,
    updated_at
  ) VALUES (
    (NEW.created_at AT TIME ZONE 'UTC')::date,
    NEW.ad_id,
    NEW.placement,
    CASE WHEN NEW.event_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'dismiss' THEN 1 ELSE 0 END,
    v_reports,
    v_spend,
    now()
  )
  ON CONFLICT (day, ad_id, placement) DO UPDATE SET
    impressions = public.ad_daily_metrics_v3.impressions + EXCLUDED.impressions,
    clicks = public.ad_daily_metrics_v3.clicks + EXCLUDED.clicks,
    dismissals = public.ad_daily_metrics_v3.dismissals + EXCLUDED.dismissals,
    reports = public.ad_daily_metrics_v3.reports + EXCLUDED.reports,
    estimated_spend = public.ad_daily_metrics_v3.estimated_spend + EXCLUDED.estimated_spend,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_delivery_events_rollup_v3 ON public.ad_delivery_events;
CREATE TRIGGER ad_delivery_events_rollup_v3
AFTER INSERT ON public.ad_delivery_events
FOR EACH ROW EXECUTE FUNCTION public.rollup_ad_delivery_event_v3();

CREATE OR REPLACE FUNCTION public.refresh_ad_quality_v3(p_ad_id uuid)
RETURNS public.ad_quality_state_v3
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impressions bigint := 0;
  v_clicks bigint := 0;
  v_dismissals bigint := 0;
  v_reports bigint := 0;
  v_conversions bigint := 0;
  v_ctr numeric := 0;
  v_hide_rate numeric := 0;
  v_report_rate numeric := 0;
  v_conversion_rate numeric := 0;
  v_score numeric := 1;
  v_status text := 'learning';
  v_row public.ad_quality_state_v3;
BEGIN
  SELECT
    COALESCE(sum(impressions), 0),
    COALESCE(sum(clicks), 0),
    COALESCE(sum(dismissals), 0),
    COALESCE(sum(reports), 0),
    COALESCE(sum(conversions), 0)
  INTO v_impressions, v_clicks, v_dismissals, v_reports, v_conversions
  FROM public.ad_daily_metrics_v3
  WHERE ad_id = p_ad_id
    AND day >= CURRENT_DATE - 29;

  IF v_impressions > 0 THEN
    v_ctr := v_clicks::numeric / v_impressions;
    v_hide_rate := v_dismissals::numeric / v_impressions;
    v_report_rate := v_reports::numeric / v_impressions;
    v_conversion_rate := v_conversions::numeric / v_impressions;
  END IF;

  -- Quality score is deliberately bounded. Bid can never buy its way out of
  -- severe negative feedback because delivery ranking multiplies by quality.
  v_score := LEAST(
    2,
    GREATEST(
      0,
      1
      + LEAST(0.35, v_ctr * 3)
      + LEAST(0.25, v_conversion_rate * 8)
      - LEAST(0.65, v_hide_rate * 4)
      - LEAST(0.90, v_report_rate * 20)
    )
  );

  v_status := CASE
    WHEN v_impressions < 100 THEN 'learning'
    WHEN v_score < 0.45 OR v_report_rate >= 0.02 THEN 'poor'
    WHEN v_score < 0.75 OR v_hide_rate >= 0.12 THEN 'limited'
    ELSE 'healthy'
  END;

  INSERT INTO public.ad_quality_state_v3 (
    ad_id,
    quality_score,
    ctr_30d,
    hide_rate_30d,
    report_rate_30d,
    conversion_rate_30d,
    sample_impressions_30d,
    status,
    updated_at
  ) VALUES (
    p_ad_id,
    v_score,
    v_ctr,
    v_hide_rate,
    v_report_rate,
    v_conversion_rate,
    v_impressions,
    v_status,
    now()
  )
  ON CONFLICT (ad_id) DO UPDATE SET
    quality_score = EXCLUDED.quality_score,
    ctr_30d = EXCLUDED.ctr_30d,
    hide_rate_30d = EXCLUDED.hide_rate_30d,
    report_rate_30d = EXCLUDED.report_rate_30d,
    conversion_rate_30d = EXCLUDED.conversion_rate_30d,
    sample_impressions_30d = EXCLUDED.sample_impressions_30d,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- During migration from legacy flat ads, conversions are allowed to reference
-- a legacy ad before it has been attached to an ad account/campaign hierarchy.
ALTER TABLE public.ad_conversion_events_v2
  ALTER COLUMN ad_account_id DROP NOT NULL;

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
  v_user_id uuid := auth.uid();
  v_touch public.ad_delivery_events;
  v_ad public.ads;
  v_conversion_id uuid;
  v_account_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF COALESCE(trim(p_event_name), '') = '' THEN
    RAISE EXCEPTION 'event_name_required';
  END IF;

  -- Click-through attribution wins. If no click exists, use a recent view.
  SELECT e.* INTO v_touch
  FROM public.ad_delivery_events e
  WHERE e.user_id = v_user_id
    AND e.event_type = 'click'
    AND e.created_at >= now() - interval '7 days'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_touch.id IS NULL THEN
    SELECT e.* INTO v_touch
    FROM public.ad_delivery_events e
    WHERE e.user_id = v_user_id
      AND e.event_type = 'impression'
      AND e.created_at >= now() - interval '1 day'
    ORDER BY e.created_at DESC
    LIMIT 1;
  END IF;

  IF v_touch.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = v_touch.ad_id;
  IF v_ad.id IS NULL THEN RETURN NULL; END IF;

  v_account_id := v_ad.ad_account_id;

  INSERT INTO public.ad_conversion_events_v2 (
    event_id,
    ad_account_id,
    campaign_id,
    ad_set_id,
    delivery_item_id,
    legacy_ad_id,
    user_id,
    event_name,
    value,
    currency,
    source,
    source_url,
    click_event_key,
    impression_event_key,
    metadata,
    occurred_at
  ) VALUES (
    p_event_id,
    v_account_id,
    v_ad.campaign_v2_id,
    v_ad.ad_set_v2_id,
    v_ad.delivery_item_v2_id,
    v_ad.id,
    v_user_id,
    trim(p_event_name),
    p_value,
    p_currency,
    'alsamos_web',
    p_source_url,
    CASE WHEN v_touch.event_type = 'click' THEN v_touch.event_key ELSE NULL END,
    CASE WHEN v_touch.event_type = 'impression' THEN v_touch.event_key ELSE NULL END,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_conversion_id;

  IF v_conversion_id IS NOT NULL THEN
    INSERT INTO public.ad_daily_metrics_v3 (
      day,
      ad_id,
      placement,
      conversions,
      conversion_value,
      updated_at
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

GRANT EXECUTE ON FUNCTION public.record_ad_conversion_v2(text, numeric, text, text, text, jsonb) TO authenticated;

-- Raw delivery rows are useful for recent frequency/fraud/attribution, but
-- should not grow forever. Long-term dashboards use ad_daily_metrics_v3.
CREATE OR REPLACE FUNCTION public.prune_ad_delivery_raw_v3(p_keep_days integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_admin_permission(auth.uid(), 'ads.review')
     AND NOT public.has_admin_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH deleted AS (
    DELETE FROM public.ad_delivery_events
    WHERE created_at < now() - make_interval(days => GREATEST(7, LEAST(COALESCE(p_keep_days, 30), 90)))
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;
