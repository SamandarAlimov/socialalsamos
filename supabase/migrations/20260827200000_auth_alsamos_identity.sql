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
