-- Admin Control Plane v3.1: appeals workflow + richer operations notifications.

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

  select * into v_before
  from public.appeals
  where id = p_appeal_id
  for update;
  if not found then raise exception 'appeal_not_found'; end if;
  if v_before.status not in ('open','in_review') then
    raise exception 'appeal_already_resolved';
  end if;

  select * into v_enforcement
  from public.enforcement_actions
  where id = v_before.enforcement_action_id
  for update;

  update public.appeals
  set status = v_decision,
      assigned_admin_id = v_actor,
      decision_note = trim(p_note),
      updated_at = now(),
      resolved_at = now()
  where id = p_appeal_id
  returning * into v_after;

  if v_decision = 'overturned' then
    update public.enforcement_actions
    set status = 'reverted',
        metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object(
            'appeal_id', p_appeal_id,
            'appeal_decision', v_decision,
            'appeal_reviewed_by', v_actor,
            'appeal_reviewed_at', now()
          )
    where id = v_before.enforcement_action_id
      and status in ('pending_execution','executing','applied','failed');
  elsif v_decision = 'modified' then
    update public.enforcement_actions
    set metadata = coalesce(metadata,'{}'::jsonb)
      || jsonb_build_object(
        'appeal_id', p_appeal_id,
        'appeal_decision', v_decision,
        'appeal_review_note', trim(p_note),
        'requires_manual_modification', true
      )
    where id = v_before.enforcement_action_id;
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
      'decision', v_decision,
      'enforcement_action_id', v_before.enforcement_action_id
    )
  );

  return jsonb_build_object(
    'appeal', to_jsonb(v_after),
    'decision', v_decision,
    'enforcement_action_id', v_before.enforcement_action_id
  );
end;
$$;

revoke all on function public.admin_review_appeal_v1(uuid,text,text)
  from public, anon;
grant execute on function public.admin_review_appeal_v1(uuid,text,text)
  to authenticated;

create or replace function public.admin_mark_all_notifications_read_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer := 0;
begin
  if v_actor is null or not public.is_admin_staff(v_actor) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  insert into public.admin_notification_reads(notification_id,user_id,read_at)
  select n.id, v_actor, now()
  from public.admin_notifications n
  where (n.expires_at is null or n.expires_at > now())
    and (
      n.user_id = v_actor
      or (
        n.user_id is null and (
          n.target_role_key is null
          or exists (
            select 1
            from public.admin_role_assignments a
            where a.user_id = v_actor
              and a.role_key = n.target_role_key
              and a.revoked_at is null
          )
          or public.has_admin_role(v_actor,'super_admin')
        )
      )
    )
  on conflict(notification_id,user_id)
  do update set read_at = excluded.read_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_mark_all_notifications_read_v1()
  from public, anon;
grant execute on function public.admin_mark_all_notifications_read_v1()
  to authenticated;

create or replace function public._admin_incident_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.severity in ('high','critical')
     and new.status <> 'resolved'
     and (
       tg_op = 'INSERT'
       or old.severity is distinct from new.severity
       or old.status is distinct from new.status
     ) then
    perform public._admin_emit_notification(
      'security_analyst',
      case when new.severity='critical' then 'critical' else 'high' end,
      'Operations incident: ' || new.title,
      coalesce(new.summary, 'Operational incident requires review.'),
      '/admin/operations',
      'admin_incident',
      new.id::text,
      jsonb_build_object('severity',new.severity,'status',new.status,'area',new.area)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_incident_notification on public.admin_incidents;
create trigger trg_admin_incident_notification
after insert or update of severity,status on public.admin_incidents
for each row execute function public._admin_incident_notification_trigger();

notify pgrst, 'reload schema';
