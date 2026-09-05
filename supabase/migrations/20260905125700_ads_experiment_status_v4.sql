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
