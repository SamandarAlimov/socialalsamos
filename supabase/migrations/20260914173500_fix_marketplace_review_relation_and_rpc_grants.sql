-- Marketplace product detail uses public profile hydration for review authors.
-- product_reviews.user_id already references auth.users(id), but PostgREST cannot
-- embed public.profiles without a relationship in the exposed schema. Add the
-- matching public FK (all existing review users have profiles) and restore only
-- the two read/analytics RPC grants intentionally used by the public marketplace.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_reviews'::regclass
      AND conname = 'product_reviews_profile_id_fkey'
  ) THEN
    ALTER TABLE public.product_reviews
      ADD CONSTRAINT product_reviews_profile_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.product_reviews
  VALIDATE CONSTRAINT product_reviews_profile_id_fkey;

GRANT EXECUTE ON FUNCTION public.increment_product_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_response_stats(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
