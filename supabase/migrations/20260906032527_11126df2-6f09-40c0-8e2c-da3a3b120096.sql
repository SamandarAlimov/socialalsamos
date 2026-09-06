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