-- Enforce the handoff code at the database boundary.
-- Any normal attempt to move an order into `delivered` is rejected unless it
-- is happening inside marketplace_verify_order_handoff for that exact order.

CREATE OR REPLACE FUNCTION public.marketplace_require_handoff_for_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_verified_order_id text := current_setting('app.marketplace_handoff_order_id', true);
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status IS DISTINCT FROM 'delivered'
     AND OLD.handoff_code IS NOT NULL
     AND OLD.handoff_verified_at IS NULL
     AND v_verified_order_id IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'marketplace_handoff:verification_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_handoff_for_delivery ON public.orders;
CREATE TRIGGER orders_require_handoff_for_delivery
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.marketplace_require_handoff_for_delivery();

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
  v_verified_at timestamptz;
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

  IF v_order.status <> 'shipped' THEN
    RAISE EXCEPTION 'marketplace_handoff:not_ready';
  END IF;

  -- The trigger only accepts delivered for the exact order currently being
  -- verified. The setting is transaction-local and disappears automatically.
  PERFORM set_config('app.marketplace_handoff_order_id', v_order.id::text, true);

  SELECT public.marketplace_update_order_status(v_order.id, 'delivered', 'handoff_verified')
  INTO v_lifecycle_result;

  v_verified_at := now();

  UPDATE public.orders
  SET handoff_verified_at = v_verified_at,
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
    'verified_at', v_verified_at,
    'lifecycle', coalesce(v_lifecycle_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_verify_order_handoff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_verify_order_handoff(text) TO authenticated;
