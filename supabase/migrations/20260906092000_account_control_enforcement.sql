-- Enforce account controls for already-authenticated sessions.
-- Supabase Auth bans prevent new logins; this RPC lets the app block an existing session immediately.

create or replace function public.get_my_account_control_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_reason text;
  v_until timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('status','signed_out','blocked',true);
  end if;

  select c.status,c.reason,c.suspended_until
    into v_status,v_reason,v_until
  from public.user_account_controls c
  where c.user_id = v_user;

  if v_status is null then
    return jsonb_build_object('status','active','blocked',false);
  end if;

  if v_status = 'suspended' and v_until is not null and v_until <= now() then
    return jsonb_build_object('status','active','blocked',false,'expired_control',true);
  end if;

  return jsonb_build_object(
    'status',v_status,
    'blocked',v_status <> 'active',
    'reason',v_reason,
    'suspended_until',v_until
  );
end;
$$;

revoke all on function public.get_my_account_control_v3() from public;
grant execute on function public.get_my_account_control_v3() to authenticated;
