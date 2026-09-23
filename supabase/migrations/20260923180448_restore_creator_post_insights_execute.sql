-- Restore creator/collaborator post insights after the SECURITY DEFINER
-- governance sweep removed the authenticated EXECUTE grant.
-- The RPC performs its own owner/accepted-collaborator authorization.

revoke all on function public.get_post_insights(uuid, integer) from public, anon;
grant execute on function public.get_post_insights(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
