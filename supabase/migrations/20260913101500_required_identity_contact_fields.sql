-- Required contact data for Alsamos registration.
-- Real email is stored as contact data only; Supabase Auth continues to use
-- the hidden username@alsamos.com credential and sends no confirmation email.

ALTER TABLE public.auth_identities
  ADD COLUMN IF NOT EXISTS contact_email text;

CREATE INDEX IF NOT EXISTS auth_identities_contact_email_lower_idx
  ON public.auth_identities (lower(contact_email))
  WHERE contact_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_identities_phone_contact_idx
  ON public.auth_identities (phone)
  WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.auth_identities.contact_email IS
  'Required contact email for new registrations. Not a public login identifier and not auto-verified.';

NOTIFY pgrst, 'reload schema';
