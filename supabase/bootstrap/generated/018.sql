-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260905122000_ads_experiments_v4.sql
-- SHA256 9886e987a9d367b2d2a3c8c9eb9cd21187e2db84353df11c097fe4f34a803c92
-- ============================================================================
-- Ads Experiments V4
--
-- Deterministic A/B assignment lives on delivery items, not on ad-hoc client
-- randomization. A user/session therefore remains on the same variant while an
-- experiment is running, and metrics continue to come from the shared delivery
-- and conversion pipeline.

CREATE TABLE IF NOT EXISTS public.ad_experiments_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns_v2(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  primary_metric text NOT NULL DEFAULT 'ctr' CHECK (
    primary_metric IN ('ctr', 'conversion_rate', 'cpa', 'roas')
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'running', 'paused', 'completed', 'archived')
  ),
  traffic_percent numeric NOT NULL DEFAULT 100 CHECK (traffic_percent > 0 AND traffic_percent <= 100),
  minimum_sample_size integer NOT NULL DEFAULT 200 CHECK (minimum_sample_size >= 50),
  starts_at timestamptz,
  ends_at timestamptz,
  winner_variant_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_experiment_variants_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.ad_experiments_v4(id) ON DELETE CASCADE,
  delivery_item_id uuid NOT NULL REFERENCES public.ad_delivery_items_v2(id) ON DELETE CASCADE,
  name text NOT NULL,
  allocation_pct numeric NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 100),
  is_control boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, delivery_item_id)
);

ALTER TABLE public.ad_experiments_v4
  DROP CONSTRAINT IF EXISTS ad_experiments_v4_winner_variant_id_fkey;
ALTER TABLE public.ad_experiments_v4
  ADD CONSTRAINT ad_experiments_v4_winner_variant_id_fkey
  FOREIGN KEY (winner_variant_id) REFERENCES public.ad_experiment_variants_v4(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ad_experiment_assignments_v4 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.ad_experiments_v4(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.ad_experiment_variants_v4(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_experiment_assignments_user_v4_idx
  ON public.ad_experiment_assignments_v4(experiment_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ad_experiment_assignments_session_v4_idx
  ON public.ad_experiment_assignments_v4(experiment_id, session_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_experiment_variants_delivery_v4_idx
  ON public.ad_experiment_variants_v4(delivery_item_id);

ALTER TABLE public.ad_experiments_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_experiment_variants_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_experiment_assignments_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ad account members can view experiments" ON public.ad_experiments_v4;
CREATE POLICY "Ad account members can view experiments"
  ON public.ad_experiments_v4 FOR SELECT TO authenticated
  USING (public.has_ad_account_access(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Ad account managers can manage experiments" ON public.ad_experiments_v4;
CREATE POLICY "Ad account managers can manage experiments"
  ON public.ad_experiments_v4 FOR ALL TO authenticated
  USING (public.can_manage_ad_account(ad_account_id, auth.uid()))
  WITH CHECK (public.can_manage_ad_account(ad_account_id, auth.uid()));

DROP POLICY IF EXISTS "Members can view experiment variants" ON public.ad_experiment_variants_v4;
CREATE POLICY "Members can view experiment variants"
  ON public.ad_experiment_variants_v4 FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ad_experiments_v4 e
    WHERE e.id = experiment_id
      AND public.has_ad_account_access(e.ad_account_id, auth.uid())
  ));

DROP POLICY IF EXISTS "Managers can manage experiment variants" ON public.ad_experiment_variants_v4;
CREATE POLICY "Managers can manage experiment variants"
  ON public.ad_experiment_variants_v4 FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ad_experiments_v4 e
    WHERE e.id = experiment_id
      AND public.can_manage_ad_account(e.ad_account_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ad_experiments_v4 e
    WHERE e.id = experiment_id
      AND public.can_manage_ad_account(e.ad_account_id, auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view own experiment assignments" ON public.ad_experiment_assignments_v4;
CREATE POLICY "Users can view own experiment assignments"
  ON public.ad_experiment_assignments_v4 FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_experiments_v4 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_experiment_variants_v4 TO authenticated;
GRANT SELECT ON public.ad_experiment_assignments_v4 TO authenticated;

CREATE OR REPLACE FUNCTION public.select_ad_experiment_variant_v4(
  p_experiment_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_session_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_experiment public.ad_experiments_v4;
  v_seed text;
  v_traffic_bucket numeric;
  v_variant_bucket numeric;
  v_control uuid;
  v_selected uuid;
BEGIN
  SELECT * INTO v_experiment
  FROM public.ad_experiments_v4
  WHERE id = p_experiment_id
    AND status = 'running'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());

  IF v_experiment.id IS NULL THEN RETURN NULL; END IF;

  v_seed := COALESCE(p_user_id::text, NULLIF(p_session_id, ''), 'anonymous');
  v_traffic_bucket := (abs(hashtext(v_experiment.id::text || ':' || v_seed || ':traffic')) % 10000) / 100.0;

  SELECT id INTO v_control
  FROM public.ad_experiment_variants_v4
  WHERE experiment_id = v_experiment.id
  ORDER BY is_control DESC, created_at ASC
  LIMIT 1;

  IF v_traffic_bucket >= v_experiment.traffic_percent THEN
    RETURN v_control;
  END IF;

  v_variant_bucket := (abs(hashtext(v_experiment.id::text || ':' || v_seed || ':variant')) % 10000) / 100.0;

  WITH weighted AS (
    SELECT
      id,
      allocation_pct,
      sum(allocation_pct) OVER (ORDER BY created_at, id) AS upper_bound
    FROM public.ad_experiment_variants_v4
    WHERE experiment_id = v_experiment.id
  ), normalized AS (
    SELECT
      id,
      upper_bound,
      max(upper_bound) OVER () AS total_weight
    FROM weighted
  )
  SELECT id INTO v_selected
  FROM normalized
  WHERE v_variant_bucket < (upper_bound / NULLIF(total_weight, 0)) * 100
  ORDER BY upper_bound
  LIMIT 1;

  RETURN COALESCE(v_selected, v_control);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ad_experiment_v4(
  p_campaign_id uuid,
  p_name text,
  p_primary_metric text,
  p_variants jsonb,
  p_traffic_percent numeric DEFAULT 100,
  p_minimum_sample_size integer DEFAULT 200
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign public.ad_campaigns_v2;
  v_experiment_id uuid;
  v_variant jsonb;
  v_total numeric := 0;
  v_count integer := 0;
  v_delivery_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_campaign FROM public.ad_campaigns_v2 WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_campaign.ad_account_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_primary_metric NOT IN ('ctr', 'conversion_rate', 'cpa', 'roas') THEN
    RAISE EXCEPTION 'invalid_primary_metric';
  END IF;
  IF jsonb_typeof(p_variants) <> 'array' THEN RAISE EXCEPTION 'variants_required'; END IF;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_variants)
  LOOP
    v_count := v_count + 1;
    v_total := v_total + COALESCE(NULLIF(v_variant->>'allocation_pct', '')::numeric, 0);
    v_delivery_id := NULLIF(v_variant->>'delivery_item_id', '')::uuid;
    IF v_delivery_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.ad_delivery_items_v2 d
      WHERE d.id = v_delivery_id AND d.campaign_id = v_campaign.id
    ) THEN
      RAISE EXCEPTION 'variant_delivery_item_not_in_campaign';
    END IF;
  END LOOP;

  IF v_count < 2 THEN RAISE EXCEPTION 'at_least_two_variants_required'; END IF;
  IF abs(v_total - 100) > 0.01 THEN RAISE EXCEPTION 'variant_allocation_must_equal_100'; END IF;

  INSERT INTO public.ad_experiments_v4 (
    ad_account_id, campaign_id, created_by, name, primary_metric,
    traffic_percent, minimum_sample_size, status
  ) VALUES (
    v_campaign.ad_account_id,
    v_campaign.id,
    v_user,
    COALESCE(NULLIF(trim(p_name), ''), v_campaign.name || ' experiment'),
    p_primary_metric,
    LEAST(100, GREATEST(1, COALESCE(p_traffic_percent, 100))),
    GREATEST(50, COALESCE(p_minimum_sample_size, 200)),
    'draft'
  ) RETURNING id INTO v_experiment_id;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_variants)
  LOOP
    INSERT INTO public.ad_experiment_variants_v4 (
      experiment_id, delivery_item_id, name, allocation_pct, is_control
    ) VALUES (
      v_experiment_id,
      (v_variant->>'delivery_item_id')::uuid,
      COALESCE(NULLIF(trim(v_variant->>'name'), ''), 'Variant'),
      (v_variant->>'allocation_pct')::numeric,
      COALESCE((v_variant->>'is_control')::boolean, false)
    );
  END LOOP;

  RETURN v_experiment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ad_experiment_status_v4(
  p_experiment_id uuid,
  p_status text
)
RETURNS public.ad_experiments_v4
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ad_experiments_v4;
  v_total numeric;
  v_count integer;
BEGIN
  SELECT * INTO v_row FROM public.ad_experiments_v4 WHERE id = p_experiment_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'experiment_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_row.ad_account_id, auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_status NOT IN ('draft', 'running', 'paused', 'completed', 'archived') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT count(*), COALESCE(sum(allocation_pct), 0)
  INTO v_count, v_total
  FROM public.ad_experiment_variants_v4
  WHERE experiment_id = v_row.id;

  IF p_status = 'running' AND (v_count < 2 OR abs(v_total - 100) > 0.01) THEN
    RAISE EXCEPTION 'experiment_not_ready';
  END IF;

  UPDATE public.ad_experiments_v4
  SET status = p_status,
      starts_at = CASE WHEN p_status = 'running' THEN COALESCE(starts_at, now()) ELSE starts_at END,
      ends_at = CASE WHEN p_status = 'completed' THEN COALESCE(ends_at, now()) ELSE ends_at END,
      updated_at = now()
  WHERE id = p_experiment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ad_experiment_results_v4(p_experiment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_experiment public.ad_experiments_v4;
  v_result jsonb;
BEGIN
  SELECT * INTO v_experiment FROM public.ad_experiments_v4 WHERE id = p_experiment_id;
  IF v_experiment.id IS NULL THEN RAISE EXCEPTION 'experiment_not_found'; END IF;
  IF NOT public.has_ad_account_access(v_experiment.ad_account_id, auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT jsonb_build_object(
    'experiment', to_jsonb(v_experiment),
    'variants', COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY rows.is_control DESC, rows.variant_name), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      ev.id AS variant_id,
      ev.name AS variant_name,
      ev.is_control,
      ev.allocation_pct,
      d.id AS delivery_item_id,
      COALESCE(sum(m.impressions), 0)::bigint AS impressions,
      COALESCE(sum(m.clicks), 0)::bigint AS clicks,
      COALESCE(sum(m.conversions), 0)::bigint AS conversions,
      COALESCE(sum(m.conversion_value), 0)::numeric AS conversion_value,
      COALESCE(sum(m.estimated_spend), 0)::numeric AS spend,
      CASE WHEN COALESCE(sum(m.impressions), 0) > 0
        THEN COALESCE(sum(m.clicks), 0)::numeric / sum(m.impressions) ELSE 0 END AS ctr,
      CASE WHEN COALESCE(sum(m.clicks), 0) > 0
        THEN COALESCE(sum(m.conversions), 0)::numeric / sum(m.clicks) ELSE 0 END AS conversion_rate,
      CASE WHEN COALESCE(sum(m.conversions), 0) > 0
        THEN COALESCE(sum(m.estimated_spend), 0)::numeric / sum(m.conversions) ELSE NULL END AS cpa,
      CASE WHEN COALESCE(sum(m.estimated_spend), 0) > 0
        THEN COALESCE(sum(m.conversion_value), 0)::numeric / sum(m.estimated_spend) ELSE NULL END AS roas,
      COALESCE(sum(m.impressions), 0) >= v_experiment.minimum_sample_size AS sample_ready
    FROM public.ad_experiment_variants_v4 ev
    JOIN public.ad_delivery_items_v2 d ON d.id = ev.delivery_item_id
    LEFT JOIN public.ads a ON a.delivery_item_v2_id = d.id
    LEFT JOIN public.ad_daily_metrics_v3 m
      ON m.ad_id = a.id
     AND m.day >= COALESCE(v_experiment.starts_at::date, v_experiment.created_at::date)
     AND (v_experiment.ends_at IS NULL OR m.day <= v_experiment.ends_at::date)
    WHERE ev.experiment_id = v_experiment.id
    GROUP BY ev.id, ev.name, ev.is_control, ev.allocation_pct, d.id
  ) rows;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_ad_experiment_variant_v4(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ad_experiment_v4(uuid, text, text, jsonb, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ad_experiment_status_v4(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_experiment_results_v4(uuid) TO authenticated;

-- Experiment-aware wrapper around the V4 auction. A delivery item that belongs
-- to a running experiment is eligible only when deterministic assignment selects
-- its variant. Non-experiment campaigns pass through unchanged.
CREATE OR REPLACE FUNCTION public.get_eligible_ads_v5(
  p_placement text,
  p_limit integer DEFAULT 6,
  p_session_id text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.ads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.ads;
  v_experiment_id uuid;
  v_variant_id uuid;
  v_selected uuid;
  v_returned integer := 0;
BEGIN
  FOR v_ad IN
    SELECT * FROM public.get_eligible_ads_v4(
      p_placement,
      LEAST(20, GREATEST(COALESCE(p_limit, 6) * 4, COALESCE(p_limit, 6))),
      p_session_id,
      p_context
    )
  LOOP
    v_experiment_id := NULL;
    v_variant_id := NULL;

    IF v_ad.delivery_item_v2_id IS NOT NULL THEN
      SELECT ev.experiment_id, ev.id
      INTO v_experiment_id, v_variant_id
      FROM public.ad_experiment_variants_v4 ev
      JOIN public.ad_experiments_v4 ex ON ex.id = ev.experiment_id
      WHERE ev.delivery_item_id = v_ad.delivery_item_v2_id
        AND ex.status = 'running'
        AND (ex.starts_at IS NULL OR ex.starts_at <= now())
        AND (ex.ends_at IS NULL OR ex.ends_at >= now())
      ORDER BY ex.created_at DESC
      LIMIT 1;
    END IF;

    IF v_experiment_id IS NOT NULL THEN
      v_selected := public.select_ad_experiment_variant_v4(
        v_experiment_id, auth.uid(), p_session_id
      );
      IF v_selected IS DISTINCT FROM v_variant_id THEN
        CONTINUE;
      END IF;
    END IF;

    RETURN NEXT v_ad;
    v_returned := v_returned + 1;
    EXIT WHEN v_returned >= GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_ads_v5(text, integer, text, jsonb) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905123000_ads_marketplace_attribution_v4.sql
-- SHA256 3cebd803c8c130103b8dcc44de2c0ba9759557ea94c5a15246e597b60859e978
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260905124000_ads_campaign_studio_v4.sql
-- SHA256 2f35afa9138086314a4adc8a7401fa51a88d13d57f0ac14b431a256b33795f3f
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260905125000_ads_legacy_backfill_v4.sql
-- SHA256 39be1c3f4dfeb5b1932163a9ae479514e6765fe208bdbed3a53211a3b9ca3c0a
-- ============================================================================
-- Ads legacy -> normalized hierarchy backfill.
--
-- Existing campaigns must not disappear from Campaign Studio after V4 rollout.
-- This migration converts every legacy public.ads row that is not yet bridged
-- into one normalized Campaign -> Ad Set -> Creative -> Delivery Item chain.
-- The operation is idempotent because bridge IDs are written back to public.ads.

DO $$
DECLARE
  r public.ads;
  v_account public.ad_accounts;
  v_campaign public.ad_campaigns_v2;
  v_set public.ad_sets_v2;
  v_creative public.ad_creatives_v2;
  v_delivery public.ad_delivery_items_v2;
  v_campaign_status text;
  v_delivery_status text;
  v_moderation_status text;
  v_objective text;
  v_placements text[];
BEGIN
  FOR r IN
    SELECT *
    FROM public.ads
    WHERE ad_account_id IS NULL
       OR campaign_v2_id IS NULL
       OR ad_set_v2_id IS NULL
       OR creative_v2_id IS NULL
       OR delivery_item_v2_id IS NULL
    ORDER BY created_at ASC
  LOOP
    SELECT * INTO v_account
    FROM public.ad_accounts
    WHERE owner_user_id = r.user_id
      AND status <> 'disabled'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_account.id IS NULL THEN
      INSERT INTO public.ad_accounts (
        owner_user_id, name, currency, timezone, business_name, created_at, updated_at
      )
      SELECT
        r.user_id,
        COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Alsamos') || ' Ads',
        'USD',
        'UTC',
        NULLIF(trim(p.display_name), ''),
        r.created_at,
        now()
      FROM public.profiles p
      WHERE p.id = r.user_id
      RETURNING * INTO v_account;
    END IF;

    -- A profile should always exist for an ads owner. If historical data is
    -- inconsistent, skip it rather than failing the entire migration.
    IF v_account.id IS NULL THEN
      CONTINUE;
    END IF;

    v_campaign_status := CASE r.status
      WHEN 'active' THEN 'active'
      WHEN 'paused' THEN 'paused'
      WHEN 'completed' THEN 'completed'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'pending_review'
    END;
    v_delivery_status := v_campaign_status;
    v_moderation_status := CASE
      WHEN r.status IN ('active', 'paused', 'completed') THEN 'approved'
      WHEN r.status = 'rejected' THEN 'rejected'
      ELSE 'pending'
    END;
    v_objective := CASE
      WHEN lower(COALESCE(r.call_to_action, '')) LIKE '%xarid%' THEN 'sales'
      WHEN NULLIF(trim(COALESCE(r.destination_url, '')), '') IS NOT NULL THEN 'traffic'
      WHEN r.media_type = 'video' THEN 'video_views'
      ELSE 'awareness'
    END;
    v_placements := CASE r.ad_type
      WHEN 'story' THEN ARRAY['story']::text[]
      WHEN 'both' THEN ARRAY['feed','discover','video','story']::text[]
      ELSE ARRAY['feed','discover','video']::text[]
    END;

    IF r.campaign_v2_id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.ad_campaigns_v2 WHERE id = r.campaign_v2_id;
    END IF;
    IF v_campaign.id IS NULL THEN
      INSERT INTO public.ad_campaigns_v2 (
        ad_account_id, created_by, name, objective, buying_type, status,
        optimization_goal, daily_budget, lifetime_budget, start_at, end_at,
        metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        r.user_id,
        r.title,
        v_objective,
        'auction',
        v_campaign_status,
        CASE v_objective
          WHEN 'sales' THEN 'conversions'
          WHEN 'traffic' THEN 'landing_page_views'
          WHEN 'video_views' THEN 'thruplay'
          ELSE 'reach'
        END,
        r.daily_budget,
        r.budget,
        r.start_date,
        r.end_date,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_campaign;
    END IF;

    IF r.ad_set_v2_id IS NOT NULL THEN
      SELECT * INTO v_set FROM public.ad_sets_v2 WHERE id = r.ad_set_v2_id;
    END IF;
    IF v_set.id IS NULL THEN
      INSERT INTO public.ad_sets_v2 (
        ad_account_id, campaign_id, created_by, name, status,
        bid_strategy, bid_amount, daily_budget, lifetime_budget,
        optimization_event, targeting, placements, frequency_cap,
        start_at, end_at, metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        v_campaign.id,
        r.user_id,
        r.title || ' · Audience',
        v_campaign_status,
        'lowest_cost',
        r.bid_amount,
        r.daily_budget,
        r.budget,
        v_campaign.optimization_goal,
        jsonb_build_object(
          'countries', to_jsonb(COALESCE(r.target_countries, ARRAY[]::text[])),
          'interests', to_jsonb(COALESCE(r.target_interests, ARRAY[]::text[])),
          'age_min', COALESCE(r.target_age_min, 13),
          'age_max', COALESCE(r.target_age_max, 65),
          'gender', COALESCE(r.target_gender, 'all')
        ),
        v_placements,
        jsonb_build_object('per_user_per_day', 2, 'minimum_gap_minutes', 45),
        r.start_date,
        r.end_date,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_set;
    END IF;

    IF r.creative_v2_id IS NOT NULL THEN
      SELECT * INTO v_creative FROM public.ad_creatives_v2 WHERE id = r.creative_v2_id;
    END IF;
    IF v_creative.id IS NULL THEN
      INSERT INTO public.ad_creatives_v2 (
        ad_account_id, created_by, name, format, media_url, headline, body,
        call_to_action, destination_url, status, moderation_status,
        metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        r.user_id,
        r.title || ' · Creative',
        CASE WHEN r.media_type = 'video' THEN 'video' ELSE 'image' END,
        r.media_url,
        r.title,
        r.description,
        r.call_to_action,
        r.destination_url,
        'ready',
        v_moderation_status,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_creative;
    END IF;

    IF r.delivery_item_v2_id IS NOT NULL THEN
      SELECT * INTO v_delivery FROM public.ad_delivery_items_v2 WHERE id = r.delivery_item_v2_id;
    END IF;
    IF v_delivery.id IS NULL THEN
      INSERT INTO public.ad_delivery_items_v2 (
        ad_account_id, campaign_id, ad_set_id, creative_id, legacy_ad_id,
        name, status, delivery_weight, metadata, created_at, updated_at
      ) VALUES (
        v_account.id,
        v_campaign.id,
        v_set.id,
        v_creative.id,
        r.id,
        r.title,
        v_delivery_status,
        1,
        jsonb_build_object('backfilled_from_legacy_ad', r.id),
        r.created_at,
        now()
      ) RETURNING * INTO v_delivery;
    END IF;

    UPDATE public.ads
    SET ad_account_id = v_account.id,
        campaign_v2_id = v_campaign.id,
        ad_set_v2_id = v_set.id,
        creative_v2_id = v_creative.id,
        delivery_item_v2_id = v_delivery.id,
        updated_at = now()
    WHERE id = r.id;

    -- Clear composite variables before the next row. PL/pgSQL record variables
    -- otherwise keep the previous iteration's values after an empty SELECT.
    v_campaign := NULL;
    v_set := NULL;
    v_creative := NULL;
    v_delivery := NULL;
    v_account := NULL;
  END LOOP;
END;
$$;


-- ============================================================================
-- SOURCE B-web: 20260905125500_ads_experiment_winner_v4.sql
-- SHA256 c58eca2df139d7b441f0716f2641a5d8546575ae321f17602fa53372a05e891b
-- ============================================================================
-- Ads experiment winner promotion.
--
-- Completing a test is a business decision, not merely a status change. This
-- helper refuses to declare a winner before the configured minimum sample is
-- reached, chooses the best variant for the experiment's primary metric, stores
-- the winner and can roll the campaign forward by pausing losing variants.

CREATE OR REPLACE FUNCTION public.complete_ad_experiment_v4(
  p_experiment_id uuid,
  p_rollout_winner boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_experiment public.ad_experiments_v4;
  v_results jsonb;
  v_winner jsonb;
  v_winner_id uuid;
  v_winner_delivery uuid;
  v_metric numeric;
BEGIN
  SELECT * INTO v_experiment
  FROM public.ad_experiments_v4
  WHERE id = p_experiment_id
  FOR UPDATE;

  IF v_experiment.id IS NULL THEN RAISE EXCEPTION 'experiment_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_experiment.ad_account_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_results := public.get_ad_experiment_results_v4(v_experiment.id);

  SELECT variant INTO v_winner
  FROM jsonb_array_elements(COALESCE(v_results->'variants', '[]'::jsonb)) AS variant
  WHERE COALESCE((variant->>'sample_ready')::boolean, false)
  ORDER BY
    CASE WHEN v_experiment.primary_metric = 'cpa'
      THEN COALESCE(NULLIF(variant->>'cpa', '')::numeric, 1e18)
      ELSE -COALESCE(
        CASE v_experiment.primary_metric
          WHEN 'ctr' THEN NULLIF(variant->>'ctr', '')::numeric
          WHEN 'conversion_rate' THEN NULLIF(variant->>'conversion_rate', '')::numeric
          WHEN 'roas' THEN NULLIF(variant->>'roas', '')::numeric
          ELSE 0
        END,
        -1e18
      )
    END ASC,
    COALESCE((variant->>'impressions')::bigint, 0) DESC
  LIMIT 1;

  IF v_winner IS NULL THEN
    RAISE EXCEPTION 'minimum_sample_not_reached';
  END IF;

  v_winner_id := (v_winner->>'variant_id')::uuid;
  v_winner_delivery := (v_winner->>'delivery_item_id')::uuid;
  v_metric := CASE v_experiment.primary_metric
    WHEN 'ctr' THEN NULLIF(v_winner->>'ctr', '')::numeric
    WHEN 'conversion_rate' THEN NULLIF(v_winner->>'conversion_rate', '')::numeric
    WHEN 'cpa' THEN NULLIF(v_winner->>'cpa', '')::numeric
    WHEN 'roas' THEN NULLIF(v_winner->>'roas', '')::numeric
    ELSE NULL
  END;

  UPDATE public.ad_experiments_v4
  SET status = 'completed',
      ends_at = COALESCE(ends_at, now()),
      winner_variant_id = v_winner_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'winner_selected_at', now(),
        'winner_metric', v_metric,
        'winner_metric_name', v_experiment.primary_metric,
        'winner_rollout', p_rollout_winner
      ),
      updated_at = now()
  WHERE id = v_experiment.id;

  IF p_rollout_winner THEN
    -- Keep only the winning delivery variant active. Losing variants remain in
    -- history and experiment result tables, but no longer compete in auction.
    UPDATE public.ad_delivery_items_v2 d
    SET status = CASE WHEN d.id = v_winner_delivery THEN 'active' ELSE 'paused' END,
        updated_at = now()
    WHERE d.id IN (
      SELECT ev.delivery_item_id
      FROM public.ad_experiment_variants_v4 ev
      WHERE ev.experiment_id = v_experiment.id
    )
      AND d.status NOT IN ('rejected', 'archived');

    UPDATE public.ads a
    SET status = CASE WHEN a.delivery_item_v2_id = v_winner_delivery THEN 'active' ELSE 'paused' END,
        updated_at = now()
    WHERE a.delivery_item_v2_id IN (
      SELECT ev.delivery_item_id
      FROM public.ad_experiment_variants_v4 ev
      WHERE ev.experiment_id = v_experiment.id
    )
      AND a.status NOT IN ('rejected', 'completed');
  END IF;

  RETURN jsonb_build_object(
    'experiment_id', v_experiment.id,
    'winner_variant_id', v_winner_id,
    'winner_delivery_item_id', v_winner_delivery,
    'primary_metric', v_experiment.primary_metric,
    'metric_value', v_metric,
    'rollout_winner', p_rollout_winner
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_ad_experiment_v4(uuid, boolean) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905125700_ads_experiment_status_v4.sql
-- SHA256 9aa85ec0c267b7a807e4c9ef3f7bde32e5a58df61187c900878bbaf595de72c2
-- ============================================================================
-- Route the generic experiment status action through winner promotion when a
-- test is completed. Existing frontend callers therefore cannot accidentally
-- mark an under-sampled experiment as completed without choosing a winner.

CREATE OR REPLACE FUNCTION public.set_ad_experiment_status_v4(
  p_experiment_id uuid,
  p_status text
)
RETURNS public.ad_experiments_v4
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ad_experiments_v4;
  v_total numeric;
  v_count integer;
BEGIN
  SELECT * INTO v_row
  FROM public.ad_experiments_v4
  WHERE id = p_experiment_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'experiment_not_found'; END IF;
  IF NOT public.can_manage_ad_account(v_row.ad_account_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_status NOT IN ('draft', 'running', 'paused', 'completed', 'archived') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_status = 'completed' THEN
    PERFORM public.complete_ad_experiment_v4(p_experiment_id, true);
    SELECT * INTO v_row FROM public.ad_experiments_v4 WHERE id = p_experiment_id;
    RETURN v_row;
  END IF;

  SELECT count(*), COALESCE(sum(allocation_pct), 0)
  INTO v_count, v_total
  FROM public.ad_experiment_variants_v4
  WHERE experiment_id = v_row.id;

  IF p_status = 'running' AND (v_count < 2 OR abs(v_total - 100) > 0.01) THEN
    RAISE EXCEPTION 'experiment_not_ready';
  END IF;

  UPDATE public.ad_experiments_v4
  SET status = p_status,
      starts_at = CASE WHEN p_status = 'running' THEN COALESCE(starts_at, now()) ELSE starts_at END,
      updated_at = now()
  WHERE id = p_experiment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ad_experiment_status_v4(uuid, text) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260905133000_platform_feedback_center.sql
-- SHA256 e2e88085707c467d10f725c8b5827d6131176918ca15a9c96254417b76b97fea
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260905133500_platform_feedback_hardening.sql
-- SHA256 aa7b75d0b26b6c666de57c905819d50ec73d5e4031539ad76c72aaa4c6842df1
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260905183500_mini_app_wallet_settlement.sql
-- SHA256 38f434074769e835b49aa5866684956970f598cdeece7f6e6566f4342b8e2299
-- ============================================================================
-- Mini Apps -> Wallet settlement
--
-- Security model:
-- 1. A mini app may only create a payment intent for the authenticated user.
-- 2. No money moves when requestPayment() is called.
-- 3. The payer must explicitly confirm the intent.
-- 4. Settlement reuses the canonical wallet_transfer() RPC so balance locking,
--    ledger writes and idempotency stay in one source of truth.
-- 5. The browser never receives a service-role credential and cannot choose a
--    different merchant than the approved mini app owner.

create table if not exists public.mini_app_payment_intents (
  id uuid primary key default gen_random_uuid(),
  payer_user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.mini_apps(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (char_length(currency) between 3 and 8),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'expired')),
  transfer_id uuid,
  idempotency_key uuid,
  failure_code text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mini_app_payment_intents_payer_created_idx
  on public.mini_app_payment_intents (payer_user_id, created_at desc);
create index if not exists mini_app_payment_intents_merchant_created_idx
  on public.mini_app_payment_intents (merchant_user_id, created_at desc);
create index if not exists mini_app_payment_intents_app_created_idx
  on public.mini_app_payment_intents (app_id, created_at desc);
create index if not exists mini_app_payment_intents_pending_expiry_idx
  on public.mini_app_payment_intents (status, expires_at)
  where status = 'pending';
create unique index if not exists mini_app_payment_intents_idempotency_idx
  on public.mini_app_payment_intents (payer_user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.mini_app_payment_intents enable row level security;

revoke all on table public.mini_app_payment_intents from anon, authenticated;
grant select on table public.mini_app_payment_intents to authenticated;

-- A payer can see their own intents. The merchant owner can also see payments
-- directed to them for reconciliation, but cannot mutate them directly.
drop policy if exists mini_app_payment_intents_select_parties on public.mini_app_payment_intents;
create policy mini_app_payment_intents_select_parties
on public.mini_app_payment_intents
for select
to authenticated
using (auth.uid() = payer_user_id or auth.uid() = merchant_user_id);

create or replace function public.mini_app_payment_create(
  p_app_id uuid,
  p_amount numeric,
  p_currency text default 'UZS',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_status text;
  v_permissions text;
  v_currency text := upper(trim(coalesce(p_currency, 'UZS')));
  v_payer_currency text;
  v_merchant_currency text;
  v_intent_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- Guard against accidental/abusive huge client-side requests. Product-level
  -- limits can be made stricter later without changing the SDK contract.
  if p_amount > 1000000000 then
    raise exception 'amount_too_large';
  end if;

  if v_currency = '' or char_length(v_currency) > 8 then
    raise exception 'invalid_currency';
  end if;

  select
    owner_id,
    status::text,
    permissions::text
  into v_owner_id, v_status, v_permissions
  from public.mini_apps
  where id = p_app_id;

  if not found then
    raise exception 'mini_app_not_found';
  end if;

  if v_status <> 'approved' then
    raise exception 'mini_app_not_approved';
  end if;

  if position('payments' in coalesce(v_permissions, '')) = 0 then
    raise exception 'payments_permission_required';
  end if;

  if v_owner_id is null then
    raise exception 'merchant_not_configured';
  end if;

  if v_owner_id = v_user_id then
    raise exception 'cannot_pay_self';
  end if;

  -- The canonical wallet layer is currency-specific. Do not silently convert
  -- money inside Mini Apps; conversion belongs to Payments/Wallet FX rails.
  select upper(currency), status::text
  into v_payer_currency, v_status
  from public.wallets
  where user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if v_status <> 'active' then
    raise exception 'wallet_restricted';
  end if;

  select upper(currency), status::text
  into v_merchant_currency, v_status
  from public.wallets
  where user_id = v_owner_id
  limit 1;

  if not found then
    raise exception 'merchant_wallet_not_found';
  end if;

  if v_status <> 'active' then
    raise exception 'merchant_wallet_restricted';
  end if;

  if v_payer_currency <> v_currency or v_merchant_currency <> v_currency then
    raise exception 'currency_mismatch';
  end if;

  -- Keep at most a small number of live checkout intents for one payer/app.
  -- This prevents a malicious iframe from filling the database with pending rows.
  if (
    select count(*)
    from public.mini_app_payment_intents
    where payer_user_id = v_user_id
      and app_id = p_app_id
      and status = 'pending'
      and expires_at > now()
  ) >= 5 then
    raise exception 'too_many_pending_payments';
  end if;

  insert into public.mini_app_payment_intents (
    payer_user_id,
    app_id,
    merchant_user_id,
    amount,
    currency,
    description
  ) values (
    v_user_id,
    p_app_id,
    v_owner_id,
    round(p_amount::numeric, 2),
    v_currency,
    nullif(left(trim(coalesce(p_description, '')), 280), '')
  )
  returning id into v_intent_id;

  return v_intent_id;
end;
$$;

create or replace function public.mini_app_payment_confirm(
  p_payment_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.mini_app_payment_intents%rowtype;
  v_recipient text;
  v_transfer jsonb;
  v_transfer_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  select * into v_intent
  from public.mini_app_payment_intents
  where id = p_payment_id
  for update;

  if not found or v_intent.payer_user_id <> v_user_id then
    raise exception 'payment_not_found';
  end if;

  if v_intent.status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'payment_id', v_intent.id,
      'transfer_id', v_intent.transfer_id,
      'status', 'paid',
      'amount', v_intent.amount,
      'currency', v_intent.currency
    );
  end if;

  if v_intent.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', v_intent.status,
      'error', 'payment_not_pending'
    );
  end if;

  if v_intent.expires_at <= now() then
    update public.mini_app_payment_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id;

    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', 'expired',
      'error', 'payment_expired'
    );
  end if;

  select coalesce(nullif(account_number, ''), '@' || nullif(p.username, ''))
  into v_recipient
  from public.wallets w
  left join public.profiles p on p.id = w.user_id
  where w.user_id = v_intent.merchant_user_id
    and w.status = 'active'
  limit 1;

  if v_recipient is null then
    raise exception 'merchant_wallet_not_found';
  end if;

  begin
    select public.wallet_transfer(
      v_recipient,
      v_intent.amount,
      coalesce(v_intent.description, 'Mini App: ' || v_intent.app_id::text),
      p_idempotency_key,
      'mini_app_payment',
      v_intent.id
    ) into v_transfer;
  exception when others then
    update public.mini_app_payment_intents
    set failure_code = left(sqlerrm, 160), updated_at = now()
    where id = v_intent.id;

    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', 'pending',
      'error', sqlerrm
    );
  end;

  begin
    v_transfer_id := nullif(v_transfer ->> 'transfer_id', '')::uuid;
  exception when others then
    v_transfer_id := null;
  end;

  update public.mini_app_payment_intents
  set
    status = 'paid',
    transfer_id = v_transfer_id,
    idempotency_key = p_idempotency_key,
    failure_code = null,
    paid_at = now(),
    updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_intent.id,
    'transfer_id', v_transfer_id,
    'status', 'paid',
    'amount', v_intent.amount,
    'currency', v_intent.currency,
    'wallet', v_transfer
  );
end;
$$;

create or replace function public.mini_app_payment_cancel(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.mini_app_payment_intents%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_intent
  from public.mini_app_payment_intents
  where id = p_payment_id
  for update;

  if not found or v_intent.payer_user_id <> v_user_id then
    raise exception 'payment_not_found';
  end if;

  if v_intent.status = 'pending' then
    update public.mini_app_payment_intents
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_intent.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_intent.id,
    'status', case when v_intent.status = 'pending' then 'cancelled' else v_intent.status end
  );
end;
$$;

grant execute on function public.mini_app_payment_create(uuid, numeric, text, text) to authenticated;
grant execute on function public.mini_app_payment_confirm(uuid, uuid) to authenticated;
grant execute on function public.mini_app_payment_cancel(uuid) to authenticated;

revoke execute on function public.mini_app_payment_create(uuid, numeric, text, text) from anon;
revoke execute on function public.mini_app_payment_confirm(uuid, uuid) from anon;
revoke execute on function public.mini_app_payment_cancel(uuid) from anon;


-- ============================================================================
-- SOURCE B-web: 20260905185000_search_activity_events.sql
-- SHA256 4ba879ead433f7170d73402bf2ef8845832ddbadd58ee59a2239414deffd7b49
-- ============================================================================
-- Alsamos Search activity ledger
--
-- `search_history` is a recent-search UX list and intentionally de-duplicates
-- repeated queries. AI/personalization analytics need a different model: one
-- immutable activity row for every committed search. This table separates the
-- two concerns so "what do I search most?" is based on real frequency rather
-- than the recent-list representation.

create table if not exists public.search_activity_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  normalized_query text not null,
  source text not null default 'search',
  searched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint search_activity_query_length check (char_length(query) between 2 and 240),
  constraint search_activity_normalized_length check (char_length(normalized_query) between 2 and 240),
  constraint search_activity_source_length check (char_length(source) between 1 and 40),
  constraint search_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists search_activity_user_time_idx
  on public.search_activity_events (user_id, searched_at desc);
create index if not exists search_activity_user_normalized_time_idx
  on public.search_activity_events (user_id, normalized_query, searched_at desc);

alter table public.search_activity_events enable row level security;

revoke all on table public.search_activity_events from anon, authenticated;
grant select, delete on table public.search_activity_events to authenticated;

-- Users can inspect or erase only their own search activity. Normal inserts go
-- through the search_history trigger/RPC so user_id cannot be forged.
drop policy if exists search_activity_select_own on public.search_activity_events;
create policy search_activity_select_own
on public.search_activity_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists search_activity_delete_own on public.search_activity_events;
create policy search_activity_delete_own
on public.search_activity_events
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.normalize_search_activity_query(p_query text)
returns text
language sql
immutable
strict
as $$
  select lower(regexp_replace(trim(p_query), '\s+', ' ', 'g'));
$$;

-- Every successful insert into the recent-search table records one real search
-- event before the recent list can de-duplicate/reorder itself on the next use.
create or replace function public.capture_search_history_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text;
begin
  v_query := regexp_replace(trim(coalesce(new.query, '')), '\s+', ' ', 'g');
  if char_length(v_query) < 2 then
    return new;
  end if;

  insert into public.search_activity_events (
    user_id,
    query,
    normalized_query,
    source,
    metadata,
    searched_at
  ) values (
    new.user_id,
    left(v_query, 240),
    public.normalize_search_activity_query(left(v_query, 240)),
    'search_page',
    '{}'::jsonb,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists search_history_capture_activity on public.search_history;
create trigger search_history_capture_activity
after insert on public.search_history
for each row
execute function public.capture_search_history_activity();

-- Existing recent rows represent at least one historical search each. Backfill
-- once without pretending we know repetition counts from before this migration.
insert into public.search_activity_events (
  user_id,
  query,
  normalized_query,
  source,
  metadata,
  searched_at
)
select
  sh.user_id,
  left(regexp_replace(trim(sh.query), '\s+', ' ', 'g'), 240),
  public.normalize_search_activity_query(left(regexp_replace(trim(sh.query), '\s+', ' ', 'g'), 240)),
  'search_history_backfill',
  jsonb_build_object('backfilled', true),
  sh.created_at
from public.search_history sh
where char_length(trim(sh.query)) >= 2
  and not exists (
    select 1
    from public.search_activity_events sae
    where sae.user_id = sh.user_id
      and sae.source = 'search_history_backfill'
      and sae.normalized_query = public.normalize_search_activity_query(left(regexp_replace(trim(sh.query), '\s+', ' ', 'g'), 240))
  );

-- Canonical privacy action. The frontend can migrate to this RPC instead of
-- issuing two unrelated DELETE requests. It clears both the visible recent
-- list and the private AI/search activity ledger atomically.
create or replace function public.clear_my_search_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent bigint := 0;
  v_events bigint := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  delete from public.search_history where user_id = v_user_id;
  get diagnostics v_recent = row_count;

  delete from public.search_activity_events where user_id = v_user_id;
  get diagnostics v_events = row_count;

  return jsonb_build_object(
    'success', true,
    'recent_deleted', v_recent,
    'activity_deleted', v_events
  );
end;
$$;

grant execute on function public.clear_my_search_history() to authenticated;
revoke execute on function public.clear_my_search_history() from anon;

-- A bounded server-side summary avoids shipping thousands of private search
-- events to the browser/AI runtime. Service-role callers can still query the
-- table directly, but authenticated clients can request only their own result.
create or replace function public.my_search_insights_v2(
  p_days integer default 30,
  p_query_contains text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 30));
  v_contains text := nullif(trim(coalesce(p_query_contains, '')), '');
  v_since timestamptz;
  v_total bigint;
  v_unique bigint;
  v_top jsonb;
  v_recent jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  v_since := now() - make_interval(days => v_days);

  select count(*), count(distinct normalized_query)
  into v_total, v_unique
  from public.search_activity_events
  where user_id = v_user_id
    and searched_at >= v_since
    and (v_contains is null or query ilike '%' || v_contains || '%');

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.search_count desc, row_data.last_searched_at desc), '[]'::jsonb)
  into v_top
  from (
    select
      max(query) as query,
      normalized_query,
      count(*)::bigint as search_count,
      max(searched_at) as last_searched_at
    from public.search_activity_events
    where user_id = v_user_id
      and searched_at >= v_since
      and (v_contains is null or query ilike '%' || v_contains || '%')
    group by normalized_query
    order by count(*) desc, max(searched_at) desc
    limit v_limit
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.searched_at desc), '[]'::jsonb)
  into v_recent
  from (
    select query, searched_at
    from public.search_activity_events
    where user_id = v_user_id
      and searched_at >= v_since
      and (v_contains is null or query ilike '%' || v_contains || '%')
    order by searched_at desc
    limit v_limit
  ) row_data;

  return jsonb_build_object(
    'days', v_days,
    'total_searches', coalesce(v_total, 0),
    'unique_queries', coalesce(v_unique, 0),
    'top', v_top,
    'recent', v_recent,
    'source', 'search_activity_events'
  );
end;
$$;

grant execute on function public.my_search_insights_v2(integer, text, integer) to authenticated;
revoke execute on function public.my_search_insights_v2(integer, text, integer) from anon;


-- ============================================================================
-- SOURCE B-web: 20260905190500_activity_preferences.sql
-- SHA256 cf8ec2ae2708f3c4b82cf6231975e86eced8734bfcd6f77c82ae1689d80b6484
-- ============================================================================
-- User-owned Activity / digital-wellbeing preferences.
-- Replaces the old hard-coded 120 minute demo goal with a real persisted setting.

create table if not exists public.user_activity_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_limit_minutes integer not null default 120
    check (daily_limit_minutes between 15 and 1440),
  reminder_enabled boolean not null default true,
  reminder_threshold_percent integer not null default 80
    check (reminder_threshold_percent between 25 and 100),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_activity_preferences enable row level security;

revoke all on table public.user_activity_preferences from anon;
grant select, insert, update, delete on table public.user_activity_preferences to authenticated;

drop policy if exists activity_preferences_select_own on public.user_activity_preferences;
create policy activity_preferences_select_own
on public.user_activity_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists activity_preferences_insert_own on public.user_activity_preferences;
create policy activity_preferences_insert_own
on public.user_activity_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists activity_preferences_update_own on public.user_activity_preferences;
create policy activity_preferences_update_own
on public.user_activity_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists activity_preferences_delete_own on public.user_activity_preferences;
create policy activity_preferences_delete_own
on public.user_activity_preferences
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.ensure_my_activity_preferences()
returns public.user_activity_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_activity_preferences;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.user_activity_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.user_activity_preferences
  where user_id = v_user_id;

  return v_row;
end;
$$;

create or replace function public.update_my_activity_preferences(
  p_daily_limit_minutes integer default null,
  p_reminder_enabled boolean default null,
  p_reminder_threshold_percent integer default null
)
returns public.user_activity_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.user_activity_preferences;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_daily_limit_minutes is not null and (p_daily_limit_minutes < 15 or p_daily_limit_minutes > 1440) then
    raise exception 'invalid_daily_limit';
  end if;

  if p_reminder_threshold_percent is not null and (p_reminder_threshold_percent < 25 or p_reminder_threshold_percent > 100) then
    raise exception 'invalid_reminder_threshold';
  end if;

  insert into public.user_activity_preferences (
    user_id,
    daily_limit_minutes,
    reminder_enabled,
    reminder_threshold_percent
  ) values (
    v_user_id,
    coalesce(p_daily_limit_minutes, 120),
    coalesce(p_reminder_enabled, true),
    coalesce(p_reminder_threshold_percent, 80)
  )
  on conflict (user_id) do update
  set
    daily_limit_minutes = coalesce(p_daily_limit_minutes, user_activity_preferences.daily_limit_minutes),
    reminder_enabled = coalesce(p_reminder_enabled, user_activity_preferences.reminder_enabled),
    reminder_threshold_percent = coalesce(p_reminder_threshold_percent, user_activity_preferences.reminder_threshold_percent),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.ensure_my_activity_preferences() to authenticated;
grant execute on function public.update_my_activity_preferences(integer, boolean, integer) to authenticated;
revoke execute on function public.ensure_my_activity_preferences() from anon;
revoke execute on function public.update_my_activity_preferences(integer, boolean, integer) from anon;

