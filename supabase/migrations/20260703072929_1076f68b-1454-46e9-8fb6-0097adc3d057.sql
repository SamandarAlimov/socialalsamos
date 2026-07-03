
-- 1. Add payment tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- 2. Atomic order-processing RPC
CREATE OR REPLACE FUNCTION public.process_marketplace_order(
  _shipping_address jsonb,
  _payment_method text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet_balance numeric;
  v_wallet_id uuid;
  v_seller record;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_subtotal numeric;
  v_shipping numeric;
  v_total numeric;
  v_grand_total numeric := 0;
  v_receipt text;
  v_cart_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _payment_method NOT IN ('wallet','card_on_delivery','cash') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  SELECT count(*) INTO v_cart_count FROM public.cart_items WHERE user_id = v_user;
  IF v_cart_count = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  -- Compute grand total across all cart items
  SELECT COALESCE(SUM((p.price * ci.quantity) + COALESCE(p.shipping_price,0)), 0)
    INTO v_grand_total
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user;

  -- Wallet path: check + deduct
  IF _payment_method = 'wallet' THEN
    SELECT id, balance INTO v_wallet_id, v_wallet_balance
      FROM public.wallets WHERE user_id = v_user
      FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, balance) VALUES (v_user, 0)
      RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
    END IF;

    IF v_wallet_balance < v_grand_total THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  END IF;

  -- Create one order per seller
  FOR v_seller IN
    SELECT p.seller_id AS seller_id
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user
      GROUP BY p.seller_id
  LOOP
    SELECT COALESCE(SUM(p.price * ci.quantity),0),
           COALESCE(SUM(COALESCE(p.shipping_price,0)),0)
      INTO v_subtotal, v_shipping
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user AND p.seller_id = v_seller.seller_id;

    v_total := v_subtotal + v_shipping;
    v_receipt := 'RCP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6));

    INSERT INTO public.orders (
      buyer_id, seller_id, order_number,
      subtotal, shipping_cost, total,
      shipping_address, notes,
      payment_status, payment_method, receipt_number,
      paid_at, status
    ) VALUES (
      v_user, v_seller.seller_id, 'TMP',
      v_subtotal, v_shipping, v_total,
      _shipping_address, _notes,
      CASE WHEN _payment_method = 'wallet' THEN 'paid' ELSE 'pending' END,
      _payment_method, v_receipt,
      CASE WHEN _payment_method = 'wallet' THEN now() ELSE NULL END,
      'pending'
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, title, quantity, price, total)
    SELECT v_order_id, p.id, p.title, ci.quantity, p.price, p.price * ci.quantity
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      WHERE ci.user_id = v_user AND p.seller_id = v_seller.seller_id;

    v_order_ids := v_order_ids || v_order_id;
  END LOOP;

  -- Wallet deduction + transaction log
  IF _payment_method = 'wallet' THEN
    UPDATE public.wallets
      SET balance = balance - v_grand_total, updated_at = now()
      WHERE id = v_wallet_id;

    INSERT INTO public.transactions (wallet_id, user_id, amount, type, status, description, reference_id, metadata)
    VALUES (
      v_wallet_id, v_user, -v_grand_total, 'purchase', 'completed',
      'Marketplace buyurtma',
      v_order_ids[1]::text,
      jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'method', 'wallet')
    );
  END IF;

  -- Clear cart
  DELETE FROM public.cart_items WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'success', true,
    'order_ids', to_jsonb(v_order_ids),
    'payment_status', CASE WHEN _payment_method = 'wallet' THEN 'paid' ELSE 'pending' END,
    'total', v_grand_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_marketplace_order(jsonb, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_marketplace_order(jsonb, text, text) TO authenticated;
