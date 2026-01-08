-- Ensure post counters never stay NULL
UPDATE public.posts
SET likes_count = COALESCE(likes_count, 0),
    comments_count = COALESCE(comments_count, 0),
    shares_count = COALESCE(shares_count, 0),
    bookmarks_count = COALESCE(bookmarks_count, 0);

ALTER TABLE public.posts ALTER COLUMN likes_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN comments_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN shares_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN bookmarks_count SET DEFAULT 0;

-- Backfill accurate counts for existing posts
UPDATE public.posts p
SET likes_count = COALESCE(l.like_count, 0)
FROM (
  SELECT post_id, COUNT(*)::int AS like_count
  FROM public.post_likes
  GROUP BY post_id
) l
WHERE p.id = l.post_id;

UPDATE public.posts p
SET comments_count = COALESCE(c.comment_count, 0)
FROM (
  SELECT post_id, COUNT(*)::int AS comment_count
  FROM public.comments
  GROUP BY post_id
) c
WHERE p.id = c.post_id;

-- Trigger function: keep posts.likes_count in sync with post_likes
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_sync_post_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_likes_count();

-- Trigger function: keep posts.comments_count in sync with comments
CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comments_count ON public.comments;
CREATE TRIGGER trg_sync_post_comments_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_comments_count();
