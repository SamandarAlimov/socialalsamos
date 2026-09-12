-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260827200000_auth_alsamos_identity.sql
-- SHA256 fcccad53bda27c11865332f2687e35c1586572343e9dcbc054203b8d10bc5064
-- ============================================================================
-- =====================================================================
-- Alsamos Auth: "Owner identity + linked accounts" (Variant B)
--
-- Goals:
--   1. Login is only possible with an <name>@alsamos.com identity email.
--   2. One identity email may own up to 10 superapp accounts.
--   3. Legacy (non-alsamos.com) emails are preserved for recovery/claim.
--   4. No user enumeration, full audit trail, server-side rate limiting.
--
-- Model:
--   auth_identities   -> the owner (identity email + password lives on the
--                        primary auth.users row, so we never store a second
--                        password hash anywhere).
--   identity_accounts -> every superapp account (its own auth.users row),
--                        linked to the identity through slot_no 1..10.
--                        Slot 1 == the identity's primary account.
--   Secondary accounts use a technical login email
--   <username>@accounts.alsamos.com and a random unusable password; their
--   sessions can only be minted after the owner proves the identity password.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Identities
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL only for legacy users who have not claimed an @alsamos.com email yet.
  alsamos_email     text UNIQUE,
  primary_user_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  migration_status  text NOT NULL DEFAULT 'migrated'
                    CHECK (migration_status IN ('legacy', 'claimed', 'migrated')),
  max_accounts      smallint NOT NULL DEFAULT 10
                    CHECK (max_accounts BETWEEN 1 AND 10),
  tos_version       text,
  tos_accepted_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_email_domain_chk CHECK (
    alsamos_email IS NULL
    OR (alsamos_email = lower(alsamos_email) AND alsamos_email LIKE '%@alsamos.com')
  )
);

COMMENT ON TABLE public.auth_identities IS
  'One row per login identity (an @alsamos.com email). Owns up to max_accounts superapp accounts.';

-- ---------------------------------------------------------------------
-- 2. Linked accounts (slots)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id  uuid NOT NULL REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_no      smallint NOT NULL CHECK (slot_no BETWEEN 1 AND 10),
  login_email  text NOT NULL,
  is_primary   boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended', 'deleted')),
  last_used_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, slot_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_accounts_one_primary_idx
  ON public.identity_accounts (identity_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS identity_accounts_identity_idx
  ON public.identity_accounts (identity_id)
  WHERE status = 'active';

-- Hard cap: an identity can never exceed its max_accounts (<= 10).
CREATE OR REPLACE FUNCTION public.enforce_identity_account_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_used  int;
  v_limit int;
BEGIN
  SELECT max_accounts INTO v_limit
  FROM public.auth_identities
  WHERE id = NEW.identity_id;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Unknown identity %', NEW.identity_id
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_used
  FROM public.identity_accounts
  WHERE identity_id = NEW.identity_id
    AND status <> 'deleted'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF NEW.status <> 'deleted' AND v_used >= v_limit THEN
    RAISE EXCEPTION 'ACCOUNT_LIMIT_REACHED: identity % already owns % of % accounts',
      NEW.identity_id, v_used, v_limit
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_identity_account_limit_trg ON public.identity_accounts;
CREATE TRIGGER enforce_identity_account_limit_trg
  BEFORE INSERT OR UPDATE OF status, identity_id ON public.identity_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_identity_account_limit();

-- ---------------------------------------------------------------------
-- 3. Legacy emails (kept for recovery / ownership proof)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legacy_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id  uuid REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_email    text NOT NULL,
  is_recovery  boolean NOT NULL DEFAULT true,
  verified_at  timestamptz,
  migrated_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, old_email)
);

CREATE INDEX IF NOT EXISTS legacy_emails_old_email_idx
  ON public.legacy_emails (lower(old_email));

-- ---------------------------------------------------------------------
-- 4. Audit log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_events (
  id           bigserial PRIMARY KEY,
  identity_id  uuid REFERENCES public.auth_identities(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  outcome      text NOT NULL DEFAULT 'success'
               CHECK (outcome IN ('success', 'failure', 'blocked')),
  reason       text,
  ip           inet,
  user_agent   text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_events_identity_idx
  ON public.auth_events (identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_events_user_idx
  ON public.auth_events (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. Rate limiting (server side only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id          bigserial PRIMARY KEY,
  email_hash  text NOT NULL,
  ip          inet,
  outcome     text NOT NULL CHECK (outcome IN ('success', 'failure')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_lookup_idx
  ON public.auth_login_attempts (email_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_login_attempts_ip_idx
  ON public.auth_login_attempts (ip, created_at DESC);

-- ---------------------------------------------------------------------
-- 6. Two-step login tickets (credentials -> choose account)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_login_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  identity_id uuid NOT NULL REFERENCES public.auth_identities(id) ON DELETE CASCADE,
  purpose     text NOT NULL DEFAULT 'account_select'
              CHECK (purpose IN ('account_select', 'account_create')),
  ip          inet,
  user_agent  text,
  uses_left   smallint NOT NULL DEFAULT 1 CHECK (uses_left >= 0),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '3 minutes'),
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_tickets_expiry_idx
  ON public.auth_login_tickets (expires_at);

-- Housekeeping: drop expired tickets and old attempt rows.
CREATE OR REPLACE FUNCTION public.prune_auth_ephemeral()
RETURNS void
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.auth_login_tickets
  WHERE expires_at < now() - interval '1 hour';

  DELETE FROM public.auth_login_attempts
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.prune_auth_ephemeral() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_auth_ephemeral() TO service_role;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.auth_identities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_emails        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_tickets   ENABLE ROW LEVEL SECURITY;

-- Resolve the identity of the currently authenticated account.
CREATE OR REPLACE FUNCTION public.current_identity_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT ia.identity_id
  FROM public.identity_accounts ia
  WHERE ia.user_id = auth.uid()
    AND ia.status <> 'deleted'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_identity_id() TO authenticated;

DROP POLICY IF EXISTS "Identity readable by its own accounts" ON public.auth_identities;
CREATE POLICY "Identity readable by its own accounts" ON public.auth_identities
  FOR SELECT TO authenticated
  USING (id = public.current_identity_id());

DROP POLICY IF EXISTS "Sibling accounts readable" ON public.identity_accounts;
CREATE POLICY "Sibling accounts readable" ON public.identity_accounts
  FOR SELECT TO authenticated
  USING (identity_id = public.current_identity_id());

DROP POLICY IF EXISTS "Own legacy emails readable" ON public.legacy_emails;
CREATE POLICY "Own legacy emails readable" ON public.legacy_emails
  FOR SELECT TO authenticated
  USING (identity_id = public.current_identity_id());

DROP POLICY IF EXISTS "Own auth events readable" ON public.auth_events;
CREATE POLICY "Own auth events readable" ON public.auth_events
  FOR SELECT TO authenticated
  USING (identity_id = public.current_identity_id());

-- auth_login_attempts and auth_login_tickets intentionally have no policies:
-- only service_role (edge functions) may touch them.

-- ---------------------------------------------------------------------
-- 8. Domain enforcement: only @alsamos.com identities may be created
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_alsamos_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := lower(coalesce(NEW.email, ''));
BEGIN
  IF v_email = '' THEN
    RETURN NEW; -- phone-only / anonymous rows are handled elsewhere
  END IF;

  IF v_email LIKE '%@alsamos.com' OR v_email LIKE '%@accounts.alsamos.com' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'EMAIL_DOMAIN_NOT_ALLOWED: only @alsamos.com addresses may register'
    USING ERRCODE = '22023';
END;
$$;

DROP TRIGGER IF EXISTS enforce_alsamos_email_domain_trg ON auth.users;
CREATE TRIGGER enforce_alsamos_email_domain_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_alsamos_email_domain();

-- ---------------------------------------------------------------------
-- 9. Automatic identity / slot bootstrap for every new auth user
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email       text := lower(coalesce(NEW.email, ''));
  v_identity_id uuid;
  v_slot        smallint;
BEGIN
  -- Secondary account created by the account-create edge function.
  v_identity_id := nullif(NEW.raw_user_meta_data ->> 'identity_id', '')::uuid;

  IF v_identity_id IS NOT NULL THEN
    v_slot := nullif(NEW.raw_user_meta_data ->> 'slot_no', '')::smallint;

    IF v_slot IS NULL THEN
      SELECT coalesce(min(s.n), 1) INTO v_slot
      FROM generate_series(1, 10) AS s(n)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.identity_accounts ia
        WHERE ia.identity_id = v_identity_id
          AND ia.slot_no = s.n
          AND ia.status <> 'deleted'
      );
    END IF;

    INSERT INTO public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
    VALUES (v_identity_id, NEW.id, v_slot, v_email, false)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- Primary identity signup with an @alsamos.com email.
  INSERT INTO public.auth_identities (alsamos_email, primary_user_id, migration_status,
                                      tos_version, tos_accepted_at)
  VALUES (
    CASE WHEN v_email LIKE '%@alsamos.com' AND v_email NOT LIKE '%@accounts.alsamos.com'
         THEN v_email ELSE NULL END,
    NEW.id,
    CASE WHEN v_email LIKE '%@alsamos.com' AND v_email NOT LIKE '%@accounts.alsamos.com'
         THEN 'migrated' ELSE 'legacy' END,
    nullif(NEW.raw_user_meta_data ->> 'tos_version', ''),
    CASE WHEN nullif(NEW.raw_user_meta_data ->> 'tos_version', '') IS NULL
         THEN NULL ELSE now() END
  )
  ON CONFLICT (primary_user_id) DO NOTHING
  RETURNING id INTO v_identity_id;

  IF v_identity_id IS NULL THEN
    SELECT id INTO v_identity_id
    FROM public.auth_identities
    WHERE primary_user_id = NEW.id;
  END IF;

  INSERT INTO public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
  VALUES (v_identity_id, NEW.id, 1, v_email, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_identity();

-- ---------------------------------------------------------------------
-- 10. Backfill existing users
-- ---------------------------------------------------------------------
INSERT INTO public.auth_identities (alsamos_email, primary_user_id, migration_status)
SELECT
  CASE WHEN lower(u.email) LIKE '%@alsamos.com'
            AND lower(u.email) NOT LIKE '%@accounts.alsamos.com'
       THEN lower(u.email) ELSE NULL END,
  u.id,
  CASE WHEN lower(u.email) LIKE '%@alsamos.com'
            AND lower(u.email) NOT LIKE '%@accounts.alsamos.com'
       THEN 'migrated' ELSE 'legacy' END
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.auth_identities i WHERE i.primary_user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.identity_accounts ia WHERE ia.user_id = u.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.identity_accounts (identity_id, user_id, slot_no, login_email, is_primary)
SELECT i.id, i.primary_user_id, 1, lower(u.email), true
FROM public.auth_identities i
JOIN auth.users u ON u.id = i.primary_user_id
ON CONFLICT (user_id) DO NOTHING;

-- Keep every pre-migration address so nobody loses access to their history.
INSERT INTO public.legacy_emails (identity_id, user_id, old_email, is_recovery, verified_at)
SELECT i.id, u.id, lower(u.email), true, u.email_confirmed_at
FROM public.auth_identities i
JOIN auth.users u ON u.id = i.primary_user_id
WHERE lower(u.email) NOT LIKE '%@alsamos.com'
ON CONFLICT (identity_id, old_email) DO NOTHING;

-- ---------------------------------------------------------------------
-- 11. Close the user-enumeration hole
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_email_for_identifier'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 12. Server-side session revocation helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = auth, public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE auth.refresh_tokens
  SET revoked = true
  WHERE user_id = p_user_id::text
    AND revoked = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 13. Audit helper used by the edge functions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_auth_event(
  p_event_type  text,
  p_outcome     text DEFAULT 'success',
  p_identity_id uuid DEFAULT NULL,
  p_user_id     uuid DEFAULT NULL,
  p_reason      text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.auth_events (identity_id, user_id, event_type, outcome, reason, ip, user_agent, metadata)
  VALUES (
    p_identity_id,
    p_user_id,
    p_event_type,
    p_outcome,
    p_reason,
    nullif(p_ip, '')::inet,
    p_user_agent,
    coalesce(p_metadata, '{}'::jsonb)
  );
EXCEPTION WHEN others THEN
  -- Never let audit logging break an auth flow.
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_event(text, text, uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_event(text, text, uuid, uuid, text, text, text, jsonb)
  TO service_role;

COMMIT;


-- ============================================================================
-- SOURCE B-web: 20260827210000_auth_identifier_login.sql
-- SHA256 adf84c21850f17b881bc5813b86ec5c1b86a44283a1c228f8c6ed0b8f8d42498
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260827220000_auth_2fa_devices.sql
-- SHA256 bedd2807387ff36750433fef7abb64866f9134563a7fb4f8ad5c1e1568e0b385
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260827230000_function_guard.sql
-- SHA256 c6d5073eeebe51fcfcbbea837268c33879a7116c36e53cd17d4145d21a8ca602
-- ============================================================================
-- Edge funksiyalar uchun umumiy tekshiruv/limit jurnali.
-- Maqsad: qattiqlashtirishni "log" rejimida boshlash — hech kim bloklanmaydi,
-- lekin real trafik yozib boriladi. Keyin AUTH_ENFORCE=on qilinadi.

create table if not exists public.function_usage (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  user_id uuid,
  ip_hash text,
  outcome text not null default 'allowed'
    check (outcome in ('allowed', 'blocked', 'would_block')),
  reason text,
  mode text not null default 'log' check (mode in ('off', 'log', 'on')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists function_usage_fn_user_time_idx
  on public.function_usage (function_name, user_id, created_at desc);
create index if not exists function_usage_fn_ip_time_idx
  on public.function_usage (function_name, ip_hash, created_at desc);
create index if not exists function_usage_time_idx
  on public.function_usage (created_at desc);
create index if not exists function_usage_outcome_idx
  on public.function_usage (outcome, created_at desc);

-- Faqat service role yozadi/o'qiydi: RLS yoqilgan, hech qanday policy yo'q.
alter table public.function_usage enable row level security;

-- Eski yozuvlarni tozalash (pg_cron yoki qo'lda chaqirish uchun).
create or replace function public.prune_function_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.function_usage
  where created_at < now() - interval '30 days';
$$;

revoke all on function public.prune_function_usage() from public;

comment on table public.function_usage is
  'Edge funksiyalarga kirish va limit hodisalari. outcome=would_block => log rejimida bloklanardi.';


-- ============================================================================
-- SOURCE B-web: 20260827234500_profile_photos.sql
-- SHA256 c9317565cdedc8b049f1707f018cb4b1c5578acc8fb709819622f0e1eab42f6c
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260828000500_media_storage_bucket.sql
-- SHA256 15e47d8db0553a2e9fd41ca96696bc3f4209d008ce209401d01a58ec77438d10
-- ============================================================================
-- =====================================================================
-- Ommaviy `media` storage buckchasi
--
-- Fayl yuklash oldin tashqi https://api.alsamos.com/api/media/presign
-- serveriga bog'liq edi. U server javob bermaganda (yoki CORS preflight
-- muvaffaqiyatsiz bo'lganda) platformada hech qanday fayl yuklanmaydi.
-- Endi asosiy yo'l - to'g'ridan to'g'ri Supabase Storage.
--
-- Kalit tuzilishi: <user_id>/<kind>/<timestamp>-<rand>-<name>
-- Shu sababli RLS siyosati birinchi papka nomini auth.uid() bilan
-- solishtiradi: har kim faqat o'z papkasiga yozadi.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update
  set public = true,
      file_size_limit = 52428800;

-- Hamma ko'radi (bucket ommaviy).
drop policy if exists "Media files are publicly readable" on storage.objects;
create policy "Media files are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'media');

-- Faqat o'z papkasiga yuklash mumkin.
drop policy if exists "Users can upload their own media" on storage.objects;
create policy "Users can upload their own media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own media" on storage.objects;
create policy "Users can update their own media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own media" on storage.objects;
create policy "Users can delete their own media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- SOURCE B-web: 20260828193000_sticker_packs.sql
-- SHA256 52b478ffed4e615519c8c3831c941d5a8b55bba382c1031604b1d2808d08b1d0
-- ============================================================================
-- DEPRECATED - DO NOT APPLY. This file intentionally does nothing.
--
-- This migration originally created its own sticker schema:
--   sticker_packs(slug, author_id, is_public, sticker_count, install_count, ...)
--   stickers(file_url, thumb_url, width, height, ...)
--   sticker_pack_installs(user_id, pack_id, position, installed_at)
--   sticker_usage(user_id, file_url, kind, use_count, last_used_at)
--   touch_sticker_usage(p_file_url, p_kind, p_sticker_id)
--
-- That was a mistake. Those tables already existed, created by
--   alsamos-superapp/supabase/migrations/20260716000000_telegram_stickers.sql
-- with different column names:
--   sticker_packs(title, cover_url, cover_lottie_url, created_by, is_animated)
--   stickers(emoji, image_url, lottie_url, video_url, thumbnail_url, type, position)
--   user_sticker_packs(user_id, pack_id, updated_at)
--   recent_stickers(user_id, sticker_id, use_count, last_used)
--
-- Running the original version of this file aborts with:
--   ERROR: 42703: column "is_public" does not exist
--
-- The reason is the same failure mode that produced the earlier
--   ERROR: 42703: column "collection" does not exist
-- CREATE TABLE IF NOT EXISTS silently does nothing when the table is already
-- there, so none of the new columns get created, and the policies and indexes
-- that follow then reference columns that do not exist.
--
-- Replaced by:
--   alsamos-superapp/supabase/migrations/20260831052300_reconcile_sticker_schema.sql
--
-- That migration keeps the canonical tables authoritative and only adds what
-- the web client is missing:
--   * sticker_packs.slug / is_public / sticker_count / install_count
--   * stickers.file_url / thumb_url / width / height, backfilled from
--     image_url / video_url / lottie_url / thumbnail_url
--   * a trigger keeping both column namings in sync in either direction
--   * a default on stickers.type, which is NOT NULL with no default
--   * user_sticker_packs.position, so the install table stays single
--   * sticker_usage, the one genuinely new table, because recent_stickers
--     cannot hold GIFs (its sticker_id is a required foreign key)
--
-- Web client changes still required, tracked in docs/CONTRACTS/db-schema.md:
--   * read stickers via file_url (now backfilled) or image_url
--   * stop writing sticker_pack_installs, use user_sticker_packs
--
-- See also docs/CONTRACTS/db-schema.md section 1 for migration ownership:
-- new migrations are authored in alsamos-superapp/supabase/migrations/.

SELECT 1;


-- ============================================================================
-- SOURCE B-web: 20260828225000_hashtag_normalization_compat.sql
-- SHA256 dbe2408d737ddb7ea4e9b69698f568805b4924558d31b129e148ecabb546aea4
-- ============================================================================
-- =============================================================================
-- Compatibility bridge: legacy hashtag schema -> normalized Create schema
--
-- This migration intentionally runs BEFORE 20260828230000_create_flow_foundation.
-- Legacy DBs have:
--   * public.hashtags as a VIEW
--   * public.post_hashtags(post_id, hashtag text, created_at)
-- The Create foundation expects:
--   * public.hashtags as a TABLE with UUID id
--   * public.post_hashtags.hashtag_id UUID
-- =============================================================================

do $
declare
  v_kind "char";
begin
  select c.relkind into v_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'hashtags';

  -- O'chirmaymiz: view OID saqlanadi va eski dependency'lar uzilmaydi.
  -- Keyin public.hashtags nomida normalized table yaratamiz.
  if v_kind = 'v' then
    execute 'alter view public.hashtags rename to hashtags_legacy_view';
  elsif v_kind = 'm' then
    execute 'alter materialized view public.hashtags rename to hashtags_legacy_view';
  end if;
end
$;

create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  posts_count int not null default 0,
  -- Legacy read compatibility: old view exposed post_count.
  post_count int generated always as (posts_count) stored,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists hashtags_tag_uniq on public.hashtags (tag);

-- Legacy post_hashtags exists on current installations. If it does not,
-- create the normalized table now so the next foundation migration is idempotent.
create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag text,
  hashtag_id uuid,
  created_at timestamptz not null default now()
);

alter table public.post_hashtags
  add column if not exists hashtag text,
  add column if not exists hashtag_id uuid;

-- Legacy sxemada primary key (post_id, hashtag) bo'lishi mumkin.
-- PK hashtag ustunini NOT NULL qiladi, shuning uchun avval aynan shu PKni
-- katalogdan topib olib tashlaymiz. Yangi unique(post_id, hashtag_id) quyida yaratiladi.
do $
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'post_hashtags'
      and con.contype = 'p'
      and exists (
        select 1
        from unnest(con.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = rel.oid
         and a.attnum = key.attnum
        where a.attname = 'hashtag'
      )
  loop
    execute format(
      'alter table public.post_hashtags drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$;

-- The old hashtag column was required. New inserts are normalized through
-- hashtag_id, therefore the legacy text column must be optional.
alter table public.post_hashtags
  alter column hashtag drop not null;

-- Migrate every valid legacy tag without losing existing usage timestamps.
insert into public.hashtags (tag, posts_count, last_used_at, created_at)
select
  lower(trim(both '#' from ph.hashtag)) as tag,
  count(*)::int as posts_count,
  max(ph.created_at) as last_used_at,
  min(ph.created_at) as created_at
from public.post_hashtags ph
where ph.hashtag is not null
  and length(trim(both '#' from ph.hashtag)) > 0
group by lower(trim(both '#' from ph.hashtag))
on conflict (tag) do update
set posts_count = excluded.posts_count,
    last_used_at = greatest(public.hashtags.last_used_at, excluded.last_used_at);

update public.post_hashtags ph
set hashtag_id = h.id
from public.hashtags h
where ph.hashtag_id is null
  and ph.hashtag is not null
  and h.tag = lower(trim(both '#' from ph.hashtag));

-- Invalid empty legacy rows cannot be represented in the normalized schema.
delete from public.post_hashtags
where hashtag_id is null;

-- Case-only duplicates can collapse to one normalized hashtag.
delete from public.post_hashtags a
using public.post_hashtags b
where a.ctid < b.ctid
  and a.post_id = b.post_id
  and a.hashtag_id = b.hashtag_id;

alter table public.post_hashtags
  alter column hashtag_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'post_hashtags_hashtag_id_fkey'
      and conrelid = 'public.post_hashtags'::regclass
  ) then
    alter table public.post_hashtags
      add constraint post_hashtags_hashtag_id_fkey
      foreign key (hashtag_id)
      references public.hashtags(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists post_hashtags_post_hashtag_uniq
  on public.post_hashtags (post_id, hashtag_id);

-- Keep the legacy aggregate view name alive for older readers.
create or replace view public.hashtags_aggregated as
select
  h.tag,
  h.posts_count::bigint as post_count,
  h.last_used_at
from public.hashtags h;


-- ============================================================================
-- SOURCE B-web: 20260828230000_create_flow_foundation.sql
-- SHA256 8ef50a19db0462feeafcb59feb13a6fca69eddb94ea777238a55729ff6f1567c
-- ============================================================================
-- ============================================================================
-- CREATE FLOW FOUNDATION (Stage 1)
-- Maqsad: post yaratish oqimidagi barcha meta-ma'lumotni post matnidan
-- ([POLL]{...}[/POLL], [MUSIC:id], "📍 ...") strukturali jadvallarga ko'chirish.
--
-- Bu migratsiya idempotent: qayta ishga tushirsa xato bermaydi.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 0. ENUM turlari
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('image', 'video', 'audio', 'document', 'archive', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'post_location_mode') then
    create type public.post_location_mode as enum ('place', 'live');
  end if;

  if not exists (select 1 from pg_type where typname = 'music_source') then
    create type public.music_source as enum ('platform', 'device', 'jamendo', 'audius', 'fma', 'ccmixter', 'pixabay');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. posts jadvaliga yangi ustunlar
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists post_kind text not null default 'post',
  add column if not exists status text not null default 'published',
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists has_poll boolean not null default false,
  add column if not exists formatted_content jsonb,
  add column if not exists edit_state jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_post_kind_check') then
    alter table public.posts
      add constraint posts_post_kind_check
      check (post_kind in ('post', 'reel', 'story', 'location', 'poll', 'file'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_status_check') then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('draft', 'scheduled', 'published', 'failed'));
  end if;
end $$;

update public.posts set published_at = created_at where published_at is null;

create index if not exists posts_status_published_idx
  on public.posts (status, published_at desc);
create index if not exists posts_scheduled_idx
  on public.posts (scheduled_at)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- 2. Ko'rish huquqini tekshiruvchi yordamchi funksiya
-- ---------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.visibility = 'public'
        or p.user_id = auth.uid()
        or exists (
          select 1 from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

create or replace function public.owns_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. post_media — har qanday turdagi fayl uchun
-- ---------------------------------------------------------------------------
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position int not null default 0,
  kind public.media_kind not null default 'other',
  storage_url text not null,
  thumbnail_url text,
  mime_type text,
  file_name text,
  file_size bigint,
  width int,
  height int,
  duration_seconds numeric(10, 3),
  aspect_ratio text,
  alt_text text,
  -- filtr, trim, crop, rotate, overlay holati (klientda qo'llanilgan tahrir)
  edit_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_idx on public.post_media (post_id, position);
create index if not exists post_media_kind_idx on public.post_media (kind);

alter table public.post_media enable row level security;

drop policy if exists "post_media_select" on public.post_media;
create policy "post_media_select" on public.post_media
  for select using (public.can_view_post(post_id));

drop policy if exists "post_media_write" on public.post_media;
create policy "post_media_write" on public.post_media
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 4. places + post_locations — xarita bilan integratsiya
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  -- tashqi geocoder (nominatim/photon/osm) identifikatori
  external_source text,
  external_id text,
  created_by uuid references auth.users(id) on delete set null,
  usage_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists places_external_uniq
  on public.places (external_source, external_id)
  where external_source is not null and external_id is not null;
create index if not exists places_coords_idx on public.places (latitude, longitude);
create index if not exists places_name_trgm_idx on public.places using gin (name gin_trgm_ops);

alter table public.places enable row level security;

drop policy if exists "places_select_all" on public.places;
create policy "places_select_all" on public.places for select using (true);

drop policy if exists "places_insert_auth" on public.places;
create policy "places_insert_auth" on public.places
  for insert with check (auth.uid() is not null);

drop policy if exists "places_update_own" on public.places;
create policy "places_update_own" on public.places
  for update using (created_by = auth.uid());

create table if not exists public.post_locations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  -- 'place'  -> tanlangan joy (Telegramdagi "Send location" analogi, boyitilgan)
  -- 'live'   -> real vaqtli joylashuv (live_until gacha yangilanadi)
  mode public.post_location_mode not null default 'place',
  label text,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading double precision,
  live_until timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists post_locations_post_uniq on public.post_locations (post_id);
create index if not exists post_locations_coords_idx on public.post_locations (latitude, longitude);
create index if not exists post_locations_live_idx on public.post_locations (live_until)
  where mode = 'live';

alter table public.post_locations enable row level security;

drop policy if exists "post_locations_select" on public.post_locations;
create policy "post_locations_select" on public.post_locations
  for select using (public.can_view_post(post_id));

drop policy if exists "post_locations_write" on public.post_locations;
create policy "post_locations_write" on public.post_locations
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 5. polls / poll_options / poll_votes — real ovoz berish tizimi
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  max_choices int,
  is_anonymous boolean not null default false,
  show_results_before_vote boolean not null default false,
  quiz_mode boolean not null default false,
  correct_option_id uuid,
  explanation text,
  closes_at timestamptz,
  total_votes int not null default 0,
  total_voters int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists polls_post_uniq on public.polls (post_id);
create index if not exists polls_closes_at_idx on public.polls (closes_at);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position int not null default 0,
  label text not null,
  emoji text,
  image_url text,
  votes_count int not null default 0
);

create index if not exists poll_options_poll_idx on public.poll_options (poll_id, position);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'polls_correct_option_fk') then
    alter table public.polls
      add constraint polls_correct_option_fk
      foreign key (correct_option_id) references public.poll_options(id) on delete set null;
  end if;
end $$;

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, user_id)
);

create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id);

-- Ovoz berishdan oldingi qat'iy tekshiruvlar
create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_existing int;
begin
  select * into v_poll from public.polls where id = new.poll_id;

  if v_poll.id is null then
    raise exception 'So''rovnoma topilmadi';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'So''rovnoma yakunlangan';
  end if;

  if not exists (
    select 1 from public.poll_options o
    where o.id = new.option_id and o.poll_id = new.poll_id
  ) then
    raise exception 'Variant bu so''rovnomaga tegishli emas';
  end if;

  select count(*) into v_existing
  from public.poll_votes v
  where v.poll_id = new.poll_id and v.user_id = new.user_id;

  if not v_poll.allow_multiple and v_existing >= 1 then
    raise exception 'Bu so''rovnomada faqat bitta variant tanlanadi';
  end if;

  if v_poll.allow_multiple
     and v_poll.max_choices is not null
     and v_existing >= v_poll.max_choices then
    raise exception 'Eng ko''p % variant tanlash mumkin', v_poll.max_choices;
  end if;

  return new;
end $$;

drop trigger if exists poll_votes_validate on public.poll_votes;
create trigger poll_votes_validate
  before insert on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- Ovoz hisoblagichlarini yangilash
create or replace function public.sync_poll_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id uuid;
begin
  v_poll_id := coalesce(new.poll_id, old.poll_id);

  update public.poll_options o
  set votes_count = (select count(*) from public.poll_votes v where v.option_id = o.id)
  where o.poll_id = v_poll_id;

  update public.polls p
  set total_votes = (select count(*) from public.poll_votes v where v.poll_id = p.id),
      total_voters = (select count(distinct v.user_id) from public.poll_votes v where v.poll_id = p.id)
  where p.id = v_poll_id;

  return null;
end $$;

drop trigger if exists poll_votes_sync_counts on public.poll_votes;
create trigger poll_votes_sync_counts
  after insert or delete on public.poll_votes
  for each row execute function public.sync_poll_counts();

-- posts.has_poll flagini avtomatik saqlash
create or replace function public.sync_post_has_poll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.posts set has_poll = false where id = old.post_id;
  else
    update public.posts set has_poll = true where id = new.post_id;
  end if;
  return null;
end $$;

drop trigger if exists polls_sync_post_flag on public.polls;
create trigger polls_sync_post_flag
  after insert or delete on public.polls
  for each row execute function public.sync_post_has_poll();

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "polls_select" on public.polls;
create policy "polls_select" on public.polls
  for select using (public.can_view_post(post_id));

drop policy if exists "polls_write" on public.polls;
create policy "polls_write" on public.polls
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

drop policy if exists "poll_options_select" on public.poll_options;
create policy "poll_options_select" on public.poll_options
  for select using (
    exists (select 1 from public.polls p where p.id = poll_id and public.can_view_post(p.post_id))
  );

drop policy if exists "poll_options_write" on public.poll_options;
create policy "poll_options_write" on public.poll_options
  for all using (
    exists (select 1 from public.polls p where p.id = poll_id and public.owns_post(p.post_id))
  ) with check (
    exists (select 1 from public.polls p where p.id = poll_id and public.owns_post(p.post_id))
  );

-- Anonim so'rovnomada boshqa foydalanuvchi ovozlari ko'rinmaydi
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select" on public.poll_votes
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.polls p
      where p.id = poll_id
        and p.is_anonymous = false
        and public.can_view_post(p.post_id)
    )
  );

drop policy if exists "poll_votes_insert" on public.poll_votes;
create policy "poll_votes_insert" on public.poll_votes
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and public.can_view_post(p.post_id))
  );

drop policy if exists "poll_votes_delete" on public.poll_votes;
create policy "poll_votes_delete" on public.poll_votes
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. hashtags / post_hashtags — Unicode (kirill + lotin) qidiruv
-- ---------------------------------------------------------------------------
create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  posts_count int not null default 0,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists hashtags_tag_uniq on public.hashtags (tag);
create index if not exists hashtags_tag_trgm_idx on public.hashtags using gin (tag gin_trgm_ops);
create index if not exists hashtags_popular_idx on public.hashtags (posts_count desc, last_used_at desc);

create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag_id)
);

create index if not exists post_hashtags_hashtag_idx on public.post_hashtags (hashtag_id, created_at desc);

-- Post matnidan hashtaglarni ajratib olish (kirill harflar ham ishlaydi:
-- [[:alnum:]] UTF-8 locale da Unicode harflarni qamrab oladi)
create or replace function public.sync_post_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_id uuid;
begin
  delete from public.post_hashtags where post_id = new.id;

  for v_tag in
    select distinct lower(m[1])
    from regexp_matches(coalesce(new.content, ''), '#([[:alnum:]_]{1,64})', 'g') as m
  loop
    insert into public.hashtags (tag, last_used_at)
    values (v_tag, now())
    on conflict (tag) do update set last_used_at = now()
    returning id into v_id;

    insert into public.post_hashtags (post_id, hashtag_id)
    values (new.id, v_id)
    on conflict do nothing;
  end loop;

  return null;
end $$;

drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags
  after insert or update of content on public.posts
  for each row execute function public.sync_post_hashtags();

create or replace function public.sync_hashtag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := coalesce(new.hashtag_id, old.hashtag_id);
  update public.hashtags h
  set posts_count = (select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id)
  where h.id = v_id;
  return null;
end $$;

drop trigger if exists post_hashtags_sync_counts on public.post_hashtags;
create trigger post_hashtags_sync_counts
  after insert or delete on public.post_hashtags
  for each row execute function public.sync_hashtag_counts();

alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;

drop policy if exists "hashtags_select_all" on public.hashtags;
create policy "hashtags_select_all" on public.hashtags for select using (true);

drop policy if exists "post_hashtags_select" on public.post_hashtags;
create policy "post_hashtags_select" on public.post_hashtags
  for select using (public.can_view_post(post_id));

-- Server tomonda hashtag qidiruvi (prefiks + fuzzy)
create or replace function public.search_hashtags(p_query text, p_limit int default 12)
returns table (id uuid, tag text, posts_count int)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(trim(both '#' from coalesce(p_query, ''))) as term)
  select h.id, h.tag, h.posts_count
  from public.hashtags h, q
  where q.term = '' or h.tag like q.term || '%' or h.tag % q.term
  order by
    case when q.term <> '' and h.tag like q.term || '%' then 0 else 1 end,
    h.posts_count desc,
    h.last_used_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- Trend hashtaglar: oxirgi N kun ichidagi ishlatilish soni bo'yicha
create or replace function public.trending_hashtags(p_limit int default 12, p_days int default 7)
returns table (id uuid, tag text, recent_count bigint, posts_count int)
language sql
stable
security definer
set search_path = public
as $$
  select h.id,
         h.tag,
         count(ph.post_id) as recent_count,
         h.posts_count
  from public.hashtags h
  join public.post_hashtags ph on ph.hashtag_id = h.id
  join public.posts p on p.id = ph.post_id
  where ph.created_at >= now() - make_interval(days => greatest(1, coalesce(p_days, 7)))
    and p.visibility = 'public'
  group by h.id, h.tag, h.posts_count
  order by recent_count desc, h.posts_count desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- ---------------------------------------------------------------------------
-- 7. music_tracks / post_music — device + platforma + open source katalog
-- ---------------------------------------------------------------------------
create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  album text,
  audio_url text not null,
  cover_url text,
  duration_seconds numeric(10, 3),
  source public.music_source not null default 'platform',
  external_id text,
  license text,
  attribution text,
  genre text,
  owner_id uuid references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  uses_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists music_tracks_external_uniq
  on public.music_tracks (source, external_id)
  where external_id is not null;
create index if not exists music_tracks_title_trgm_idx
  on public.music_tracks using gin (title gin_trgm_ops);
create index if not exists music_tracks_popular_idx
  on public.music_tracks (is_public, uses_count desc);

create table if not exists public.post_music (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  track_id uuid references public.music_tracks(id) on delete set null,
  start_seconds numeric(10, 3) not null default 0,
  end_seconds numeric(10, 3),
  volume numeric(4, 3) not null default 1.0,
  muted_original boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists post_music_post_uniq on public.post_music (post_id);

alter table public.music_tracks enable row level security;
alter table public.post_music enable row level security;

drop policy if exists "music_tracks_select" on public.music_tracks;
create policy "music_tracks_select" on public.music_tracks
  for select using (is_public = true or owner_id = auth.uid());

drop policy if exists "music_tracks_insert" on public.music_tracks;
create policy "music_tracks_insert" on public.music_tracks
  for insert with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

drop policy if exists "music_tracks_update_own" on public.music_tracks;
create policy "music_tracks_update_own" on public.music_tracks
  for update using (owner_id = auth.uid());

drop policy if exists "music_tracks_delete_own" on public.music_tracks;
create policy "music_tracks_delete_own" on public.music_tracks
  for delete using (owner_id = auth.uid());

drop policy if exists "post_music_select" on public.post_music;
create policy "post_music_select" on public.post_music
  for select using (public.can_view_post(post_id));

drop policy if exists "post_music_write" on public.post_music;
create policy "post_music_write" on public.post_music
  for all using (public.owns_post(post_id)) with check (public.owns_post(post_id));

-- ---------------------------------------------------------------------------
-- 8. Hammuallif limiti: 10 nafar (Instagram 5 ta, bizda 10 ta)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.post_collaborators
  where post_id = new.post_id;

  if v_count >= 10 then
    raise exception 'Bitta postga eng ko''pi bilan 10 nafar hammuallif qo''shish mumkin';
  end if;

  return new;
end $$;

drop trigger if exists post_collaborators_limit on public.post_collaborators;
create trigger post_collaborators_limit
  before insert on public.post_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- ---------------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.poll_votes;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.poll_options;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.post_locations;
  exception when duplicate_object or undefined_object then null;
  end;
end $$;


-- ============================================================================
-- SOURCE B-web: 20260828230000_map_premium.sql
-- SHA256 be457e434daa1ab86e0e3f02e4aeea519e9e2b4ee19f354a7c56dfcd65e2ca55
-- ============================================================================
-- DEPRECATED - DO NOT APPLY. This file intentionally does nothing.
--
-- Superseded twice over. It was first replaced by
--   20260829010000_map_premium_fix.sql
-- which is itself now deprecated, because both files collide with schema that
-- already existed.
--
-- The real reconciliation lives in
--   alsamos-superapp/supabase/migrations/20260831053000_reconcile_map_schema.sql
--
-- See docs/CONTRACTS/db-schema.md section 4 for the verified column-level diff.

SELECT 1;


-- ============================================================================
-- SOURCE B-web: 20260828234500_poll_types_video_jobs_music_ingest.sql
-- SHA256 1ec279e28efe44456c8bf3d60d78648e3a2157fb81b2b37cfc672e160a2fe424
-- ============================================================================
-- =============================================================================
-- ADR-004: So'rovnoma turlari (oddiy, kviz, rasmli, slayder, reyting)
-- ADR-001: Video qayta ishlash uchun gibrid ish navbati (video_jobs)
-- ADR-002: Musiqa katalogi ingest metadatasi
--
-- MUHIM: barcha yangi ustunlar NULL qabul qiladi yoki DEFAULT bilan keladi,
-- shuning uchun mavjud postlar, so'rovnomalar va treklar buzilmaydi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. So'rovnoma turlari
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'poll_type') then
    create type public.poll_type as enum ('standard', 'quiz', 'image', 'slider', 'rating');
  end if;
end $$;

alter table public.polls
  add column if not exists poll_type public.poll_type not null default 'standard',
  add column if not exists min_value numeric,
  add column if not exists max_value numeric,
  add column if not exists step numeric,
  add column if not exists left_label text,
  add column if not exists right_label text;

-- Mavjud kviz so'rovnomalarini to'g'ri turga o'tkazamiz
update public.polls
set poll_type = 'quiz'
where quiz_mode is true and poll_type = 'standard';

-- Slayder uchun diapazon mantiqiy bo'lishi shart
alter table public.polls
  drop constraint if exists polls_slider_range_check;

alter table public.polls
  add constraint polls_slider_range_check check (
    poll_type <> 'slider'
    or (
      min_value is not null
      and max_value is not null
      and max_value > min_value
      and (step is null or step > 0)
    )
  );

-- Rasmli variantlar
alter table public.poll_options
  add column if not exists image_url text;

-- Slayder/reyting ovozlari raqamli qiymat bilan keladi
alter table public.poll_votes
  add column if not exists numeric_value numeric;

comment on column public.polls.poll_type is 'ADR-004: so''rovnoma turi';
comment on column public.poll_votes.numeric_value is 'Slayder va reyting turlari uchun ovoz qiymati';

-- -----------------------------------------------------------------------------
-- 2. Ovoz turini tekshiruvchi trigger
--    Slayderda variant emas, qiymat kerak; oddiy turda esa aksincha.
-- -----------------------------------------------------------------------------

create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.poll_type;
  v_min numeric;
  v_max numeric;
begin
  select poll_type, min_value, max_value
    into v_type, v_min, v_max
  from public.polls
  where id = new.poll_id;

  if v_type is null then
    return new;
  end if;

  if v_type in ('slider', 'rating') then
    if new.numeric_value is null then
      raise exception 'Slayder so''rovnomasi uchun qiymat majburiy';
    end if;
    if v_min is not null and new.numeric_value < v_min then
      raise exception 'Qiymat ruxsat etilgan diapazondan kichik';
    end if;
    if v_max is not null and new.numeric_value > v_max then
      raise exception 'Qiymat ruxsat etilgan diapazondan katta';
    end if;
  else
    if new.option_id is null then
      raise exception 'Variant tanlanmagan';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists validate_poll_vote_trigger on public.poll_votes;

create trigger validate_poll_vote_trigger
  before insert or update on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- Slayder natijasi: o'rtacha, mediana va ovoz soni
create or replace function public.poll_slider_summary(p_poll_id uuid)
returns table (
  vote_count bigint,
  average_value numeric,
  median_value numeric,
  min_voted numeric,
  max_voted numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    round(avg(numeric_value), 2),
    percentile_cont(0.5) within group (order by numeric_value),
    min(numeric_value),
    max(numeric_value)
  from public.poll_votes
  where poll_id = p_poll_id
    and numeric_value is not null;
$$;

-- -----------------------------------------------------------------------------
-- 3. ADR-001: video ish navbati
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_job_status') then
    create type public.media_job_status as enum ('queued', 'processing', 'done', 'failed', 'canceled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_job_kind') then
    create type public.media_job_kind as enum ('transcode', 'hls', 'thumbnail', 'audio_mux', 'nsfw_scan');
  end if;
end $$;

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  media_id uuid references public.post_media (id) on delete cascade,
  kind public.media_job_kind not null default 'transcode',
  status public.media_job_status not null default 'queued',
  -- Klientda urinib ko'rilganmi (ADR-001: avval klient, keyin server)
  client_attempts integer not null default 0,
  attempts integer not null default 0,
  source_url text not null,
  output_url text,
  params jsonb not null default '{}'::jsonb,
  error_message text,
  -- Xarajat nazorati: qayta ishlangan sekundlar
  processed_seconds numeric,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists video_jobs_status_idx on public.video_jobs (status, created_at);
create index if not exists video_jobs_owner_idx on public.video_jobs (owner_id, created_at desc);
create index if not exists video_jobs_post_idx on public.video_jobs (post_id);

alter table public.video_jobs enable row level security;

drop policy if exists "video_jobs_select_own" on public.video_jobs;
create policy "video_jobs_select_own"
  on public.video_jobs for select
  using (auth.uid() = owner_id);

drop policy if exists "video_jobs_insert_own" on public.video_jobs;
create policy "video_jobs_insert_own"
  on public.video_jobs for insert
  with check (auth.uid() = owner_id);

drop policy if exists "video_jobs_update_own" on public.video_jobs;
create policy "video_jobs_update_own"
  on public.video_jobs for update
  using (auth.uid() = owner_id);

drop policy if exists "video_jobs_delete_own" on public.video_jobs;
create policy "video_jobs_delete_own"
  on public.video_jobs for delete
  using (auth.uid() = owner_id);

-- Kunlik server-daqiqa limiti (ADR-001 xarajat nazorati)
create or replace function public.video_job_quota_used(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(processed_seconds), 0)
  from public.video_jobs
  where owner_id = p_user_id
    and created_at >= now() - interval '1 day';
$$;

-- -----------------------------------------------------------------------------
-- 4. ADR-002: musiqa katalogi ingest metadatasi
-- -----------------------------------------------------------------------------

alter table public.music_tracks
  add column if not exists waveform jsonb,
  add column if not exists bpm integer,
  add column if not exists genre text,
  add column if not exists language text,
  add column if not exists license_url text,
  add column if not exists is_commercial_ok boolean,
  add column if not exists popularity integer not null default 0,
  add column if not exists ingested_at timestamptz;

-- Litsenziyasiz ommaviy trek katalogga kirmasligi kerak (o'zgarmas tamoyil #5)
alter table public.music_tracks
  drop constraint if exists music_tracks_public_requires_license;

alter table public.music_tracks
  add constraint music_tracks_public_requires_license check (
    is_public is not true
    or (license is not null and length(trim(license)) > 0)
  );

create index if not exists music_tracks_search_idx
  on public.music_tracks using gin ((title || ' ' || coalesce(artist, '')) gin_trgm_ops);

create index if not exists music_tracks_popularity_idx
  on public.music_tracks (is_public, popularity desc);

-- Ingest jurnali: qaysi manbadan qachon nechta trek olindi
create table if not exists public.music_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source public.music_source not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text
);

alter table public.music_ingest_runs enable row level security;

-- Jurnalni faqat service role yozadi; oddiy foydalanuvchi o'qiy oladi.
drop policy if exists "music_ingest_runs_select_all" on public.music_ingest_runs;
create policy "music_ingest_runs_select_all"
  on public.music_ingest_runs for select
  using (true);

-- Musiqa qidiruvi (katalog + foydalanuvchining o'z fayllari)
create or replace function public.search_music_tracks(
  p_query text,
  p_limit integer default 20
)
returns setof public.music_tracks
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.music_tracks
  where (is_public = true or owner_id = auth.uid())
    and (
      p_query is null
      or length(trim(p_query)) = 0
      or title ilike '%' || p_query || '%'
      or coalesce(artist, '') ilike '%' || p_query || '%'
    )
  order by popularity desc, created_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;

