-- Keep posts.likes_count as a denormalized cache of the canonical post_likes rows.
-- The original schema created both tables but no trigger connecting them, so the
-- counter could drift indefinitely from the real liker rows.

CREATE OR REPLACE FUNCTION public.reconcile_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_id uuid;
BEGIN
  -- If a like is ever moved between posts, reconcile the old post as well.
  IF TG_OP = 'UPDATE' AND OLD.post_id IS DISTINCT FROM NEW.post_id THEN
    UPDATE public.posts AS p
    SET likes_count = (
      SELECT COUNT(*)::integer
      FROM public.post_likes AS pl
      WHERE pl.post_id = OLD.post_id
    )
    WHERE p.id = OLD.post_id;
  END IF;

  target_post_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;

  UPDATE public.posts AS p
  SET likes_count = (
    SELECT COUNT(*)::integer
    FROM public.post_likes AS pl
    WHERE pl.post_id = target_post_id
  )
  WHERE p.id = target_post_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS zzz_reconcile_post_likes_count ON public.post_likes;

-- The zzz prefix deliberately places this reconciliation after ordinary
-- alphabetically ordered AFTER triggers, so the final cached value is exact.
CREATE TRIGGER zzz_reconcile_post_likes_count
AFTER INSERT OR DELETE OR UPDATE OF post_id
ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_post_likes_count();

-- Repair all historical drift in one idempotent backfill. post_likes already
-- has UNIQUE(post_id, user_id), whose index makes these per-post counts cheap.
UPDATE public.posts AS p
SET likes_count = (
  SELECT COUNT(*)::integer
  FROM public.post_likes AS pl
  WHERE pl.post_id = p.id
)
WHERE p.likes_count IS DISTINCT FROM (
  SELECT COUNT(*)::integer
  FROM public.post_likes AS pl
  WHERE pl.post_id = p.id
);
