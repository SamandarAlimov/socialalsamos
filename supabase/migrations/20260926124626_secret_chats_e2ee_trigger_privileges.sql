begin;

-- Trigger helpers are internal database implementation details. They must not be
-- exposed through PostgREST/RPC even though the trigger itself continues to run.
revoke all on function public.guard_secret_message_payload() from public, anon, authenticated;
revoke all on function public.guard_secret_scheduled_message() from public, anon, authenticated;

commit;