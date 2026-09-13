-- Alsamos currently has no mail delivery dependency for primary identity signup.
-- Existing primary @alsamos.com users that were created while hosted Auth still
-- required confirmation must be able to sign in immediately. Linked technical
-- accounts are deliberately excluded.

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL
  AND lower(COALESCE(email, '')) LIKE '%@alsamos.com'
  AND lower(COALESCE(email, '')) NOT LIKE '%@accounts.alsamos.com';
