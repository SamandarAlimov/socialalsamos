-- Explicit video -> product links for Marketplace video commerce.
-- A product is shown under a video only when the owner intentionally links it.

CREATE TABLE IF NOT EXISTS public.marketplace_video_products (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_id)
);

CREATE INDEX IF NOT EXISTS marketplace_video_products_product_idx
  ON public.marketplace_video_products(product_id);

ALTER TABLE public.marketplace_video_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video product links are public" ON public.marketplace_video_products;
DROP POLICY IF EXISTS "Owners can link own marketplace products" ON public.marketplace_video_products;
DROP POLICY IF EXISTS "Owners can unlink own marketplace products" ON public.marketplace_video_products;

CREATE POLICY "Video product links are public"
ON public.marketplace_video_products
FOR SELECT
USING (true);

CREATE POLICY "Owners can link own marketplace products"
ON public.marketplace_video_products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = marketplace_video_products.post_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.products pr
    JOIN public.sellers s ON s.id = pr.seller_id
    WHERE pr.id = marketplace_video_products.product_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Owners can unlink own marketplace products"
ON public.marketplace_video_products
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = marketplace_video_products.post_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.products pr
    JOIN public.sellers s ON s.id = pr.seller_id
    WHERE pr.id = marketplace_video_products.product_id
      AND s.user_id = auth.uid()
  )
);
