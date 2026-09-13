-- Signup must accept normal external identity email addresses.
--
-- The earlier repair migration attempted to drop a legacy email-domain guard
-- using the trigger name `alsamos_email_domain_guard`, but the actual trigger
-- still installed on auth.users was `enforce_alsamos_email_domain_trg`.
-- That leftover BEFORE INSERT/UPDATE trigger rejected every non-@alsamos.com
-- address, so Auth admin.createUser() surfaced "Database error creating new user"
-- and account-signup returned HTTP 500.
--
-- Keep both drops so the migration is safe on environments carrying either
-- historical trigger name.

DROP TRIGGER IF EXISTS enforce_alsamos_email_domain_trg ON auth.users;
DROP TRIGGER IF EXISTS alsamos_email_domain_guard ON auth.users;
