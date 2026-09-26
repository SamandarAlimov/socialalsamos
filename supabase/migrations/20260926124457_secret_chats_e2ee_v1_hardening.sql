begin;

create or replace function public.create_secret_conversation(
  p_other_user_id uuid,
  p_my_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_conversation_id uuid;
  v_peer_device public.user_e2ee_devices%rowtype;
  v_my_device public.user_e2ee_devices%rowtype;
  v_accepts boolean := true;
  v_blocked boolean := false;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user then
    raise exception 'invalid_recipient';
  end if;
  if not public.check_rate_limit('secret_chat_create', v_user::text, 20, 3600) then
    raise exception 'rate_limited';
  end if;

  select * into v_my_device
  from public.user_e2ee_devices d
  where d.id = p_my_device_id
    and d.user_id = v_user
    and d.revoked_at is null;

  if v_my_device.id is null then
    raise exception 'sender_e2ee_device_not_registered';
  end if;

  select coalesce(us.accept_secret_chats, true)
    into v_accepts
  from public.user_settings us
  where us.user_id = p_other_user_id;

  if found and not v_accepts then
    raise exception 'recipient_secret_chats_disabled';
  end if;

  select (
    exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_user and b.blocked_user_id = p_other_user_id)
         or (b.blocker_id = p_other_user_id and b.blocked_user_id = v_user)
    )
    or exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = v_user and b.blocked_id = p_other_user_id)
         or (b.blocker_id = p_other_user_id and b.blocked_id = v_user)
    )
  ) into v_blocked;

  if coalesce(v_blocked, false) then
    raise exception 'blocked';
  end if;

  select * into v_peer_device
  from public.user_e2ee_devices d
  where d.user_id = p_other_user_id
    and d.revoked_at is null
  order by d.last_seen_at desc, d.created_at desc
  limit 1;

  if v_peer_device.id is null then
    raise exception 'recipient_e2ee_device_not_ready';
  end if;

  insert into public.conversations (
    type,
    owner_id,
    is_encrypted,
    security_mode,
    restrict_saving_content,
    last_message_at
  ) values (
    'private',
    v_user,
    true,
    'e2ee',
    true,
    now()
  )
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (v_conversation_id, v_user, 'owner'),
    (v_conversation_id, p_other_user_id, 'member');

  insert into public.secret_conversation_devices (
    conversation_id, user_id, device_id, public_key_jwk, key_version
  ) values
    (v_conversation_id, v_user, v_my_device.id, v_my_device.public_key_jwk, v_my_device.key_version),
    (v_conversation_id, p_other_user_id, v_peer_device.id, v_peer_device.public_key_jwk, v_peer_device.key_version);

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'my_device_id', v_my_device.id,
    'peer_device_id', v_peer_device.id,
    'peer_public_key_jwk', v_peer_device.public_key_jwk,
    'key_version', 1
  );
end;
$$;

revoke all on function public.create_secret_conversation(uuid, uuid) from public;
grant execute on function public.create_secret_conversation(uuid, uuid) to authenticated;

create or replace function public.guard_secret_scheduled_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_security_mode text;
begin
  select c.security_mode into v_security_mode
  from public.conversations c
  where c.id = new.conversation_id;

  if coalesce(v_security_mode, 'standard') = 'e2ee' then
    raise exception 'secret_chat_scheduling_not_supported';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_secret_scheduled_message on public.scheduled_messages;
create trigger trg_guard_secret_scheduled_message
before insert or update on public.scheduled_messages
for each row execute function public.guard_secret_scheduled_message();

commit;