-- Admin Control Center hardening.
-- Keep detail payloads least-privilege and provide audited mailbox alias lifecycle controls.

create or replace function public.admin_get_user_details_v3(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.admin_control_authorized('admin.users.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'bio', p.bio,
      'website', p.website,
      'location', p.location,
      'country', p.country,
      'is_verified', coalesce(p.is_verified,false),
      'is_online', coalesce(p.is_online,false),
      'last_seen', p.last_seen,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ),
    'account', jsonb_build_object(
      'status', coalesce(c.status,'active'),
      'reason', c.reason,
      'suspended_until', c.suspended_until,
      'changed_at', c.changed_at,
      'roles', public.admin_user_role_keys(p.id),
      'protected', public.admin_is_protected_user(p.id)
    ),
    'counts', jsonb_build_object(
      'posts', (select count(*) from public.posts x where x.user_id = p.id),
      'comments', (select count(*) from public.comments x where x.user_id = p.id),
      'followers', (select count(*) from public.follows x where x.following_id = p.id),
      'following', (select count(*) from public.follows x where x.follower_id = p.id),
      'mailbox_aliases', (select count(*) from public.mailbox_aliases x where x.user_id = p.id),
      'scheduled_emails', (select count(*) from public.scheduled_emails x where x.user_id = p.id),
      'audit_events', (select count(*) from public.admin_audit_log x where x.target_user_id = p.id)
    )
  ) into v_result
  from public.profiles p
  left join public.user_account_controls c on c.user_id = p.id
  where p.id = p_user_id;

  return v_result;
end;
$$;

revoke all on function public.admin_get_user_details_v3(uuid) from public;
grant execute on function public.admin_get_user_details_v3(uuid) to authenticated;

create or replace function public.admin_update_user_profile_v3(
  p_user_id uuid,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_username text;
begin
  if not public.admin_control_authorized('admin.users.edit') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if p_patch is null then raise exception 'patch_required'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('display_name','username','bio','website','location','country','is_verified')) then
    raise exception 'field_not_allowed';
  end if;

  if p_patch ? 'username' then
    v_username := nullif(lower(trim(p_patch->>'username')), '');
    if v_username is not null and v_username !~ '^[a-z0-9_]{3,30}$' then
      raise exception 'invalid_username';
    end if;
  end if;

  select jsonb_build_object(
    'display_name',p.display_name,'username',p.username,'bio',p.bio,'website',p.website,
    'location',p.location,'country',p.country,'is_verified',coalesce(p.is_verified,false)
  ) into v_before
  from public.profiles p where p.id = p_user_id for update;
  if v_before is null then raise exception 'user_not_found'; end if;

  update public.profiles p set
    display_name = case when p_patch ? 'display_name' then nullif(trim(p_patch->>'display_name'),'') else p.display_name end,
    username = case when p_patch ? 'username' then v_username else p.username end,
    bio = case when p_patch ? 'bio' then nullif(trim(p_patch->>'bio'),'') else p.bio end,
    website = case when p_patch ? 'website' then nullif(trim(p_patch->>'website'),'') else p.website end,
    location = case when p_patch ? 'location' then nullif(trim(p_patch->>'location'),'') else p.location end,
    country = case when p_patch ? 'country' then nullif(trim(p_patch->>'country'),'') else p.country end,
    is_verified = case when p_patch ? 'is_verified' then coalesce((p_patch->>'is_verified')::boolean,false) else p.is_verified end,
    updated_at = now()
  where p.id = p_user_id
  returning jsonb_build_object(
    'id',p.id,'display_name',p.display_name,'username',p.username,'bio',p.bio,'website',p.website,
    'location',p.location,'country',p.country,'is_verified',coalesce(p.is_verified,false),'updated_at',p.updated_at
  ) into v_after;

  perform public.admin_write_audit(
    'user.profile.update',p_user_id,'user',p_user_id::text,p_reason,
    v_before,v_after,jsonb_build_object('fields', coalesce((select jsonb_agg(key) from jsonb_each(p_patch)), '[]'::jsonb))
  );
  return v_after;
end;
$$;

revoke all on function public.admin_update_user_profile_v3(uuid,jsonb,text) from public;
grant execute on function public.admin_update_user_profile_v3(uuid,jsonb,text) to authenticated;

create or replace function public.admin_list_mailbox_aliases_v3(p_user_id uuid)
returns table(alias text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized('admin.users.email.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select m.alias::text from public.mailbox_aliases m where m.user_id = p_user_id order by m.alias;
end;
$$;
revoke all on function public.admin_list_mailbox_aliases_v3(uuid) from public;
grant execute on function public.admin_list_mailbox_aliases_v3(uuid) to authenticated;

create or replace function public.admin_delete_mailbox_alias_v3(p_user_id uuid, p_alias text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean := false;
begin
  if not public.admin_control_authorized('admin.users.email.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if public.admin_is_protected_user(p_user_id) then raise exception 'protected_user'; end if;

  delete from public.mailbox_aliases
  where user_id = p_user_id and lower(alias) = lower(trim(p_alias));
  v_deleted := found;

  if v_deleted then
    perform public.admin_write_audit(
      'mailbox.alias.delete',p_user_id,'mailbox_alias',lower(trim(p_alias)),p_reason,
      jsonb_build_object('alias',lower(trim(p_alias))), '{}'::jsonb, '{}'::jsonb
    );
  end if;
  return v_deleted;
end;
$$;
revoke all on function public.admin_delete_mailbox_alias_v3(uuid,text,text) from public;
grant execute on function public.admin_delete_mailbox_alias_v3(uuid,text,text) to authenticated;