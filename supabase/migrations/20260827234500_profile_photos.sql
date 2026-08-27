-- Telegram uslubidagi ko'p profil rasmlari
-- Har bir foydalanuvchi bir nechta profil rasmini saqlashi mumkin.
-- Eng katta position - hozirgi asosiy rasm (profiles.avatar_url bilan sinxron).

CREATE TABLE IF NOT EXISTS public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_photos_user_idx
  ON public.profile_photos (user_id, position DESC, created_at DESC);

ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile photos are viewable by everyone" ON public.profile_photos;
CREATE POLICY "Profile photos are viewable by everyone"
  ON public.profile_photos FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile photos" ON public.profile_photos;
CREATE POLICY "Users can insert their own profile photos"
  ON public.profile_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile photos" ON public.profile_photos;
CREATE POLICY "Users can update their own profile photos"
  ON public.profile_photos FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own profile photos" ON public.profile_photos;
CREATE POLICY "Users can delete their own profile photos"
  ON public.profile_photos FOR DELETE
  USING (auth.uid() = user_id);

-- Yangi rasm qo'shilganda: eng tepaga chiqadi va avatar_url yangilanadi
CREATE OR REPLACE FUNCTION public.handle_new_profile_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(position), 0) INTO v_max
  FROM public.profile_photos
  WHERE user_id = NEW.user_id;

  IF NEW.position IS NULL OR NEW.position <= v_max THEN
    NEW.position := v_max + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_photos_before_insert ON public.profile_photos;
CREATE TRIGGER profile_photos_before_insert
  BEFORE INSERT ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_photo();

CREATE OR REPLACE FUNCTION public.sync_avatar_after_photo_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET avatar_url = NEW.image_url
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_photos_after_insert ON public.profile_photos;
CREATE TRIGGER profile_photos_after_insert
  AFTER INSERT ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION public.sync_avatar_after_photo_insert();

-- Rasm o'chirilganda: agar u asosiy bo'lsa, keyingi eng yangi rasm asosiy bo'ladi
CREATE OR REPLACE FUNCTION public.sync_avatar_after_photo_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next text;
  v_current text;
BEGIN
  SELECT avatar_url INTO v_current FROM public.profiles WHERE id = OLD.user_id;

  IF v_current IS NOT DISTINCT FROM OLD.image_url THEN
    SELECT image_url INTO v_next
    FROM public.profile_photos
    WHERE user_id = OLD.user_id
    ORDER BY position DESC, created_at DESC
    LIMIT 1;

    UPDATE public.profiles
    SET avatar_url = v_next
    WHERE id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profile_photos_after_delete ON public.profile_photos;
CREATE TRIGGER profile_photos_after_delete
  AFTER DELETE ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION public.sync_avatar_after_photo_delete();

-- Mavjud rasmni asosiy qilish (atomik)
CREATE OR REPLACE FUNCTION public.set_main_profile_photo(p_photo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_url text;
  v_max integer;
BEGIN
  SELECT user_id, image_url INTO v_user, v_url
  FROM public.profile_photos
  WHERE id = p_photo_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Rasm topilmadi';
  END IF;

  IF v_user <> auth.uid() THEN
    RAISE EXCEPTION 'Ruxsat yo''q';
  END IF;

  SELECT COALESCE(MAX(position), 0) INTO v_max
  FROM public.profile_photos
  WHERE user_id = v_user;

  UPDATE public.profile_photos
  SET position = v_max + 1
  WHERE id = p_photo_id;

  UPDATE public.profiles
  SET avatar_url = v_url
  WHERE id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_main_profile_photo(uuid) TO authenticated;

-- Mavjud avatarlarni galereyaga ko'chirish (bir marta)
INSERT INTO public.profile_photos (user_id, image_url, position, created_at)
SELECT p.id, p.avatar_url, 1, COALESCE(p.created_at, now())
FROM public.profiles p
WHERE p.avatar_url IS NOT NULL
  AND p.avatar_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_photos ph
    WHERE ph.user_id = p.id AND ph.image_url = p.avatar_url
  );
