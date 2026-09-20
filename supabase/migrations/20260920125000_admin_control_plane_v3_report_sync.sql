-- Admin Control Plane v3.2: keep legacy report producers synchronized with reports_v2.

create or replace function public._sync_reports_legacy_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;

  insert into public.reports_v2(
    reporter_id,target_type,target_id,reason_code,description,source_surface,
    priority,status,legacy_source,legacy_id,created_at,resolved_at,updated_at
  ) values (
    new.reporter_id,
    case when new.post_id is not null then 'post' else 'user' end,
    coalesce(new.post_id::text,new.user_id::text),
    new.reason,
    new.description,
    'legacy_reports',
    case when new.reason in ('violence','harassment','nsfw') then 'high' else 'normal' end,
    case coalesce(new.status,'pending')
      when 'reviewing' then 'in_review'
      when 'resolved' then 'resolved'
      when 'dismissed' then 'dismissed'
      else 'open'
    end,
    'reports',
    new.id,
    coalesce(new.created_at,now()),
    case when new.status in ('resolved','dismissed') then new.reviewed_at else null end,
    now()
  )
  on conflict (legacy_source,legacy_id)
    where legacy_source is not null and legacy_id is not null
  do update set
    reporter_id=excluded.reporter_id,
    target_type=excluded.target_type,
    target_id=excluded.target_id,
    reason_code=excluded.reason_code,
    description=excluded.description,
    priority=excluded.priority,
    status=excluded.status,
    resolved_at=excluded.resolved_at,
    updated_at=now();

  return new;
end;
$$;

create or replace function public._sync_message_reports_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text;
  v_target_id text;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  v_target_type := case
    when coalesce(new.message_id,new.target_message_id) is not null then 'message'
    when coalesce(new.conversation_id,new.target_conversation_id) is not null then 'conversation'
    else 'user'
  end;
  v_target_id := coalesce(
    new.message_id::text,new.target_message_id::text,
    new.conversation_id::text,new.target_conversation_id::text,
    new.target_user_id::text
  );

  if v_target_id is null then return new; end if;

  insert into public.reports_v2(
    reporter_id,target_type,target_id,reason_code,description,source_surface,
    priority,status,legacy_source,legacy_id,created_at,resolved_at,updated_at
  ) values (
    new.reporter_id,
    v_target_type,
    v_target_id,
    new.reason,
    new.details,
    'messages',
    case when lower(new.reason) similar to '%(threat|violence|harass|abuse)%' then 'high' else 'normal' end,
    case coalesce(new.status,'pending')
      when 'reviewing' then 'in_review'
      when 'resolved' then 'resolved'
      when 'dismissed' then 'dismissed'
      else 'open'
    end,
    'message_reports',
    new.id,
    new.created_at,
    case when new.status in ('resolved','dismissed') then new.resolved_at else null end,
    now()
  )
  on conflict (legacy_source,legacy_id)
    where legacy_source is not null and legacy_id is not null
  do update set
    target_type=excluded.target_type,
    target_id=excluded.target_id,
    reason_code=excluded.reason_code,
    description=excluded.description,
    priority=excluded.priority,
    status=excluded.status,
    resolved_at=excluded.resolved_at,
    updated_at=now();

  return new;
end;
$$;

create or replace function public._sync_product_reports_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;

  insert into public.reports_v2(
    reporter_id,target_type,target_id,reason_code,description,source_surface,
    priority,status,legacy_source,legacy_id,created_at,resolved_at,updated_at
  ) values (
    new.reporter_id,
    'marketplace_product',
    new.product_id::text,
    new.reason,
    new.description,
    'marketplace',
    'normal',
    case coalesce(new.status,'pending')
      when 'reviewing' then 'in_review'
      when 'resolved' then 'resolved'
      when 'dismissed' then 'dismissed'
      else 'open'
    end,
    'product_reports',
    new.id,
    new.created_at,
    case when new.status in ('resolved','dismissed') then new.resolved_at else null end,
    now()
  )
  on conflict (legacy_source,legacy_id)
    where legacy_source is not null and legacy_id is not null
  do update set
    reason_code=excluded.reason_code,
    description=excluded.description,
    status=excluded.status,
    resolved_at=excluded.resolved_at,
    updated_at=now();

  return new;
end;
$$;

create or replace function public._sync_reports_v2_status_to_legacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := case new.status
    when 'open' then 'pending'
    when 'in_review' then 'reviewing'
    when 'resolved' then 'resolved'
    when 'dismissed' then 'dismissed'
    else 'pending'
  end;
  v_actor uuid := auth.uid();
begin
  if pg_trigger_depth() > 1 or new.legacy_source is null or new.legacy_id is null then
    return new;
  end if;

  if new.legacy_source='reports' then
    update public.reports
    set status=v_status,
        reviewed_at=case when v_status in ('resolved','dismissed') then coalesce(reviewed_at,now()) else reviewed_at end,
        reviewed_by=case when v_status in ('resolved','dismissed') then coalesce(reviewed_by,v_actor) else reviewed_by end
    where id=new.legacy_id;
  elsif new.legacy_source='message_reports' then
    update public.message_reports
    set status=v_status,
        resolved_at=case when v_status in ('resolved','dismissed') then coalesce(resolved_at,now()) else null end,
        resolved_by=case when v_status in ('resolved','dismissed') then coalesce(resolved_by,v_actor) else resolved_by end
    where id=new.legacy_id;
  elsif new.legacy_source='product_reports' then
    update public.product_reports
    set status=v_status,
        resolved_at=case when v_status in ('resolved','dismissed') then coalesce(resolved_at,now()) else null end,
        moderator_id=case when v_status in ('resolved','dismissed') then coalesce(moderator_id,v_actor) else moderator_id end,
        updated_at=now()
    where id=new.legacy_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reports_to_v2 on public.reports;
create trigger trg_reports_to_v2
after insert or update on public.reports
for each row execute function public._sync_reports_legacy_to_v2();

drop trigger if exists trg_message_reports_to_v2 on public.message_reports;
create trigger trg_message_reports_to_v2
after insert or update on public.message_reports
for each row execute function public._sync_message_reports_to_v2();

drop trigger if exists trg_product_reports_to_v2 on public.product_reports;
create trigger trg_product_reports_to_v2
after insert or update on public.product_reports
for each row execute function public._sync_product_reports_to_v2();

drop trigger if exists trg_reports_v2_to_legacy on public.reports_v2;
create trigger trg_reports_v2_to_legacy
after update of status on public.reports_v2
for each row
when (old.status is distinct from new.status)
execute function public._sync_reports_v2_status_to_legacy();

create or replace function public._admin_report_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.priority in ('high','critical')
     and new.status in ('open','in_review')
     and (
       tg_op='INSERT'
       or old.priority is distinct from new.priority
       or old.status is distinct from new.status
     ) then
    perform public._admin_emit_notification(
      'trust_safety',
      case when new.priority='critical' then 'critical' else 'high' end,
      'High-priority ' || replace(new.target_type,'_',' ') || ' report',
      coalesce(new.description,'Reason: ' || new.reason_code),
      '/admin/trust-safety',
      'report',
      new.id::text,
      jsonb_build_object(
        'reason_code',new.reason_code,
        'source_surface',new.source_surface,
        'priority',new.priority
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_report_notification on public.reports_v2;
create trigger trg_admin_report_notification
after insert or update of priority,status on public.reports_v2
for each row execute function public._admin_report_notification_trigger();

revoke all on function public._sync_reports_legacy_to_v2() from public,anon,authenticated;
revoke all on function public._sync_message_reports_to_v2() from public,anon,authenticated;
revoke all on function public._sync_product_reports_to_v2() from public,anon,authenticated;
revoke all on function public._sync_reports_v2_status_to_legacy() from public,anon,authenticated;
revoke all on function public._admin_report_notification_trigger() from public,anon,authenticated;

notify pgrst, 'reload schema';
