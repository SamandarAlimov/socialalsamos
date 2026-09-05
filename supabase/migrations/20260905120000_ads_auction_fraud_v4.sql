-- Ads Auction & Integrity V4
--
-- Deepens delivery beyond a flat bid sort. The server now combines smoothed
-- response probability, creative quality, first-party relevance, advertiser
-- fatigue, budget pacing and hierarchy state. Invalid-traffic signals are
-- scored before legacy counters/spend-facing rollups are allowed to move.

ALTER TABLE public.ad_delivery_events
  ADD COLUMN IF NOT EXISTS is_invalid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fraud_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invalid_reason text;

CREATE INDEX IF NOT EXISTS ad_delivery_events_valid_user_time_v4_idx
  ON public.ad_delivery_events(user_id, created_at DESC)
  WHERE is_invalid = false;

CREATE TABLE IF NOT EXISTS public.ad_fraud_signals_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_event_id uuid REFERENCES public.ad_delivery_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  signal_type text NOT NULL,
  severity numeric NOT NULL CHECK (severity >= 0 AND severity <= 1),
  session_id text,
  device_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_fraud_signals_v4_ad_time_idx
  ON public.ad_fraud_signals_v4(ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_fraud_signals_v4_user_time_idx
  ON public.ad_fraud_signals_v4(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.ad_fraud_signals_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ads reviewers can view fraud signals" ON public.ad_fraud_signals_v4;
CREATE POLICY "Ads reviewers can view fraud signals"
  ON public.ad_fraud_signals_v4 FOR SELECT TO authenticated
  USING (public.has_admin_permission(auth.uid(), 'ads.review'));

GRANT SELECT ON public.ad_fraud_signals_v4 TO authenticated;

CREATE OR REPLACE FUNCTION public.score_ad_event_risk_v4(
  p_user_id uuid,
  p_ad_id uuid,
  p_placement text,
  p_event_type text,
  p_session_id text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric := 0;
  v_reason text := NULL;
  v_recent_same integer := 0;
  v_user_minute integer := 0;
  v_session_minute integer := 0;
  v_clicks_same_minute integer := 0;
  v_has_recent_impression boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('score', 0, 'invalid', false, 'reason', NULL);
  END IF;

  SELECT count(*) INTO v_recent_same
  FROM public.ad_delivery_events e
  WHERE e.user_id = p_user_id
    AND e.ad_id = p_ad_id
    AND e.placement = p_placement
    AND e.event_type = p_event_type
    AND e.created_at > now() - interval '2 seconds';

  IF v_recent_same > 0 THEN
    v_score := v_score + CASE WHEN p_event_type = 'click' THEN 0.85 ELSE 0.70 END;
    v_reason := 'rapid_duplicate';
  END IF;

  SELECT count(*) INTO v_user_minute
  FROM public.ad_delivery_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '1 minute';

  IF v_user_minute >= 40 THEN
    v_score := v_score + 0.45;
    v_reason := COALESCE(v_reason, 'user_event_burst');
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT count(*) INTO v_session_minute
    FROM public.ad_delivery_events e
    WHERE e.session_id = p_session_id
      AND e.created_at > now() - interval '1 minute';

    IF v_session_minute >= 60 THEN
      v_score := v_score + 0.45;
      v_reason := COALESCE(v_reason, 'session_event_burst');
    END IF;
  END IF;

  IF p_event_type = 'click' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ad_delivery_events e
      WHERE e.user_id = p_user_id
        AND e.ad_id = p_ad_id
        AND e.event_type = 'impression'
        AND e.is_invalid = false
        AND e.created_at > now() - interval '15 minutes'
    ) INTO v_has_recent_impression;

    IF NOT v_has_recent_impression THEN
      v_score := v_score + 0.45;
      v_reason := COALESCE(v_reason, 'click_without_recent_impression');
    END IF;

    SELECT count(*) INTO v_clicks_same_minute
    FROM public.ad_delivery_events e
    WHERE e.user_id = p_user_id
      AND e.ad_id = p_ad_id
      AND e.event_type = 'click'
      AND e.created_at > now() - interval '1 minute';

    IF v_clicks_same_minute >= 3 THEN
      v_score := v_score + 0.55;
      v_reason := COALESCE(v_reason, 'repeated_click_burst');
    END IF;
  END IF;

  -- Client-provided metadata is never trusted as a primary fraud verdict, but
  -- impossible/empty automation fingerprints may contribute a small signal.
  IF COALESCE(p_metadata->>'automation', '') = 'true' THEN
    v_score := v_score + 0.35;
    v_reason := COALESCE(v_reason, 'automation_hint');
  END IF;

  v_score := LEAST(1, GREATEST(0, v_score));
  RETURN jsonb_build_object(
    'score', v_score,
    'invalid', v_score >= 0.85,
    'reason', v_reason
  );
END;
$$;

-- Measurement rollups must ignore invalid traffic. The trigger name remains the
-- V3 name so existing installations are upgraded in place.
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
  IF COALESCE(NEW.is_invalid, false) THEN
    RETURN NEW;
  END IF;

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
    day, ad_id, placement, impressions, clicks, dismissals, reports,
    estimated_spend, updated_at
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

CREATE OR REPLACE FUNCTION public.record_ad_delivery_event_v4(
  p_ad_id uuid,
  p_placement text,
  p_event_type text,
  p_session_id text DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_slot_key text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_score numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_risk jsonb;
  v_fraud_score numeric := 0;
  v_invalid boolean := false;
  v_reason text := NULL;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'dismiss', 'feedback') THEN
    RAISE EXCEPTION 'unsupported_ad_event';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ads WHERE id = p_ad_id AND status = 'active') THEN
    RETURN false;
  END IF;

  v_risk := public.score_ad_event_risk_v4(
    v_user_id, p_ad_id, p_placement, p_event_type,
    p_session_id, p_device_type, COALESCE(p_metadata, '{}'::jsonb)
  );
  v_fraud_score := COALESCE((v_risk->>'score')::numeric, 0);
  v_invalid := COALESCE((v_risk->>'invalid')::boolean, false);
  v_reason := NULLIF(v_risk->>'reason', '');

  INSERT INTO public.ad_delivery_events (
    event_key, ad_id, user_id, placement, event_type, session_id, slot_key,
    device_type, score, metadata, is_invalid, fraud_score, invalid_reason
  ) VALUES (
    p_event_key, p_ad_id, v_user_id, p_placement, p_event_type, p_session_id,
    p_slot_key, p_device_type, p_score, COALESCE(p_metadata, '{}'::jsonb),
    v_invalid, v_fraud_score, v_reason
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_fraud_score >= 0.35 THEN
    INSERT INTO public.ad_fraud_signals_v4 (
      delivery_event_id, user_id, ad_id, placement, signal_type, severity,
      session_id, device_type, metadata
    ) VALUES (
      v_event_id, v_user_id, p_ad_id, p_placement,
      COALESCE(v_reason, 'risk_score'), v_fraud_score,
      p_session_id, p_device_type,
      jsonb_build_object('event_type', p_event_type, 'slot_key', p_slot_key)
    );
  END IF;

  IF v_invalid THEN
    RETURN false;
  END IF;

  IF p_event_type = 'impression' THEN
    INSERT INTO public.ad_impressions (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_reach (ad_id, user_id)
      VALUES (p_ad_id, v_user_id)
      ON CONFLICT (ad_id, user_id) DO NOTHING;

      INSERT INTO public.ad_frequency_counters (
        user_id, ad_id, placement, day, impressions,
        first_impression_at, last_impression_at, updated_at
      ) VALUES (
        v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now(), now(), now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        impressions = public.ad_frequency_counters.impressions + 1,
        first_impression_at = COALESCE(public.ad_frequency_counters.first_impression_at, EXCLUDED.first_impression_at),
        last_impression_at = EXCLUDED.last_impression_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'click' THEN
    INSERT INTO public.ad_clicks (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_frequency_counters (
        user_id, ad_id, placement, day, clicks, last_click_at, updated_at
      ) VALUES (
        v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now(), now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        clicks = public.ad_frequency_counters.clicks + 1,
        last_click_at = EXCLUDED.last_click_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'dismiss' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.ad_frequency_counters (
      user_id, ad_id, placement, day, dismissals, updated_at
    ) VALUES (
      v_user_id, p_ad_id, p_placement, CURRENT_DATE, 1, now()
    )
    ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
      dismissals = public.ad_frequency_counters.dismissals + 1,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_delivery_event_v4(uuid, text, text, text, text, text, text, numeric, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_eligible_ads_v4(
  p_placement text,
  p_limit integer DEFAULT 6,
  p_session_id text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.ads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT * FROM public.ad_delivery_config
    WHERE placement = p_placement AND enabled = true
    LIMIT 1
  ),
  ctx AS (
    SELECT
      CASE WHEN COALESCE(p_context->>'session_age_seconds', '') ~ '^[0-9]+$'
        THEN (p_context->>'session_age_seconds')::integer ELSE 0 END AS session_age_seconds,
      CASE WHEN jsonb_typeof(p_context->'interests') = 'array'
        THEN ARRAY(SELECT lower(value) FROM jsonb_array_elements_text(p_context->'interests'))
        ELSE ARRAY[]::text[] END AS interests
  ),
  base AS (
    SELECT a.*
    FROM public.get_eligible_ads_v2(
      p_placement,
      LEAST(20, GREATEST(COALESCE(p_limit, 6) * 6, COALESCE(p_limit, 6))),
      p_session_id,
      p_context
    ) a
  ),
  scored AS (
    SELECT
      a.id,
      a.created_at,
      COALESCE(q.quality_score, 1) AS quality_score,
      COALESCE(dm.estimated_spend, 0) AS spent_today,
      COALESCE(di.delivery_weight, 1) AS delivery_weight,
      COALESCE(af.advertiser_impressions_24h, 0) AS advertiser_impressions_24h,
      COALESCE(
        s.daily_budget,
        c.daily_budget,
        a.daily_budget
      ) AS effective_daily_budget,
      (
        CASE
          WHEN lower(COALESCE(a.billing_type, 'cpm')) = 'cpc'
            THEN GREATEST(COALESCE(a.bid_amount, 0.01), 0.01)
                 * ((COALESCE(a.clicks_count, 0) + 2.0) / (COALESCE(a.impressions_count, 0) + 100.0))
                 * 1000.0
          ELSE GREATEST(COALESCE(a.bid_amount, 0.01), 0.01)
        END
      )
      * (0.35 + 0.65 * LEAST(2, GREATEST(0, COALESCE(q.quality_score, 1))))
      * (
          1 + LEAST(
            0.45,
            CASE
              WHEN cardinality(ctx.interests) = 0 OR COALESCE(cardinality(a.target_interests), 0) = 0 THEN 0
              ELSE 0.15 * (
                SELECT count(*)::numeric
                FROM unnest(a.target_interests) target_interest
                WHERE lower(target_interest) = ANY(ctx.interests)
              )
            END
          )
        )
      * (1.0 / (1.0 + COALESCE(af.advertiser_impressions_24h, 0) * 0.22))
      * CASE WHEN COALESCE(a.impressions_count, 0) < 100 THEN 1.08 ELSE 1 END
      * COALESCE(di.delivery_weight, 1)
      * CASE
          WHEN COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) IS NULL
               OR COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) <= 0
            THEN 1
          ELSE LEAST(
            1.40,
            GREATEST(
              0.15,
              (
                COALESCE(s.daily_budget, c.daily_budget, a.daily_budget)
                * GREATEST(
                    0.08,
                    EXTRACT(EPOCH FROM (now() - date_trunc('day', now()))) / 86400.0
                  )
              ) / GREATEST(COALESCE(dm.estimated_spend, 0), 0.01)
            )
          )
        END AS auction_score
    FROM base a
    CROSS JOIN cfg
    CROSS JOIN ctx
    LEFT JOIN public.ad_quality_state_v3 q ON q.ad_id = a.id
    LEFT JOIN (
      SELECT ad_id, sum(estimated_spend) AS estimated_spend
      FROM public.ad_daily_metrics_v3
      WHERE day = CURRENT_DATE
      GROUP BY ad_id
    ) dm ON dm.ad_id = a.id
    LEFT JOIN public.ad_campaigns_v2 c ON c.id = a.campaign_v2_id
    LEFT JOIN public.ad_sets_v2 s ON s.id = a.ad_set_v2_id
    LEFT JOIN public.ad_creatives_v2 cr ON cr.id = a.creative_v2_id
    LEFT JOIN public.ad_delivery_items_v2 di ON di.id = a.delivery_item_v2_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS advertiser_impressions_24h
      FROM public.ad_delivery_events e
      JOIN public.ads seen_ad ON seen_ad.id = e.ad_id
      WHERE e.user_id = auth.uid()
        AND e.event_type = 'impression'
        AND e.is_invalid = false
        AND seen_ad.user_id = a.user_id
        AND e.created_at > now() - interval '24 hours'
    ) af ON true
    WHERE ctx.session_age_seconds >= cfg.min_session_seconds
      AND (a.campaign_v2_id IS NULL OR c.status = 'active')
      AND (a.ad_set_v2_id IS NULL OR s.status = 'active')
      AND (a.creative_v2_id IS NULL OR cr.moderation_status IN ('approved', 'limited'))
      AND (a.delivery_item_v2_id IS NULL OR di.status = 'active')
      AND (
        COALESCE(s.daily_budget, c.daily_budget, a.daily_budget) IS NULL
        OR COALESCE(dm.estimated_spend, 0) < COALESCE(s.daily_budget, c.daily_budget, a.daily_budget)
      )
      AND (
        c.id IS NULL
        OR c.lifetime_budget IS NULL
        OR (
          SELECT COALESCE(sum(COALESCE(linked.spent, 0)), 0)
          FROM public.ads linked
          WHERE linked.campaign_v2_id = c.id
        ) < c.lifetime_budget
      )
  )
  SELECT a.*
  FROM scored s
  JOIN public.ads a ON a.id = s.id
  ORDER BY s.auction_score DESC, s.quality_score DESC, s.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_ads_v4(text, integer, text, jsonb) TO authenticated;
