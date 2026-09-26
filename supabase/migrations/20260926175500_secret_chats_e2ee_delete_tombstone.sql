begin;

create or replace function public.guard_secret_message_payload()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_security_mode text;
  v_bound_device uuid;
  v_sender_device uuid;
begin
  select c.security_mode into v_security_mode
  from public.conversations c
  where c.id = new.conversation_id;

  if coalesce(v_security_mode, 'standard') <> 'e2ee' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Everyone-delete is the only content mutation allowed for Secret Chat.
    -- Rewrite it into a tombstone and destroy the ciphertext envelope so the
    -- server no longer retains recoverable message content after deletion.
    if new.is_deleted is true and old.is_deleted is distinct from true then
      new.content := '🔒';
      new.media_url := null;
      new.media_type := null;
      new.location_payload := null;
      new.live_location_expires_at := null;
      new.live_location_stopped_at := now();
      new.metadata := '{}'::jsonb;
      return new;
    end if;

    if new.content is distinct from old.content
       or new.media_url is distinct from old.media_url
       or new.media_type is distinct from old.media_type
       or new.location_payload is distinct from old.location_payload
       or new.metadata is distinct from old.metadata then
      raise exception 'secret_message_content_is_immutable';
    end if;
    return new;
  end if;

  if new.sender_id is null then
    raise exception 'secret_message_sender_required';
  end if;

  if new.content is distinct from '🔒'::text then
    raise exception 'secret_message_plaintext_rejected';
  end if;

  if new.media_url is not null
     or new.media_type is not null
     or new.location_payload is not null
     or new.live_location_expires_at is not null
     or new.live_location_stopped_at is not null then
    raise exception 'secret_message_media_not_supported_v1';
  end if;

  if jsonb_typeof(new.metadata->'e2ee') <> 'object'
     or coalesce(new.metadata->'e2ee'->>'ciphertext', '') = ''
     or coalesce(new.metadata->'e2ee'->>'iv', '') = ''
     or coalesce(new.metadata->'e2ee'->>'sender_device_id', '') = ''
     or coalesce(new.metadata->'e2ee'->>'alg', '') <> 'ECDH-P256+HKDF-SHA256+AES-256-GCM'
     or coalesce((new.metadata->'e2ee'->>'v')::integer, 0) <> 1 then
    raise exception 'invalid_secret_message_envelope';
  end if;

  select scd.device_id into v_bound_device
  from public.secret_conversation_devices scd
  where scd.conversation_id = new.conversation_id
    and scd.user_id = new.sender_id;

  begin
    v_sender_device := (new.metadata->'e2ee'->>'sender_device_id')::uuid;
  exception when others then
    raise exception 'invalid_secret_sender_device';
  end;

  if v_bound_device is null or v_sender_device is distinct from v_bound_device then
    raise exception 'secret_sender_device_mismatch';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_secret_message_payload() from public, anon, authenticated;

commit;
