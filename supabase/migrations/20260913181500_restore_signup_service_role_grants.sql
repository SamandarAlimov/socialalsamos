-- Restore the minimum PostgREST privileges required by the server-side
-- account-signup Edge Function.
--
-- The function authenticates to PostgREST with SUPABASE_SERVICE_ROLE_KEY and
-- performs these operations before calling auth.admin.createUser():
--   * SELECT public.profiles            (username uniqueness)
--   * SELECT public.auth_identities     (phone uniqueness)
--   * SELECT/INSERT public.function_usage (rate-limit telemetry)
--
-- RLS bypass from the service_role JWT does not replace SQL table privileges;
-- without these GRANTs PostgREST returns 42501 and signup surfaces as HTTP 500.

grant usage on schema public to service_role;

grant select on table public.profiles to service_role;
grant select on table public.auth_identities to service_role;
grant select, insert on table public.function_usage to service_role;
