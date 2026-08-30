-- Canonical, idempotent call history.
-- One finished call produces one history row and one chat bubble regardless of
-- which participant presses End first or whether both clients race.

alter table public.messages
  add column if not exists call_id uuid references public.video_calls(id) on delete set null;

create unique index if not exists messages_one_call_history_per_call_idx
  on public.messages (call_id)
  where media_type = 'call_history' and call_id is not null;

create index if not exists messages_call_id_idx
  on public.messages (call_id)
  where call_id is not null;

create or replace function public.record_finished_video_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := 'ended';
  v_callee_id uuid;
  v_duration integer;
  v_history_id uuid;
begin
  if new.ended_at is null or old.ended_at is not null then
    return new;
  end if;

  if new.conversation_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.call_invites ci
    where ci.call_id = new.id and ci.status = 'missed'
  ) then
    v_status := 'missed';
  elsif exists (
    select 1 from public.call_invites ci
    where ci.call_id = new.id and ci.status = 'declined'
  ) then
    v_status := 'declined';
  elsif new.started_at is null then
    v_status := 'cancelled';
  end if;

  if not coalesce(new.is_group_call, false) then
    select cp.user_id
    into v_callee_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.host_id
    order by cp.user_id
    limit 1;
  end if;

  v_duration := case
    when new.started_at is not null
      then greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer)
    else null
  end;

  if not exists (
    select 1 from public.call_history ch where ch.call_id = new.id
  ) then
    insert into public.call_history (
      call_id,
      conversation_id,
      caller_id,
      callee_id,
      call_type,
      status,
      started_at,
      ended_at,
      duration_seconds,
      created_at
    )
    values (
      new.id,
      new.conversation_id,
      new.host_id,
      v_callee_id,
      new.call_type,
      v_status,
      new.started_at,
      new.ended_at,
      v_duration,
      now()
    )
    returning id into v_history_id;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    media_type,
    call_id,
    created_at
  )
  values (
    new.conversation_id,
    new.host_id,
    jsonb_build_object(
      'call_id', new.id,
      'type', case when new.call_type = 'audio' then 'audio' else 'video' end,
      'status', v_status,
      'duration', v_duration,
      'timestamp', new.ended_at,
      'caller_id', new.host_id,
      'callee_id', coalesce(v_callee_id, new.host_id)
    )::text,
    'call_history',
    new.id,
    new.ended_at
  )
  on conflict (call_id)
    where media_type = 'call_history' and call_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_record_finished_video_call on public.video_calls;
create trigger trg_record_finished_video_call
after update of status, ended_at on public.video_calls
for each row execute function public.record_finished_video_call();

comment on function public.record_finished_video_call() is
  'Creates exactly one canonical call history row and chat bubble when a call ends.';
