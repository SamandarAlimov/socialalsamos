-- Move Alsamos calls from the old 8-peer mesh assumptions to an SFU-aware
-- lifecycle. Media itself is carried by LiveKit; Supabase remains authoritative
-- for call membership, ringing, history and UI state.

alter table public.video_calls
  add column if not exists call_mode text;

alter table public.video_calls
  add column if not exists media_topology text;

alter table public.video_calls
  add column if not exists max_participants integer;

update public.video_calls vc
set
  call_mode = case
    when c.type = 'channel' then 'broadcast'
    when c.type = 'group' then 'group'
    when coalesce(vc.is_group_call, false) then 'conference'
    else 'direct'
  end,
  media_topology = 'sfu',
  max_participants = case
    when c.type = 'channel' then greatest(coalesce(vc.max_participants, 0), 3000)
    when c.type = 'group' then greatest(coalesce(vc.max_participants, 0), 500)
    when coalesce(vc.is_group_call, false) then greatest(coalesce(vc.max_participants, 0), 64)
    else 2
  end
from public.conversations c
where c.id = vc.conversation_id;

update public.video_calls
set
  call_mode = coalesce(call_mode, case when coalesce(is_group_call, false) then 'conference' else 'direct' end),
  media_topology = 'sfu',
  max_participants = case
    when coalesce(call_mode, case when coalesce(is_group_call, false) then 'conference' else 'direct' end) = 'broadcast'
      then greatest(coalesce(max_participants, 0), 3000)
    when coalesce(call_mode, case when coalesce(is_group_call, false) then 'conference' else 'direct' end) = 'group'
      then greatest(coalesce(max_participants, 0), 500)
    when coalesce(call_mode, case when coalesce(is_group_call, false) then 'conference' else 'direct' end) = 'conference'
      then greatest(coalesce(max_participants, 0), 64)
    else 2
  end
where conversation_id is null
   or call_mode is null
   or media_topology is null
   or max_participants is null;

alter table public.video_calls
  alter column call_mode set default 'direct',
  alter column call_mode set not null,
  alter column media_topology set default 'sfu',
  alter column media_topology set not null,
  alter column max_participants set default 500,
  alter column max_participants set not null;

alter table public.video_calls
  drop constraint if exists video_calls_call_mode_check;
alter table public.video_calls
  add constraint video_calls_call_mode_check
  check (call_mode in ('direct', 'conference', 'group', 'broadcast'));

alter table public.video_calls
  drop constraint if exists video_calls_media_topology_check;
alter table public.video_calls
  add constraint video_calls_media_topology_check
  check (media_topology in ('sfu', 'p2p'));

alter table public.video_calls
  drop constraint if exists video_calls_max_participants_sfu_check;
alter table public.video_calls
  add constraint video_calls_max_participants_sfu_check
  check (max_participants between 2 and 3000);

create or replace function public.set_video_call_sfu_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if new.conversation_id is not null then
    select c.type
      into v_type
    from public.conversations c
    where c.id = new.conversation_id;
  end if;

  if new.call_mode is null
     or (tg_op = 'INSERT' and new.call_mode = 'direct' and v_type in ('group', 'channel'))
  then
    new.call_mode := case
      when v_type = 'channel' then 'broadcast'
      when v_type = 'group' then 'group'
      when coalesce(new.is_group_call, false) then 'conference'
      else 'direct'
    end;
  end if;

  new.media_topology := 'sfu';

  -- Override the old mesh cap when callers still send/default <= 8.
  if new.max_participants is null or new.max_participants <= 8 then
    new.max_participants := case new.call_mode
      when 'broadcast' then 3000
      when 'group' then 500
      when 'conference' then 64
      else 2
    end;
  end if;

  if new.call_mode = 'direct' then
    new.max_participants := 2;
    new.is_group_call := false;
  else
    new.is_group_call := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_video_calls_sfu_defaults on public.video_calls;
create trigger trg_video_calls_sfu_defaults
before insert or update of conversation_id, call_mode, max_participants
on public.video_calls
for each row execute function public.set_video_call_sfu_defaults();

-- Existing open calls should immediately stop advertising the old 8-person
-- mesh ceiling after this migration is applied.
update public.video_calls
set max_participants = case call_mode
  when 'broadcast' then greatest(max_participants, 3000)
  when 'group' then greatest(max_participants, 500)
  when 'conference' then greatest(max_participants, 64)
  else 2
end
where ended_at is null
  and status in ('waiting', 'active');

comment on column public.video_calls.call_mode is
  'Alsamos call semantics: direct, conference, group, or broadcast.';
comment on column public.video_calls.media_topology is
  'Media transport topology. New calls use sfu; p2p is retained only for rollback/history.';
