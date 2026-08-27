-- =====================================================================
-- Alsamos Auth: identifier login (email | username | phone)
--
-- The identity model does not change: one @alsamos.com identity owns up to
-- 10 accounts. What changes is HOW the user types their identifier:
--
--   * <name>@alsamos.com  -> identity email
--   * old email           -> preserved legacy address (gmail.com etc.)
--   * username            -> profiles.username of any account of the identity
--   * phone number        -> auth_identities.phone (E.164) or auth.users.phone
--
-- Resolution happens ONLY server side (service_role), so the client can never
-- probe which identifiers exist.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Phone on the identity
-- ---------------------------------------------------------------------
ALTER TABLE public.auth_identities ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.auth_identities ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.auth_identities.phone IS
  'E.164 phone of the identity owner. Usable as a login identifier.';

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR btrim(p_phone) = '' THEN NULL
    WHEN ('+' || regexp_replace(p_phone, '[^0-9]', '', 'g')) ~ '^\+[1-9][0-9]{7,14}$'
      THEN '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_phone_format_chk'
  ) THEN
    ALTER TABLE public.auth_identities
      ADD CONSTRAINT auth_identities_phone_format_chk
      CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_phone_idx
  ON public.auth_identities (phone)
  WHERE phone IS NOT NULL;

-- Username lookups must not degrade into a sequential scan.
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));

-- ---------------------------------------------------------------------
-- 2. Backfill phones that already exist on auth.users
-- ---------------------------------------------------------------------
UPDATE public.auth_identities i
SET phone = public.normalize_phone(u.phone),
    updated_at = now()
FROM auth.users u
WHERE u.id = i.primary_user_id
  AND i.phone IS NULL
  AND public.normalize_phone(u.phone) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.auth_identities x
    WHERE x.phone = public.normalize_phone(u.phone)
  );

-- ---------------------------------------------------------------------
-- 3. Keep the identity phone in sync with signup metadata
--    (named zz_* so it runs after the identity bootstrap trigger)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_identity_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone text := public.normalize_phone(
    coalesce(NEW.raw_user_meta_data ->> 'phone', NEW.phone)
  );
BEGIN
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.auth_identities
  SET phone = v_phone,
      updated_at = now()
  WHERE primary_user_id = NEW.id
    AND phone IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.auth_identities x WHERE x.phone = v_phone
    );

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- A duplicate or malformed phone must never break the signup flow.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_identity_phone_trg ON auth.users;
CREATE TRIGGER zz_sync_identity_phone_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_identity_phone();

-- ---------------------------------------------------------------------
-- 4. Identifier -> identity resolution (service_role only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_login_identity(_identifier text)
RETURNS TABLE (identity_id uuid, login_email text, migration_status text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_raw      text := lower(btrim(coalesce(_identifier, '')));
  v_identity uuid;
  v_phone    text;
  v_user     uuid;
BEGIN
  IF v_raw = '' THEN
    RETURN;
  END IF;

  IF position('@' IN v_raw) > 0 THEN
    -- (a) identity email
    SELECT i.id INTO v_identity
    FROM public.auth_identities i
    WHERE i.alsamos_email = v_raw;

    -- (b) preserved legacy address (gmail.com etc.)
    IF v_identity IS NULL THEN
      SELECT l.identity_id INTO v_identity
      FROM public.legacy_emails l
      WHERE lower(l.old_email) = v_raw
        AND l.identity_id IS NOT NULL
      LIMIT 1;
    END IF;

  ELSIF v_raw ~ '^[+0-9][0-9 ()._-]{6,}$' THEN
    v_phone := public.normalize_phone(v_raw);

    IF v_phone IS NOT NULL THEN
      SELECT i.id INTO v_identity
      FROM public.auth_identities i
      WHERE i.phone = v_phone;

      IF v_identity IS NULL THEN
        SELECT ia.identity_id INTO v_identity
        FROM public.identity_accounts ia
        JOIN auth.users u ON u.id = ia.user_id
        WHERE public.normalize_phone(u.phone) = v_phone
          AND ia.status <> 'deleted'
        LIMIT 1;
      END IF;
    END IF;

  ELSE
    -- username of ANY account belonging to the identity
    SELECT p.id INTO v_user
    FROM public.profiles p
    WHERE lower(p.username) = v_raw
    LIMIT 1;

    IF v_user IS NOT NULL THEN
      SELECT ia.identity_id INTO v_identity
      FROM public.identity_accounts ia
      WHERE ia.user_id = v_user
        AND ia.status <> 'deleted'
      LIMIT 1;
    END IF;
  END IF;

  IF v_identity IS NULL THEN
    RETURN;
  END IF;

  -- The password always lives on the primary (slot 1) account.
  RETURN QUERY
  SELECT i.id, ia.login_email, i.migration_status
  FROM public.auth_identities i
  JOIN public.identity_accounts ia
    ON ia.identity_id = i.id
   AND ia.is_primary
   AND ia.status = 'active'
  WHERE i.id = v_identity;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_identity(text) TO service_role;

COMMIT;
