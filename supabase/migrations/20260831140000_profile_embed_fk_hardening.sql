-- Sahifalarda "yuklab bo'lmadi" xatolarining umumiy sababi.
--
-- Frontend PostgREST embed hintlaridan foydalanadi, masalan:
--   select=*,profile:profiles!posts_user_id_fkey(id,username,...)
-- Bu hint faqat shu NOM bilan FK constraint bazada mavjud bo'lsa ishlaydi.
-- Nom mos kelmasa PostgREST butun so'rovni PGRST200 bilan rad etadi, ya'ni
-- faqat avatar uchun kerak bo'lgan kosmetik join butun ro'yxatni (postlar,
-- videolar, izohlar, typing indikatorlari) yo'q qilib qo'yadi.
--
-- Xuddi shu bug chat oynasi uchun 20260831070000_messages_sender_embed_fk.sql
-- da tuzatilgan edi. Bu migratsiya qolgan barcha profil embedlarini bir xil
-- qoidaga keltiradi.
--
-- Migratsiya idempotent:
--   * jadval yoki ustun yo'q bo'lsa - o'tkazib yuboriladi;
--   * shu ustunda profiles ga FK mavjud, lekin nomi boshqa bo'lsa - RENAME
--     qilinadi (ikkinchi FK qo'shilsa PGRST201 "ambiguous relationship"
--     xatosi kelib chiqardi);
--   * FK butunlay yo'q bo'lsa - NOT VALID qilib qo'shiladi, shunda profili
--     o'chirilgan eski qatorlar DDL ni to'xtatib qo'ymaydi.

BEGIN;

DO $$
DECLARE
  spec record;
  src_oid oid;
  ref_oid oid;
  src_attnum smallint;
  existing_name text;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      ('public.posts', 'user_id', 'posts_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.comments', 'user_id', 'comments_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.post_likes', 'user_id', 'post_likes_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.comment_likes', 'user_id', 'comment_likes_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.typing_indicators', 'user_id', 'typing_indicators_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.post_collaborators', 'user_id', 'post_collaborators_user_id_fkey', 'public.profiles', 'id', 'CASCADE'),
      ('public.sellers', 'user_id', 'sellers_user_id_fkey', 'public.profiles', 'id', 'CASCADE')
    ) AS t(src_table, src_column, fk_name, ref_table, ref_column, on_delete)
  LOOP
    src_oid := to_regclass(spec.src_table);
    ref_oid := to_regclass(spec.ref_table);

    IF src_oid IS NULL OR ref_oid IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum INTO src_attnum
    FROM pg_attribute
    WHERE attrelid = src_oid
      AND attname = spec.src_column
      AND attnum > 0
      AND NOT attisdropped;

    IF src_attnum IS NULL THEN
      CONTINUE;
    END IF;

    SELECT conname INTO existing_name
    FROM pg_constraint
    WHERE conrelid = src_oid
      AND confrelid = ref_oid
      AND contype = 'f'
      AND conkey = ARRAY[src_attnum]::smallint[]
    ORDER BY conname
    LIMIT 1;

    IF existing_name IS NOT NULL THEN
      IF existing_name <> spec.fk_name THEN
        EXECUTE format(
          'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
          spec.src_table, existing_name, spec.fk_name
        );
      END IF;
    ELSE
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s NOT VALID',
        spec.src_table, spec.fk_name, spec.src_column,
        spec.ref_table, spec.ref_column, spec.on_delete
      );
    END IF;

    existing_name := NULL;
    src_attnum := NULL;
  END LOOP;
END $$;

-- Embed va profil bo'yicha filtrlash uchun foydali indekslar.
DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      ('public.posts', 'user_id', 'idx_posts_user_id'),
      ('public.comments', 'user_id', 'idx_comments_user_id'),
      ('public.post_likes', 'user_id', 'idx_post_likes_user_id')
    ) AS t(src_table, src_column, index_name)
  LOOP
    IF to_regclass(spec.src_table) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass(spec.src_table)
        AND attname = spec.src_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s(%I)',
      spec.index_name, spec.src_table, spec.src_column
    );
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
