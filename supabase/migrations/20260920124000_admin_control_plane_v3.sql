-- Alsamos Admin Control Plane v3
-- Trust & Safety cases, RBAC matrix governance, admin notifications,
-- queue/system health, audit diff and privacy-safe session/device security.

alter table public.admin_permissions
  add column if not exists risk_level text not null default 'medium'
  check (risk_level in ('low','medium','high','critical'));

insert into public.admin_permissions(key, category, label, description, risk_level)
values
  ('admin.trust_safety.view', 'trust_safety', 'Trust & Safety markazini ko‘rish', 'Universal report, case, evidence, decision va appeal queue’larini ko‘rish.', 'high'),
  ('admin.trust_safety.manage', 'trust_safety', 'Trust & Safety case’larini boshqarish', 'Case yaratish, triage, decision va enforcement rejasini boshqarish.', 'critical'),
  ('admin.notifications.view', 'admin', 'Admin bildirishnomalarini ko‘rish', 'Admin control-plane bildirishnomalarini ko‘rish va read state yuritish.', 'low'),
  ('admin.rbac.matrix.manage', 'admin', 'RBAC permission matrixini boshqarish', 'Role-permission matrixini o‘zgartirish. Super admin bilan cheklangan.', 'critical'),
  ('admin.security.manage', 'security', 'Security device trust boshqaruvi', 'Alsamos device trust holatini bekor qilish va security boshqaruv amallarini bajarish.', 'critical')
on conflict (key) do update
set category = excluded.category,
    label = excluded.label,
    description = excluded.description,
    risk_level = excluded.risk_level;

update public.admin_permissions
set risk_level = case
  when key in ('admin.roles.manage','admin.users.delete','admin.users.email.manage','payments.manage','wallets.manage','security.lock') then 'critical'
  when key in ('reports.review','appeals.review','content.moderate','admin.incidents.manage','admin.feature_flags.manage','admin.users.suspend') then 'high'
  when category in ('security','trust_safety','finance') then 'high'
  when category in ('admin','users','content','marketplace','ads') then 'medium'
  else 'low'
end
where risk_level = 'medium';

insert into public.admin_role_permissions(role_key, permission_key)
values
  ('trust_safety', 'admin.trust_safety.view'),
  ('trust_safety', 'admin.trust_safety.manage'),
  ('trust_safety', 'admin.notifications.view'),
  ('security_analyst', 'admin.notifications.view'),
  ('security_analyst', 'admin.security.manage'),
  ('support', 'admin.notifications.view'),
  ('analytics_viewer', 'admin.notifications.view')
on conflict do nothing;

create table if not exists public.reports_v2 (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text not null,
  reason_code text not null,
  subreason_code text,
  description text,
  source_surface text,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  status text not null default 'open'
    check (status in ('open','in_review','resolved','dismissed')),
  legacy_source text,
  legacy_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_v2_target_type_len check (char_length(trim(target_type)) between 2 and 64),
  constraint reports_v2_target_id_len check (char_length(trim(target_id)) between 1 and 180),
  constraint reports_v2_reason_len check (char_length(trim(reason_code)) between 2 and 96)
);

create unique index if not exists reports_v2_legacy_unique_idx
  on public.reports_v2(legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;
create index if not exists reports_v2_queue_idx
  on public.reports_v2(status, priority, created_at desc);
create index if not exists reports_v2_target_idx
  on public.reports_v2(target_type, target_id, created_at desc);
create index if not exists reports_v2_reporter_idx
  on public.reports_v2(reporter_id, created_at desc);

create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  case_type text not null default 'report_review',
  subject_type text not null,
  subject_id text not null,
  title text not null,
  summary text,
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  status text not null default 'open'
    check (status in ('open','investigating','pending_action','resolved','dismissed')),
  assigned_team text not null default 'trust_safety',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  policy_code text,
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint moderation_cases_title_len check (char_length(trim(title)) between 3 and 180)
);

create index if not exists moderation_cases_queue_idx
  on public.moderation_cases(status, priority, due_at, opened_at desc);
create index if not exists moderation_cases_subject_idx
  on public.moderation_cases(subject_type, subject_id, opened_at desc);
create index if not exists moderation_cases_assignee_idx
  on public.moderation_cases(assigned_admin_id, status, opened_at desc);

create table if not exists public.moderation_case_reports (
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  report_id uuid not null references public.reports_v2(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (case_id, report_id)
);
create index if not exists moderation_case_reports_report_idx
  on public.moderation_case_reports(report_id, linked_at desc);

create table if not exists public.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  evidence_type text not null default 'snapshot',
  object_type text not null,
  object_id text not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  media_reference text,
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists moderation_evidence_case_idx
  on public.moderation_evidence(case_id, captured_at desc);

create table if not exists public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  decision text not null
    check (decision in ('no_violation','violation','needs_more_info','escalate')),
  policy_code text,
  rationale text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint moderation_decisions_rationale_len check (char_length(trim(rationale)) between 3 and 4000)
);
create index if not exists moderation_decisions_case_idx
  on public.moderation_decisions(case_id, created_at desc);

create table if not exists public.enforcement_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.moderation_cases(id) on delete set null,
  target_type text not null,
  target_id text not null,
  action_type text not null
    check (action_type in (
      'warning','remove_content','feature_limit','temporary_suspend',
      'permanent_disable','demonetize','age_restrict'
    )),
  status text not null default 'pending_execution'
    check (status in ('pending_execution','executing','applied','failed','reverted')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists enforcement_actions_queue_idx
  on public.enforcement_actions(status, created_at desc);
create index if not exists enforcement_actions_target_idx
  on public.enforcement_actions(target_type, target_id, created_at desc);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  enforcement_action_id uuid not null references public.enforcement_actions(id) on delete cascade,
  appellant_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open','in_review','upheld','overturned','modified','closed')),
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint appeals_reason_len check (char_length(trim(reason)) between 3 and 4000)
);
create index if not exists appeals_queue_idx
  on public.appeals(status, created_at desc);
create index if not exists appeals_assignee_idx
  on public.appeals(assigned_admin_id, status, created_at desc);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  target_role_key text references public.admin_roles(key) on update cascade on delete cascade,
  kind text not null default 'info',
  severity text not null default 'info'
    check (severity in ('info','warning','high','critical')),
  title text not null,
  body text,
  action_url text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint admin_notifications_title_len check (char_length(trim(title)) between 2 and 180)
);
create index if not exists admin_notifications_user_idx
  on public.admin_notifications(user_id, created_at desc);
create index if not exists admin_notifications_role_idx
  on public.admin_notifications(target_role_key, created_at desc);
create index if not exists admin_notifications_created_idx
  on public.admin_notifications(created_at desc);

create table if not exists public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists admin_notification_reads_user_idx
  on public.admin_notification_reads(user_id, read_at desc);

alter table public.reports_v2 enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_case_reports enable row level security;
alter table public.moderation_evidence enable row level security;
alter table public.moderation_decisions enable row level security;
alter table public.enforcement_actions enable row level security;
alter table public.appeals enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'reports_v2','moderation_cases','moderation_case_reports','moderation_evidence',
    'moderation_decisions','enforcement_actions','appeals'
  ]
  loop
    execute format('drop policy if exists "RBAC trust safety read" on public.%I', t);
    execute format(
      'create policy "RBAC trust safety read" on public.%I for select to authenticated using (' ||
      '(select public.has_admin_permission((select auth.uid()), ''admin.trust_safety.view'')) ' ||
      'or (select public.has_admin_permission((select auth.uid()), ''reports.view'')) ' ||
      'or (select public.has_admin_permission((select auth.uid()), ''reports.review''))' ||
      ')', t
    );
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "Admin notifications own or role read" on public.admin_notifications;
create policy "Admin notifications own or role read"
on public.admin_notifications for select to authenticated
using (
  (select public.is_admin_staff((select auth.uid())))
  and (
    user_id = (select auth.uid())
    or (
      user_id is null
      and (
        target_role_key is null
        or exists (
          select 1
          from public.admin_role_assignments a
          where a.user_id = (select auth.uid())
            and a.role_key = admin_notifications.target_role_key
            and a.revoked_at is null
        )
        or (select public.has_admin_role((select auth.uid()), 'super_admin'))
      )
    )
  )
);

drop policy if exists "Admin notification reads own" on public.admin_notification_reads;
create policy "Admin notification reads own"
on public.admin_notification_reads for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.admin_notifications, public.admin_notification_reads to authenticated;

insert into public.reports_v2(
  reporter_id,target_type,target_id,reason_code,description,source_surface,
  priority,status,legacy_source,legacy_id,created_at,resolved_at
)
select
  r.reporter_id,
  case when r.post_id is not null then 'post' else 'user' end,
  coalesce(r.post_id::text, r.user_id::text),
  r.reason,
  r.description,
  'legacy_reports',
  case when r.reason in ('violence','harassment','nsfw') then 'high' else 'normal' end,
  case coalesce(r.status,'pending')
    when 'reviewing' then 'in_review'
    when 'resolved' then 'resolved'
    when 'dismissed' then 'dismissed'
    else 'open'
  end,
  'reports',
  r.id,
  coalesce(r.created_at, now()),
  case when r.status in ('resolved','dismissed') then r.reviewed_at else null end
from public.reports r
where coalesce(r.post_id::text, r.user_id::text) is not null
on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null do nothing;

insert into public.reports_v2(
  reporter_id,target_type,target_id,reason_code,description,source_surface,
  priority,status,legacy_source,legacy_id,created_at,resolved_at
)
select
  r.reporter_id,
  case
    when coalesce(r.message_id, r.target_message_id) is not null then 'message'
    when coalesce(r.conversation_id, r.target_conversation_id) is not null then 'conversation'
    else 'user'
  end,
  coalesce(
    r.message_id::text, r.target_message_id::text,
    r.conversation_id::text, r.target_conversation_id::text,
    r.target_user_id::text
  ),
  r.reason,
  r.details,
  'messages',
  case when lower(r.reason) similar to '%(threat|violence|harass|abuse)%' then 'high' else 'normal' end,
  case coalesce(r.status,'pending')
    when 'resolved' then 'resolved'
    when 'dismissed' then 'dismissed'
    when 'reviewing' then 'in_review'
    else 'open'
  end,
  'message_reports',
  r.id,
  r.created_at,
  case when r.status in ('resolved','dismissed') then r.resolved_at else null end
from public.message_reports r
where coalesce(
  r.message_id::text, r.target_message_id::text,
  r.conversation_id::text, r.target_conversation_id::text,
  r.target_user_id::text
) is not null
on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null do nothing;

insert into public.reports_v2(
  reporter_id,target_type,target_id,reason_code,description,source_surface,
  priority,status,legacy_source,legacy_id,created_at,resolved_at
)
select
  r.reporter_id,
  'marketplace_product',
  r.product_id::text,
  r.reason,
  r.description,
  'marketplace',
  'normal',
  case coalesce(r.status,'pending')
    when 'resolved' then 'resolved'
    when 'dismissed' then 'dismissed'
    when 'reviewing' then 'in_review'
    else 'open'
  end,
  'product_reports',
  r.id,
  r.created_at,
  case when r.status in ('resolved','dismissed') then r.resolved_at else null end
from public.product_reports r
on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null do nothing;

create or replace function public._admin_emit_notification(
  p_target_role_key text,
  p_severity text,
  p_title text,
  p_body text,
  p_action_url text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_notifications(
    target_role_key,severity,title,body,action_url,entity_type,entity_id,metadata
  ) values (
    p_target_role_key,
    case when p_severity in ('info','warning','high','critical') then p_severity else 'info' end,
    left(trim(p_title),180),
    nullif(trim(p_body),''),
    nullif(trim(p_action_url),''),
    nullif(trim(p_entity_type),''),
    nullif(trim(p_entity_id),''),
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public._admin_emit_notification(text,text,text,text,text,text,text,jsonb)
  from public, anon, authenticated;

create or replace function public._admin_case_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.severity in ('high','critical') then
    perform public._admin_emit_notification(
      'trust_safety',
      case when new.severity='critical' then 'critical' else 'high' end,
      'Trust & Safety case #' || new.case_number,
      new.title,
      '/admin/trust-safety',
      'moderation_case',
      new.id::text,
      jsonb_build_object('priority',new.priority,'status',new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_case_notification on public.moderation_cases;
create trigger trg_admin_case_notification
after insert on public.moderation_cases
for each row execute function public._admin_case_notification_trigger();

create or replace function public.admin_trust_safety_snapshot_v1(
  p_limit integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,120),1),250);
  v_result jsonb;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'reports_open', (select count(*) from public.reports_v2 where status='open'),
      'reports_in_review', (select count(*) from public.reports_v2 where status='in_review'),
      'cases_open', (select count(*) from public.moderation_cases where status not in ('resolved','dismissed')),
      'cases_overdue', (select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and due_at is not null and due_at < now()),
      'appeals_open', (select count(*) from public.appeals where status in ('open','in_review')),
      'pending_enforcement', (select count(*) from public.enforcement_actions where status='pending_execution')
    ),
    'reports', coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        x.created_at asc
      )
      from (
        select r.id,r.reporter_id,r.target_type,r.target_id,r.reason_code,r.subreason_code,
               r.description,r.source_surface,r.priority,r.status,r.legacy_source,r.created_at,r.updated_at,
               p.username as reporter_username,p.display_name as reporter_name,
               exists(select 1 from public.moderation_case_reports cr where cr.report_id=r.id) as linked_to_case
        from public.reports_v2 r
        left join public.profiles p on p.id=r.reporter_id
        where r.status in ('open','in_review')
        order by
          case r.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
          r.created_at asc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        x.opened_at desc
      )
      from (
        select c.id,c.case_number,c.case_type,c.subject_type,c.subject_id,c.title,c.summary,
               c.severity,c.priority,c.status,c.assigned_team,c.assigned_admin_id,c.policy_code,
               c.opened_at,c.due_at,c.resolved_at,c.updated_at,
               p.username as assigned_username,p.display_name as assigned_name,
               (select count(*) from public.moderation_case_reports cr where cr.case_id=c.id) as report_count,
               (select count(*) from public.moderation_evidence e where e.case_id=c.id) as evidence_count,
               (select count(*) from public.moderation_decisions d where d.case_id=c.id) as decision_count
        from public.moderation_cases c
        left join public.profiles p on p.id=c.assigned_admin_id
        order by c.opened_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at asc)
      from (
        select a.id,a.enforcement_action_id,a.appellant_id,a.reason,a.status,a.assigned_admin_id,
               a.decision_note,a.created_at,a.updated_at,a.resolved_at,
               p.username as appellant_username,
               ea.action_type,ea.target_type,ea.target_id,ea.status as enforcement_status
        from public.appeals a
        left join public.profiles p on p.id=a.appellant_id
        join public.enforcement_actions ea on ea.id=a.enforcement_action_id
        where a.status in ('open','in_review')
        order by a.created_at asc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_trust_safety_snapshot_v1(integer) from public, anon;
grant execute on function public.admin_trust_safety_snapshot_v1(integer) to authenticated;

create or replace function public.admin_create_case_from_report_v1(
  p_report_id uuid,
  p_assigned_to uuid default null,
  p_severity text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_report public.reports_v2%rowtype;
  v_case_id uuid;
  v_severity text;
  v_due timestamptz;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select * into v_report from public.reports_v2 where id=p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;

  select cr.case_id into v_case_id
  from public.moderation_case_reports cr
  join public.moderation_cases c on c.id=cr.case_id
  where cr.report_id=p_report_id and c.status not in ('resolved','dismissed')
  order by c.opened_at desc
  limit 1;
  if v_case_id is not null then return v_case_id; end if;

  v_severity := coalesce(nullif(lower(trim(p_severity)), ''),
    case v_report.priority when 'critical' then 'critical' when 'high' then 'high' else 'medium' end);
  if v_severity not in ('low','medium','high','critical') then raise exception 'invalid_severity'; end if;

  v_due := now() + case v_report.priority
    when 'critical' then interval '4 hours'
    when 'high' then interval '24 hours'
    when 'normal' then interval '72 hours'
    else interval '7 days'
  end;

  insert into public.moderation_cases(
    subject_type,subject_id,title,summary,severity,priority,status,
    assigned_admin_id,opened_by,due_at
  ) values (
    v_report.target_type,
    v_report.target_id,
    initcap(replace(v_report.target_type,'_',' ')) || ' report review',
    coalesce(nullif(v_report.description,''), 'Reason: ' || v_report.reason_code),
    v_severity,
    v_report.priority,
    'investigating',
    coalesce(p_assigned_to,v_actor),
    v_actor,
    v_due
  ) returning id into v_case_id;

  insert into public.moderation_case_reports(case_id,report_id,linked_by)
  values(v_case_id,p_report_id,v_actor);

  insert into public.moderation_evidence(
    case_id,evidence_type,object_type,object_id,snapshot_json,captured_by
  ) values (
    v_case_id,'report_snapshot','report',p_report_id::text,to_jsonb(v_report),v_actor
  );

  update public.reports_v2
  set status='in_review',updated_at=now()
  where id=p_report_id;

  perform public.admin_write_audit(
    'trust_safety.case.create',
    null,
    'moderation_case',
    v_case_id::text,
    'Case created from report',
    '{}'::jsonb,
    (select to_jsonb(c) from public.moderation_cases c where c.id=v_case_id),
    jsonb_build_object('report_id',p_report_id)
  );

  return v_case_id;
end;
$$;
revoke all on function public.admin_create_case_from_report_v1(uuid,uuid,text) from public, anon;
grant execute on function public.admin_create_case_from_report_v1(uuid,uuid,text) to authenticated;

create or replace function public.admin_update_case_v1(
  p_case_id uuid,
  p_status text default null,
  p_priority text default null,
  p_severity text default null,
  p_assigned_admin_id uuid default null,
  p_summary text default null,
  p_policy_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.moderation_cases%rowtype;
  v_after public.moderation_cases%rowtype;
  v_status text := nullif(lower(trim(p_status)),'');
  v_priority text := nullif(lower(trim(p_priority)),'');
  v_severity text := nullif(lower(trim(p_severity)),'');
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  if v_status is not null and v_status not in ('open','investigating','pending_action','resolved','dismissed') then raise exception 'invalid_status'; end if;
  if v_priority is not null and v_priority not in ('low','normal','high','critical') then raise exception 'invalid_priority'; end if;
  if v_severity is not null and v_severity not in ('low','medium','high','critical') then raise exception 'invalid_severity'; end if;

  select * into v_before from public.moderation_cases where id=p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;

  update public.moderation_cases
  set status=coalesce(v_status,status),
      priority=coalesce(v_priority,priority),
      severity=coalesce(v_severity,severity),
      assigned_admin_id=coalesce(p_assigned_admin_id,assigned_admin_id),
      summary=case when p_summary is null then summary else nullif(trim(p_summary),'') end,
      policy_code=case when p_policy_code is null then policy_code else nullif(trim(p_policy_code),'') end,
      resolved_at=case
        when coalesce(v_status,status) in ('resolved','dismissed') then coalesce(resolved_at,now())
        when v_status is not null then null
        else resolved_at
      end,
      updated_at=now()
  where id=p_case_id
  returning * into v_after;

  perform public.admin_write_audit(
    'trust_safety.case.update',null,'moderation_case',p_case_id::text,
    'Case updated',to_jsonb(v_before),to_jsonb(v_after),'{}'::jsonb
  );

  return to_jsonb(v_after);
end;
$$;
revoke all on function public.admin_update_case_v1(uuid,text,text,text,uuid,text,text) from public, anon;
grant execute on function public.admin_update_case_v1(uuid,text,text,text,uuid,text,text) to authenticated;

create or replace function public.admin_decide_case_v1(
  p_case_id uuid,
  p_decision text,
  p_policy_code text,
  p_rationale text,
  p_action_type text default null,
  p_action_hours integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_decision_id uuid;
  v_action_id uuid;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_action text := nullif(lower(trim(p_action_type)),'');
  v_case_status text;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_decision not in ('no_violation','violation','needs_more_info','escalate') then raise exception 'invalid_decision'; end if;
  if char_length(trim(coalesce(p_rationale,''))) < 3 then raise exception 'rationale_required'; end if;
  if v_action is not null and v_action not in ('warning','remove_content','feature_limit','temporary_suspend','permanent_disable','demonetize','age_restrict') then
    raise exception 'invalid_action';
  end if;

  select * into v_case from public.moderation_cases where id=p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;

  insert into public.moderation_decisions(case_id,decision,policy_code,rationale,decided_by)
  values(p_case_id,v_decision,nullif(trim(p_policy_code),''),trim(p_rationale),v_actor)
  returning id into v_decision_id;

  if v_decision='violation' and v_action is not null then
    insert into public.enforcement_actions(
      case_id,target_type,target_id,action_type,status,starts_at,ends_at,created_by,
      metadata
    ) values (
      p_case_id,v_case.subject_type,v_case.subject_id,v_action,'pending_execution',now(),
      case when p_action_hours is not null and p_action_hours > 0
        then now() + make_interval(hours => least(p_action_hours, 87600))
        else null end,
      v_actor,
      jsonb_build_object('decision_id',v_decision_id,'policy_code',nullif(trim(p_policy_code),''))
    ) returning id into v_action_id;
  end if;

  v_case_status := case
    when v_decision='no_violation' then 'dismissed'
    when v_decision='violation' and v_action_id is not null then 'pending_action'
    when v_decision='violation' then 'resolved'
    when v_decision='needs_more_info' then 'investigating'
    else 'investigating'
  end;

  update public.moderation_cases
  set status=v_case_status,
      policy_code=coalesce(nullif(trim(p_policy_code),''),policy_code),
      resolved_at=case when v_case_status in ('resolved','dismissed') then now() else null end,
      updated_at=now()
  where id=p_case_id;

  update public.reports_v2 r
  set status=case when v_decision='no_violation' then 'dismissed'
                  when v_decision='violation' then 'resolved'
                  else 'in_review' end,
      resolved_at=case when v_decision in ('no_violation','violation') then now() else null end,
      updated_at=now()
  where exists (
    select 1 from public.moderation_case_reports cr
    where cr.case_id=p_case_id and cr.report_id=r.id
  );

  perform public.admin_write_audit(
    'trust_safety.case.decision',null,'moderation_case',p_case_id::text,
    trim(p_rationale),to_jsonb(v_case),
    (select to_jsonb(c) from public.moderation_cases c where c.id=p_case_id),
    jsonb_build_object('decision_id',v_decision_id,'decision',v_decision,'enforcement_action_id',v_action_id)
  );

  return jsonb_build_object(
    'case_id',p_case_id,
    'decision_id',v_decision_id,
    'enforcement_action_id',v_action_id,
    'status',v_case_status
  );
end;
$$;
revoke all on function public.admin_decide_case_v1(uuid,text,text,text,text,integer) from public, anon;
grant execute on function public.admin_decide_case_v1(uuid,text,text,text,text,integer) to authenticated;

create or replace function public.admin_bulk_triage_reports_v1(
  p_report_ids uuid[],
  p_action text,
  p_priority text default null,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_priority text := nullif(lower(trim(p_priority)),'');
  v_count integer := 0;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if coalesce(array_length(p_report_ids,1),0)=0 or array_length(p_report_ids,1)>100 then raise exception 'invalid_batch_size'; end if;
  if v_action not in ('dismiss','reopen','set_priority','mark_in_review') then raise exception 'invalid_action'; end if;
  if v_action='set_priority' and v_priority not in ('low','normal','high','critical') then raise exception 'invalid_priority'; end if;
  if v_action='dismiss' and char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'reason_required'; end if;

  update public.reports_v2
  set status=case v_action
        when 'dismiss' then 'dismissed'
        when 'reopen' then 'open'
        when 'mark_in_review' then 'in_review'
        else status end,
      priority=case when v_action='set_priority' then v_priority else priority end,
      resolved_at=case
        when v_action='dismiss' then now()
        when v_action in ('reopen','mark_in_review') then null
        else resolved_at end,
      updated_at=now()
  where id=any(p_report_ids);
  get diagnostics v_count = row_count;

  perform public.admin_write_audit(
    'trust_safety.reports.bulk',null,'report_batch',null,
    coalesce(nullif(trim(p_reason),''),v_action),
    '{}'::jsonb,'{}'::jsonb,
    jsonb_build_object('action',v_action,'priority',v_priority,'report_ids',to_jsonb(p_report_ids),'count',v_count)
  );

  return v_count;
end;
$$;
revoke all on function public.admin_bulk_triage_reports_v1(uuid[],text,text,text) from public, anon;
grant execute on function public.admin_bulk_triage_reports_v1(uuid[],text,text,text) to authenticated;

create or replace function public.admin_rbac_matrix_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_admin_permission(v_actor,'admin.roles.view') then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'actor_super_admin',public.has_admin_role(v_actor,'super_admin'),
    'roles',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rank,x.key)
      from (
        select r.key,r.label,r.description,r.rank,r.is_system,
               (select count(distinct a.user_id) from public.admin_role_assignments a where a.role_key=r.key and a.revoked_at is null) as active_members,
               (select count(*) from public.admin_role_permissions rp where rp.role_key=r.key) as permission_count,
               (r.key='super_admin') as implicit_all
        from public.admin_roles r
      ) x
    ),'[]'::jsonb),
    'permissions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.category,x.risk_order,x.key)
      from (
        select p.key,p.category,p.label,p.description,p.risk_level,
               case p.risk_level when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end as risk_order,
               coalesce((
                 select jsonb_agg(rp.role_key order by rp.role_key)
                 from public.admin_role_permissions rp where rp.permission_key=p.key
               ),'[]'::jsonb) as roles
        from public.admin_permissions p
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_rbac_matrix_v1() from public, anon;
grant execute on function public.admin_rbac_matrix_v1() to authenticated;

create or replace function public.admin_set_role_permission_v1(
  p_role_key text,
  p_permission_key text,
  p_enabled boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := trim(coalesce(p_role_key,''));
  v_perm text := trim(coalesce(p_permission_key,''));
  v_before boolean;
begin
  if v_actor is null
     or not public.has_admin_role(v_actor,'super_admin')
     or not public.has_admin_permission(v_actor,'admin.roles.manage') then
    raise exception 'super_admin_required' using errcode='42501';
  end if;
  if v_role='super_admin' then raise exception 'super_admin_matrix_is_implicit'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if not exists(select 1 from public.admin_roles where key=v_role) then raise exception 'role_not_found'; end if;
  if not exists(select 1 from public.admin_permissions where key=v_perm) then raise exception 'permission_not_found'; end if;

  select exists(
    select 1 from public.admin_role_permissions
    where role_key=v_role and permission_key=v_perm
  ) into v_before;

  if p_enabled then
    insert into public.admin_role_permissions(role_key,permission_key)
    values(v_role,v_perm)
    on conflict do nothing;
  else
    delete from public.admin_role_permissions
    where role_key=v_role and permission_key=v_perm;
  end if;

  perform public.admin_write_audit(
    'rbac.permission.' || case when p_enabled then 'grant' else 'revoke' end,
    null,'admin_role',v_role,trim(p_reason),
    jsonb_build_object('permission',v_perm,'enabled',v_before),
    jsonb_build_object('permission',v_perm,'enabled',p_enabled),
    jsonb_build_object('risk_level',(select risk_level from public.admin_permissions where key=v_perm))
  );

  return true;
end;
$$;
revoke all on function public.admin_set_role_permission_v1(text,text,boolean,text) from public, anon;
grant execute on function public.admin_set_role_permission_v1(text,text,boolean,text) to authenticated;

create or replace function public.admin_system_control_snapshot_v4()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.system.view')
    or public.has_admin_permission(v_actor,'admin.operations.view')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'database',jsonb_build_object(
      'size_bytes',pg_database_size(current_database()),
      'connections',(
        select count(*) from pg_stat_activity where datname=current_database()
      )
    ),
    'queues',jsonb_build_array(
      jsonb_build_object('key','verification','label','Verification','pending',(select count(*) from public.verification_requests where status='pending'),'failed',0,'oldest_at',(select min(created_at) from public.verification_requests where status='pending')),
      jsonb_build_object('key','trust_safety_reports','label','Trust & Safety reports','pending',(select count(*) from public.reports_v2 where status in ('open','in_review')),'failed',0,'oldest_at',(select min(created_at) from public.reports_v2 where status in ('open','in_review'))),
      jsonb_build_object('key','moderation_cases','label','Moderation cases','pending',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed')),'failed',0,'oldest_at',(select min(opened_at) from public.moderation_cases where status not in ('resolved','dismissed'))),
      jsonb_build_object('key','appeals','label','Appeals','pending',(select count(*) from public.appeals where status in ('open','in_review')),'failed',0,'oldest_at',(select min(created_at) from public.appeals where status in ('open','in_review'))),
      jsonb_build_object('key','video_jobs','label','Video jobs','pending',(select count(*) from public.video_jobs where status::text in ('queued','processing')),'failed',(select count(*) from public.video_jobs where status::text='failed'),'oldest_at',(select min(created_at) from public.video_jobs where status::text in ('queued','processing'))),
      jsonb_build_object('key','ai_media_jobs','label','AI media jobs','pending',(select count(*) from public.ai_media_jobs where status in ('queued','running')),'failed',(select count(*) from public.ai_media_jobs where status='failed'),'oldest_at',(select min(created_at) from public.ai_media_jobs where status in ('queued','running'))),
      jsonb_build_object('key','scheduled_email','label','Scheduled email','pending',(select count(*) from public.scheduled_emails where status='pending'),'failed',(select count(*) from public.scheduled_emails where status='failed'),'oldest_at',(select min(created_at) from public.scheduled_emails where status='pending')),
      jsonb_build_object('key','user_deletion','label','User deletion','pending',(select count(*) from public.admin_user_deletion_jobs where status not in ('completed','failed')),'failed',(select count(*) from public.admin_user_deletion_jobs where status='failed'),'oldest_at',(select min(requested_at) from public.admin_user_deletion_jobs where status not in ('completed','failed')))
    ),
    'security',jsonb_build_object(
      'devices_total',(select count(*) from public.auth_devices),
      'devices_active',(select count(*) from public.auth_devices where revoked_at is null),
      'devices_revoked',(select count(*) from public.auth_devices where revoked_at is not null),
      'sessions_24h',(select count(*) from public.user_sessions where coalesce(last_active_at,created_at)>=now()-interval '24 hours'),
      'security_events_24h',(select count(*) from public.security_events where created_at>=now()-interval '24 hours'),
      'failed_logins_24h',(select count(*) from public.auth_login_attempts where created_at>=now()-interval '24 hours' and lower(outcome) not in ('success','succeeded','ok'))
    ),
    'governance',jsonb_build_object(
      'audit_24h',(select count(*) from public.admin_audit_log where created_at>=now()-interval '24 hours'),
      'admins_active',(select count(distinct user_id) from public.admin_role_assignments where revoked_at is null),
      'roles',(select count(*) from public.admin_roles),
      'permissions',(select count(*) from public.admin_permissions),
      'unread_notifications',(
        select count(*)
        from public.admin_notifications n
        where (n.expires_at is null or n.expires_at>now())
          and (
            n.user_id=v_actor
            or (
              n.user_id is null and (
                n.target_role_key is null
                or exists(select 1 from public.admin_role_assignments a where a.user_id=v_actor and a.role_key=n.target_role_key and a.revoked_at is null)
                or public.has_admin_role(v_actor,'super_admin')
              )
            )
          )
          and not exists(select 1 from public.admin_notification_reads nr where nr.notification_id=n.id and nr.user_id=v_actor)
      )
    ),
    'recent_audit',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select a.id,a.actor_id,a.target_user_id,a.action,a.entity_type,a.entity_id,a.reason,
               a.before_state,a.after_state,a.metadata,a.created_at,
               p.username as actor_username,p.display_name as actor_name
        from public.admin_audit_log a
        left join public.profiles p on p.id=a.actor_id
        order by a.created_at desc
        limit 100
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_system_control_snapshot_v4() from public, anon;
grant execute on function public.admin_system_control_snapshot_v4() to authenticated;

create or replace function public.admin_user_security_snapshot_v1(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.security.view')
    or public.has_admin_permission(v_actor,'security.view')
    or public.has_admin_permission(v_actor,'sessions.view')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'user',(
      select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url)
      from public.profiles p where p.id=p_user_id
    ),
    'devices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'label',d.label,
        'user_agent',d.user_agent,
        'ip_masked',case
          when d.ip is null then null
          when d.ip ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' then regexp_replace(d.ip,'\.[0-9]{1,3}$','.x')
          else left(d.ip,12) || '…'
        end,
        'created_at',d.created_at,
        'last_seen_at',d.last_seen_at,
        'revoked_at',d.revoked_at,
        'revoked_reason',d.revoked_reason
      ) order by d.last_seen_at desc)
      from public.auth_devices d where d.user_id=p_user_id
    ),'[]'::jsonb),
    'sessions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'device_name',s.device_name,
        'device_type',s.device_type,
        'platform',s.platform,
        'device_model',s.device_model,
        'os_name',s.os_name,
        'os_version',s.os_version,
        'browser_name',s.browser_name,
        'app_name',s.app_name,
        'app_version',s.app_version,
        'location_city',s.location_city,
        'location_country',s.location_country,
        'ip_masked',case
          when s.ip_address is null then null
          when s.ip_address ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' then regexp_replace(s.ip_address,'\.[0-9]{1,3}$','.x')
          else left(s.ip_address,12) || '…'
        end,
        'is_current',s.is_current,
        'created_at',s.created_at,
        'last_active_at',s.last_active_at
      ) order by coalesce(s.last_active_at,s.created_at) desc)
      from public.user_sessions s where s.user_id=p_user_id
    ),'[]'::jsonb),
    'security_events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'event_type',e.event_type,'description',e.description,'created_at',e.created_at
      ) order by e.created_at desc)
      from (
        select * from public.security_events where user_id=p_user_id order by created_at desc limit 50
      ) e
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_user_security_snapshot_v1(uuid) from public, anon;
grant execute on function public.admin_user_security_snapshot_v1(uuid) to authenticated;

create or replace function public.admin_revoke_device_trust_v1(
  p_device_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.auth_devices%rowtype;
  v_after public.auth_devices%rowtype;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.security.manage')
    or public.has_admin_permission(v_actor,'security.lock')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;

  select * into v_before from public.auth_devices where id=p_device_id for update;
  if not found then raise exception 'device_not_found'; end if;

  update public.auth_devices
  set revoked_at=coalesce(revoked_at,now()),
      revoked_reason=trim(p_reason)
  where id=p_device_id
  returning * into v_after;

  perform public.admin_write_audit(
    'security.device_trust.revoke',v_before.user_id,'auth_device',p_device_id::text,
    trim(p_reason),to_jsonb(v_before),to_jsonb(v_after),'{}'::jsonb
  );

  return true;
end;
$$;
revoke all on function public.admin_revoke_device_trust_v1(uuid,text) from public, anon;
grant execute on function public.admin_revoke_device_trust_v1(uuid,text) to authenticated;

create or replace function public.admin_audit_event_detail_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return (
    select jsonb_build_object(
      'id',a.id,'actor_id',a.actor_id,'target_user_id',a.target_user_id,
      'action',a.action,'entity_type',a.entity_type,'entity_id',a.entity_id,
      'reason',a.reason,'before_state',a.before_state,'after_state',a.after_state,
      'metadata',a.metadata,'created_at',a.created_at,
      'actor_username',p.username,'actor_name',p.display_name
    )
    from public.admin_audit_log a
    left join public.profiles p on p.id=a.actor_id
    where a.id=p_event_id
  );
end;
$$;
revoke all on function public.admin_audit_event_detail_v1(uuid) from public, anon;
grant execute on function public.admin_audit_event_detail_v1(uuid) to authenticated;

create or replace function public.admin_notification_inbox_v1(
  p_limit integer default 100
)
returns table(
  id uuid,
  kind text,
  severity text,
  title text,
  body text,
  action_url text,
  entity_type text,
  entity_id text,
  created_at timestamptz,
  is_read boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_admin_staff(v_actor) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return query
  select n.id,n.kind,n.severity,n.title,n.body,n.action_url,n.entity_type,n.entity_id,n.created_at,
         exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=v_actor)
  from public.admin_notifications n
  where (n.expires_at is null or n.expires_at>now())
    and (
      n.user_id=v_actor
      or (
        n.user_id is null and (
          n.target_role_key is null
          or exists(select 1 from public.admin_role_assignments a where a.user_id=v_actor and a.role_key=n.target_role_key and a.revoked_at is null)
          or public.has_admin_role(v_actor,'super_admin')
        )
      )
    )
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),250);
end;
$$;
revoke all on function public.admin_notification_inbox_v1(integer) from public, anon;
grant execute on function public.admin_notification_inbox_v1(integer) to authenticated;

create or replace function public.admin_mark_notification_read_v1(
  p_notification_id uuid,
  p_read boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_visible boolean;
begin
  if v_actor is null or not public.is_admin_staff(v_actor) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select exists(
    select 1 from public.admin_notifications n
    where n.id=p_notification_id
      and (
        n.user_id=v_actor
        or (
          n.user_id is null and (
            n.target_role_key is null
            or exists(select 1 from public.admin_role_assignments a where a.user_id=v_actor and a.role_key=n.target_role_key and a.revoked_at is null)
            or public.has_admin_role(v_actor,'super_admin')
          )
        )
      )
  ) into v_visible;
  if not v_visible then raise exception 'notification_not_found'; end if;

  if p_read then
    insert into public.admin_notification_reads(notification_id,user_id)
    values(p_notification_id,v_actor)
    on conflict(notification_id,user_id) do update set read_at=now();
  else
    delete from public.admin_notification_reads where notification_id=p_notification_id and user_id=v_actor;
  end if;

  return true;
end;
$$;
revoke all on function public.admin_mark_notification_read_v1(uuid,boolean) from public, anon;
grant execute on function public.admin_mark_notification_read_v1(uuid,boolean) to authenticated;

notify pgrst, 'reload schema';
