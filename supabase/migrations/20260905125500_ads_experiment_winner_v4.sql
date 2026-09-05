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
