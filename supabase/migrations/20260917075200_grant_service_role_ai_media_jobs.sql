-- AI media generation runs inside authenticated Supabase Edge Functions.
-- guard.ts creates a service-role client, so the database role must have
-- table privileges before RLS bypass can take effect.
--
-- Without these grants, generate_video fails before calling Veo with:
--   permission denied for table ai_media_jobs
--
-- Keep RLS enabled for user-facing clients; this grant is only for the
-- trusted server-side service_role used by the AI runtime.

grant select, insert, update, delete
on table public.ai_media_jobs
to service_role;
