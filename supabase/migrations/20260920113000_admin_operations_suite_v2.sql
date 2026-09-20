-- Admin Operations Suite v2
-- Expands RBAC, incident response, internal notes, feature-flag governance,
-- and a unified operations snapshot for the Alsamos admin control plane.

insert into public.admin_permissions(key, category, label, description)
values
  ('admin.users.view', 'users', 'Users & Auth ko‘rish', 'Admin control center foydalanuvchi va auth metadata ko‘rish.'),
  ('admin.users.edit', 'users', 'Profilni tahrirlash', 'Whitelisted profil maydonlarini audit bilan tahrirlash.'),
  ('admin.users.suspend', 'users', 'Hisob holatini boshqarish', 'Suspend, ban va account lifecycle enforcement amallari.'),
  ('admin.users.delete', 'users', 'Hisobni o‘chirish', 'Himoyalangan deletion workflow orqali hisobni o‘chirish.'),
  ('admin.users.email.manage', 'users', 'Auth email boshqarish', 'Server-side Auth identity emailini boshqarish.'),
  ('admin.audit.view', 'admin', 'Control-center audit', 'Admin control center audit oqimini ko‘rish.'),
  ('admin.regions.view', 'analytics', 'Hududlar analitikasi', 'Maxfiylikka mos hudud agregatlarini ko‘rish.'),
  ('admin.system.view', 'admin', 'System holatini ko‘rish', 'System health, queue va governance holatini ko‘rish.'),
  ('admin.operations.view', 'admin', 'Operations markazini ko‘rish', 'Incident, security, feature flag va platform operations holatini ko‘rish.'),
  ('admin.incidents.view', 'security', 'Incidentlarni ko‘rish', 'Platform incident response yozuvlarini ko‘rish.'),
  ('admin.incidents.manage', 'security', 'Incidentlarni boshqarish', 'Incident yaratish, assign qilish va statusini yangilash.'),
  ('admin.feature_flags.view', 'admin', 'Feature flaglarni ko‘rish', 'Platform feature flag konfiguratsiyasini ko‘rish.'),
  ('admin.feature_flags.manage', 'admin', 'Feature flaglarni boshqarish', 'Rollout, platform va enable holatini audit bilan boshqarish.'),
  ('admin.notes.view', 'support', 'Ichki admin qaydlarini ko‘rish', 'Foydalanuvchi va entity bo‘yicha ichki admin qaydlarini ko‘rish.'),
  ('admin.notes.manage', 'support', 'Ichki admin qaydlarini boshqarish', 'Ichki qayd qo‘shish, pin qilish va o‘chirish.'),
  ('admin.security.view', 'security', 'Security operations ko‘rish', 'Login va rate-limit signallarini agregat ko‘rish.')
on conflict (key) do update
set category = excluded.category,
    label = excluded.label,
    description = excluded.description;

insert into public.admin_role_permissions(role_key, permission_key)
values
  ('support', 'admin.users.view'),
  ('support', 'admin.users.edit'),
  ('support', 'admin.users.email.manage'),
  ('support', 'admin.notes.view'),
  ('support', 'admin.notes.manage'),
  ('trust_safety', 'admin.users.view'),
  ('trust_safety', 'admin.users.edit'),
  ('trust_safety', 'admin.users.suspend'),
  ('trust_safety', 'admin.audit.view'),
  ('trust_safety', 'admin.operations.view'),
  ('trust_safety', 'admin.incidents.view'),
  ('trust_safety', 'admin.incidents.manage'),
  ('trust_safety', 'admin.notes.view'),
  ('trust_safety', 'admin.notes.manage'),
  ('security_analyst', 'admin.users.view'),
  ('security_analyst', 'admin.users.suspend'),
  ('security_analyst', 'admin.audit.view'),
  ('security_analyst', 'admin.system.view'),
  ('security_analyst', 'admin.operations.view'),
  ('security_analyst', 'admin.incidents.view'),
  ('security_analyst', 'admin.incidents.manage'),
  ('security_analyst', 'admin.feature_flags.view'),
  ('security_analyst', 'admin.security.view'),
  ('security_analyst', 'admin.notes.view'),
  ('analytics_viewer', 'admin.regions.view'),
  ('analytics_viewer', 'admin.system.view')
on conflict do nothing;

create table if not exists public.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','investigating','mitigated','resolved')),
  area text not null default 'platform',
  source text not null default 'manual',
  resolution_note text,
  created_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_incidents_title_len check (char_length(trim(title)) between 3 and 180),
  constraint admin_incidents_area_len check (char_length(trim(area)) between 2 and 64)
);

create index if not exists admin_incidents_status_created_idx
  on public.admin_incidents(status, created_at desc);
create index if not exists admin_incidents_severity_created_idx
  on public.admin_incidents(severity, created_at desc);
create index if not exists admin_incidents_assigned_open_idx
  on public.admin_incidents(assigned_to, created_at desc)
  where status <> 'resolved';

alter table public.admin_incidents enable row level security;

drop policy if exists "RBAC admins can view incidents" on public.admin_incidents;
create policy "RBAC admins can view incidents"
on public.admin_incidents for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()), 'admin.incidents.view'))
  or (select public.has_admin_permission((select auth.uid()), 'admin.incidents.manage'))
);

drop policy if exists "RBAC admins can manage incidents" on public.admin_incidents;
create policy "RBAC admins can manage incidents"
on public.admin_incidents for all to authenticated
using ((select public.has_admin_permission((select auth.uid()), 'admin.incidents.manage')))
with check ((select public.has_admin_permission((select auth.uid()), 'admin.incidents.manage')));

grant select on public.admin_incidents to authenticated;

create table if not exists public.admin_entity_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_entity_notes_type_len check (char_length(trim(entity_type)) between 2 and 64),
  constraint admin_entity_notes_id_len check (char_length(trim(entity_id)) between 1 and 180),
  constraint admin_entity_notes_body_len check (char_length(trim(body)) between 2 and 4000)
);

create index if not exists admin_entity_notes_entity_idx
  on public.admin_entity_notes(entity_type, entity_id, pinned desc, created_at desc);
create index if not exists admin_entity_notes_created_by_idx
  on public.admin_entity_notes(created_by, created_at desc);

alter table public.admin_entity_notes enable row level security;

drop policy if exists "RBAC admins can view entity notes" on public.admin_entity_notes;
create policy "RBAC admins can view entity notes"
on public.admin_entity_notes for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()), 'admin.notes.view'))
  or (select public.has_admin_permission((select auth.uid()), 'admin.notes.manage'))
);

drop policy if exists "RBAC admins can manage entity notes" on public.admin_entity_notes;
create policy "RBAC admins can manage entity notes"
on public.admin_entity_notes for all to authenticated
using ((select public.has_admin_permission((select auth.uid()), 'admin.notes.manage')))
with check ((select public.has_admin_permission((select auth.uid()), 'admin.notes.manage')));

grant select on public.admin_entity_notes to authenticated;

create table if not exists public.admin_feature_flag_history (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_feature_flag_history_key_idx
  on public.admin_feature_flag_history(flag_key, created_at desc);

alter table public.admin_feature_flag_history enable row level security;

drop policy if exists "RBAC admins can view feature flag history" on public.admin_feature_flag_history;
create policy "RBAC admins can view feature flag history"
on public.admin_feature_flag_history for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.view'))
  or (select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.manage'))
);

grant select on public.admin_feature_flag_history to authenticated;

alter table public.feature_flags enable row level security;

drop policy if exists "RBAC admins can view feature flags" on public.feature_flags;
create policy "RBAC admins can view feature flags"
on public.feature_flags for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.view'))
  or (select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.manage'))
);

drop policy if exists "RBAC admins can manage feature flags" on public.feature_flags;
create policy "RBAC admins can manage feature flags"
on public.feature_flags for all to authenticated
using ((select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.manage')))
with check ((select public.has_admin_permission((select auth.uid()), 'admin.feature_flags.manage')));

grant select on public.feature_flags to authenticated;

create or replace function public.admin_operations_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or not (
    public.admin_control_authorized('admin.operations.view')
    or public.admin_control_authorized('admin.system.view')
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'queues', jsonb_build_object(
      'verification_pending', (select count(*) from public.verification_requests where status = 'pending'),
      'reports_open', (select count(*) from public.reports where coalesce(status, 'pending') in ('pending','reviewing')),
      'incidents_open', (select count(*) from public.admin_incidents where status <> 'resolved'),
      'incidents_critical', (select count(*) from public.admin_incidents where status <> 'resolved' and severity = 'critical')
    ),
    'security', jsonb_build_object(
      'failed_logins_24h', (
        select count(*) from public.auth_login_attempts
        where created_at >= now() - interval '24 hours'
          and lower(coalesce(outcome,'')) not in ('success','succeeded','ok')
      ),
      'rate_limit_events_24h', (
        select count(*) from public.rate_limit_events
        where created_at >= now() - interval '24 hours'
      ),
      'suspended_accounts', (
        select count(*) from public.user_account_controls where status = 'suspended'
      ),
      'banned_accounts', (
        select count(*) from public.user_account_controls where status = 'banned'
      )
    ),
    'governance', jsonb_build_object(
      'audit_events_24h', (
        select count(*) from public.admin_audit_log where created_at >= now() - interval '24 hours'
      ),
      'feature_flags_total', (select count(*) from public.feature_flags),
      'feature_flags_enabled', (select count(*) from public.feature_flags where enabled)
    ),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
        x.created_at desc
      )
      from (
        select
          i.id, i.title, i.summary, i.severity, i.status, i.area, i.source,
          i.resolution_note, i.created_by, i.assigned_to, i.created_at, i.updated_at, i.resolved_at,
          creator.username as created_by_username,
          assignee.username as assigned_to_username,
          assignee.display_name as assigned_to_name
        from public.admin_incidents i
        left join public.profiles creator on creator.id = i.created_by
        left join public.profiles assignee on assignee.id = i.assigned_to
        order by i.created_at desc
        limit 80
      ) x
    ), '[]'::jsonb),
    'feature_flags', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.key)
      from (
        select key, description, enabled, min_version, platforms, rollout_percentage, updated_at, updated_by
        from public.feature_flags
      ) f
    ), '[]'::jsonb),
    'feature_flag_history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.created_at desc)
      from (
        select fh.id, fh.flag_key, fh.changed_by, fh.before_state, fh.after_state, fh.reason, fh.created_at,
               p.username as changed_by_username
        from public.admin_feature_flag_history fh
        left join public.profiles p on p.id = fh.changed_by
        order by fh.created_at desc
        limit 40
      ) h
    ), '[]'::jsonb),
    'recent_audit', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select al.id, al.actor_id, al.target_user_id, al.action, al.entity_type, al.entity_id,
               al.reason, al.metadata, al.created_at,
               p.username as actor_username, p.display_name as actor_name
        from public.admin_audit_log al
        left join public.profiles p on p.id = al.actor_id
        order by al.created_at desc
        limit 60
      ) a
    ), '[]'::jsonb),
    'rate_limit_scopes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.event_count desc)
      from (
        select scope, count(*) as event_count
        from public.rate_limit_events
        where created_at >= now() - interval '24 hours'
        group by scope
        order by count(*) desc
        limit 12
      ) r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_operations_snapshot_v1() from public, anon;
grant execute on function public.admin_operations_snapshot_v1() to authenticated;

create or replace function public.admin_create_incident_v1(
  p_title text,
  p_summary text default null,
  p_severity text default 'medium',
  p_area text default 'platform',
  p_assigned_to uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.admin_control_authorized('admin.incidents.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title,''))) < 3 then raise exception 'title_required'; end if;
  if lower(coalesce(p_severity,'')) not in ('low','medium','high','critical') then raise exception 'invalid_severity'; end if;

  insert into public.admin_incidents(
    title, summary, severity, area, created_by, assigned_to, metadata
  ) values (
    trim(p_title), nullif(trim(p_summary),''), lower(p_severity),
    coalesce(nullif(trim(p_area),''),'platform'), v_actor, p_assigned_to, coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  perform public.admin_write_audit(
    'operations.incident.create', null, 'admin_incident', v_id::text,
    'Incident created',
    '{}'::jsonb,
    (select to_jsonb(i) from public.admin_incidents i where i.id = v_id),
    jsonb_build_object('severity', lower(p_severity), 'area', coalesce(nullif(trim(p_area),''),'platform'))
  );

  return v_id;
end;
$$;

revoke all on function public.admin_create_incident_v1(text,text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.admin_create_incident_v1(text,text,text,text,uuid,jsonb) to authenticated;

create or replace function public.admin_update_incident_v1(
  p_incident_id uuid,
  p_status text default null,
  p_severity text default null,
  p_assigned_to uuid default null,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.admin_incidents%rowtype;
  v_after public.admin_incidents%rowtype;
  v_status text := nullif(lower(trim(p_status)), '');
  v_severity text := nullif(lower(trim(p_severity)), '');
begin
  if v_actor is null or not public.admin_control_authorized('admin.incidents.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('open','investigating','mitigated','resolved') then raise exception 'invalid_status'; end if;
  if v_severity is not null and v_severity not in ('low','medium','high','critical') then raise exception 'invalid_severity'; end if;

  select * into v_before from public.admin_incidents where id = p_incident_id for update;
  if not found then raise exception 'incident_not_found'; end if;

  update public.admin_incidents
  set status = coalesce(v_status, status),
      severity = coalesce(v_severity, severity),
      assigned_to = coalesce(p_assigned_to, assigned_to),
      resolution_note = case when p_resolution_note is not null then nullif(trim(p_resolution_note),'') else resolution_note end,
      resolved_at = case
        when coalesce(v_status, status) = 'resolved' then coalesce(resolved_at, now())
        when v_status is not null and v_status <> 'resolved' then null
        else resolved_at
      end,
      updated_at = now()
  where id = p_incident_id
  returning * into v_after;

  perform public.admin_write_audit(
    'operations.incident.update', null, 'admin_incident', p_incident_id::text,
    coalesce(nullif(trim(p_resolution_note),''), 'Incident updated'),
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('status', v_after.status, 'severity', v_after.severity)
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.admin_update_incident_v1(uuid,text,text,uuid,text) from public, anon;
grant execute on function public.admin_update_incident_v1(uuid,text,text,uuid,text) to authenticated;

create or replace function public.admin_set_feature_flag_v1(
  p_key text,
  p_enabled boolean,
  p_rollout_percentage integer default 100,
  p_description text default null,
  p_platforms text[] default null,
  p_min_version text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb := '{}'::jsonb;
  v_after jsonb;
  v_key text := lower(trim(coalesce(p_key,'')));
begin
  if v_actor is null or not public.admin_control_authorized('admin.feature_flags.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_key !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then raise exception 'invalid_flag_key'; end if;
  if p_rollout_percentage < 0 or p_rollout_percentage > 100 then raise exception 'invalid_rollout_percentage'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;

  select to_jsonb(f) into v_before
  from public.feature_flags f
  where f.key = v_key
  for update;
  v_before := coalesce(v_before, '{}'::jsonb);

  insert into public.feature_flags(
    key, description, enabled, min_version, platforms, rollout_percentage, updated_at, updated_by
  ) values (
    v_key, nullif(trim(p_description),''), coalesce(p_enabled,false), nullif(trim(p_min_version),''),
    coalesce(p_platforms,'{}'::text[]), p_rollout_percentage, now(), v_actor
  )
  on conflict (key) do update
  set description = coalesce(excluded.description, public.feature_flags.description),
      enabled = excluded.enabled,
      min_version = case when p_min_version is null then public.feature_flags.min_version else excluded.min_version end,
      platforms = case when p_platforms is null then public.feature_flags.platforms else excluded.platforms end,
      rollout_percentage = excluded.rollout_percentage,
      updated_at = now(),
      updated_by = v_actor;

  select to_jsonb(f) into v_after from public.feature_flags f where f.key = v_key;

  insert into public.admin_feature_flag_history(flag_key, changed_by, before_state, after_state, reason)
  values (v_key, v_actor, v_before, v_after, trim(p_reason));

  perform public.admin_write_audit(
    'operations.feature_flag.set', null, 'feature_flag', v_key, trim(p_reason),
    v_before, v_after,
    jsonb_build_object('rollout_percentage', p_rollout_percentage)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_set_feature_flag_v1(text,boolean,integer,text,text[],text,text) from public, anon;
grant execute on function public.admin_set_feature_flag_v1(text,boolean,integer,text,text[],text,text) to authenticated;

create or replace function public.admin_list_entity_notes_v1(
  p_entity_type text,
  p_entity_id text,
  p_limit integer default 50
)
returns table(
  id uuid,
  body text,
  pinned boolean,
  created_by uuid,
  created_by_username text,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    public.admin_control_authorized('admin.notes.view')
    or public.admin_control_authorized('admin.notes.manage')
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select n.id, n.body, n.pinned, n.created_by,
         p.username, p.display_name, n.created_at, n.updated_at
  from public.admin_entity_notes n
  left join public.profiles p on p.id = n.created_by
  where n.entity_type = trim(p_entity_type)
    and n.entity_id = trim(p_entity_id)
  order by n.pinned desc, n.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;

revoke all on function public.admin_list_entity_notes_v1(text,text,integer) from public, anon;
grant execute on function public.admin_list_entity_notes_v1(text,text,integer) to authenticated;

create or replace function public.admin_add_entity_note_v1(
  p_entity_type text,
  p_entity_id text,
  p_body text,
  p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.admin_control_authorized('admin.notes.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body,''))) < 2 then raise exception 'note_required'; end if;

  insert into public.admin_entity_notes(entity_type, entity_id, body, pinned, created_by)
  values (trim(p_entity_type), trim(p_entity_id), trim(p_body), coalesce(p_pinned,false), v_actor)
  returning id into v_id;

  perform public.admin_write_audit(
    'operations.note.add', null, 'admin_note', v_id::text, 'Internal note added',
    '{}'::jsonb,
    jsonb_build_object('entity_type', trim(p_entity_type), 'entity_id', trim(p_entity_id), 'pinned', coalesce(p_pinned,false)),
    '{}'::jsonb
  );

  return v_id;
end;
$$;

revoke all on function public.admin_add_entity_note_v1(text,text,text,boolean) from public, anon;
grant execute on function public.admin_add_entity_note_v1(text,text,text,boolean) to authenticated;

create or replace function public.admin_delete_entity_note_v1(
  p_note_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.admin_entity_notes%rowtype;
begin
  if v_actor is null or not public.admin_control_authorized('admin.notes.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;

  select * into v_before from public.admin_entity_notes where id = p_note_id for update;
  if not found then return false; end if;

  delete from public.admin_entity_notes where id = p_note_id;

  perform public.admin_write_audit(
    'operations.note.delete', null, 'admin_note', p_note_id::text, trim(p_reason),
    to_jsonb(v_before), '{}'::jsonb,
    jsonb_build_object('entity_type', v_before.entity_type, 'entity_id', v_before.entity_id)
  );

  return true;
end;
$$;

revoke all on function public.admin_delete_entity_note_v1(uuid,text) from public, anon;
grant execute on function public.admin_delete_entity_note_v1(uuid,text) to authenticated;

notify pgrst, 'reload schema';
