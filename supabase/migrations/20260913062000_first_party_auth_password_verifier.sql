-- Alsamos @alsamos.com addresses are an internal identity namespace, not
-- deliverable mailboxes. This helper lets the trusted account-signup Edge
-- Function repair a user that was accidentally created while Supabase's
-- Confirm Email setting was enabled.
--
-- SECURITY: the function is deliberately service_role-only. It never returns
-- password material; it returns the user id only when the supplied password
-- matches auth.users.encrypted_password.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.verify_alsamos_identity_password(
  _email text,
  _password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email text := lower(trim(coalesce(_email, '')));
  v_user_id uuid;
  v_hash text;
BEGIN
  IF v_email !~ '^[a-z0-9._%+\-]{1,64}@alsamos\.com$'
     OR v_email LIKE '%@accounts.alsamos.com'
     OR coalesce(_password, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id, u.encrypted_password
    INTO v_user_id, v_hash
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL OR coalesce(v_hash, '') = '' THEN
    RETURN NULL;
  END IF;

  IF v_hash = crypt(_password, v_hash) THEN
    RETURN v_user_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_alsamos_identity_password(text, text) TO service_role;

COMMENT ON FUNCTION public.verify_alsamos_identity_password(text, text) IS
  'Server-only ownership proof for @alsamos.com identities accidentally left unconfirmed. Never expose to browser roles.';
