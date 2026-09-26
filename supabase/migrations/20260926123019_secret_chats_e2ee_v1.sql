begin;

alter table public.user_settings
  add column if not exists accept_secret_chats boolean not null default true;

alter table public.conversations
  add column if not exists security_mode text not null default 'standard';

alter table public.conversations
  drop constraint if exists conversations_security_mode_check;

alter table public.conversations
  add constraint conversations_security_mode_check
  check (security_mode in ('standard', 'e2ee'));

create index if not exists idx_conversations_security_mode
  on public.conversations (security_mode)
  where security_mode = 'e2ee';

create table if not exists public.user_e2ee_devices (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_key_jwk jsonb not null,
  key_version integer not null default 1 check (key_version > 0),
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_e2ee_devices_public_key_object check (jsonb_typeof(public_key_jwk) = 'object')
);

create index if not exists idx_user_e2ee_devices_user_active
  on public.user_e2ee_devices (user_id, last_seen_at desc)
  where revoked_at is null;

alter table public.user_e2ee_devices enable row level security;

drop policy if exists "Users can view own E2EE devices" on public.user_e2ee_devices;
create policy "Users can view own E2EE devices"
  on public.user_e2ee_devices for select
  using (user_id = auth.uid());

drop policy if exists "Users can register own E2EE devices" on public.user_e2ee_devices;
create policy "Users can register own E2EE devices"
  on public.user_e2ee_devices for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own E2EE devices" on public.user_e2ee_devices;
create policy "Users can update own E2EE devices"
  on public.user_e2ee_devices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_e2ee_devices to authenticated;

create table if not exists public.secret_conversation_devices (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.user_e2ee_devices(id) on delete restrict,
  public_key_jwk jsonb not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  unique (conversation_id, device_id),
  constraint secret_conversation_devices_public_key_object check (jsonb_typeof(public_key_jwk) = 'object')
);

alter table public.secret_conversation_devices enable row level security;

drop policy if exists "Participants can view secret chat device bindings" on public.secret_conversation_devices;
create policy "Participants can view secret chat device bindings"
  on public.secret_conversation_devices for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

grant select on public.secret_conversation_devices to authenticated;

create or replace function public.register_e2ee_device(
  p_device_id uuid,
  p_public_key_jwk jsonb,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_device_id is null then
    raise exception 'device_id_required';
  end if;
  if p_public_key_jwk is null or jsonb_typeof(p_public_key_jwk) <> 'object' then
    raise exception 'invalid_public_key';
  end if;

  insert into public.user_e2ee_devices (
    id, user_id, public_key_jwk, platform, last_seen_at, updated_at, revoked_at
  ) values (
    p_device_id, v_user, p_public_key_jwk, nullif(left(coalesce(p_platform, ''), 180), ''), now(), now(), null
  )
  on conflict (id) do update
    set public_key_jwk = excluded.public_key_jwk,
        platform = excluded.platform,
        last_seen_at = now(),
        updated_at = now(),
        revoked_at = null
    where public.user_e2ee_devices.user_id = v_user;

  if not exists (
    select 1 from public.user_e2ee_devices d
    where d.id = p_device_id and d.user_id = v_user and d.revoked_at is null
  ) then
    raise exception 'device_id_owned_by_another_user';
  end if;

  return p_device_id;
end;
$$;

revoke all on function public.register_e2ee_device(uuid, jsonb, text) from public;
grant execute on function public.register_e2ee_device(uuid, jsonb, text) to authenticated;

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

drop trigger if exists trg_guard_secret_message_payload on public.messages;
create trigger trg_guard_secret_message_payload
before insert or update on public.messages
for each row execute function public.guard_secret_message_payload();

comment on column public.conversations.security_mode is
  'standard = server-readable message payload; e2ee = device-bound end-to-end encrypted payload enforced by guard_secret_message_payload().';
comment on table public.user_e2ee_devices is
  'Public ECDH device keys only. Private keys must remain client-side and are never stored in Supabase.';
comment on table public.secret_conversation_devices is
  'Immutable device/public-key snapshots bound to a device-specific Secret Chat.';

commit;