-- Alsamos Admin Control Plane v4
-- Four-eyes approvals, policy catalog, evidence timeline and safe enforcement execution.

insert into public.admin_permissions(key, category, label, description, risk_level)
values
  ('admin.enforcement.approve','trust_safety','Enforcement tasdiqlash','Destructive enforcement action uchun independent approval berish yoki rad etish.','critical'),
  ('admin.enforcement.execute','trust_safety','Enforcement ijro etish','Tasdiqlangan enforcement actionni canonical platform state’ga qo‘llash.','critical'),
  ('admin.policy.manage','trust_safety','Moderation policy catalogini boshqarish','Policy catalog va default enforcement parametrlarini boshqarish.','critical')
on conflict (key) do update
set category=excluded.category,
    label=excluded.label,
    description=excluded.description,
    risk_level=excluded.risk_level;

insert into public.admin_role_permissions(role_key, permission_key)
values
  ('trust_safety','admin.enforcement.approve'),
  ('trust_safety','admin.enforcement.execute')
on conflict do nothing;

create table if not exists public.moderation_policies (
  code text primary key,
  title text not null,
  category text not null,
  description text not null default '',
  severity_default text not null default 'medium'
    check (severity_default in ('low','medium','high','critical')),
  default_action text,
  execution_mode text not null default 'automatic'
    check (execution_mode in ('automatic','manual')),
  requires_independent_approval boolean not null default true,
  required_approvals smallint not null default 1
    check (required_approvals between 0 and 3),
  default_duration_hours integer
    check (default_duration_hours is null or default_duration_hours between 1 and 87600),
  allowed_target_types text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.moderation_policies(
  code,title,category,description,severity_default,default_action,execution_mode,
  requires_independent_approval,required_approvals,default_duration_hours,allowed_target_types
)
values
  ('CONTENT.SPAM','Spam va manipulyativ kontent','content','Takroriy spam, engagement manipulation yoki ommaviy keraksiz kontent.','medium','remove_content','automatic',true,1,null,array['post','message']),
  ('CONTENT.HARASSMENT','Haqorat va ta’qib','content','Nishonlangan haqorat, tahqirlash yoki takroriy ta’qib.','high','remove_content','automatic',true,1,null,array['post','message']),
  ('CONTENT.VIOLENCE','Zo‘ravonlik va tahdid','content','Zo‘ravonlikni targ‘ib qilish yoki real tahdid signallari.','critical','remove_content','automatic',true,1,null,array['post','message']),
  ('ACCOUNT.IMPERSONATION','Shaxsni soxtalashtirish','account','Boshqa shaxs yoki tashkilot sifatida aldovchi identifikatsiya.','high','temporary_suspend','automatic',true,1,168,array['user']),
  ('ACCOUNT.FRAUD','Firibgarlik va zararli hisob','account','Firibgarlik, scam yoki platformadan zararli foydalanish.','critical','permanent_disable','automatic',true,1,null,array['user']),
  ('ACCOUNT.EVASION','Enforcementdan qochish','account','Oldingi cheklovni aylanib o‘tish yoki qayta zararli hisob yaratish.','critical','permanent_disable','automatic',true,1,null,array['user']),
  ('MARKETPLACE.PROHIBITED','Taqiqlangan marketplace listing','marketplace','Marketplace siyosatiga zid yoki taqiqlangan listing.','high','remove_content','automatic',true,1,null,array['marketplace_product'])
on conflict (code) do nothing;

alter table public.enforcement_actions
  add column if not exists required_approvals smallint not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists executed_by uuid references public.profiles(id) on delete set null,
  add column if not exists execution_result jsonb not null default '{}'::jsonb,
  add column if not exists policy_code text references public.moderation_policies(code) on update cascade on delete set null;

alter table public.enforcement_actions
  drop constraint if exists enforcement_actions_status_check;
alter table public.enforcement_actions
  add constraint enforcement_actions_status_check
  check (status in (
    'awaiting_approval','pending_execution','executing','applied',
    'failed','reverted','rejected'
  ));

create table if not exists public.enforcement_approvals (
  id uuid primary key default gen_random_uuid(),
  enforcement_action_id uuid not null references public.enforcement_actions(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected')),
  note text not null,
  created_at timestamptz not null default now(),
  unique(enforcement_action_id, approver_id),
  constraint enforcement_approvals_note_len check (char_length(trim(note)) between 3 and 2000)
);

create table if not exists public.enforcement_execution_events (
  id uuid primary key default gen_random_uuid(),
  enforcement_action_id uuid not null references public.enforcement_actions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'requested','approved','rejected','ready','executing','applied','failed','reverted'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_policies_active_category_idx
  on public.moderation_policies(active, category, code);
create index if not exists moderation_policies_updated_by_idx
  on public.moderation_policies(updated_by);
create index if not exists enforcement_approvals_action_idx
  on public.enforcement_approvals(enforcement_action_id, created_at desc);
create index if not exists enforcement_approvals_approver_idx
  on public.enforcement_approvals(approver_id, created_at desc);
create index if not exists enforcement_execution_events_action_idx
  on public.enforcement_execution_events(enforcement_action_id, created_at desc);
create index if not exists enforcement_execution_events_actor_idx
  on public.enforcement_execution_events(actor_id, created_at desc);
create index if not exists enforcement_actions_approval_queue_idx
  on public.enforcement_actions(status, required_approvals, created_at desc);
create index if not exists enforcement_actions_executed_by_idx
  on public.enforcement_actions(executed_by);

alter table public.moderation_policies enable row level security;
alter table public.enforcement_approvals enable row level security;
alter table public.enforcement_execution_events enable row level security;

drop policy if exists "RBAC trust safety policy read" on public.moderation_policies;
create policy "RBAC trust safety policy read"
on public.moderation_policies for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.review'))
);

drop policy if exists "RBAC trust safety approval read" on public.enforcement_approvals;
create policy "RBAC trust safety approval read"
on public.enforcement_approvals for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.review'))
);

drop policy if exists "RBAC trust safety execution event read" on public.enforcement_execution_events;
create policy "RBAC trust safety execution event read"
on public.enforcement_execution_events for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()),'reports.review'))
);

grant select on public.moderation_policies, public.enforcement_approvals, public.enforcement_execution_events
to authenticated;

create or replace function public._admin_enforcement_required_approvals(
  p_action_type text,
  p_policy_code text
)
returns smallint
language sql
stable
security definer
set search_path=public
as $$
  select greatest(
    case
      when p_action_type in ('remove_content','temporary_suspend','permanent_disable','demonetize','age_restrict','feature_limit') then 1
      else 0
    end,
    coalesce((
      select case when requires_independent_approval then required_approvals else 0 end
      from public.moderation_policies
      where code=p_policy_code and active
    ),0)
  )::smallint;
$$;
revoke all on function public._admin_enforcement_required_approvals(text,text)
from public,anon,authenticated;

create or replace function public._admin_enforcement_event(
  p_action_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.enforcement_execution_events(
    enforcement_action_id,actor_id,event_type,detail
  ) values (
    p_action_id,p_actor_id,p_event_type,coalesce(p_detail,'{}'::jsonb)
  );
end;
$$;
revoke all on function public._admin_enforcement_event(uuid,uuid,text,jsonb)
from public,anon,authenticated;

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
  v_required smallint := 0;
  v_duration integer := p_action_hours;
  v_policy text := nullif(trim(p_policy_code),'');
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_decision not in ('no_violation','violation','needs_more_info','escalate') then
    raise exception 'invalid_decision';
  end if;
  if char_length(trim(coalesce(p_rationale,''))) < 3 then
    raise exception 'rationale_required';
  end if;
  if v_action is not null and v_action not in (
    'warning','remove_content','feature_limit','temporary_suspend',
    'permanent_disable','demonetize','age_restrict'
  ) then
    raise exception 'invalid_action';
  end if;
  if v_policy is not null and not exists (
    select 1 from public.moderation_policies where code=v_policy and active
  ) then
    raise exception 'policy_not_found_or_inactive';
  end if;

  select * into v_case
  from public.moderation_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'case_not_found'; end if;

  if v_policy is not null and not exists (
    select 1
    from public.moderation_policies p
    where p.code=v_policy
      and v_case.subject_type = any(p.allowed_target_types)
  ) then
    raise exception 'policy_target_mismatch';
  end if;

  if v_action='temporary_suspend' and coalesce(v_duration,0) <= 0 then
    select default_duration_hours into v_duration
    from public.moderation_policies where code=v_policy;
    v_duration := coalesce(v_duration,24);
  end if;

  insert into public.moderation_decisions(case_id,decision,policy_code,rationale,decided_by)
  values(p_case_id,v_decision,v_policy,trim(p_rationale),v_actor)
  returning id into v_decision_id;

  if v_decision='violation' and v_action is not null then
    v_required := public._admin_enforcement_required_approvals(v_action,v_policy);

    insert into public.enforcement_actions(
      case_id,target_type,target_id,action_type,status,starts_at,ends_at,created_by,
      metadata,required_approvals,policy_code
    ) values (
      p_case_id,
      v_case.subject_type,
      v_case.subject_id,
      v_action,
      case when v_required > 0 then 'awaiting_approval' else 'pending_execution' end,
      now(),
      case when v_duration is not null and v_duration > 0
        then now() + make_interval(hours => least(v_duration,87600))
        else null end,
      v_actor,
      jsonb_build_object(
        'decision_id',v_decision_id,
        'policy_code',v_policy,
        'rationale',trim(p_rationale)
      ),
      v_required,
      v_policy
    ) returning id into v_action_id;

    perform public._admin_enforcement_event(
      v_action_id,v_actor,'requested',
      jsonb_build_object('required_approvals',v_required,'action_type',v_action)
    );
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
      policy_code=coalesce(v_policy,policy_code),
      resolved_at=case when v_case_status in ('resolved','dismissed') then now() else null end,
      updated_at=now()
  where id=p_case_id;

  update public.reports_v2 r
  set status=case
        when v_decision='no_violation' then 'dismissed'
        when v_decision='violation' then 'resolved'
        else 'in_review'
      end,
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
    jsonb_build_object(
      'decision_id',v_decision_id,
      'decision',v_decision,
      'enforcement_action_id',v_action_id,
      'required_approvals',v_required
    )
  );

  return jsonb_build_object(
    'case_id',p_case_id,
    'decision_id',v_decision_id,
    'enforcement_action_id',v_action_id,
    'status',v_case_status,
    'enforcement_status',
      case when v_action_id is null then null
           when v_required > 0 then 'awaiting_approval'
           else 'pending_execution' end,
    'required_approvals',v_required
  );
end;
$$;
revoke all on function public.admin_decide_case_v1(uuid,text,text,text,text,integer)
from public,anon;
grant execute on function public.admin_decide_case_v1(uuid,text,text,text,text,integer)
to authenticated;

create or replace function public.admin_review_enforcement_v1(
  p_action_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_approved integer;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.approve')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_decision not in ('approved','rejected') then
    raise exception 'invalid_decision';
  end if;
  if char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'approval_note_required';
  end if;

  select * into v_action
  from public.enforcement_actions
  where id=p_action_id
  for update;
  if not found then raise exception 'enforcement_not_found'; end if;
  if v_action.status <> 'awaiting_approval' then
    raise exception 'enforcement_not_waiting_for_approval';
  end if;
  if v_action.created_by = v_actor then
    raise exception 'four_eyes_creator_cannot_approve';
  end if;
  if v_action.action_type='permanent_disable'
     and not public.has_admin_role(v_actor,'super_admin') then
    raise exception 'super_admin_approval_required';
  end if;

  insert into public.enforcement_approvals(
    enforcement_action_id,approver_id,decision,note
  ) values (
    p_action_id,v_actor,v_decision,trim(p_note)
  )
  on conflict(enforcement_action_id,approver_id)
  do update set decision=excluded.decision,note=excluded.note,created_at=now();

  perform public._admin_enforcement_event(
    p_action_id,v_actor,
    case when v_decision='approved' then 'approved' else 'rejected' end,
    jsonb_build_object('note',trim(p_note))
  );

  if v_decision='rejected' then
    update public.enforcement_actions
    set status='rejected',
        failure_reason='Rejected by independent reviewer: ' || trim(p_note)
    where id=p_action_id;

    perform public.admin_write_audit(
      'trust_safety.enforcement.reject',null,'enforcement_action',p_action_id::text,
      trim(p_note),to_jsonb(v_action),
      (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
      '{}'::jsonb
    );

    return jsonb_build_object('status','rejected','approved_count',0);
  end if;

  select count(*) into v_approved
  from public.enforcement_approvals
  where enforcement_action_id=p_action_id and decision='approved';

  if v_approved >= v_action.required_approvals then
    update public.enforcement_actions
    set status='pending_execution',approved_at=now(),failure_reason=null
    where id=p_action_id;

    perform public._admin_enforcement_event(
      p_action_id,v_actor,'ready',
      jsonb_build_object('approved_count',v_approved)
    );
  end if;

  perform public.admin_write_audit(
    'trust_safety.enforcement.approve',null,'enforcement_action',p_action_id::text,
    trim(p_note),to_jsonb(v_action),
    (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
    jsonb_build_object('approved_count',v_approved)
  );

  return jsonb_build_object(
    'status',case when v_approved >= v_action.required_approvals then 'pending_execution' else 'awaiting_approval' end,
    'approved_count',v_approved,
    'required_approvals',v_action.required_approvals
  );
end;
$$;
revoke all on function public.admin_review_enforcement_v1(uuid,text,text)
from public,anon;
grant execute on function public.admin_review_enforcement_v1(uuid,text,text)
to authenticated;

create or replace function public.admin_execute_enforcement_v1(
  p_action_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_approved integer := 0;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_target uuid;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.execute')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'execution_reason_required';
  end if;

  select * into v_action
  from public.enforcement_actions
  where id=p_action_id
  for update;
  if not found then raise exception 'enforcement_not_found'; end if;
  if v_action.status <> 'pending_execution' then
    raise exception 'enforcement_not_ready';
  end if;
  if v_action.starts_at > now() then
    raise exception 'enforcement_not_started';
  end if;

  select count(*) into v_approved
  from public.enforcement_approvals
  where enforcement_action_id=p_action_id and decision='approved';
  if v_approved < v_action.required_approvals then
    raise exception 'approval_threshold_not_met';
  end if;

  if v_action.action_type in ('temporary_suspend','permanent_disable') then
    if v_action.target_type <> 'user' then raise exception 'action_target_mismatch'; end if;
    begin
      v_target := v_action.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_target_id';
    end;
    if public.admin_is_protected_user(v_target) then
      raise exception 'protected_user';
    end if;
  end if;

  if v_action.action_type='remove_content'
     and v_action.target_type not in ('post','message','marketplace_product') then
    raise exception 'unsupported_remove_content_target';
  end if;

  if v_action.action_type not in (
    'warning','remove_content','temporary_suspend','permanent_disable'
  ) then
    raise exception 'manual_execution_required';
  end if;

  update public.enforcement_actions
  set status='executing',failure_reason=null
  where id=p_action_id;
  perform public._admin_enforcement_event(p_action_id,v_actor,'executing','{}'::jsonb);

  if v_action.action_type='warning' then
    v_before := '{}'::jsonb;
    v_after := jsonb_build_object('warning_recorded',true);

  elsif v_action.action_type='remove_content' and v_action.target_type='post' then
    select to_jsonb(p) into v_before
    from public.posts p where p.id=v_action.target_id::uuid for update;
    if v_before is null then raise exception 'target_not_found'; end if;

    update public.posts
    set is_hidden=true,moderation_status='rejected',updated_at=now()
    where id=v_action.target_id::uuid;
    select to_jsonb(p) into v_after from public.posts p where p.id=v_action.target_id::uuid;

  elsif v_action.action_type='remove_content' and v_action.target_type='message' then
    select to_jsonb(m) into v_before
    from public.messages m where m.id=v_action.target_id::uuid for update;
    if v_before is null then raise exception 'target_not_found'; end if;

    update public.messages
    set is_deleted=true,deleted_at=coalesce(deleted_at,now()),updated_at=now()
    where id=v_action.target_id::uuid;
    select to_jsonb(m) into v_after from public.messages m where m.id=v_action.target_id::uuid;

  elsif v_action.action_type='remove_content' and v_action.target_type='marketplace_product' then
    select to_jsonb(p) into v_before
    from public.products p where p.id=v_action.target_id::uuid for update;
    if v_before is null then raise exception 'target_not_found'; end if;

    update public.products
    set status='deleted',
        moderation_status='rejected',
        moderation_notes='Trust & Safety enforcement: ' || trim(p_reason),
        moderated_at=now(),
        moderated_by=v_actor,
        updated_at=now()
    where id=v_action.target_id::uuid;
    select to_jsonb(p) into v_after from public.products p where p.id=v_action.target_id::uuid;

  elsif v_action.action_type='temporary_suspend' then
    select to_jsonb(c) into v_before
    from public.user_account_controls c where c.user_id=v_target for update;

    if v_action.ends_at is null or v_action.ends_at <= now() then
      raise exception 'temporary_suspend_requires_future_end';
    end if;

    insert into public.user_account_controls(
      user_id,status,reason,suspended_until,changed_by,changed_at,updated_at
    ) values (
      v_target,'suspended',trim(p_reason),v_action.ends_at,v_actor,now(),now()
    )
    on conflict(user_id) do update set
      status='suspended',
      reason=excluded.reason,
      suspended_until=excluded.suspended_until,
      changed_by=v_actor,
      changed_at=now(),
      updated_at=now();

    select to_jsonb(c) into v_after
    from public.user_account_controls c where c.user_id=v_target;

  elsif v_action.action_type='permanent_disable' then
    select to_jsonb(c) into v_before
    from public.user_account_controls c where c.user_id=v_target for update;

    insert into public.user_account_controls(
      user_id,status,reason,suspended_until,changed_by,changed_at,updated_at
    ) values (
      v_target,'banned',trim(p_reason),null,v_actor,now(),now()
    )
    on conflict(user_id) do update set
      status='banned',
      reason=excluded.reason,
      suspended_until=null,
      changed_by=v_actor,
      changed_at=now(),
      updated_at=now();

    select to_jsonb(c) into v_after
    from public.user_account_controls c where c.user_id=v_target;
  end if;

  update public.enforcement_actions
  set status='applied',
      executed_at=now(),
      executed_by=v_actor,
      execution_result=jsonb_build_object(
        'before_state',coalesce(v_before,'{}'::jsonb),
        'after_state',coalesce(v_after,'{}'::jsonb),
        'executed_reason',trim(p_reason)
      ),
      failure_reason=null
  where id=p_action_id;

  if v_action.case_id is not null then
    insert into public.moderation_evidence(
      case_id,evidence_type,object_type,object_id,snapshot_json,captured_by,metadata
    ) values (
      v_action.case_id,
      'enforcement_execution',
      v_action.target_type,
      v_action.target_id,
      jsonb_build_object(
        'before_state',coalesce(v_before,'{}'::jsonb),
        'after_state',coalesce(v_after,'{}'::jsonb)
      ),
      v_actor,
      jsonb_build_object('enforcement_action_id',p_action_id,'action_type',v_action.action_type)
    );
  end if;

  perform public._admin_enforcement_event(
    p_action_id,v_actor,'applied',
    jsonb_build_object('action_type',v_action.action_type)
  );

  perform public.admin_write_audit(
    'trust_safety.enforcement.execute',
    case when v_action.target_type='user' then v_target else null end,
    'enforcement_action',p_action_id::text,trim(p_reason),
    to_jsonb(v_action),
    (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
    jsonb_build_object('target_type',v_action.target_type,'target_id',v_action.target_id)
  );

  if v_action.case_id is not null then
    update public.moderation_cases
    set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where id=v_action.case_id;
  end if;

  return jsonb_build_object(
    'status','applied',
    'action_id',p_action_id,
    'action_type',v_action.action_type,
    'target_type',v_action.target_type
  );
end;
$$;
revoke all on function public.admin_execute_enforcement_v1(uuid,text)
from public,anon;
grant execute on function public.admin_execute_enforcement_v1(uuid,text)
to authenticated;

create or replace function public.admin_revert_enforcement_v1(
  p_action_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_before jsonb;
  v_target uuid;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.execute')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'appeals.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'revert_reason_required';
  end if;

  select * into v_action
  from public.enforcement_actions
  where id=p_action_id
  for update;
  if not found then raise exception 'enforcement_not_found'; end if;
  if v_action.status in ('reverted','rejected') then
    return jsonb_build_object('status',v_action.status,'action_id',p_action_id);
  end if;

  if v_action.status in ('awaiting_approval','pending_execution') then
    update public.enforcement_actions
    set status='reverted',failure_reason='Cancelled before execution: ' || trim(p_reason)
    where id=p_action_id;
  elsif v_action.status='applied' then
    v_before := coalesce(v_action.execution_result->'before_state','{}'::jsonb);

    if v_action.action_type='remove_content' and v_action.target_type='post' then
      update public.posts
      set is_hidden=coalesce((v_before->>'is_hidden')::boolean,false),
          moderation_status=nullif(v_before->>'moderation_status',''),
          updated_at=now()
      where id=v_action.target_id::uuid;

    elsif v_action.action_type='remove_content' and v_action.target_type='message' then
      update public.messages
      set is_deleted=coalesce((v_before->>'is_deleted')::boolean,false),
          deleted_at=nullif(v_before->>'deleted_at','')::timestamptz,
          updated_at=now()
      where id=v_action.target_id::uuid;

    elsif v_action.action_type='remove_content' and v_action.target_type='marketplace_product' then
      update public.products
      set status=coalesce(nullif(v_before->>'status',''),'active'),
          moderation_status=coalesce(nullif(v_before->>'moderation_status',''),'approved'),
          moderation_notes=nullif(v_before->>'moderation_notes',''),
          updated_at=now()
      where id=v_action.target_id::uuid;

    elsif v_action.action_type in ('temporary_suspend','permanent_disable')
          and v_action.target_type='user' then
      v_target := v_action.target_id::uuid;
      if v_before='{}'::jsonb then
        delete from public.user_account_controls where user_id=v_target;
      else
        insert into public.user_account_controls(
          user_id,status,reason,suspended_until,changed_by,changed_at,updated_at
        ) values (
          v_target,
          coalesce(nullif(v_before->>'status',''),'active'),
          nullif(v_before->>'reason',''),
          nullif(v_before->>'suspended_until','')::timestamptz,
          v_actor,now(),now()
        )
        on conflict(user_id) do update set
          status=excluded.status,
          reason=excluded.reason,
          suspended_until=excluded.suspended_until,
          changed_by=v_actor,
          changed_at=now(),
          updated_at=now();
      end if;
    elsif v_action.action_type='warning' then
      null;
    else
      raise exception 'automatic_revert_not_supported';
    end if;

    update public.enforcement_actions
    set status='reverted',
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'reverted_at',now(),'reverted_by',v_actor,'revert_reason',trim(p_reason)
        )
    where id=p_action_id;
  else
    raise exception 'enforcement_cannot_be_reverted_from_status';
  end if;

  perform public._admin_enforcement_event(
    p_action_id,v_actor,'reverted',jsonb_build_object('reason',trim(p_reason))
  );
  perform public.admin_write_audit(
    'trust_safety.enforcement.revert',
    case when v_action.target_type='user' then v_action.target_id::uuid else null end,
    'enforcement_action',p_action_id::text,trim(p_reason),
    to_jsonb(v_action),
    (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
    '{}'::jsonb
  );

  return jsonb_build_object('status','reverted','action_id',p_action_id);
end;
$$;
revoke all on function public.admin_revert_enforcement_v1(uuid,text)
from public,anon;
grant execute on function public.admin_revert_enforcement_v1(uuid,text)
to authenticated;

create or replace function public.admin_review_appeal_v1(
  p_appeal_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.appeals%rowtype;
  v_after public.appeals%rowtype;
  v_enforcement public.enforcement_actions%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_revert jsonb;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'appeals.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_decision not in ('upheld','overturned','modified') then
    raise exception 'invalid_appeal_decision';
  end if;
  if char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'decision_note_required';
  end if;

  select * into v_before from public.appeals where id=p_appeal_id for update;
  if not found then raise exception 'appeal_not_found'; end if;
  if v_before.status not in ('open','in_review') then
    raise exception 'appeal_already_resolved';
  end if;

  select * into v_enforcement
  from public.enforcement_actions
  where id=v_before.enforcement_action_id
  for update;
  if not found then raise exception 'enforcement_not_found'; end if;
  if v_enforcement.created_by=v_actor then
    raise exception 'four_eyes_creator_cannot_review_appeal';
  end if;

  update public.appeals
  set status=v_decision,
      assigned_admin_id=v_actor,
      decision_note=trim(p_note),
      updated_at=now(),
      resolved_at=now()
  where id=p_appeal_id
  returning * into v_after;

  if v_decision='overturned' then
    v_revert := public.admin_revert_enforcement_v1(
      v_before.enforcement_action_id,
      'Appeal overturned: ' || trim(p_note)
    );
  elsif v_decision='modified' then
    update public.enforcement_actions
    set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'appeal_id',p_appeal_id,
      'appeal_decision',v_decision,
      'appeal_review_note',trim(p_note),
      'requires_manual_modification',true
    )
    where id=v_before.enforcement_action_id;
  end if;

  perform public.admin_write_audit(
    'trust_safety.appeal.review',
    v_before.appellant_id,
    'appeal',
    p_appeal_id::text,
    trim(p_note),
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object(
      'decision',v_decision,
      'enforcement_action_id',v_before.enforcement_action_id,
      'revert_result',coalesce(v_revert,'{}'::jsonb)
    )
  );

  return jsonb_build_object(
    'appeal',to_jsonb(v_after),
    'decision',v_decision,
    'enforcement_action_id',v_before.enforcement_action_id,
    'revert_result',v_revert
  );
end;
$$;
revoke all on function public.admin_review_appeal_v1(uuid,text,text)
from public,anon;
grant execute on function public.admin_review_appeal_v1(uuid,text,text)
to authenticated;

create or replace function public.admin_case_detail_v1(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'case',(
      select to_jsonb(c) || jsonb_build_object(
        'assigned_username',p.username,'assigned_name',p.display_name
      )
      from public.moderation_cases c
      left join public.profiles p on p.id=c.assigned_admin_id
      where c.id=p_case_id
    ),
    'reports',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.reports_v2 r
      join public.moderation_case_reports cr on cr.report_id=r.id
      where cr.case_id=p_case_id
    ),'[]'::jsonb),
    'evidence',coalesce((
      select jsonb_agg(
        to_jsonb(e) || jsonb_build_object(
          'captured_username',p.username,'captured_name',p.display_name
        )
        order by e.captured_at desc
      )
      from public.moderation_evidence e
      left join public.profiles p on p.id=e.captured_by
      where e.case_id=p_case_id
    ),'[]'::jsonb),
    'decisions',coalesce((
      select jsonb_agg(
        to_jsonb(d) || jsonb_build_object(
          'decided_username',p.username,'decided_name',p.display_name
        )
        order by d.created_at desc
      )
      from public.moderation_decisions d
      left join public.profiles p on p.id=d.decided_by
      where d.case_id=p_case_id
    ),'[]'::jsonb),
    'enforcement',coalesce((
      select jsonb_agg(
        to_jsonb(a) || jsonb_build_object(
          'created_username',creator.username,
          'created_name',creator.display_name,
          'executed_username',executor.username,
          'executed_name',executor.display_name,
          'approvals',coalesce((
            select jsonb_agg(
              to_jsonb(ap) || jsonb_build_object(
                'approver_username',pp.username,
                'approver_name',pp.display_name
              )
              order by ap.created_at
            )
            from public.enforcement_approvals ap
            left join public.profiles pp on pp.id=ap.approver_id
            where ap.enforcement_action_id=a.id
          ),'[]'::jsonb),
          'events',coalesce((
            select jsonb_agg(
              to_jsonb(ev) || jsonb_build_object(
                'actor_username',ep.username,
                'actor_name',ep.display_name
              )
              order by ev.created_at
            )
            from public.enforcement_execution_events ev
            left join public.profiles ep on ep.id=ev.actor_id
            where ev.enforcement_action_id=a.id
          ),'[]'::jsonb)
        )
        order by a.created_at desc
      )
      from public.enforcement_actions a
      left join public.profiles creator on creator.id=a.created_by
      left join public.profiles executor on executor.id=a.executed_by
      where a.case_id=p_case_id
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_case_detail_v1(uuid) from public,anon;
grant execute on function public.admin_case_detail_v1(uuid) to authenticated;

create or replace function public.admin_enforcement_queue_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(x) order by
        case x.status when 'awaiting_approval' then 1 when 'pending_execution' then 2 else 3 end,
        x.created_at asc
      )
      from (
        select a.id,a.case_id,a.target_type,a.target_id,a.action_type,a.status,
               a.starts_at,a.ends_at,a.created_by,a.created_at,a.approved_at,
               a.executed_at,a.executed_by,a.failure_reason,a.required_approvals,a.policy_code,
               c.case_number,c.title as case_title,
               p.username as creator_username,p.display_name as creator_name,
               (select count(*) from public.enforcement_approvals ap
                where ap.enforcement_action_id=a.id and ap.decision='approved') as approved_count
        from public.enforcement_actions a
        left join public.moderation_cases c on c.id=a.case_id
        left join public.profiles p on p.id=a.created_by
        where a.status in ('awaiting_approval','pending_execution','failed')
        order by a.created_at asc
        limit least(greatest(coalesce(p_limit,100),1),250)
      ) x
    ),'[]'::jsonb),
    'policies',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.category,p.code)
      from public.moderation_policies p
      where p.active
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_enforcement_queue_v1(integer) from public,anon;
grant execute on function public.admin_enforcement_queue_v1(integer) to authenticated;

create or replace function public.admin_update_moderation_policy_v1(
  p_code text,
  p_description text,
  p_default_action text,
  p_required_approvals integer,
  p_default_duration_hours integer,
  p_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.moderation_policies%rowtype;
  v_after public.moderation_policies%rowtype;
begin
  if v_actor is null or not (
    public.has_admin_role(v_actor,'super_admin')
    and public.has_admin_permission(v_actor,'admin.policy.manage')
  ) then
    raise exception 'super_admin_required' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'reason_required';
  end if;
  if p_required_approvals < 0 or p_required_approvals > 3 then
    raise exception 'invalid_required_approvals';
  end if;

  select * into v_before from public.moderation_policies where code=p_code for update;
  if not found then raise exception 'policy_not_found'; end if;

  update public.moderation_policies
  set description=coalesce(nullif(trim(p_description),''),description),
      default_action=case when p_default_action is null then default_action else nullif(trim(p_default_action),'') end,
      required_approvals=p_required_approvals,
      requires_independent_approval=(p_required_approvals > 0),
      default_duration_hours=p_default_duration_hours,
      active=p_active,
      updated_at=now(),
      updated_by=v_actor
  where code=p_code
  returning * into v_after;

  perform public.admin_write_audit(
    'trust_safety.policy.update',null,'moderation_policy',p_code,trim(p_reason),
    to_jsonb(v_before),to_jsonb(v_after),'{}'::jsonb
  );

  return to_jsonb(v_after);
end;
$$;
revoke all on function public.admin_update_moderation_policy_v1(text,text,text,integer,integer,boolean,text)
from public,anon;
grant execute on function public.admin_update_moderation_policy_v1(text,text,text,integer,integer,boolean,text)
to authenticated;

create or replace function public._admin_enforcement_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='awaiting_approval' then
    if tg_op='INSERT' or (tg_op='UPDATE' and old.status is distinct from new.status) then
      perform public._admin_emit_notification(
        'trust_safety',
        case when new.action_type='permanent_disable' then 'critical' else 'high' end,
        'Independent approval navbati',
        replace(new.action_type,'_',' ') || ' · ' || new.target_type,
        '/admin/trust-safety',
        'enforcement_action',
        new.id::text,
        jsonb_build_object('case_id',new.case_id,'required_approvals',new.required_approvals)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_enforcement_notification on public.enforcement_actions;
create trigger trg_admin_enforcement_notification
after insert or update of status on public.enforcement_actions
for each row execute function public._admin_enforcement_notification_trigger();

revoke all on function public._admin_enforcement_notification_trigger()
from public,anon,authenticated;

notify pgrst, 'reload schema';
