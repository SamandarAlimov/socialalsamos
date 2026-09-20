-- Atomic admin verification workflows.
-- Approval/rejection and direct verification changes are server-side, permission
-- checked, audited and transactionally consistent.

create or replace function public.admin_set_user_verification_v1(
  p_user_id uuid,
  p_verified boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before boolean;
  v_after boolean := coalesce(p_verified, false);
  v_username text;
begin
  if v_actor is null or not public.has_admin_permission(v_actor, 'verification.review') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(p.is_verified, false), p.username
    into v_before, v_username
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  update public.profiles
  set is_verified = v_after,
      updated_at = now()
  where id = p_user_id;

  if v_before is distinct from v_after then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      p_user_id,
      'verification',
      case when v_after then 'Verifikatsiya tasdiqlandi' else 'Verifikatsiya olib tashlandi' end,
      case
        when v_after then 'Hisobingiz Alsamos tomonidan tasdiqlandi.'
        else 'Hisobingizdagi verifikatsiya holati administrator tomonidan yangilandi.'
      end,
      jsonb_build_object('source', 'admin', 'verified', v_after)
    );

    perform public.admin_write_audit(
      case when v_after then 'verification.user.grant' else 'verification.user.revoke' end,
      p_user_id,
      'profile',
      p_user_id::text,
      coalesce(nullif(trim(p_reason), ''), 'Admin verification change'),
      jsonb_build_object('is_verified', v_before),
      jsonb_build_object('is_verified', v_after),
      jsonb_build_object('username', v_username)
    );
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'is_verified', v_after,
    'changed', v_before is distinct from v_after
  );
end;
$$;

revoke all on function public.admin_set_user_verification_v1(uuid,boolean,text) from public;
grant execute on function public.admin_set_user_verification_v1(uuid,boolean,text) to authenticated;

create or replace function public.admin_review_verification_request_v1(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.verification_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(trim(p_reason), '');
  v_before_verified boolean;
begin
  if v_actor is null or not public.has_admin_permission(v_actor, 'verification.review') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  if v_decision = 'rejected' and coalesce(length(v_reason), 0) < 3 then
    raise exception 'rejection_reason_required';
  end if;

  select *
    into v_request
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'verification_request_not_found';
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object(
      'request_id', v_request.id,
      'user_id', v_request.user_id,
      'status', v_request.status,
      'changed', false
    );
  end if;

  select coalesce(is_verified, false)
    into v_before_verified
  from public.profiles
  where id = v_request.user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.verification_requests
  set status = v_decision,
      rejection_reason = case when v_decision = 'rejected' then v_reason else null end,
      reviewed_at = now(),
      reviewed_by = v_actor
  where id = v_request.id;

  if v_decision = 'approved' then
    update public.profiles
    set is_verified = true,
        updated_at = now()
    where id = v_request.user_id;
  end if;

  insert into public.notifications(user_id, type, title, body, data)
  values (
    v_request.user_id,
    'verification',
    case when v_decision = 'approved' then 'Verifikatsiya tasdiqlandi' else 'Verifikatsiya rad etildi' end,
    case
      when v_decision = 'approved' then 'Hisobingiz Alsamos tomonidan tasdiqlandi.'
      else v_reason
    end,
    jsonb_build_object('request_id', v_request.id, 'decision', v_decision)
  );

  perform public.admin_write_audit(
    'verification.request.' || v_decision,
    v_request.user_id,
    'verification_request',
    v_request.id::text,
    coalesce(v_reason, case when v_decision = 'approved' then 'Verification request approved' else 'Verification request rejected' end),
    jsonb_build_object(
      'status', v_request.status,
      'is_verified', v_before_verified
    ),
    jsonb_build_object(
      'status', v_decision,
      'is_verified', case when v_decision = 'approved' then true else v_before_verified end
    ),
    jsonb_build_object(
      'category', v_request.category,
      'full_name', v_request.full_name
    )
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'user_id', v_request.user_id,
    'status', v_decision,
    'is_verified', case when v_decision = 'approved' then true else v_before_verified end,
    'changed', true
  );
end;
$$;

revoke all on function public.admin_review_verification_request_v1(uuid,text,text) from public;
grant execute on function public.admin_review_verification_request_v1(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
