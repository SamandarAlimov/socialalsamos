-- Policies may call SECURITY DEFINER helper functions, but PostgREST roles must
-- also have EXECUTE on those helpers. Grant only the helpers required by client
-- RLS and keep account/admin helpers away from anon.

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.can_view_post(uuid)',
    'public.can_view_structured_post_compat(uuid)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('grant execute on function %s to anon, authenticated', sig);
    end if;
  end loop;

  foreach sig in array array[
    'public.can_manage_ad_account(uuid,uuid)',
    'public.can_owner_add_conversation_participant(uuid,uuid)',
    'public.current_identity_id()',
    'public.has_ad_account_access(uuid,uuid)',
    'public.is_call_participant(uuid,uuid)',
    'public.is_conversation_admin(uuid)',
    'public.is_conversation_admin(uuid,uuid)',
    'public.is_conversation_member(uuid)',
    'public.is_my_conversation(uuid)',
    'public.mini_app_can_manage(uuid)',
    'public.owns_structured_post_compat(uuid)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('grant execute on function %s to authenticated', sig);
      execute format('revoke execute on function %s from anon', sig);
    end if;
  end loop;
end
$$;
