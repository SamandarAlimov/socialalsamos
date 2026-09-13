-- Restore least-privilege access to the authenticated Story draft lifecycle.
-- These SECURITY DEFINER functions validate auth.uid() and ownership internally;
-- hardened default EXECUTE revokes must therefore be followed by explicit grants.

revoke all on function public.create_story_draft(jsonb) from public;
revoke all on function public.publish_story_draft(jsonb) from public;
revoke all on function public.activate_story_draft(uuid) from public;
revoke all on function public.discard_story_draft(uuid) from public;

revoke execute on function public.create_story_draft(jsonb) from anon;
revoke execute on function public.publish_story_draft(jsonb) from anon;
revoke execute on function public.activate_story_draft(uuid) from anon;
revoke execute on function public.discard_story_draft(uuid) from anon;

grant execute on function public.create_story_draft(jsonb) to authenticated;
grant execute on function public.publish_story_draft(jsonb) to authenticated;
grant execute on function public.activate_story_draft(uuid) to authenticated;
grant execute on function public.discard_story_draft(uuid) to authenticated;
