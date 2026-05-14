CREATE OR REPLACE FUNCTION public.get_email_for_identifier(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF _identifier IS NULL OR length(trim(_identifier)) = 0 THEN
    RETURN NULL;
  END IF;

  -- If it already looks like an email, just return it (lowercased)
  IF position('@' in _identifier) > 0 THEN
    RETURN lower(trim(_identifier));
  END IF;

  -- Try username via profiles table
  SELECT id INTO v_id FROM public.profiles
  WHERE lower(username) = lower(trim(_identifier))
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_id LIMIT 1;
    IF v_email IS NOT NULL THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Try phone match in auth.users
  SELECT email INTO v_email FROM auth.users
  WHERE phone = regexp_replace(_identifier, '[^0-9]', '', 'g')
     OR phone = trim(_identifier)
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_for_identifier(text) TO anon, authenticated;