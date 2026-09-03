-- Follow-up for the already-applied chat activity migration.
-- Replaces the trigger function with explicit INSERT/UPDATE/DELETE branches.

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

  if tg_op = 'UPDATE'
     and coalesce(old.is_deleted, false) is distinct from coalesce(new.is_deleted, false)
     and coalesce(new.is_deleted, false) = false then
    update public.conversations
    set last_message_at = greatest(
      coalesce(last_message_at, new.created_at),
      new.created_at
    )
    where id = new.conversation_id;

    return new;
  end if;

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
