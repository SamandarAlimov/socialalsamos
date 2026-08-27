-- =====================================================================
-- Alsamos auth, phase 3: two-factor authentication (TOTP),
-- hashed recovery codes and an active-devices registry.
--
-- Security goals
--   * TOTP secrets are readable by service_role ONLY (never by the browser).
--   * Recovery codes are stored as SHA-256 hashes, single use.
--     The pre-existing plaintext column user_security.recovery_codes is
--     emptied and permanently blocked by a trigger.
--   * Every minted session registers a device row, so the user can see and
--     revoke sessions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Tickets: allow an intermediate "password ok, 2FA pending" state
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.auth_login_tickets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%purpose%';

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.auth_login_tickets DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.auth_login_tickets
  ADD CONSTRAINT auth_login_tickets_purpose_chk
  CHECK (purpose IN ('account_select', 'account_create', 'mfa_pending'));

-- ---------------------------------------------------------------------
-- 1. TOTP secrets (service_role only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_totp (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_id     uuid REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  secret          text NOT NULL,
  confirmed_at    timestamptz,
  last_used_step  bigint,
  failed_attempts integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_totp_identity_idx
  ON public.user_totp(identity_id) WHERE confirmed_at IS NOT NULL;

ALTER TABLE public.user_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_totp FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_totp FROM PUBLIC, anon, authenticated;
-- Intentionally NO policies: the shared secret must never leave the server.

-- ---------------------------------------------------------------------
-- 2. Recovery codes - hashed, single use
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  used_at     timestamptz,
  used_ip     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_recovery_codes_unique_idx
  ON public.user_recovery_codes(identity_id, code_hash);

CREATE INDEX IF NOT EXISTS user_recovery_codes_open_idx
  ON public.user_recovery_codes(identity_id) WHERE used_at IS NULL;

ALTER TABLE public.user_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_recovery_codes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_recovery_codes FROM PUBLIC, anon, authenticated;
-- No policies: even the owner may not read the hashes.

-- ---------------------------------------------------------------------
-- 3. Kill the old plaintext recovery codes column
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_security'
      AND column_name = 'recovery_codes'
  ) THEN
    EXECUTE 'UPDATE public.user_security SET recovery_codes = NULL WHERE recovery_codes IS NOT NULL';

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.block_plaintext_recovery_codes()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        -- Recovery codes live hashed in public.user_recovery_codes.
        NEW.recovery_codes := NULL;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS user_security_block_recovery_codes ON public.user_security';
    EXECUTE 'CREATE TRIGGER user_security_block_recovery_codes
             BEFORE INSERT OR UPDATE ON public.user_security
             FOR EACH ROW EXECUTE FUNCTION public.block_plaintext_recovery_codes()';

    EXECUTE 'COMMENT ON COLUMN public.user_security.recovery_codes IS
             ''DEPRECATED and always NULL. Hashed codes live in public.user_recovery_codes.''';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Active devices / sessions registry
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id    uuid NOT NULL REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_no        integer NOT NULL DEFAULT 1,
  device_hash    text NOT NULL,
  label          text,
  user_agent     text,
  ip             text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_devices_active_idx
  ON public.auth_devices(identity_id, user_id, device_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_devices_identity_idx
  ON public.auth_devices(identity_id, last_seen_at DESC);

ALTER TABLE public.auth_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own devices readable" ON public.auth_devices;
CREATE POLICY "Own devices readable"
  ON public.auth_devices
  FOR SELECT
  TO authenticated
  USING (identity_id = public.current_identity_id());

-- Writes go through the SECURITY DEFINER helpers below only.
REVOKE INSERT, UPDATE, DELETE ON public.auth_devices FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_auth_device(
  _identity_id uuid,
  _user_id     uuid,
  _slot_no     integer,
  _device_hash text,
  _user_agent  text DEFAULT NULL,
  _ip          text DEFAULT NULL,
  _label       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _identity_id IS NULL OR _user_id IS NULL OR _device_hash IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.auth_devices AS d (
    identity_id, user_id, slot_no, device_hash, label, user_agent, ip
  )
  VALUES (
    _identity_id, _user_id, COALESCE(_slot_no, 1), _device_hash, _label, _user_agent, _ip
  )
  ON CONFLICT (identity_id, user_id, device_hash) WHERE revoked_at IS NULL
  DO UPDATE SET
    last_seen_at = now(),
    slot_no      = EXCLUDED.slot_no,
    user_agent   = COALESCE(EXCLUDED.user_agent, d.user_agent),
    ip           = COALESCE(EXCLUDED.ip, d.ip),
    label        = COALESCE(EXCLUDED.label, d.label)
  RETURNING d.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_auth_device(uuid, uuid, integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_auth_device(uuid, uuid, integer, text, text, text, text)
  TO service_role;

/**
 * Mark a device as revoked. Returns the affected user_id so the caller can
 * also invalidate that account's refresh tokens.
 */
CREATE OR REPLACE FUNCTION public.revoke_auth_device(
  _device_id uuid,
  _reason    text DEFAULT 'user'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE public.auth_devices
     SET revoked_at = now(), revoked_reason = _reason
   WHERE id = _device_id
     AND revoked_at IS NULL
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_auth_device(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_auth_device(uuid, text) TO service_role;

-- ---------------------------------------------------------------------
-- 5. Housekeeping: keep the device list meaningful
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_auth_devices()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_devices
   WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '90 days')
      OR (revoked_at IS NULL AND last_seen_at < now() - interval '180 days');
$$;

REVOKE ALL ON FUNCTION public.prune_auth_devices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_auth_devices() TO service_role;
