
-- Alsamos Admin Operations Hardening v7

-- Explicit deny policies on RLS tables that intentionally expose no direct rows.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name,c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relrowsecurity
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid)
  loop
    execute format(
      'create policy %I on %I.%I for all to anon, authenticated using (false) with check (false)',
      'Direct client access denied',r.schema_name,r.table_name
    );
  end loop;
end
$$;

-- Freeze search_path on application-owned functions only. Extension-owned
-- functions are intentionally excluded because their owner is managed by Supabase.
do $$
declare
  r record;
  v_path text;
begin
  for r in
    select n.nspname as schema_name,p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','alsamos_ops')
      and p.prokind='f'
      and pg_get_userbyid(p.proowner)=current_user
      and not exists(
        select 1 from pg_depend d
        where d.classid='pg_proc'::regclass
          and d.objid=p.oid
          and d.deptype='e'
      )
      and not exists(
        select 1
        from unnest(coalesce(p.proconfig,array[]::text[])) cfg
        where cfg like 'search_path=%'
      )
  loop
    v_path:=format('%I, public, extensions, auth, storage, net, vault, cron',r.schema_name);
    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      r.schema_name,r.proname,r.args,v_path
    );
  end loop;
end
$$;

-- SECURITY DEFINER trigger functions must never be callable as public RPCs.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name,p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.prosecdef
      and p.prorettype='pg_catalog.trigger'::regtype
      and pg_get_userbyid(p.proowner)=current_user
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      r.schema_name,r.proname,r.args
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- SLA escalation: stable one-step priority promotion + L1/L2/L3 time escalation.
-- ---------------------------------------------------------------------------
create or replace function private.process_moderation_sla_v1()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_state text;
  v_warning interval;
  v_new_priority text;
  v_level smallint;
  v_overdue interval;
  v_changed integer:=0;
begin
  for r in
    select id,case_number,title,priority,status,due_at,sla_state,sla_escalation_level
    from public.moderation_cases
    where status not in ('resolved','dismissed') and due_at is not null
    for update skip locked
  loop
    v_level:=r.sla_escalation_level;
    v_new_priority:=r.priority;

    v_warning:=case r.priority
      when 'critical' then interval '1 hour'
      when 'high' then interval '4 hours'
      when 'normal' then interval '12 hours'
      else interval '24 hours'
    end;

    v_state:=case
      when now()>r.due_at then 'breached'
      when r.due_at-now()<=v_warning then 'at_risk'
      else 'on_track'
    end;

    if v_state='breached' then
      v_overdue:=now()-r.due_at;
      v_level:=case
        when v_overdue>=interval '24 hours' then 3
        when v_overdue>=interval '4 hours' then 2
        else 1
      end;

      v_new_priority:=case
        when r.sla_state='breached' then r.priority
        when r.priority='low' then 'normal'
        when r.priority='normal' then 'high'
        when r.priority='high' then 'critical'
        else 'critical'
      end;

      update public.moderation_cases
      set sla_state='breached',
          sla_escalation_level=greatest(r.sla_escalation_level,v_level),
          sla_last_evaluated_at=now(),
          escalated_at=coalesce(escalated_at,now()),
          priority=v_new_priority,
          updated_at=now()
      where id=r.id;

      insert into public.moderation_case_sla_events(
        case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
      ) values (
        r.id,'breached',v_level,r.priority,v_new_priority,r.due_at,
        jsonb_build_object(
          'automated',true,
          'case_number',r.case_number,
          'overdue_seconds',greatest(0,extract(epoch from v_overdue)::bigint)
        )
      ) on conflict do nothing;

      if r.sla_state is distinct from 'breached' or v_level>r.sla_escalation_level then
        perform public._admin_emit_notification(
          'trust_safety',
          case when v_level>=2 then 'critical' else 'high' end,
          'SLA escalation L'||v_level||' · case #'||r.case_number,
          r.title,
          '/admin/trust-safety',
          'moderation_case',
          r.id::text,
          jsonb_build_object(
            'due_at',r.due_at,
            'escalation_level',v_level,
            'priority',v_new_priority
          )
        );
      end if;

    elsif v_state='at_risk' then
      update public.moderation_cases
      set sla_state='at_risk',sla_last_evaluated_at=now(),updated_at=now()
      where id=r.id;

      insert into public.moderation_case_sla_events(
        case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
      ) values (
        r.id,'at_risk',r.sla_escalation_level,r.priority,r.priority,r.due_at,
        jsonb_build_object('automated',true,'case_number',r.case_number)
      ) on conflict do nothing;

      if r.sla_state is distinct from 'at_risk' then
        perform public._admin_emit_notification(
          'trust_safety','warning',
          'SLA at risk · case #'||r.case_number,
          r.title,
          '/admin/trust-safety',
          'moderation_case',
          r.id::text,
          jsonb_build_object('due_at',r.due_at)
        );
      end if;

    else
      update public.moderation_cases
      set sla_state='on_track',sla_last_evaluated_at=now(),updated_at=now()
      where id=r.id;

      if r.sla_state in ('at_risk','breached') then
        insert into public.moderation_case_sla_events(
          case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
        ) values (
          r.id,'recovered',r.sla_escalation_level,r.priority,r.priority,r.due_at,
          jsonb_build_object('automated',true,'case_number',r.case_number)
        ) on conflict do nothing;
      end if;
    end if;

    if r.sla_state is distinct from v_state or v_level>r.sla_escalation_level then
      v_changed:=v_changed+1;
    end if;
  end loop;

  for r in
    select id,case_number,title,priority,status,due_at,sla_state,sla_escalation_level
    from public.moderation_cases
    where status in ('resolved','dismissed') and sla_state<>'resolved'
    for update skip locked
  loop
    update public.moderation_cases
    set sla_state='resolved',sla_last_evaluated_at=now(),updated_at=now()
    where id=r.id;

    insert into public.moderation_case_sla_events(
      case_id,event_type,escalation_level,prior_priority,new_priority,due_at,detail
    ) values (
      r.id,'resolved',r.sla_escalation_level,r.priority,r.priority,r.due_at,
      jsonb_build_object('automated',true,'case_number',r.case_number,'case_status',r.status)
    ) on conflict do nothing;

    v_changed:=v_changed+1;
  end loop;

  return v_changed;
end;
$$;
revoke all on function private.process_moderation_sla_v1() from public,anon,authenticated;

select private.process_moderation_sla_v1();

-- ---------------------------------------------------------------------------
-- Durable enforcement failure/retry ledger.
-- ---------------------------------------------------------------------------
alter table public.enforcement_execution_events
  drop constraint if exists enforcement_execution_events_event_type_check;
alter table public.enforcement_execution_events
  add constraint enforcement_execution_events_event_type_check
  check(event_type in (
    'requested','approved','rejected','ready','executing','applied','failed','reverted',
    'retry_requeued'
  ));

alter table public.enforcement_retry_requests
  drop constraint if exists enforcement_retry_requests_status_check;
alter table public.enforcement_retry_requests
  add constraint enforcement_retry_requests_status_check
  check(status in ('requeued','failed','cancelled','executed'));

create or replace function public.admin_execute_enforcement_v1(
  p_action_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_action public.enforcement_actions%rowtype;
  v_approved integer:=0;
  v_before jsonb:='{}'::jsonb;
  v_after jsonb:='{}'::jsonb;
  v_target uuid;
  v_error text;
  v_error_code text;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.enforcement.execute')
    or public.has_admin_permission(v_actor,'admin.trust_safety.manage')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  if char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'execution_reason_required';
  end if;

  select * into v_action
  from public.enforcement_actions
  where id=p_action_id
  for update;

  if not found then raise exception 'enforcement_not_found'; end if;
  if v_action.status<>'pending_execution' then raise exception 'enforcement_not_ready'; end if;
  if v_action.starts_at>now() then raise exception 'enforcement_not_started'; end if;

  select count(*) into v_approved
  from public.enforcement_approvals
  where enforcement_action_id=p_action_id and decision='approved';
  if v_approved<v_action.required_approvals then raise exception 'approval_threshold_not_met'; end if;

  if v_action.action_type in ('temporary_suspend','permanent_disable') then
    if v_action.target_type<>'user' then raise exception 'action_target_mismatch'; end if;
    begin
      v_target:=v_action.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_target_id';
    end;
    if public.admin_is_protected_user(v_target) then raise exception 'protected_user'; end if;
  end if;

  if v_action.action_type='remove_content'
     and v_action.target_type not in ('post','message','marketplace_product') then
    raise exception 'unsupported_remove_content_target';
  end if;

  if v_action.action_type not in ('warning','remove_content','temporary_suspend','permanent_disable') then
    raise exception 'manual_execution_required';
  end if;

  update public.enforcement_actions
  set status='executing',failure_reason=null
  where id=p_action_id;

  perform public._admin_enforcement_event(
    p_action_id,v_actor,'executing',
    jsonb_build_object('retry_count',v_action.retry_count)
  );

  begin
    if v_action.action_type='warning' then
      v_before:='{}'::jsonb;
      v_after:=jsonb_build_object('warning_recorded',true);

    elsif v_action.action_type='remove_content' and v_action.target_type='post' then
      select to_jsonb(p) into v_before
      from public.posts p where p.id=v_action.target_id::uuid for update;
      if v_before is null then raise exception 'target_not_found'; end if;

      update public.posts
      set is_hidden=true,moderation_status='rejected',updated_at=now()
      where id=v_action.target_id::uuid;

      select to_jsonb(p) into v_after
      from public.posts p where p.id=v_action.target_id::uuid;

    elsif v_action.action_type='remove_content' and v_action.target_type='message' then
      select to_jsonb(m) into v_before
      from public.messages m where m.id=v_action.target_id::uuid for update;
      if v_before is null then raise exception 'target_not_found'; end if;

      update public.messages
      set is_deleted=true,deleted_at=coalesce(deleted_at,now()),updated_at=now()
      where id=v_action.target_id::uuid;

      select to_jsonb(m) into v_after
      from public.messages m where m.id=v_action.target_id::uuid;

    elsif v_action.action_type='remove_content' and v_action.target_type='marketplace_product' then
      select to_jsonb(p) into v_before
      from public.products p where p.id=v_action.target_id::uuid for update;
      if v_before is null then raise exception 'target_not_found'; end if;

      update public.products
      set status='deleted',
          moderation_status='rejected',
          moderation_notes='Trust & Safety enforcement: '||trim(p_reason),
          moderated_at=now(),
          moderated_by=v_actor,
          updated_at=now()
      where id=v_action.target_id::uuid;

      select to_jsonb(p) into v_after
      from public.products p where p.id=v_action.target_id::uuid;

    elsif v_action.action_type='temporary_suspend' then
      select to_jsonb(c) into v_before
      from public.user_account_controls c where c.user_id=v_target for update;

      if v_action.ends_at is null or v_action.ends_at<=now() then
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
          'executed_reason',trim(p_reason),
          'retry_count',v_action.retry_count
        ),
        failure_reason=null
    where id=p_action_id;

    update public.enforcement_retry_requests
    set status='executed'
    where enforcement_action_id=p_action_id and status='requeued';

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
        jsonb_build_object(
          'enforcement_action_id',p_action_id,
          'action_type',v_action.action_type,
          'retry_count',v_action.retry_count
        )
      );
    end if;

    perform public._admin_enforcement_event(
      p_action_id,v_actor,'applied',
      jsonb_build_object('action_type',v_action.action_type,'retry_count',v_action.retry_count)
    );

    perform public.admin_write_audit(
      'trust_safety.enforcement.execute',
      case when v_action.target_type='user' then v_target else null end,
      'enforcement_action',p_action_id::text,trim(p_reason),
      to_jsonb(v_action),
      (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
      jsonb_build_object(
        'target_type',v_action.target_type,
        'target_id',v_action.target_id,
        'retry_count',v_action.retry_count
      )
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
      'target_type',v_action.target_type,
      'retry_count',v_action.retry_count
    );

  exception when others then
    v_error:=left(sqlerrm,1000);
    v_error_code:=sqlstate;

    update public.enforcement_actions
    set status='failed',
        failure_reason=v_error,
        execution_result=jsonb_build_object(
          'error_code',v_error_code,
          'error_message',v_error,
          'failed_at',now(),
          'retry_count',v_action.retry_count
        )
    where id=p_action_id;

    update public.enforcement_retry_requests
    set status='failed'
    where enforcement_action_id=p_action_id and status='requeued';

    perform public._admin_enforcement_event(
      p_action_id,v_actor,'failed',
      jsonb_build_object(
        'error_code',v_error_code,
        'error_message',v_error,
        'retry_count',v_action.retry_count
      )
    );

    begin
      perform public.admin_write_audit(
        'trust_safety.enforcement.failed',
        case when v_action.target_type='user' then v_target else null end,
        'enforcement_action',p_action_id::text,trim(p_reason),
        to_jsonb(v_action),
        (select to_jsonb(e) from public.enforcement_actions e where e.id=p_action_id),
        jsonb_build_object(
          'error_code',v_error_code,
          'error_message',v_error,
          'target_type',v_action.target_type,
          'target_id',v_action.target_id,
          'retry_count',v_action.retry_count
        )
      );
    exception when others then
      null;
    end;

    begin
      perform public._admin_emit_notification(
        'trust_safety','critical',
        'Enforcement execution failed',
        replace(v_action.action_type,'_',' ')||' · '||v_error,
        '/admin/trust-safety',
        'enforcement_action',
        p_action_id::text,
        jsonb_build_object('error_code',v_error_code,'retry_count',v_action.retry_count)
      );
    exception when others then
      null;
    end;

    return jsonb_build_object(
      'status','failed',
      'action_id',p_action_id,
      'action_type',v_action.action_type,
      'target_type',v_action.target_type,
      'error_code',v_error_code,
      'error_message',v_error,
      'retry_count',v_action.retry_count
    );
  end;
end;
$$;
revoke all on function public.admin_execute_enforcement_v1(uuid,text) from public,anon;
grant execute on function public.admin_execute_enforcement_v1(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deterministic tamper-evident audit chain.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_admin_audit_immutable_v1 on public.admin_audit_log;

create sequence if not exists private.admin_audit_chain_seq;

alter table public.admin_audit_log
  add column if not exists chain_seq bigint;

with ranked as (
  select id,row_number() over(order by created_at,id)::bigint as seq
  from public.admin_audit_log
)
update public.admin_audit_log a
set chain_seq=ranked.seq
from ranked
where ranked.id=a.id
  and a.chain_seq is null;

do $$
declare v_max bigint;
begin
  select coalesce(max(chain_seq),0) into v_max from public.admin_audit_log;
  if v_max=0 then
    perform setval('private.admin_audit_chain_seq',1,false);
  else
    perform setval('private.admin_audit_chain_seq',v_max,true);
  end if;
end
$$;

alter table public.admin_audit_log
  alter column chain_seq set not null;

create unique index if not exists admin_audit_log_chain_seq_key
  on public.admin_audit_log(chain_seq);

create or replace function private.admin_audit_event_hash_v2(
  p_prev_hash text,
  p_chain_seq bigint,
  p_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_reason text,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb,
  p_created_at timestamptz
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'prev_hash',coalesce(p_prev_hash,''),
          'chain_seq',p_chain_seq,
          'id',p_id,
          'actor_id',p_actor_id,
          'target_user_id',p_target_user_id,
          'action',p_action,
          'entity_type',p_entity_type,
          'entity_id',p_entity_id,
          'reason',p_reason,
          'before_state',coalesce(p_before,'{}'::jsonb),
          'after_state',coalesce(p_after,'{}'::jsonb),
          'metadata',coalesce(p_metadata,'{}'::jsonb),
          'created_at',p_created_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;
revoke all on function private.admin_audit_event_hash_v2(text,bigint,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,timestamptz)
from public,anon,authenticated;

do $$
declare
  r record;
  v_prev text:=repeat('0',64);
  v_hash text;
begin
  for r in
    select * from public.admin_audit_log order by chain_seq
  loop
    v_hash:=private.admin_audit_event_hash_v2(
      v_prev,r.chain_seq,r.id,r.actor_id,r.target_user_id,r.action,r.entity_type,r.entity_id,r.reason,
      r.before_state,r.after_state,r.metadata,r.created_at
    );

    update public.admin_audit_log
    set prev_hash=v_prev,event_hash=v_hash
    where id=r.id;

    v_prev:=v_hash;
  end loop;
end
$$;

create or replace function private.admin_audit_chain_insert_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_prev text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alsamos_admin_audit_chain_v2',0));

  new.chain_seq:=nextval('private.admin_audit_chain_seq'::regclass);

  select a.event_hash into v_prev
  from public.admin_audit_log a
  order by a.chain_seq desc
  limit 1;

  new.prev_hash:=coalesce(v_prev,repeat('0',64));
  new.event_hash:=private.admin_audit_event_hash_v2(
    new.prev_hash,new.chain_seq,new.id,new.actor_id,new.target_user_id,new.action,new.entity_type,new.entity_id,new.reason,
    new.before_state,new.after_state,new.metadata,new.created_at
  );

  return new;
end;
$$;
revoke all on function private.admin_audit_chain_insert_v1() from public,anon,authenticated;

drop trigger if exists trg_admin_audit_chain_insert_v1 on public.admin_audit_log;
create trigger trg_admin_audit_chain_insert_v1
before insert on public.admin_audit_log
for each row execute function private.admin_audit_chain_insert_v1();

create or replace function private.admin_audit_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'admin_audit_log_is_immutable' using errcode='42501';
end;
$$;
revoke all on function private.admin_audit_immutable_v1() from public,anon,authenticated;

create trigger trg_admin_audit_immutable_v1
before update or delete on public.admin_audit_log
for each row execute function private.admin_audit_immutable_v1();

create or replace function public.admin_verify_audit_chain_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  r record;
  v_prev text:=repeat('0',64);
  v_expected text;
  v_count integer:=0;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  for r in select * from public.admin_audit_log order by chain_seq loop
    v_expected:=private.admin_audit_event_hash_v2(
      v_prev,r.chain_seq,r.id,r.actor_id,r.target_user_id,r.action,r.entity_type,r.entity_id,r.reason,
      r.before_state,r.after_state,r.metadata,r.created_at
    );

    v_count:=v_count+1;

    if r.prev_hash is distinct from v_prev or r.event_hash is distinct from v_expected then
      return jsonb_build_object(
        'valid',false,
        'rows_checked',v_count,
        'first_invalid_id',r.id,
        'first_invalid_seq',r.chain_seq,
        'checked_at',now()
      );
    end if;

    v_prev:=r.event_hash;
  end loop;

  return jsonb_build_object(
    'valid',true,
    'rows_checked',v_count,
    'head_hash',v_prev,
    'head_seq',case when v_count=0 then 0 else (select max(chain_seq) from public.admin_audit_log) end,
    'checked_at',now()
  );
end;
$$;
revoke all on function public.admin_verify_audit_chain_v1() from public,anon;
grant execute on function public.admin_verify_audit_chain_v1() to authenticated;

create or replace function public.admin_audit_export_v1(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  return jsonb_build_object(
    'exported_at',now(),
    'chain',public.admin_verify_audit_chain_v1(),
    'events',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.chain_seq)
      from (
        select a.chain_seq,a.id,a.actor_id,a.target_user_id,a.action,a.entity_type,a.entity_id,a.reason,
               a.before_state,a.after_state,a.metadata,a.created_at,a.prev_hash,a.event_hash
        from public.admin_audit_log a
        where (p_from is null or a.created_at>=p_from)
          and (p_to is null or a.created_at<=p_to)
        order by a.chain_seq desc
        limit least(greatest(coalesce(p_limit,1000),1),5000)
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_audit_export_v1(timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.admin_audit_export_v1(timestamptz,timestamptz,integer) to authenticated;

create table if not exists public.admin_audit_export_manifests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  range_from timestamptz,
  range_to timestamptz,
  row_limit integer not null,
  row_count integer not null,
  chain_head_seq bigint not null,
  chain_head_hash text not null,
  payload_hash text not null,
  manifest_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_export_manifests enable row level security;
drop policy if exists "Admins can read audit export manifests" on public.admin_audit_export_manifests;
create policy "Admins can read audit export manifests"
on public.admin_audit_export_manifests
for select to authenticated
using (
  (select public.has_admin_permission((select auth.uid()),'admin.audit.view'))
  or (select public.has_admin_permission((select auth.uid()),'audit.view'))
  or (select public.has_admin_permission((select auth.uid()),'admin.system.view'))
);
grant select on public.admin_audit_export_manifests to authenticated;

create or replace function private.admin_audit_export_manifest_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'admin_audit_export_manifest_is_immutable' using errcode='42501';
end;
$$;
revoke all on function private.admin_audit_export_manifest_immutable_v1() from public,anon,authenticated;

drop trigger if exists trg_admin_audit_export_manifest_immutable_v1 on public.admin_audit_export_manifests;
create trigger trg_admin_audit_export_manifest_immutable_v1
before update or delete on public.admin_audit_export_manifests
for each row execute function private.admin_audit_export_manifest_immutable_v1();

create or replace function public.admin_create_audit_export_v2(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_export jsonb;
  v_events jsonb;
  v_payload_hash text;
  v_manifest_id uuid:=pg_catalog.gen_random_uuid();
  v_created_at timestamptz:=clock_timestamp();
  v_chain_head text;
  v_chain_seq bigint;
  v_row_count integer;
  v_manifest_hash text;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.audit.view')
    or public.has_admin_permission(v_actor,'audit.view')
    or public.has_admin_permission(v_actor,'admin.system.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  v_export:=public.admin_audit_export_v1(p_from,p_to,p_limit);
  v_events:=coalesce(v_export->'events','[]'::jsonb);
  v_payload_hash:=encode(extensions.digest(convert_to(v_events::text,'UTF8'),'sha256'),'hex');
  v_chain_head:=coalesce(v_export#>>'{chain,head_hash}',repeat('0',64));
  v_chain_seq:=coalesce((v_export#>>'{chain,head_seq}')::bigint,0);
  v_row_count:=jsonb_array_length(v_events);

  v_manifest_hash:=encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'id',v_manifest_id,
          'requested_by',v_actor,
          'range_from',p_from,
          'range_to',p_to,
          'row_limit',least(greatest(coalesce(p_limit,1000),1),5000),
          'row_count',v_row_count,
          'chain_head_seq',v_chain_seq,
          'chain_head_hash',v_chain_head,
          'payload_hash',v_payload_hash,
          'created_at',v_created_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.admin_audit_export_manifests(
    id,requested_by,range_from,range_to,row_limit,row_count,
    chain_head_seq,chain_head_hash,payload_hash,manifest_hash,created_at
  ) values (
    v_manifest_id,v_actor,p_from,p_to,least(greatest(coalesce(p_limit,1000),1),5000),v_row_count,
    v_chain_seq,v_chain_head,v_payload_hash,v_manifest_hash,v_created_at
  );

  perform public.admin_write_audit(
    'system.audit.export',
    null,
    'admin_audit_export',
    v_manifest_id::text,
    'Tamper-evident audit export created',
    '{}'::jsonb,
    jsonb_build_object(
      'row_count',v_row_count,
      'chain_head_seq',v_chain_seq,
      'chain_head_hash',v_chain_head,
      'payload_hash',v_payload_hash,
      'manifest_hash',v_manifest_hash
    ),
    jsonb_build_object('range_from',p_from,'range_to',p_to,'row_limit',p_limit)
  );

  return v_export || jsonb_build_object(
    'manifest',jsonb_build_object(
      'id',v_manifest_id,
      'requested_by',v_actor,
      'row_count',v_row_count,
      'chain_head_seq',v_chain_seq,
      'chain_head_hash',v_chain_head,
      'payload_hash',v_payload_hash,
      'manifest_hash',v_manifest_hash,
      'created_at',v_created_at
    )
  );
end;
$$;
revoke all on function public.admin_create_audit_export_v2(timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.admin_create_audit_export_v2(timestamptz,timestamptz,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Live security advisor posture aligned to Supabase advisor categories.
-- ---------------------------------------------------------------------------
create or replace function public.admin_security_posture_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_rls_no_policy integer;
  v_mutable_search_path integer;
  v_anon_definer integer;
  v_anon_definer_trigger integer;
  v_public_extensions integer;
  v_chain jsonb;
  v_country_known integer;
  v_country_unknown integer;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.system.view')
    or public.has_admin_permission(v_actor,'admin.security.view')
    or public.has_admin_permission(v_actor,'security.view')
    or public.has_admin_permission(v_actor,'admin.audit.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  select count(*) into v_rls_no_policy
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relrowsecurity
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid);

  select count(*) into v_mutable_search_path
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','alsamos_ops')
    and p.prokind='f'
    and not exists(
      select 1 from pg_catalog.pg_depend d
      where d.classid='pg_proc'::regclass
        and d.objid=p.oid
        and d.deptype='e'
    )
    and not exists(
      select 1
      from unnest(coalesce(p.proconfig,array[]::text[])) cfg
      where cfg like 'search_path=%'
    );

  select count(*) into v_anon_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  select count(*) into v_anon_definer_trigger
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.prorettype='pg_catalog.trigger'::regtype
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  select count(*) into v_public_extensions
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  where n.nspname='public';

  v_chain:=public.admin_verify_audit_chain_v1();

  select count(*) filter(where country_code is not null),
         count(*) filter(where country_code is null)
    into v_country_known,v_country_unknown
  from private.user_country_resolution;

  return jsonb_build_object(
    'checked_at',now(),
    'audit_chain',v_chain,
    'rls_exposed_without_policy',v_rls_no_policy,
    'security_definer_public_execute',v_anon_definer,
    'advisor',jsonb_build_object(
      'rls_enabled_no_policy',v_rls_no_policy,
      'mutable_search_path',v_mutable_search_path,
      'anon_security_definer_rpc',v_anon_definer,
      'anon_security_definer_trigger',v_anon_definer_trigger,
      'extensions_in_public',v_public_extensions
    ),
    'country_resolution',jsonb_build_object(
      'resolved',coalesce(v_country_known,0),
      'unknown',coalesce(v_country_unknown,0),
      'coverage_pct',case
        when coalesce(v_country_known,0)+coalesce(v_country_unknown,0)=0 then 0
        else round(100.0*v_country_known/(v_country_known+v_country_unknown),1)
      end
    ),
    'sla',jsonb_build_object(
      'at_risk',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='at_risk'),
      'breached',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='breached')
    ),
    'enforcement',jsonb_build_object(
      'failed',(select count(*) from public.enforcement_actions where status='failed'),
      'retry_requests',(select count(*) from public.enforcement_retry_requests),
      'retry_failed',(select count(*) from public.enforcement_retry_requests where status='failed')
    ),
    'audit_exports',jsonb_build_object(
      'total',(select count(*) from public.admin_audit_export_manifests),
      'latest_at',(select max(created_at) from public.admin_audit_export_manifests)
    )
  );
end;
$$;
revoke all on function public.admin_security_posture_v1() from public,anon;
grant execute on function public.admin_security_posture_v1() to authenticated;

notify pgrst,'reload schema';
