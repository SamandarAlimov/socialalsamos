GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;

ALTER TABLE public.call_signals REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS call_signals_call_created_idx
  ON public.call_signals (call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS call_signals_target_idx
  ON public.call_signals (target_user_id, created_at DESC);

DROP FUNCTION IF EXISTS public.cleanup_expired_call_signals();

CREATE FUNCTION public.cleanup_expired_call_signals()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.call_signals WHERE expires_at < now();
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_call_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_signals() TO service_role;