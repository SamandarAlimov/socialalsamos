-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260906090000_admin_control_center.sql
-- SHA256 0bf9818522340878e4056a86ba4990bf52b2e91f60f382ec653f91e8280881ac
-- ============================================================================
-- Alsamos Admin Control Center v3
-- Privacy-first user lifecycle, immutable audit, region aggregates and system health.
-- Auth identity mutations (email/ban/delete) remain server-only in admin-user-control.

create table if not exists public.user_account_controls (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended','banned','deactivated','deletion_pending')),
  reason text null,
  suspended_until timestamptz null,
  changed_by uuid null,
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_account_controls_status_idx
  on public.user_account_controls(status, updated_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  target_user_id uuid null,
  action text not null,
  entity_type text not null default 'user',
  entity_id text null,
  reason text null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_len check (char_length(action) between 2 and 96),
  constraint admin_audit_log_entity_type_len check (char_length(entity_type) between 2 and 64)
);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log(target_user_id, created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log(actor_id, created_at desc);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

create table if not exists public.admin_user_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  requested_by uuid not null,
  reason text not null,
  status text not null default 'requested' check (status in ('requested','auth_deleting','completed','failed','cancelled')),
  error_message text null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists admin_user_deletion_jobs_target_idx
  on public.admin_user_deletion_jobs(target_user_id, requested_at desc);

alter table public.user_account_controls enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_user_deletion_jobs enable row level security;

revoke all on table public.user_account_controls from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;
revoke all on table public.admin_user_deletion_jobs from anon, authenticated;

-- One compatibility gate for legacy admin + the newer role assignment system.
create or replace function public.admin_control_authorized(p_permission text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_user is null then
    return false;
  end if;

  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_user and ur.role = 'admin'
  ) then
    return true;
  end if;

  if to_regclass('public.admin_role_assignments') is not null then
    execute $q$
      select exists (
        select 1
        from public.admin_role_assignments a
        where a.user_id = $1
          and a.revoked_at is null
          and a.role_key = 'super_admin'
      )
    $q$ into v_allowed using v_user;
    if v_allowed then return true; end if;
  end if;

  if p_permission is not null
     and to_regclass('public.admin_role_assignments') is not null
     and to_regclass('public.admin_role_permissions') is not null then
    execute $q$
      select exists (
        select 1
        from public.admin_role_assignments a
        join public.admin_role_permissions rp on rp.role_key = a.role_key
        where a.user_id = $1
          and a.revoked_at is null
          and rp.permission_key in ($2, '*')
      )
    $q$ into v_allowed using v_user, p_permission;
  end if;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.admin_control_authorized(text) from public;
grant execute on function public.admin_control_authorized(text) to authenticated;

create or replace function public.admin_user_role_keys(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_roles text[] := '{}'::text[];
  v_new_roles text[] := '{}'::text[];
begin
  select coalesce(array_agg(distinct ur.role::text), '{}'::text[])
    into v_roles
  from public.user_roles ur
  where ur.user_id = p_user_id;

  if to_regclass('public.admin_role_assignments') is not null then
    execute $q$
      select coalesce(array_agg(distinct a.role_key::text), '{}'::text[])
      from public.admin_role_assignments a
      where a.user_id = $1 and a.revoked_at is null
    $q$ into v_new_roles using p_user_id;
  end if;

  return array(select distinct unnest(coalesce(v_roles,'{}'::text[]) || coalesce(v_new_roles,'{}'::text[])));
end;
$$;

revoke all on function public.admin_user_role_keys(uuid) from public;
grant execute on function public.admin_user_role_keys(uuid) to authenticated;

create or replace function public.admin_is_protected_user(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_protected boolean := false;
begin
  if p_user_id = auth.uid() then return true; end if;
  if to_regclass('public.admin_role_assignments') is not null then
    execute $q$
      select exists (
        select 1 from public.admin_role_assignments
        where user_id = $1 and revoked_at is null and role_key = 'super_admin'
      )
    $q$ into v_protected using p_user_id;
  end if;
  return coalesce(v_protected, false);
end;
$$;

revoke all on function public.admin_is_protected_user(uuid) from public;
grant execute on function public.admin_is_protected_user(uuid) to authenticated;

create or replace function public.admin_write_audit(
  p_action text,
  p_target_user_id uuid default null,
  p_entity_type text default 'user',
  p_entity_id text default null,
  p_reason text default null,
  p_before jsonb default '{}'::jsonb,
  p_after jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.admin_control_authorized(null) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.admin_audit_log(
    actor_id,target_user_id,action,entity_type,entity_id,reason,before_state,after_state,metadata
  ) values (
    auth.uid(),p_target_user_id,p_action,coalesce(nullif(trim(p_entity_type),''),'user'),p_entity_id,
    nullif(trim(p_reason),''),coalesce(p_before,'{}'::jsonb),coalesce(p_after,'{}'::jsonb),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_write_audit(text,uuid,text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.admin_write_audit(text,uuid,text,text,text,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.admin_list_users_v3(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  is_online boolean,
  last_seen timestamptz,
  country text,
  created_at timestamptz,
  followers_count bigint,
  following_count bigint,
  posts_count bigint,
  account_status text,
  status_reason text,
  suspended_until timestamptz,
  roles text[],
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized('admin.users.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.username::text,
    p.display_name::text,
    p.avatar_url::text,
    coalesce(p.is_verified,false),
    coalesce(p.is_online,false),
    p.last_seen,
    p.country::text,
    p.created_at,
    coalesce(p.followers_count,0)::bigint,
    coalesce(p.following_count,0)::bigint,
    coalesce(p.posts_count,0)::bigint,
    coalesce(c.status,'active')::text,
    c.reason::text,
    c.suspended_until,
    public.admin_user_role_keys(p.id),
    count(*) over()::bigint
  from public.profiles p
  left join public.user_account_controls c on c.user_id = p.id
  where (
    nullif(trim(p_search),'') is null
    or p.username ilike '%' || trim(p_search) || '%'
    or p.display_name ilike '%' || trim(p_search) || '%'
    or p.id::text = trim(p_search)
  )
  and (p_status is null or p_status = '' or coalesce(c.status,'active') = p_status)
  order by p.created_at desc nulls last
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.admin_list_users_v3(text,text,integer,integer) from public;
grant execute on function public.admin_list_users_v3(text,text,integer,integer) to authenticated;

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
    'profile', to_jsonb(p),
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

  if p_patch ? 'username' then
    v_username := nullif(lower(trim(p_patch->>'username')), '');
    if v_username is not null and v_username !~ '^[a-z0-9_]{3,30}$' then
      raise exception 'invalid_username';
    end if;
  end if;

  select to_jsonb(p) into v_before from public.profiles p where p.id = p_user_id for update;
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
  returning to_jsonb(p) into v_after;

  perform public.admin_write_audit(
    'user.profile.update',p_user_id,'user',p_user_id::text,p_reason,
    v_before - array['preferences','notification_preferences','email_filters','signatures'],
    v_after - array['preferences','notification_preferences','email_filters','signatures'],
    jsonb_build_object('fields', coalesce((select jsonb_agg(key) from jsonb_each(p_patch)), '[]'::jsonb))
  );
  return v_after;
end;
$$;

revoke all on function public.admin_update_user_profile_v3(uuid,jsonb,text) from public;
grant execute on function public.admin_update_user_profile_v3(uuid,jsonb,text) to authenticated;

create or replace function public.admin_set_user_account_status_v3(
  p_user_id uuid,
  p_status text,
  p_reason text,
  p_suspended_until timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.admin_control_authorized('admin.users.suspend') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended','banned','deactivated','deletion_pending') then
    raise exception 'invalid_status';
  end if;
  if p_status <> 'active' and nullif(trim(p_reason),'') is null then
    raise exception 'reason_required';
  end if;
  if public.admin_is_protected_user(p_user_id) and p_status <> 'active' then
    raise exception 'protected_user';
  end if;

  select to_jsonb(c) into v_before from public.user_account_controls c where c.user_id = p_user_id;
  insert into public.user_account_controls(user_id,status,reason,suspended_until,changed_by,changed_at,updated_at)
  values (p_user_id,p_status,nullif(trim(p_reason),''),p_suspended_until,auth.uid(),now(),now())
  on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    suspended_until = excluded.suspended_until,
    changed_by = excluded.changed_by,
    changed_at = now(),
    updated_at = now()
  returning to_jsonb(user_account_controls) into v_after;

  perform public.admin_write_audit(
    'user.account_status.' || p_status,p_user_id,'user',p_user_id::text,p_reason,
    coalesce(v_before,'{}'::jsonb),v_after,'{}'::jsonb
  );
  return v_after;
end;
$$;

revoke all on function public.admin_set_user_account_status_v3(uuid,text,text,timestamptz) from public;
grant execute on function public.admin_set_user_account_status_v3(uuid,text,text,timestamptz) to authenticated;

create or replace function public.admin_prepare_user_deletion_v3(p_user_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid;
begin
  if not public.admin_control_authorized('admin.users.delete') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if public.admin_is_protected_user(p_user_id) then raise exception 'protected_user'; end if;
  if not exists(select 1 from public.profiles where id = p_user_id) then raise exception 'user_not_found'; end if;

  insert into public.admin_user_deletion_jobs(target_user_id,requested_by,reason,status)
  values(p_user_id,auth.uid(),trim(p_reason),'requested') returning id into v_job;

  insert into public.user_account_controls(user_id,status,reason,changed_by,changed_at,updated_at)
  values(p_user_id,'deletion_pending',trim(p_reason),auth.uid(),now(),now())
  on conflict(user_id) do update set status='deletion_pending', reason=excluded.reason, changed_by=auth.uid(), changed_at=now(), updated_at=now();

  perform public.admin_write_audit('user.delete.requested',p_user_id,'user',p_user_id::text,p_reason,'{}'::jsonb,'{}'::jsonb,jsonb_build_object('job_id',v_job));
  return v_job;
end;
$$;

revoke all on function public.admin_prepare_user_deletion_v3(uuid,text) from public;
grant execute on function public.admin_prepare_user_deletion_v3(uuid,text) to authenticated;

create or replace function public.admin_finalize_user_deletion_v3(
  p_job_id uuid,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if not public.admin_control_authorized('admin.users.delete') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select target_user_id into v_target from public.admin_user_deletion_jobs where id = p_job_id;
  if v_target is null then raise exception 'job_not_found'; end if;

  update public.admin_user_deletion_jobs set
    status = case when p_success then 'completed' else 'failed' end,
    error_message = case when p_success then null else left(coalesce(p_error,'unknown_error'),1000) end,
    completed_at = case when p_success then now() else null end,
    updated_at = now()
  where id = p_job_id;

  if not p_success and exists(select 1 from public.profiles where id = v_target) then
    update public.user_account_controls set status='deactivated', updated_at=now() where user_id = v_target;
  end if;

  perform public.admin_write_audit(
    case when p_success then 'user.delete.completed' else 'user.delete.failed' end,
    v_target,'user',v_target::text,null,'{}'::jsonb,'{}'::jsonb,
    jsonb_build_object('job_id',p_job_id,'error',p_error)
  );
end;
$$;

revoke all on function public.admin_finalize_user_deletion_v3(uuid,boolean,text) from public;
grant execute on function public.admin_finalize_user_deletion_v3(uuid,boolean,text) to authenticated;

create or replace function public.admin_user_audit_v3(p_user_id uuid, p_limit integer default 50)
returns table(
  id uuid,
  actor_id uuid,
  action text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized('admin.audit.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select a.id,a.actor_id,a.action,a.reason,a.before_state,a.after_state,a.metadata,a.created_at
    from public.admin_audit_log a where a.target_user_id=p_user_id
    order by a.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.admin_user_audit_v3(uuid,integer) from public;
grant execute on function public.admin_user_audit_v3(uuid,integer) to authenticated;

create or replace function public.admin_recent_audit_v3(p_limit integer default 50)
returns table(
  id uuid,
  actor_id uuid,
  target_user_id uuid,
  action text,
  entity_type text,
  entity_id text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized('admin.audit.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query select a.id,a.actor_id,a.target_user_id,a.action,a.entity_type,a.entity_id,a.reason,a.metadata,a.created_at
    from public.admin_audit_log a order by a.created_at desc
    limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.admin_recent_audit_v3(integer) from public;
grant execute on function public.admin_recent_audit_v3(integer) to authenticated;

create or replace function public.admin_region_summary_v3()
returns table(
  country text,
  users_count bigint,
  online_count bigint,
  verified_count bigint,
  new_30d_count bigint,
  posts_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_control_authorized('admin.regions.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  select
    coalesce(nullif(trim(p.country),''),'Unknown')::text,
    count(*)::bigint,
    count(*) filter(where coalesce(p.is_online,false) and p.last_seen >= now()-interval '2 minutes')::bigint,
    count(*) filter(where coalesce(p.is_verified,false))::bigint,
    count(*) filter(where p.created_at >= now()-interval '30 days')::bigint,
    coalesce(sum(coalesce(p.posts_count,0)),0)::bigint
  from public.profiles p
  group by 1
  order by count(*) desc;
end;
$$;
revoke all on function public.admin_region_summary_v3() from public;
grant execute on function public.admin_region_summary_v3() to authenticated;

create or replace function public.admin_system_health_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.admin_control_authorized('admin.system.view') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'checked_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'online', (select count(*) from public.profiles where coalesce(is_online,false) and last_seen >= now()-interval '2 minutes'),
      'verified', (select count(*) from public.profiles where coalesce(is_verified,false)),
      'suspended', (select count(*) from public.user_account_controls where status='suspended'),
      'banned', (select count(*) from public.user_account_controls where status='banned'),
      'deletion_pending', (select count(*) from public.user_account_controls where status='deletion_pending')
    ),
    'content', jsonb_build_object(
      'posts', (select count(*) from public.posts),
      'comments', (select count(*) from public.comments)
    ),
    'mail', jsonb_build_object(
      'aliases', (select count(*) from public.mailbox_aliases),
      'scheduled_total', (select count(*) from public.scheduled_emails),
      'scheduled_pending', (select count(*) from public.scheduled_emails where status in ('pending','scheduled')),
      'scheduled_failed', (select count(*) from public.scheduled_emails where status='failed')
    ),
    'governance', jsonb_build_object(
      'audit_events_24h', (select count(*) from public.admin_audit_log where created_at >= now()-interval '24 hours'),
      'failed_deletions', (select count(*) from public.admin_user_deletion_jobs where status='failed'),
      'pending_deletions', (select count(*) from public.admin_user_deletion_jobs where status in ('requested','auth_deleting'))
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_system_health_v3() from public;
grant execute on function public.admin_system_health_v3() to authenticated;

-- Seed new permission keys into existing RBAC when that schema is available.
do $$
declare
  v_role text;
  v_permission text;
begin
  if to_regclass('public.admin_role_permissions') is null then return; end if;
  foreach v_role in array array['super_admin'] loop
    foreach v_permission in array array[
      'admin.users.view','admin.users.edit','admin.users.suspend','admin.users.delete','admin.users.email.manage',
      'admin.audit.view','admin.regions.view','admin.system.view'
    ] loop
      begin
        execute 'insert into public.admin_role_permissions(role_key,permission_key) values ($1,$2) on conflict do nothing'
          using v_role,v_permission;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
  end loop;
end;
$$;


-- ============================================================================
-- SOURCE B-web: 20260906091500_admin_control_center_hardening.sql
-- SHA256 6c06052e4bf5ed769b42252f7698946a12ba6a9e0577693f81995d3f91abc6e2
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260906092000_account_control_enforcement.sql
-- SHA256 7dd38a32fcd29903340731271bdee341e89727058c07ab381d211fe8876030c1
-- ============================================================================
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

-- Internal helpers are called only by SECURITY DEFINER admin RPCs. They should
-- not be discoverable as standalone privilege/role probes by normal users.
revoke execute on function public.admin_control_authorized(text) from authenticated;
revoke execute on function public.admin_user_role_keys(uuid) from authenticated;
revoke execute on function public.admin_is_protected_user(uuid) from authenticated;


-- ============================================================================
-- SOURCE B-web: 20260906113000_story_reel_publish_hardening.sql
-- SHA256 24b1e4c206b1c066e1e99258d61e31fe443ec999152b72f6445c029b2a735d4d
-- ============================================================================
-- =============================================================================
-- Story / Reel publishing hardening
--
-- Finalizes the unified Create pipeline after the post/story foundation:
--   * unpublished/scheduled posts are no longer visible through RLS;
--   * pending collaborators retain explicit preview access;
--   * Story drafts keep their linked post in `draft` until activation;
--   * Story activation publishes the linked post in the same transaction;
--   * Story deletion removes the complete linked DB graph transactionally.
--
-- This migration is intentionally idempotent and safe to re-apply through the
-- Lovable-managed Supabase migration runner.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Canonical post visibility: privacy + publication state in one helper.
-- -----------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        -- Owners can always inspect their own drafts/scheduled posts.
        p.user_id = auth.uid()

        -- A pending collaboration invite is an explicit owner-granted preview.
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status in ('pending', 'accepted')
        )

        -- Everyone else only sees content after it is actually published.
        or (
          coalesce(nullif(btrim(p.status), ''), 'published') = 'published'
          and (p.published_at is null or p.published_at <= now())
          and (
            coalesce(nullif(btrim(p.visibility), ''), 'public') = 'public'
            or (
              coalesce(nullif(btrim(p.visibility), ''), 'public') = 'friends'
              and auth.uid() is not null
              and exists (
                select 1
                from public.follows f
                where f.follower_id = auth.uid()
                  and f.following_id = p.user_id
              )
              and exists (
                select 1
                from public.follows f
                where f.follower_id = p.user_id
                  and f.following_id = auth.uid()
              )
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_view_post(uuid) from public;
grant execute on function public.can_view_post(uuid) to anon, authenticated;

-- Reassert the posts policy so every direct post read uses the canonical helper.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));

-- -----------------------------------------------------------------------------
-- 2. Story draft lifecycle: the linked post is a real draft until activation.
-- -----------------------------------------------------------------------------
create or replace function public.create_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_story_id uuid;
  v_post_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  v_result := public.publish_story_draft(p_payload);
  v_story_id := nullif(v_result ->> 'storyId', '')::uuid;
  v_post_id := nullif(v_result ->> 'postId', '')::uuid;

  if v_story_id is null or v_post_id is null then
    raise exception 'Story qoralama identifikatori qaytmadi';
  end if;

  update public.stories
  set is_active = false
  where id = v_story_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  update public.posts
  set status = 'draft',
      scheduled_at = null,
      published_at = null,
      updated_at = now()
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  if not found then
    raise exception 'Story post qoralamasi topilmadi';
  end if;

  return v_result;
end
$$;

revoke all on function public.create_story_draft(jsonb) from public, anon;
grant execute on function public.create_story_draft(jsonb) to authenticated;

create or replace function public.activate_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select s.post_id
    into v_post_id
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.user_id = auth.uid()
      and p.post_kind = 'story'
  ) then
    raise exception 'Story post topilmadi';
  end if;

  update public.posts
  set status = 'published',
      scheduled_at = null,
      published_at = now(),
      updated_at = now()
  where id = v_post_id
    and user_id = auth.uid();

  update public.stories
  set is_active = true,
      expires_at = now() + interval '24 hours'
  where id = p_story_id
    and user_id = auth.uid();

  return true;
end
$$;

revoke all on function public.activate_story_draft(uuid) from public, anon;
grant execute on function public.activate_story_draft(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Story delete: remove story + canonical post graph in one transaction.
--    Binary object deletion remains a media-service responsibility; this RPC
--    guarantees there are no orphan DB rows (post_media/stickers/polls/etc.).
-- -----------------------------------------------------------------------------
create or replace function public.delete_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_post_id uuid;
  v_storage_bucket text;
  v_storage_key text;
  v_media_url text;
begin
  if v_user_id is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select
    s.user_id,
    s.post_id,
    s.storage_bucket,
    s.storage_key,
    s.media_url
  into
    v_owner_id,
    v_post_id,
    v_storage_bucket,
    v_storage_key,
    v_media_url
  from public.stories s
  where s.id = p_story_id
  for update;

  if not found then
    -- Idempotent delete: already-removed story is a successful terminal state.
    return jsonb_build_object(
      'deleted', true,
      'storyId', p_story_id,
      'alreadyMissing', true
    );
  end if;

  if v_owner_id is distinct from v_user_id then
    raise exception 'Bu Storini o''chirish huquqi yo''q';
  end if;

  delete from public.stories
  where id = p_story_id
    and user_id = v_user_id;

  if v_post_id is not null then
    delete from public.posts
    where id = v_post_id
      and user_id = v_user_id
      and post_kind = 'story';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'storyId', p_story_id,
    'postId', v_post_id,
    'storageBucket', v_storage_bucket,
    'storageKey', v_storage_key,
    'mediaUrl', v_media_url
  );
end
$$;

revoke all on function public.delete_story(uuid) from public, anon;
grant execute on function public.delete_story(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Story reads: hidden drafts are owner-only; live linked stories inherit
--    the publication + privacy decision from can_view_post().
-- -----------------------------------------------------------------------------
drop policy if exists "Stories viewable by authenticated" on public.stories;
drop policy if exists "stories_select_visible" on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and expires_at > now()
      and (
        post_id is null
        or public.can_view_post(post_id)
      )
    )
  );

-- Retrieval indexes for the two main public surfaces.
create index if not exists posts_publish_state_visibility_idx
  on public.posts (status, visibility, published_at desc);

create index if not exists stories_live_expiry_idx
  on public.stories (expires_at desc, user_id)
  where is_active is distinct from false;

commit;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260906150000_restore_conversation_creation_rls.sql
-- SHA256 668b4e3729118567d074bde8d8bcb3bbf3e0073e555106e4616ecd77cf194139
-- ============================================================================
-- =============================================================================
-- Restore safe client conversation creation after RLS hardening
--
-- The web client creates a conversation first and then adds its participants.
-- A stricter conversations SELECT/INSERT policy made the first
-- `.insert(...).select()` fail before the creator could add themselves as a
-- participant, producing:
--   new row violates row-level security policy for table "conversations"
--
-- Keep RLS enabled and restore the intended bootstrap path without reopening
-- conversations globally:
--   * only the authenticated owner may create a conversation;
--   * the owner can see the row immediately so INSERT ... RETURNING works;
--   * only the owner may bootstrap participants directly;
--   * private conversations stay capped at two participants;
--   * blocked user pairs cannot be added to a private conversation;
--   * participants can read the participant list only for conversations they
--     belong to (needed for existing-DM discovery);
--   * failed bootstrap cleanup may delete only an owned conversation.
--
-- SECURITY DEFINER helpers avoid recursive RLS policy evaluation while always
-- binding authorization to auth.uid().
-- =============================================================================

begin;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;

-- True only when the current authenticated user owns or participates in the
-- requested conversation. No arbitrary user id is accepted, avoiding a
-- participant-membership side channel.
create or replace function public.is_my_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.conversations c
      where c.id = p_conversation_id
        and (
          c.owner_id = auth.uid()
          or exists (
            select 1
            from public.conversation_participants cp
            where cp.conversation_id = c.id
              and cp.user_id = auth.uid()
          )
        )
    );
$$;

-- The direct web bootstrap inserts both participant rows after creating the
-- conversation. Authorize that narrowly: the actor must own the conversation.
-- For a private DM, only one other user may be added and blocked pairs fail.
create or replace function public.can_owner_add_conversation_participant(
  p_conversation_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_type text;
  v_owner uuid;
  v_participant_count integer := 0;
  v_can_dm boolean := true;
begin
  if v_actor is null or p_target_user_id is null then
    return false;
  end if;

  select c.type, c.owner_id
    into v_type, v_owner
  from public.conversations c
  where c.id = p_conversation_id;

  if v_owner is null or v_owner <> v_actor then
    return false;
  end if;

  -- Group/channel owners keep their existing member-management bootstrap.
  if coalesce(v_type, 'private') <> 'private' then
    return true;
  end if;

  -- Re-inserting an existing participant is harmless from an authorization
  -- perspective (the UNIQUE constraint still prevents duplicates).
  if exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_target_user_id
  ) then
    return true;
  end if;

  select count(*)::integer
    into v_participant_count
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id;

  if v_participant_count >= 2 then
    return false;
  end if;

  if p_target_user_id <> v_actor then
    -- Batch-1 deployments expose can_dm_user(). Dynamic SQL keeps this
    -- compatibility migration safe on older Lovable snapshots as well.
    if to_regprocedure('public.can_dm_user(uuid,uuid)') is not null then
      execute 'select public.can_dm_user($1, $2)'
        into v_can_dm
        using v_actor, p_target_user_id;
    elsif to_regclass('public.user_blocks') is not null then
      execute $blocked$
        select not exists (
          select 1
          from public.user_blocks b
          where (b.blocker_id = $1 and b.blocked_user_id = $2)
             or (b.blocker_id = $2 and b.blocked_user_id = $1)
        )
      $blocked$
        into v_can_dm
        using v_actor, p_target_user_id;
    end if;
  end if;

  return coalesce(v_can_dm, false);
end;
$$;

revoke all on function public.is_my_conversation(uuid) from public;
revoke all on function public.can_owner_add_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_my_conversation(uuid) to authenticated;
grant execute on function public.can_owner_add_conversation_participant(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------

-- Replace the historical open INSERT policy with an owner-bound policy. The
-- explicit owner SELECT branch is important: PostgREST `.insert().select()`
-- must be able to return the newly-created row before participant rows exist.
drop policy if exists "Users can create conversations" on public.conversations;
drop policy if exists "conversations_insert_owner" on public.conversations;
create policy "conversations_insert_owner"
  on public.conversations
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

drop policy if exists "Users can view their conversations" on public.conversations;
drop policy if exists "conversations_select_member_or_owner" on public.conversations;
create policy "conversations_select_member_or_owner"
  on public.conversations
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_my_conversation(id)
  );

-- useMessages() best-effort cleanup deletes the just-created row if participant
-- bootstrap fails. Permit only the owner to perform that cleanup.
drop policy if exists "conversations_delete_owner" on public.conversations;
create policy "conversations_delete_owner"
  on public.conversations
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- conversation_participants
-- -----------------------------------------------------------------------------

-- Existing-DM discovery reads the other participant after first reading the
-- caller's conversation ids. Members therefore need the participant roster of
-- their own conversations, but nothing outside those conversations.
drop policy if exists "Participants can view participation" on public.conversation_participants;
drop policy if exists "conversation_participants_select_members" on public.conversation_participants;
create policy "conversation_participants_select_members"
  on public.conversation_participants
  for select
  to authenticated
  using (public.is_my_conversation(conversation_id));

-- The historical self-only INSERT policy cannot bootstrap the second DM user.
-- Replace it with the narrow owner helper above. Invite/join SECURITY DEFINER
-- RPCs remain unaffected by this client-facing policy.
drop policy if exists "Users can join conversations" on public.conversation_participants;
drop policy if exists "conversation_participants_insert_owner_bootstrap" on public.conversation_participants;
create policy "conversation_participants_insert_owner_bootstrap"
  on public.conversation_participants
  for insert
  to authenticated
  with check (
    public.can_owner_add_conversation_participant(conversation_id, user_id)
  );

commit;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260908131500_marketplace_review_media.sql
-- SHA256 935a21130f733920634180cf18de2e6339249a55a71e3e99a20b4ee87d308ce1
-- ============================================================================
-- Marketplace review media: verified buyers may attach up to 5 images/videos
-- to their own product review. Product authenticity is intentionally NOT
-- inferred from merchant verification; media is user-generated review proof.

CREATE TABLE IF NOT EXISTS public.product_review_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  url text NOT NULL CHECK (length(trim(url)) > 0),
  thumbnail_url text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 60)),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position < 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, position)
);

CREATE INDEX IF NOT EXISTS product_review_media_review_idx
  ON public.product_review_media(review_id, position);

CREATE INDEX IF NOT EXISTS product_review_media_user_idx
  ON public.product_review_media(user_id, created_at DESC);

ALTER TABLE public.product_review_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Review media is readable" ON public.product_review_media;
CREATE POLICY "Review media is readable"
ON public.product_review_media
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
  )
);

DROP POLICY IF EXISTS "Review owners can add media" ON public.product_review_media;
CREATE POLICY "Review owners can add media"
ON public.product_review_media
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Review owners can update media" ON public.product_review_media;
CREATE POLICY "Review owners can update media"
ON public.product_review_media
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.product_reviews r
    WHERE r.id = product_review_media.review_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Review owners can delete media" ON public.product_review_media;
CREATE POLICY "Review owners can delete media"
ON public.product_review_media
FOR DELETE
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.marketplace_check_review_media_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  media_count integer;
  video_count integer;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE media_type = 'video')::integer
  INTO media_count, video_count
  FROM public.product_review_media
  WHERE review_id = NEW.review_id
    AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF media_count >= 5 THEN
    RAISE EXCEPTION 'review_media_limit';
  END IF;

  IF NEW.media_type = 'video' AND video_count >= 1 THEN
    RAISE EXCEPTION 'review_video_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_review_media_limits ON public.product_review_media;
CREATE TRIGGER marketplace_review_media_limits
BEFORE INSERT OR UPDATE ON public.product_review_media
FOR EACH ROW EXECUTE FUNCTION public.marketplace_check_review_media_limits();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_review_media TO authenticated;
GRANT SELECT ON public.product_review_media TO anon;


-- ============================================================================
-- SOURCE B-web: 20260908143000_marketplace_international_logistics_v1.sql
-- SHA256 c5843e240edf7ae0ae294e84c84b18b01142b499aa9c9c53bfcfd462f7fb04e2
-- ============================================================================
-- International Logistics v1 for Alsamos Marketplace.
-- Separates commerce order state from physical shipment state so one order can
-- move through truck/air/sea/rail legs, export/import customs and last-mile delivery.

begin;

create table if not exists public.marketplace_carriers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  modes text[] not null default '{}'::text[],
  tracking_url_template text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_carriers (code, name, modes, is_active)
values (
  'ALSAMOS',
  'Alsamos Logistics',
  array['courier','truck','air','sea','rail','multimodal']::text[],
  true
)
on conflict (code) do update
set name = excluded.name,
    modes = excluded.modes,
    is_active = true,
    updated_at = now();

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_id uuid not null,
  carrier_id uuid references public.marketplace_carriers(id) on delete set null,
  carrier_name text,
  service_level text not null default 'standard',
  transport_mode text not null default 'multimodal'
    check (transport_mode in ('courier','truck','air','sea','rail','multimodal','pickup')),
  tracking_number text,
  status text not null default 'draft'
    check (status in (
      'draft','booked','handed_over','customs_export','in_transit','customs_import',
      'customs_hold','out_for_delivery','delivered','exception','cancelled'
    )),
  origin_country text,
  destination_country text,
  current_country text,
  current_location text,
  incoterm text not null default 'DAP' check (incoterm in ('DDP','DAP')),
  duties_payer text not null default 'buyer' check (duties_payer in ('buyer','seller','included')),
  declared_value numeric(18,2) not null default 0 check (declared_value >= 0),
  currency text not null default 'USD',
  customs_status text not null default 'not_required'
    check (customs_status in (
      'not_required','documents_required','export_review','export_cleared',
      'import_review','payment_required','hold','cleared','rejected'
    )),
  estimated_departure_at timestamptz,
  estimated_delivery_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipments_order_id_idx on public.shipments(order_id, created_at desc);
create index if not exists shipments_buyer_id_idx on public.shipments(buyer_id, created_at desc);
create index if not exists shipments_seller_id_idx on public.shipments(seller_id, created_at desc);
create index if not exists shipments_tracking_idx on public.shipments(tracking_number) where tracking_number is not null;

create table if not exists public.shipment_legs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  mode text not null check (mode in ('courier','truck','air','sea','rail','multimodal','pickup')),
  carrier_name text,
  tracking_number text,
  origin_name text,
  origin_country text,
  destination_name text,
  destination_country text,
  status text not null default 'planned'
    check (status in ('planned','booked','in_progress','completed','exception','cancelled')),
  estimated_departure_at timestamptz,
  estimated_arrival_at timestamptz,
  departed_at timestamptz,
  arrived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, position)
);

create index if not exists shipment_legs_shipment_idx on public.shipment_legs(shipment_id, position);

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  leg_id uuid references public.shipment_legs(id) on delete set null,
  status text not null,
  event_code text not null,
  title text not null,
  description text,
  location text,
  country_code text,
  occurred_at timestamptz not null default now(),
  is_public boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shipment_events_shipment_idx on public.shipment_events(shipment_id, occurred_at desc);

create table if not exists public.customs_declarations (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments(id) on delete cascade,
  hs_code text,
  origin_country text,
  destination_country text,
  declared_value numeric(18,2) not null default 0 check (declared_value >= 0),
  currency text not null default 'USD',
  invoice_number text,
  incoterm text not null default 'DAP' check (incoterm in ('DDP','DAP')),
  items jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  duty_amount numeric(18,2) not null default 0 check (duty_amount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  fees_amount numeric(18,2) not null default 0 check (fees_amount >= 0),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','estimated','required','paid','waived')),
  clearance_status text not null default 'draft'
    check (clearance_status in ('draft','submitted','review','hold','payment_required','cleared','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_carriers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_legs enable row level security;
alter table public.shipment_events enable row level security;
alter table public.customs_declarations enable row level security;

drop policy if exists marketplace_carriers_read on public.marketplace_carriers;
create policy marketplace_carriers_read
on public.marketplace_carriers for select
using (is_active = true);

drop policy if exists shipments_party_read on public.shipments;
create policy shipments_party_read
on public.shipments for select
to authenticated
using (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipments_seller_insert on public.shipments;
create policy shipments_seller_insert
on public.shipments for insert
to authenticated
with check (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipments_seller_update on public.shipments;
create policy shipments_seller_update
on public.shipments for update
to authenticated
using (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipment_legs_party_read on public.shipment_legs;
create policy shipment_legs_party_read
on public.shipment_legs for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = shipment_legs.shipment_id
      and (
        sh.buyer_id = auth.uid()
        or exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
      )
  )
);

drop policy if exists shipment_legs_seller_write on public.shipment_legs;
create policy shipment_legs_seller_write
on public.shipment_legs for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_legs.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_legs.shipment_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipment_events_party_read on public.shipment_events;
create policy shipment_events_party_read
on public.shipment_events for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = shipment_events.shipment_id
      and (
        exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
        or (sh.buyer_id = auth.uid() and shipment_events.is_public = true)
      )
  )
);

drop policy if exists shipment_events_seller_write on public.shipment_events;
create policy shipment_events_seller_write
on public.shipment_events for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_events.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_events.shipment_id and s.user_id = auth.uid()
  )
);

drop policy if exists customs_party_read on public.customs_declarations;
create policy customs_party_read
on public.customs_declarations for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = customs_declarations.shipment_id
      and (
        sh.buyer_id = auth.uid()
        or exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
      )
  )
);

drop policy if exists customs_seller_write on public.customs_declarations;
create policy customs_seller_write
on public.customs_declarations for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = customs_declarations.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = customs_declarations.shipment_id and s.user_id = auth.uid()
  )
);

create or replace function public.marketplace_create_shipment(
  _order_id uuid,
  _transport_mode text default 'multimodal',
  _service_level text default 'standard',
  _carrier_name text default 'Alsamos Logistics',
  _tracking_number text default null,
  _origin_country text default null,
  _destination_country text default null,
  _incoterm text default 'DAP',
  _estimated_delivery_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.orders%rowtype;
  _seller_user uuid;
  _shipment_id uuid;
  _carrier_id uuid;
  _mode text := lower(coalesce(nullif(trim(_transport_mode), ''), 'multimodal'));
  _term text := upper(coalesce(nullif(trim(_incoterm), ''), 'DAP'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into _order from public.orders where id = _order_id;
  if not found then raise exception 'order_not_found'; end if;

  select user_id into _seller_user from public.sellers where id = _order.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;
  if _order.status in ('cancelled','delivered') then raise exception 'order_finalized'; end if;
  if _mode not in ('courier','truck','air','sea','rail','multimodal','pickup') then raise exception 'invalid_transport_mode'; end if;
  if _term not in ('DDP','DAP') then raise exception 'invalid_incoterm'; end if;

  select id into _carrier_id from public.marketplace_carriers where code = 'ALSAMOS' limit 1;

  insert into public.shipments (
    order_id, seller_id, buyer_id, carrier_id, carrier_name, service_level,
    transport_mode, tracking_number, status, origin_country, destination_country,
    incoterm, duties_payer, declared_value, currency, customs_status,
    estimated_delivery_at
  ) values (
    _order.id,
    _order.seller_id,
    _order.buyer_id,
    _carrier_id,
    coalesce(nullif(trim(_carrier_name), ''), 'Alsamos Logistics'),
    coalesce(nullif(trim(_service_level), ''), 'standard'),
    _mode,
    nullif(trim(_tracking_number), ''),
    'booked',
    upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')),
    _term,
    case when _term = 'DDP' then 'included' else 'buyer' end,
    greatest(coalesce(_order.total, 0), 0),
    coalesce(_order.currency, 'USD'),
    case
      when nullif(trim(_origin_country), '') is not null
       and nullif(trim(_destination_country), '') is not null
       and upper(trim(_origin_country)) <> upper(trim(_destination_country))
      then 'documents_required'
      else 'not_required'
    end,
    _estimated_delivery_at
  ) returning id into _shipment_id;

  insert into public.shipment_legs (
    shipment_id, position, mode, carrier_name, tracking_number,
    origin_country, destination_country, status, estimated_arrival_at
  ) values (
    _shipment_id, 0, _mode, coalesce(nullif(trim(_carrier_name), ''), 'Alsamos Logistics'),
    nullif(trim(_tracking_number), ''), upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')), 'booked', _estimated_delivery_at
  );

  insert into public.shipment_events (
    shipment_id, status, event_code, title, description, country_code, occurred_at
  ) values (
    _shipment_id, 'booked', 'shipment_booked', 'Yetkazma yaratildi',
    'Sotuvchi transport va yo‘nalishni tayyorladi.', upper(nullif(trim(_origin_country), '')), now()
  );

  return jsonb_build_object('success', true, 'shipment_id', _shipment_id);
end;
$$;

create or replace function public.marketplace_add_shipment_event(
  _shipment_id uuid,
  _status text,
  _event_code text,
  _title text,
  _description text default null,
  _location text default null,
  _country_code text default null,
  _occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _shipment public.shipments%rowtype;
  _seller_user uuid;
  _next_status text := lower(trim(_status));
  _order_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into _shipment from public.shipments where id = _shipment_id;
  if not found then raise exception 'shipment_not_found'; end if;
  select user_id into _seller_user from public.sellers where id = _shipment.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;

  if _next_status not in (
    'draft','booked','handed_over','customs_export','in_transit','customs_import',
    'customs_hold','out_for_delivery','delivered','exception','cancelled'
  ) then raise exception 'invalid_shipment_status'; end if;

  update public.shipments
  set status = _next_status,
      current_location = coalesce(nullif(trim(_location), ''), current_location),
      current_country = coalesce(upper(nullif(trim(_country_code), '')), current_country),
      customs_status = case
        when _next_status = 'customs_export' then 'export_review'
        when _next_status = 'customs_import' then 'import_review'
        when _next_status = 'customs_hold' then 'hold'
        when _next_status = 'out_for_delivery' and customs_status in ('import_review','payment_required','hold') then 'cleared'
        else customs_status
      end,
      shipped_at = case when _next_status = 'handed_over' then coalesce(shipped_at, _occurred_at) else shipped_at end,
      delivered_at = case when _next_status = 'delivered' then coalesce(delivered_at, _occurred_at) else delivered_at end,
      updated_at = now()
  where id = _shipment_id;

  insert into public.shipment_events (
    shipment_id, status, event_code, title, description, location, country_code, occurred_at
  ) values (
    _shipment_id, _next_status, coalesce(nullif(trim(_event_code), ''), _next_status),
    coalesce(nullif(trim(_title), ''), _next_status), nullif(trim(_description), ''),
    nullif(trim(_location), ''), upper(nullif(trim(_country_code), '')), coalesce(_occurred_at, now())
  );

  select status into _order_status from public.orders where id = _shipment.order_id;
  if _next_status in ('handed_over','customs_export','in_transit','customs_import','customs_hold','out_for_delivery')
     and _order_status = 'processing' then
    perform public.marketplace_update_order_status(_shipment.order_id, 'shipped', 'shipment_handed_over');
  elsif _next_status = 'delivered' and _order_status = 'shipped' then
    perform public.marketplace_update_order_status(_shipment.order_id, 'delivered', 'shipment_delivered');
  end if;

  return jsonb_build_object('success', true, 'shipment_id', _shipment_id, 'status', _next_status);
end;
$$;

create or replace function public.marketplace_upsert_customs_declaration(
  _shipment_id uuid,
  _hs_code text default null,
  _origin_country text default null,
  _destination_country text default null,
  _declared_value numeric default 0,
  _currency text default 'USD',
  _invoice_number text default null,
  _incoterm text default 'DAP',
  _duty_amount numeric default 0,
  _tax_amount numeric default 0,
  _fees_amount numeric default 0,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _shipment public.shipments%rowtype;
  _seller_user uuid;
  _declaration_id uuid;
  _term text := upper(coalesce(nullif(trim(_incoterm), ''), 'DAP'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into _shipment from public.shipments where id = _shipment_id;
  if not found then raise exception 'shipment_not_found'; end if;
  select user_id into _seller_user from public.sellers where id = _shipment.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;
  if _term not in ('DDP','DAP') then raise exception 'invalid_incoterm'; end if;

  insert into public.customs_declarations (
    shipment_id, hs_code, origin_country, destination_country, declared_value,
    currency, invoice_number, incoterm, duty_amount, tax_amount, fees_amount,
    payment_status, clearance_status, notes
  ) values (
    _shipment_id, nullif(trim(_hs_code), ''), upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')), greatest(coalesce(_declared_value, 0), 0),
    coalesce(nullif(trim(_currency), ''), 'USD'), nullif(trim(_invoice_number), ''), _term,
    greatest(coalesce(_duty_amount, 0), 0), greatest(coalesce(_tax_amount, 0), 0),
    greatest(coalesce(_fees_amount, 0), 0),
    case when coalesce(_duty_amount, 0) + coalesce(_tax_amount, 0) + coalesce(_fees_amount, 0) > 0 then 'estimated' else 'not_required' end,
    'draft', nullif(trim(_notes), '')
  )
  on conflict (shipment_id) do update
  set hs_code = excluded.hs_code,
      origin_country = excluded.origin_country,
      destination_country = excluded.destination_country,
      declared_value = excluded.declared_value,
      currency = excluded.currency,
      invoice_number = excluded.invoice_number,
      incoterm = excluded.incoterm,
      duty_amount = excluded.duty_amount,
      tax_amount = excluded.tax_amount,
      fees_amount = excluded.fees_amount,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      updated_at = now()
  returning id into _declaration_id;

  update public.shipments
  set incoterm = _term,
      duties_payer = case when _term = 'DDP' then 'included' else 'buyer' end,
      customs_status = case when customs_status = 'not_required' then 'documents_required' else customs_status end,
      updated_at = now()
  where id = _shipment_id;

  return jsonb_build_object('success', true, 'declaration_id', _declaration_id);
end;
$$;

revoke all on function public.marketplace_create_shipment(uuid,text,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.marketplace_add_shipment_event(uuid,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.marketplace_upsert_customs_declaration(uuid,text,text,text,numeric,text,text,text,numeric,numeric,numeric,text) from public;

grant execute on function public.marketplace_create_shipment(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.marketplace_add_shipment_event(uuid,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.marketplace_upsert_customs_declaration(uuid,text,text,text,numeric,text,text,text,numeric,numeric,numeric,text) to authenticated;

grant select on public.marketplace_carriers to anon, authenticated;
grant select on public.shipments, public.shipment_legs, public.shipment_events, public.customs_declarations to authenticated;
grant insert, update, delete on public.shipments, public.shipment_legs, public.shipment_events, public.customs_declarations to authenticated;

commit;


-- ============================================================================
-- SOURCE B-web: 20260908144500_marketplace_restaurant_menu_checkout.sql
-- SHA256 32f6617418c1bd6a30702744e2d8aebd668677ba9362c988c1f4ec5a3226f88b
-- ============================================================================
-- Restaurant-aware marketplace products and pickup-safe checkout.
-- Keeps the latest variant-aware checkout semantics while adding a guarded
-- restaurant pickup mode and menu metadata used by the web UX.

alter table public.products
  add column if not exists is_food boolean not null default false,
  add column if not exists restaurant_category text,
  add column if not exists preparation_minutes integer,
  add column if not exists serving_label text,
  add column if not exists restaurant_options jsonb not null default '[]'::jsonb;

alter table public.products
  drop constraint if exists products_preparation_minutes_check;
alter table public.products
  add constraint products_preparation_minutes_check
  check (preparation_minutes is null or preparation_minutes between 1 and 240);

alter table public.products
  drop constraint if exists products_restaurant_options_array_check;
alter table public.products
  add constraint products_restaurant_options_array_check
  check (jsonb_typeof(restaurant_options) = 'array');

create index if not exists products_restaurant_menu_idx
  on public.products(seller_id, restaurant_category, created_at desc)
  where is_food = true and status = 'active';

create or replace function public.process_marketplace_order(
  _shipping_address jsonb,
  _payment_method text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user            uuid := auth.uid();
  v_cart_count      integer;
  v_item            record;
  v_group           record;
  v_order_id        uuid;
  v_order_ids       uuid[] := '{}';
  v_grand_total     numeric(14,2) := 0;
  v_payment_status  text;
  v_balance         numeric(14,2);
  v_receipt         text;
  v_currency        text := 'USD';
  v_is_pickup       boolean := coalesce(_shipping_address->>'fulfillment_type', 'delivery') = 'pickup';
  v_seller_count    integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _payment_method is null or _payment_method not in ('wallet', 'card_on_delivery', 'cash') then
    raise exception 'invalid_payment_method';
  end if;

  if _shipping_address is null
     or coalesce(_shipping_address->>'full_name', '') = ''
     or coalesce(_shipping_address->>'phone', '') = ''
     or coalesce(_shipping_address->>'street', '') = ''
     or coalesce(_shipping_address->>'city', '') = '' then
    raise exception 'invalid_shipping_address';
  end if;

  select count(*) into v_cart_count
  from public.cart_items
  where user_id = v_user;

  if v_cart_count = 0 then
    raise exception 'empty_cart';
  end if;

  -- Pickup is intentionally restricted to one restaurant per checkout so a
  -- generic client cannot zero-out delivery fees for ordinary marketplace goods.
  if v_is_pickup then
    select count(distinct p.seller_id)
      into v_seller_count
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.user_id = v_user;

    if v_seller_count <> 1
       or exists (
         select 1
           from public.cart_items ci
           join public.products p on p.id = ci.product_id
           join public.sellers s on s.id = p.seller_id
          where ci.user_id = v_user
            and coalesce(s.business_type, '') <> 'restaurant'
       ) then
      raise exception 'pickup_not_available';
    end if;
  end if;

  -- Validate and lock every line against oversell. Variant price/stock remains
  -- authoritative exactly as in the variant-aware checkout migration.
  for v_item in
    select ci.product_id,
           ci.product_variant_id,
           ci.quantity,
           coalesce(pv.price, p.price) as price,
           case when ci.product_variant_id is null then p.quantity else pv.quantity end as stock,
           p.status,
           p.currency,
           case when v_is_pickup then 0 else coalesce(p.shipping_price, 0) end as shipping_price,
           pv.id as variant_id,
           pv.is_active as variant_active
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
     where ci.user_id = v_user
     order by ci.product_id, ci.product_variant_id nulls first
       for update of p, pv
  loop
    if v_item.status <> 'active'
       or (
         v_item.product_variant_id is not null
         and (v_item.variant_id is null or coalesce(v_item.variant_active, false) = false)
       ) then
      raise exception 'product_unavailable';
    end if;

    if v_item.quantity < 1 then
      raise exception 'invalid_quantity';
    end if;

    if coalesce(v_item.stock, 0) < v_item.quantity then
      raise exception 'insufficient_stock';
    end if;

    v_currency := coalesce(v_item.currency, v_currency);
    v_grand_total := v_grand_total
                   + (v_item.price * v_item.quantity)
                   + (v_item.shipping_price * v_item.quantity);
  end loop;

  if _payment_method = 'wallet' then
    select balance into v_balance
      from public.wallets
     where user_id = v_user
       for update;

    if v_balance is null or v_balance < v_grand_total then
      raise exception 'insufficient_balance';
    end if;
  end if;

  v_payment_status := case when _payment_method = 'wallet' then 'paid' else 'pending' end;

  for v_group in
    select p.seller_id,
           sum(coalesce(pv.price, p.price) * ci.quantity) as subtotal,
           sum(
             case when v_is_pickup
               then 0
               else coalesce(p.shipping_price, 0) * ci.quantity
             end
           ) as shipping
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
     where ci.user_id = v_user
     group by p.seller_id
  loop
    v_receipt := case when v_payment_status = 'paid'
                      then public.marketplace_generate_receipt_number()
                      else null end;

    insert into public.orders (
      order_number, buyer_id, seller_id, status, payment_status, payment_method,
      subtotal, shipping_cost, total, currency, shipping_address, notes,
      receipt_number, paid_at
    ) values (
      public.marketplace_generate_order_number(), v_user, v_group.seller_id,
      'pending', v_payment_status, _payment_method,
      v_group.subtotal, v_group.shipping, v_group.subtotal + v_group.shipping,
      v_currency, _shipping_address, _notes,
      v_receipt,
      case when v_payment_status = 'paid' then now() else null end
    )
    returning id into v_order_id;

    v_order_ids := v_order_ids || v_order_id;

    insert into public.order_items (
      order_id, product_id, product_variant_id, variant_options,
      title, quantity, price, total
    )
    select
      v_order_id,
      p.id,
      ci.product_variant_id,
      coalesce(pv.options, '{}'::jsonb),
      p.title,
      ci.quantity,
      coalesce(pv.price, p.price),
      coalesce(pv.price, p.price) * ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
     where ci.user_id = v_user
       and p.seller_id = v_group.seller_id;

    if v_payment_status = 'paid' then
      insert into public.marketplace_payments (
        user_id, order_id, direction, amount, currency, method,
        status, receipt_number, metadata
      ) values (
        v_user, v_order_id, 'debit', v_group.subtotal + v_group.shipping, v_currency,
        _payment_method, 'succeeded', v_receipt,
        jsonb_build_object(
          'seller_id', v_group.seller_id,
          'fulfillment_type', case when v_is_pickup then 'pickup' else 'delivery' end
        )
      );
    end if;
  end loop;

  update public.product_variants pv
     set quantity = greatest(pv.quantity - ci.quantity, 0),
         updated_at = now()
    from public.cart_items ci
   where ci.product_variant_id = pv.id
     and ci.user_id = v_user;

  update public.products p
     set quantity = p.quantity - ci.quantity,
         status   = case when (p.quantity - ci.quantity) <= 0 then 'sold' else p.status end
    from public.cart_items ci
   where ci.product_id = p.id
     and ci.product_variant_id is null
     and ci.user_id = v_user;

  if v_payment_status = 'paid' then
    update public.wallets
       set balance = balance - v_grand_total,
           updated_at = now()
     where user_id = v_user
    returning balance into v_balance;

    update public.marketplace_payments
       set balance_after = v_balance
     where order_id = any(v_order_ids);
  end if;

  update public.sellers s
     set total_sales = coalesce(s.total_sales, 0) + 1
   where s.id in (select seller_id from public.orders where id = any(v_order_ids));

  delete from public.cart_items where user_id = v_user;

  return jsonb_build_object(
    'success', true,
    'order_ids', to_jsonb(v_order_ids),
    'payment_status', v_payment_status,
    'total', v_grand_total,
    'currency', v_currency,
    'fulfillment_type', case when v_is_pickup then 'pickup' else 'delivery' end
  );
end;
$$;

revoke all on function public.process_marketplace_order(jsonb, text, text) from public;
grant execute on function public.process_marketplace_order(jsonb, text, text) to authenticated;

