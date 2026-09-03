-- Keep chat-list activity in sync at the database layer.
-- Client realtime is still used for instant UX, but this trigger is authoritative
-- for every sender/device and also repairs historical stale conversations.

create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_last_message_at timestamptz;
begin
  if tg_op = 'INSERT' then
    v_conversation_id := new.conversation_id;
    update public.conversations
    set last_message_at = greatest(
      coalesce(last_message_at, new.created_at),
      new.created_at
    )
    where id = new.conversation_id;

    return new;
  elsif tg_op = 'DELETE' then
    v_conversation_id := old.conversation_id;
  else
    v_conversation_id := new.conversation_id;
  end if;

  -- If a message is restored, it becomes eligible for latest activity again.
  if tg_op = 'UPDATE' and coalesce(old.is_deleted, false) is distinct from coalesce(new.is_deleted, false) then
    if coalesce(new.is_deleted, false) = false then
      update public.conversations
      set last_message_at = greatest(
        coalesce(last_message_at, new.created_at),
        new.created_at
      )
      where id = new.conversation_id;
      return new;
    end if;
  end if;

  -- Hard deletes or soft-deleting the latest message must fall back to the
  -- newest remaining visible message rather than leaving a stale timestamp.
  select max(m.created_at)
  into v_last_message_at
  from public.messages m
  where m.conversation_id = v_conversation_id
    and coalesce(m.is_deleted, false) = false;

  update public.conversations c
  set last_message_at = coalesce(v_last_message_at, c.created_at)
  where c.id = v_conversation_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_sync_conversation_activity_insert on public.messages;
create trigger messages_sync_conversation_activity_insert
after insert on public.messages
for each row
execute function public.sync_conversation_last_message_at();

drop trigger if exists messages_sync_conversation_activity_delete on public.messages;
create trigger messages_sync_conversation_activity_delete
after delete on public.messages
for each row
execute function public.sync_conversation_last_message_at();

drop trigger if exists messages_sync_conversation_activity_soft_delete on public.messages;
create trigger messages_sync_conversation_activity_soft_delete
after update of is_deleted on public.messages
for each row
when (old.is_deleted is distinct from new.is_deleted)
execute function public.sync_conversation_last_message_at();

-- Repair existing chats that were left behind by older clients.
with latest_visible as (
  select
    m.conversation_id,
    max(m.created_at) as last_message_at
  from public.messages m
  where coalesce(m.is_deleted, false) = false
  group by m.conversation_id
)
update public.conversations c
set last_message_at = l.last_message_at
from latest_visible l
where c.id = l.conversation_id
  and c.last_message_at is distinct from l.last_message_at;
