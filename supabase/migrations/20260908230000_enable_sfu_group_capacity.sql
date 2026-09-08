-- SFU group calls no longer have the old 8-peer mesh ceiling.
-- Keep 1:1 records untouched; normalize only calls explicitly marked as groups.
CREATE OR REPLACE FUNCTION public.normalize_sfu_group_call_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_group_call IS TRUE AND COALESCE(NEW.max_participants, 0) < 64 THEN
    NEW.max_participants := 64;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sfu_group_call_capacity ON public.video_calls;
CREATE TRIGGER trg_normalize_sfu_group_call_capacity
BEFORE INSERT OR UPDATE OF is_group_call, max_participants
ON public.video_calls
FOR EACH ROW
EXECUTE FUNCTION public.normalize_sfu_group_call_capacity();

UPDATE public.video_calls
SET max_participants = 64
WHERE is_group_call IS TRUE
  AND COALESCE(max_participants, 0) < 64;
