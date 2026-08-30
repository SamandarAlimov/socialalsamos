-- Premium call invitation lifecycle.
-- Keeps incoming ringing scoped to explicit invitees instead of broadcasting
-- every video_calls INSERT to every authenticated client.

create unique index if not exists call_invites_call_invitee_unique_idx
  on public.call_invites (call_id, invitee_id)
  where invitee_id is not null;

create index if not exists call_invites_pending_invitee_idx
  on public.call_invites (invitee_id, created_at desc)
  where status in ('pending', 'ringing');

alter table public.call_invites enable row level security;

drop policy if exists "call_invites_select_parties" on public.call_invites;
create policy "call_invites_select_parties"
on public.call_invites
for select
to authenticated
using (
  invitee_id = auth.uid()
  or inviter_id = auth.uid()
  or public.can_view_call(call_id, auth.uid())
);

create or replace function public.invite_to_video_call(
  p_call_id uuid,
  p_invitee_id uuid,
  p_call_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
  v_invite_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_call
  from public.video_calls
  where id = p_call_id
  for update;

  if not found then
    raise exception 'call_not_found';
  end if;

  if v_call.ended_at is not null or v_call.status = 'ended' then
    raise exception 'call_ended';
  end if;

  if not public.can_view_call(p_call_id, v_user_id) then
    raise exception 'not_call_participant';
  end if;

  if p_invitee_id = v_user_id then
    raise exception 'cannot_invite_self';
  end if;

  if v_call.conversation_id is not null and not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = v_call.conversation_id
      and cp.user_id = p_invitee_id
  ) then
    raise exception 'invitee_not_conversation_participant';
  end if;

  insert into public.call_invites (
    call_id,
    conversation_id,
    inviter_id,
    invitee_id,
    call_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  values (
    p_call_id,
    v_call.conversation_id,
    v_user_id,
    p_invitee_id,
    coalesce(nullif(p_call_type, ''), v_call.call_type, 'video'),
    'pending',
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (call_id, invitee_id) where invitee_id is not null
  do update set
    inviter_id = excluded.inviter_id,
    call_type = excluded.call_type,
    status = case
      when public.call_invites.status in ('accepted', 'joined') then public.call_invites.status
      else 'pending'
    end,
    updated_at = now()
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.invite_to_video_call(uuid, uuid, text) from public, anon;
grant execute on function public.invite_to_video_call(uuid, uuid, text) to authenticated;

create or replace function public.seed_video_call_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null then
    return new;
  end if;

  insert into public.call_invites (
    call_id,
    conversation_id,
    inviter_id,
    invitee_id,
    call_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  select
    new.id,
    new.conversation_id,
    new.host_id,
    cp.user_id,
    new.call_type,
    'pending',
    '{}'::jsonb,
    now(),
    now()
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.host_id
  on conflict (call_id, invitee_id) where invitee_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_video_call_invites on public.video_calls;
create trigger trg_seed_video_call_invites
after insert on public.video_calls
for each row execute function public.seed_video_call_invites();

create or replace function public.sync_call_invite_from_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.connection_state = 'declined' then
    update public.call_invites
    set status = 'declined', updated_at = now()
    where call_id = new.call_id
      and invitee_id = new.user_id
      and status not in ('missed', 'cancelled');
  elsif new.left_at is null
    and new.joined_at is not null
    and new.connection_state in ('connecting', 'connected')
  then
    update public.call_invites
    set status = 'accepted', updated_at = now()
    where call_id = new.call_id
      and invitee_id = new.user_id
      and status in ('pending', 'ringing');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_call_invite_from_participant on public.call_participants;
create trigger trg_sync_call_invite_from_participant
after insert or update of connection_state, joined_at, left_at
on public.call_participants
for each row execute function public.sync_call_invite_from_participant();

create or replace function public.sync_call_invites_when_call_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null or new.status = 'ended' then
    update public.call_invites
    set status = case
      when status in ('pending', 'ringing') then 'cancelled'
      else status
    end,
    updated_at = now()
    where call_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_call_invites_when_call_ends on public.video_calls;
create trigger trg_sync_call_invites_when_call_ends
after update of status, ended_at on public.video_calls
for each row execute function public.sync_call_invites_when_call_ends();

create or replace function public.mark_video_call_missed(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_call public.video_calls;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_call
  from public.video_calls
  where id = p_call_id
  for update;

  if not found then
    return;
  end if;

  if not public.can_view_call(p_call_id, v_user_id) then
    raise exception 'not_call_participant';
  end if;

  update public.call_invites
  set status = 'missed', updated_at = now()
  where call_id = p_call_id
    and invitee_id = v_user_id
    and status in ('pending', 'ringing');

  insert into public.call_participants (
    call_id, user_id, joined_at, left_at, is_muted, is_video_on,
    is_screen_sharing, is_hand_raised, connection_state, last_seen_at
  ) values (
    p_call_id, v_user_id, null, now(), false, false,
    false, false, 'missed', now()
  )
  on conflict (call_id, user_id) do update set
    left_at = now(),
    connection_state = 'missed',
    last_seen_at = now();

  if not coalesce(v_call.is_group_call, false) then
    update public.video_calls
    set status = 'ended',
        ended_at = coalesce(ended_at, now())
    where id = p_call_id
      and ended_at is null;
  end if;
end;
$$;

revoke all on function public.mark_video_call_missed(uuid) from public, anon;
grant execute on function public.mark_video_call_missed(uuid) to authenticated;

-- Backfill explicit invites for currently open calls so deploys are seamless.
insert into public.call_invites (
  call_id,
  conversation_id,
  inviter_id,
  invitee_id,
  call_type,
  status,
  metadata,
  created_at,
  updated_at
)
select
  vc.id,
  vc.conversation_id,
  vc.host_id,
  cp.user_id,
  vc.call_type,
  'pending',
  '{}'::jsonb,
  vc.created_at,
  now()
from public.video_calls vc
join public.conversation_participants cp
  on cp.conversation_id = vc.conversation_id
where vc.ended_at is null
  and vc.status in ('waiting', 'active')
  and cp.user_id <> vc.host_id
on conflict (call_id, invitee_id) where invitee_id is not null
do nothing;
