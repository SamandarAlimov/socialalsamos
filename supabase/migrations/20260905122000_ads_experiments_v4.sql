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
