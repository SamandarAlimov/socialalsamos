-- Drop duplicate notification triggers (keep one per event)
DROP TRIGGER IF EXISTS on_new_like ON public.post_likes;
DROP TRIGGER IF EXISTS on_new_comment ON public.comments;
DROP TRIGGER IF EXISTS on_new_follow ON public.follows;

-- Clean up existing duplicate notification rows (keep oldest)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, type, data, date_trunc('second', created_at)
           ORDER BY created_at ASC
         ) AS rn
  FROM public.notifications
  WHERE created_at > now() - interval '30 days'
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id AND r.rn > 1;