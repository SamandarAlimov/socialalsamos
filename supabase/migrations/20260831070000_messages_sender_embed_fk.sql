-- Chat oynasi bo'sh ko'rinishining sababi: PostgREST embed uchun kerak bo'lgan
-- FK nomi (messages_sender_id_fkey) bazada yo'q. useMessages so'rovi
--   select=*,sender:profiles!messages_sender_id_fkey(...)
-- ko'rinishida bo'lgani uchun butun so'rov PGRST200 bilan qaytadi va xabarlar
-- ro'yxati bo'sh qoladi. Chat ro'yxati esa profiles ni alohida so'rov bilan
-- olgani uchun ishlashda davom etadi.
--
-- Migratsiya idempotent: constraint mavjud bo'lsa hech narsa qilinmaydi.
-- NOT VALID - eski qatorlarda profili o'chirilgan sender_id bo'lsa ham DDL
-- to'xtab qolmasligi uchun.

BEGIN;

DO $$
DECLARE
  has_named_fk boolean;
BEGIN
  IF to_regclass('public.messages') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_sender_id_fkey'
      AND conrelid = 'public.messages'::regclass
      AND contype = 'f'
  ) INTO has_named_fk;

  IF has_named_fk THEN
    RETURN;
  END IF;

  EXECUTE $ddl$
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL
      NOT VALID
  $ddl$;
END $$;

-- Reply preview ham xuddi shu embed uslubidan foydalanadi, shuning uchun
-- sender_id bo'yicha qidiruv indeksi ham foydali.
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages(sender_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
