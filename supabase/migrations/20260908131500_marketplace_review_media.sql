-- Marketplace review media: verified buyers may attach up to 5 images/videos
-- to their own product review. Product authenticity is intentionally NOT
-- inferred from merchant verification; media is user-generated review proof.

CREATE TABLE IF NOT EXISTS public.product_review_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  url text NOT NULL CHECK (length(trim(url)) > 0),
  thumbnail_url text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 60)),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position < 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, position)
);

CREATE INDEX IF NOT EXISTS product_review_media_review_idx
  ON public.product_review_media(review_id, position);

CREATE INDEX IF NOT EXISTS product_review_media_user_idx
  ON public.product_review_media(user_id, created_at DESC);

ALTER TABLE public.product_review_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Review media is readable" ON public.product_review_media;
CREATE POLICY "Review media is readable"
ON public.product_review_media
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
  )
);

DROP POLICY IF EXISTS "Review owners can add media" ON public.product_review_media;
CREATE POLICY "Review owners can add media"
ON public.product_review_media
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Review owners can update media" ON public.product_review_media;
CREATE POLICY "Review owners can update media"
ON public.product_review_media
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Review owners can delete media" ON public.product_review_media;
CREATE POLICY "Review owners can delete media"
ON public.product_review_media
FOR DELETE
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.marketplace_check_review_media_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  media_count integer;
  video_count integer;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE media_type = 'video')::integer
  INTO media_count, video_count
  FROM public.product_review_media
  WHERE review_id = NEW.review_id
    AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF media_count >= 5 THEN
    RAISE EXCEPTION 'review_media_limit';
  END IF;

  IF NEW.media_type = 'video' AND video_count >= 1 THEN
    RAISE EXCEPTION 'review_video_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_review_media_limits ON public.product_review_media;
CREATE TRIGGER marketplace_review_media_limits
BEFORE INSERT OR UPDATE ON public.product_review_media
FOR EACH ROW EXECUTE FUNCTION public.marketplace_check_review_media_limits();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_review_media TO authenticated;
GRANT SELECT ON public.product_review_media TO anon;
