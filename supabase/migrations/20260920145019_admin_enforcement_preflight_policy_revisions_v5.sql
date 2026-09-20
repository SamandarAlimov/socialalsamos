-- Alsamos Admin Control Plane v5
-- Immutable policy revisions + execution preflight for four-eyes enforcement.

create table if not exists public.moderation_policy_revisions (
  id bigint generated always as identity primary key,
  policy_code text not null references public.moderation_policies(code)
    on update cascade on delete cascade,
  snapshot jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text not null,
  created_at timestamptz not null default now(),
  constraint moderation_policy_revisions_reason_len
    check (char_length(trim(change_reason)) between 3 and 2000)
);

create index if not exists moderation_policy_revisions_policy_created_idx
  on public.moderation_policy_revisions(policy_code, created_at desc);
create index if not exists moderation_policy_revisions_changed_by_idx
  on public.moderation_policy_revisions(changed_by);

alter table public.moderation_policy_revisions enable row level security;

drop policy if exists "RBAC trust safety policy revision read"
  on public.moderation_policy_revisions;
create policy "RBAC trust safety policy revision read"
on public.moderation_policy_revisions
for select
to authenticated
using (
  (select public.has_admin_permission((select auth.uid()), 'admin.trust_safety.view'))
  or (select public.has_admin_permission((select auth.uid()), 'reports.view'))
  or (select public.has_admin_permission((select auth.uid()), 'reports.review'))
);

grant select on public.moderation_policy_revisions to authenticated;

insert into public.moderation_policy_revisions(
  policy_code,
  snapshot,
  changed_by,
  change_reason,
  created_at
)
select
  p.code,
  to_jsonb(p),
  p.updated_by,
  'Initial catalog snapshot',
  p.updated_at
from public.moderation_policies p
where not exists (
  select 1
  from public.moderation_policy_revisions r
  where r.policy_code = p.code
);

alter table public.enforcement_actions
  add column if not exists policy_revision_id bigint
    references public.moderation_policy_revisions(id) on delete set null;

create index if not exists enforcement_actions_policy_revision_idx
  on public.enforcement_actions(policy_revision_id);

create or replace function public._admin_capture_enforcement_policy_revision()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.policy_code is not null and new.policy_revision_id is null then
    select r.id
      into new.policy_revision_id
    from public.moderation_policy_revisions r
    where r.policy_code = new.policy_code
    order by r.created_at desc, r.id desc
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public._admin_capture_enforcement_policy_revision()
from public, anon, authenticated;

drop trigger if exists trg_admin_capture_enforcement_policy_revision
  on public.enforcement_actions;
create trigger trg_admin_capture_enforcement_policy_revision
before insert on public.enforcement_actions
for each row
execute function public._admin_capture_enforcement_policy_revision();

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
  v_revision_id bigint;
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
  if p_default_duration_hours is not null
     and (p_default_duration_hours < 1 or p_default_duration_hours > 87600) then
    raise exception 'invalid_default_duration';
  end if;
  if p_default_action is not null
     and nullif(trim(p_default_action),'') is not null
     and trim(p_default_action) not in (
       'warning','remove_content','feature_limit','temporary_suspend',
       'permanent_disable','demonetize','age_restrict'
     ) then
    raise exception 'invalid_default_action';
  end if;

  select *
    into v_before
  from public.moderation_policies
  where code=p_code
  for update;
  if not found then
    raise exception 'policy_not_found';
  end if;

  update public.moderation_policies
  set description=coalesce(nullif(trim(p_description),''),description),
      default_action=case
        when p_default_action is null then default_action
        else nullif(trim(p_default_action),'')
      end,
      required_approvals=p_required_approvals,
      requires_independent_approval=(p_required_approvals > 0),
      default_duration_hours=p_default_duration_hours,
      active=p_active,
      updated_at=now(),
      updated_by=v_actor
  where code=p_code
  returning * into v_after;

  insert into public.moderation_policy_revisions(
    policy_code,
    snapshot,
    changed_by,
    change_reason
  ) values (
    p_code,
    to_jsonb(v_after),
    v_actor,
    trim(p_reason)
  )
  returning id into v_revision_id;

  perform public.admin_write_audit(
    'trust_safety.policy.update',
    null,
    'moderation_policy',
    p_code,
    trim(p_reason),
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object('policy_revision_id',v_revision_id)
  );

  return to_jsonb(v_after) || jsonb_build_object('policy_revision_id',v_revision_id);
end;
$$;

revoke all on function public.admin_update_moderation_policy_v1(
  text,text,text,integer,integer,boolean,text
)
from public,anon;
grant execute on function public.admin_update_moderation_policy_v1(
  text,text,text,integer,integer,boolean,text
)
to authenticated;

create or replace function public.admin_policy_revision_history_v1(
  p_code text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
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

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.id desc)
    from (
      select
        r.id,
        r.policy_code,
        r.snapshot,
        r.changed_by,
        r.change_reason,
        r.created_at,
        p.username as changed_username,
        p.display_name as changed_name
      from public.moderation_policy_revisions r
      left join public.profiles p on p.id=r.changed_by
      where r.policy_code=p_code
      order by r.id desc
      limit least(greatest(coalesce(p_limit,25),1),100)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_policy_revision_history_v1(text,integer)
from public,anon;
grant execute on function public.admin_policy_revision_history_v1(text,integer)
to authenticated;

create or replace function public.admin_enforcement_preflight_v1(
  p_action_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_approved integer := 0;
  v_target_uuid uuid;
  v_target_id_valid boolean := true;
  v_target_exists boolean := true;
  v_target_supported boolean := true;
  v_action_target_match boolean := true;
  v_protected boolean := false;
  v_super_admin_approval boolean := true;
  v_checks jsonb := '[]'::jsonb;
  v_ready boolean := true;
  v_policy_snapshot jsonb := null;
  v_policy_revision_created_at timestamptz := null;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.execute')
    or public.has_admin_permission(v_actor,'admin.enforcement.approve')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
    or public.has_admin_permission(v_actor,'admin.trust_safety.view')
    or public.has_admin_permission(v_actor,'reports.review')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select *
    into v_action
  from public.enforcement_actions
  where id=p_action_id;
  if not found then
    raise exception 'enforcement_not_found';
  end if;

  select count(*)::integer
    into v_approved
  from public.enforcement_approvals
  where enforcement_action_id=p_action_id
    and decision='approved';

  if v_action.policy_revision_id is not null then
    select r.snapshot, r.created_at
      into v_policy_snapshot, v_policy_revision_created_at
    from public.moderation_policy_revisions r
    where r.id=v_action.policy_revision_id;
  end if;

  if v_action.target_type in ('user','post','message','marketplace_product') then
    begin
      v_target_uuid := v_action.target_id::uuid;
    exception when invalid_text_representation then
      v_target_id_valid := false;
      v_target_exists := false;
    end;
  else
    v_target_supported := false;
    v_target_exists := false;
  end if;

  if v_target_id_valid and v_target_uuid is not null then
    if v_action.target_type='user' then
      select exists(select 1 from public.profiles p where p.id=v_target_uuid)
        into v_target_exists;
    elsif v_action.target_type='post' then
      select exists(select 1 from public.posts p where p.id=v_target_uuid)
        into v_target_exists;
    elsif v_action.target_type='message' then
      select exists(select 1 from public.messages m where m.id=v_target_uuid)
        into v_target_exists;
    elsif v_action.target_type='marketplace_product' then
      select exists(select 1 from public.products p where p.id=v_target_uuid)
        into v_target_exists;
    end if;
  end if;

  if v_action.action_type in ('temporary_suspend','permanent_disable') then
    v_action_target_match := v_action.target_type='user';
    if v_action_target_match and v_target_id_valid and v_target_uuid is not null then
      v_protected := public.admin_is_protected_user(v_target_uuid);
    end if;
  elsif v_action.action_type='remove_content' then
    v_action_target_match :=
      v_action.target_type in ('post','message','marketplace_product');
  elsif v_action.action_type='warning' then
    v_action_target_match := v_target_supported;
  else
    v_action_target_match := false;
  end if;

  if v_action.action_type='permanent_disable' then
    select exists(
      select 1
      from public.enforcement_approvals ap
      where ap.enforcement_action_id=p_action_id
        and ap.decision='approved'
        and public.has_admin_role(ap.approver_id,'super_admin')
    ) into v_super_admin_approval;
  end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','status_ready',
    'ok',v_action.status='pending_execution',
    'label','Execution status',
    'detail',case when v_action.status='pending_execution'
      then 'Action pending_execution holatida.'
      else 'Action statusi: ' || v_action.status end
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','approval_threshold',
    'ok',v_approved >= v_action.required_approvals,
    'label','Approval threshold',
    'detail',v_approved::text || ' / ' || v_action.required_approvals::text || ' approval'
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','start_time',
    'ok',v_action.starts_at <= now(),
    'label','Start time',
    'detail',case when v_action.starts_at <= now()
      then 'Action boshlanish vaqti yetgan.'
      else 'Action hali boshlanish vaqtiga yetmagan.' end
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','supported_action',
    'ok',v_action.action_type in ('warning','remove_content','temporary_suspend','permanent_disable'),
    'label','Executor support',
    'detail',case
      when v_action.action_type in ('warning','remove_content','temporary_suspend','permanent_disable')
        then 'Automatic executor ushbu actionni qo‘llaydi.'
      else 'Ushbu action manual executor talab qiladi.' end
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','target_type',
    'ok',v_target_supported and v_action_target_match and v_target_id_valid,
    'label','Target contract',
    'detail',case
      when not v_target_supported then 'Target type qo‘llab-quvvatlanmaydi.'
      when not v_target_id_valid then 'Target ID UUID formatida emas.'
      when not v_action_target_match then 'Action va target type mos emas.'
      else 'Action va target contract mos.' end
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','target_exists',
    'ok',v_target_exists,
    'label','Target mavjudligi',
    'detail',case when v_target_exists
      then 'Canonical target topildi.'
      else 'Canonical target topilmadi.' end
  ));

  if v_action.action_type in ('temporary_suspend','permanent_disable') then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'key','protected_user',
      'ok',not v_protected,
      'label','Protected account guard',
      'detail',case when v_protected
        then 'Protected admin/account targeti destructive enforcementdan himoyalangan.'
        else 'Target protected account emas.' end
    ));
  end if;

  if v_action.action_type='temporary_suspend' then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'key','suspension_window',
      'ok',v_action.ends_at is not null and v_action.ends_at > now(),
      'label','Suspension window',
      'detail',case when v_action.ends_at is not null and v_action.ends_at > now()
        then 'Temporary suspend yakun vaqti kelajakda.'
        else 'Temporary suspend uchun kelajakdagi ends_at talab qilinadi.' end
    ));
  end if;

  if v_action.action_type='permanent_disable' then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'key','super_admin_approval',
      'ok',v_super_admin_approval,
      'label','Super admin approval',
      'detail',case when v_super_admin_approval
        then 'Independent super admin approval mavjud.'
        else 'Permanent disable uchun super admin approval topilmadi.' end
    ));
  end if;

  select coalesce(bool_and((item->>'ok')::boolean), true)
    into v_ready
  from jsonb_array_elements(v_checks) item;

  return jsonb_build_object(
    'action_id',v_action.id,
    'ready',coalesce(v_ready,false),
    'status',v_action.status,
    'action_type',v_action.action_type,
    'target_type',v_action.target_type,
    'approved_count',v_approved,
    'required_approvals',v_action.required_approvals,
    'policy_code',v_action.policy_code,
    'policy_revision_id',v_action.policy_revision_id,
    'policy_revision_created_at',v_policy_revision_created_at,
    'policy_snapshot',v_policy_snapshot,
    'checks',v_checks,
    'checked_at',now()
  );
end;
$$;

revoke all on function public.admin_enforcement_preflight_v1(uuid)
from public,anon;
grant execute on function public.admin_enforcement_preflight_v1(uuid)
to authenticated;

notify pgrst, 'reload schema';
