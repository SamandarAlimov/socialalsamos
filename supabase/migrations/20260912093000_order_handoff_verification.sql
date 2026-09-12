-- Secure one-time handoff verification for marketplace orders.
-- The code is generated server-side, displayed to the buyer as text/barcode,
-- and can only be consumed by the seller that owns the order.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handoff_code text,
  ADD COLUMN IF NOT EXISTS handoff_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_handoff_code_unique_idx
  ON public.orders (handoff_code)
  WHERE handoff_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.marketplace_generate_handoff_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    -- Eight uppercase hexadecimal characters are short enough for manual entry
    -- while remaining easy to encode in Code 128 for handheld scanners.
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.orders
      WHERE handoff_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.orders
  ALTER COLUMN handoff_code SET DEFAULT public.marketplace_generate_handoff_code();

-- Give currently active orders a code as well, so rollout does not leave an
-- in-flight order without a handoff credential.
UPDATE public.orders
SET handoff_code = public.marketplace_generate_handoff_code()
WHERE handoff_code IS NULL
  AND status IN ('pending', 'processing', 'shipped');

CREATE OR REPLACE FUNCTION public.marketplace_verify_order_handoff(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(_code, '')));
  v_order public.orders%ROWTYPE;
  v_lifecycle_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authenticated';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'marketplace_handoff:invalid_code';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.handoff_code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:code_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sellers s
    WHERE s.id = v_order.seller_id
      AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authorized';
  END IF;

  IF v_order.handoff_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  -- Handoff is only valid after the seller has marked the order ready/shipped.
  -- This keeps the existing marketplace lifecycle as the source of truth.
  IF v_order.status <> 'shipped' THEN
    RAISE EXCEPTION 'marketplace_handoff:not_ready';
  END IF;

  -- Reuse the existing guarded lifecycle RPC instead of bypassing payment,
  -- receipt, inventory, analytics, or other delivered-state side effects.
  SELECT public.marketplace_update_order_status(v_order.id, 'delivered', 'handoff_verified')
  INTO v_lifecycle_result;

  UPDATE public.orders
  SET handoff_verified_at = now(),
      handoff_verified_by = v_user_id
  WHERE id = v_order.id
    AND handoff_verified_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'delivered',
    'verified_at', now(),
    'lifecycle', coalesce(v_lifecycle_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_verify_order_handoff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_verify_order_handoff(text) TO authenticated;
