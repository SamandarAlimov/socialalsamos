-- Restore current sticker-recents capabilities to signed-in users.
-- The functions already scope reads/writes to auth.uid(); only EXECUTE was missing.
GRANT EXECUTE ON FUNCTION public.top_sticker_recents(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_sticker_recent(text, public.sticker_kind, text, text, uuid) TO authenticated;
-- Keep the legacy RPC callable for older cached clients while current clients use sticker_recents.
GRANT EXECUTE ON FUNCTION public.touch_sticker_usage(text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.top_sticker_recents(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_sticker_recent(text, public.sticker_kind, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_sticker_usage(text, text, uuid) FROM anon;

-- Allow an authenticated user to refresh only their own typing row in a conversation
-- they actually participate in. This also makes a future client-side UPSERT safe.
DROP POLICY IF EXISTS "Users can refresh own typing" ON public.typing_indicators;
CREATE POLICY "Users can refresh own typing"
ON public.typing_indicators
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = typing_indicators.conversation_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = typing_indicators.conversation_id
      AND cp.user_id = auth.uid()
  )
);

-- Old deployed clients do DELETE + INSERT on every keystroke. Two overlapping
-- requests can both delete and then both insert, racing on the unique
-- (conversation_id,user_id) constraint. Serialize those inserts and turn an
-- overlapping duplicate into a refresh rather than HTTP 409.
CREATE OR REPLACE FUNCTION public.coalesce_typing_indicator_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_conversation_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.conversation_id::text),
    hashtext(NEW.user_id::text)
  );

  UPDATE public.typing_indicators ti
     SET started_at = COALESCE(NEW.started_at, now())
   WHERE ti.conversation_id = NEW.conversation_id
     AND ti.user_id = NEW.user_id;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS coalesce_typing_indicator_insert_trg ON public.typing_indicators;
CREATE TRIGGER coalesce_typing_indicator_insert_trg
BEFORE INSERT ON public.typing_indicators
FOR EACH ROW
EXECUTE FUNCTION public.coalesce_typing_indicator_insert();

REVOKE ALL ON FUNCTION public.coalesce_typing_indicator_insert() FROM PUBLIC, anon, authenticated;
