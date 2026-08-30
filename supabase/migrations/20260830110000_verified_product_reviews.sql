-- Verified-purchase reviews: only buyers with a delivered order containing
-- the reviewed product may create or move a review to that product/order.

DROP POLICY IF EXISTS "Users can create reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can update their reviews" ON public.product_reviews;

CREATE POLICY "Delivered buyers can create reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id = product_reviews.order_id
      AND o.buyer_id = auth.uid()
      AND o.status = 'delivered'
      AND oi.product_id = product_reviews.product_id
  )
);

CREATE POLICY "Delivered buyers can update reviews"
ON public.product_reviews
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id = product_reviews.order_id
      AND o.buyer_id = auth.uid()
      AND o.status = 'delivered'
      AND oi.product_id = product_reviews.product_id
  )
);

CREATE OR REPLACE FUNCTION public.get_product_review_summary(_product_id uuid)
RETURNS TABLE(average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0::numeric) AS average_rating,
    COUNT(*)::bigint AS review_count
  FROM public.product_reviews r
  WHERE r.product_id = _product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_review_summary(uuid) TO anon, authenticated;
