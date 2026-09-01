-- Alsamos Bot API.
-- Maqsad: mini applar botlar orqali ulanadi (Telegram modeli): bot yaratiladi,
-- token beriladi, bot HTTP API orqali update oladi va xabar yuboradi.
--
-- Qoidalar: enum yo'q (text + check), citext yo'q, cron yo'q, additive va idempotent.

-- 1) Botlar --------------------------------------------------------------
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  publisher_id uuid references public.publishers(id) on delete set null,
  username text not null,
  display_name text not null,
  description text,
  token_hash text not null,
  token_prefix text not null,
  webhook_url text,
  webhook_secret text,
  allowed_updates jsonb not null default '["message","mini_app_open","web_app_data","callback_query"]'::jsonb,
  commands jsonb not null default '[]'::jsonb,
  mini_app_id uuid references public.mini_apps(id) on delete set null,
  mini_app_url text,
  is_active boolean not null default true,
  requests_total bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bots_username_format check (username ~ '^[a-z][a-z0-9_]{3,28}bot$'),
  constraint bots_username_key unique (username)
);

create index if not exists bots_owner_idx on public.bots (owner_id);
create index if not exists bots_token_hash_idx on public.bots (token_hash);
create index if not exists bots_mini_app_idx on public.bots (mini_app_id);

alter table public.mini_apps add column if not exists bot_id uuid references public.bots(id) on delete set null;
create index if not exists mini_apps_bot_idx on public.mini_apps (bot_id);

-- 2) Update navbati ------------------------------------------------------
create table if not exists public.bot_updates (
  id bigserial primary key,
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  update_type text not null check (update_type in ('message','mini_app_open','web_app_data','callback_query','payment')),
  payload jsonb not null default '{}'::jsonb,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bot_updates_queue_idx on public.bot_updates (bot_id, id) where consumed_at is null;

-- 3) Xabarlar ------------------------------------------------------------
create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  kind text not null default 'text' check (kind in ('text','photo','document','web_app_data','system')),
  text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_messages_bot_idx on public.bot_messages (bot_id, created_at desc);
create index if not exists bot_messages_user_idx on public.bot_messages (user_id, created_at desc);

-- 4) updated_at ----------------------------------------------------------
create or replace function public.bots_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bots_touch_updated_at_trg on public.bots;
create trigger bots_touch_updated_at_trg
  before update on public.bots
  for each row execute function public.bots_touch_updated_at();

-- 5) Token yordamchilari -------------------------------------------------
create or replace function public.bot_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
$$;

create or replace function public.bot_normalize_username(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(coalesce(p_username, ''), '[^A-Za-z0-9_]', '', 'g'));
begin
  if v = '' then
    return null;
  end if;
  if right(v, 3) <> 'bot' then
    v := v || '_bot';
  end if;
  if v !~ '^[a-z][a-z0-9_]{3,28}bot$' then
    return null;
  end if;
  return v;
end;
$$;

-- 6) Bot yaratish (token FAQAT bir marta qaytariladi) -------------------
create or replace function public.bot_create(
  p_username text,
  p_display_name text default null,
  p_description text default null,
  p_publisher_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := public.bot_normalize_username(p_username);
  v_id uuid := gen_random_uuid();
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_username is null then
    raise exception 'INVALID_USERNAME';
  end if;
  if exists (select 1 from public.bots b where b.username = v_username) then
    raise exception 'USERNAME_TAKEN';
  end if;
  if p_publisher_id is not null and not exists (
    select 1 from public.publisher_members m
    where m.publisher_id = p_publisher_id and m.user_id = v_uid
  ) then
    raise exception 'NOT_PUBLISHER_MEMBER';
  end if;

  v_token := substr(replace(v_id::text, '-', ''), 1, 12) || ':' || v_secret;

  insert into public.bots (
    id, owner_id, publisher_id, username, display_name, description, token_hash, token_prefix
  ) values (
    v_id,
    v_uid,
    p_publisher_id,
    v_username,
    coalesce(nullif(btrim(p_display_name), ''), v_username),
    nullif(btrim(p_description), ''),
    public.bot_token_hash(v_token),
    substr(v_token, 1, 12)
  );

  return jsonb_build_object('bot_id', v_id, 'username', v_username, 'token', v_token);
end;
$$;

-- 7) Tokenni almashtirish ------------------------------------------------
create or replace function public.bot_revoke_token(p_bot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  v_token := substr(replace(p_bot_id::text, '-', ''), 1, 12) || ':' || v_secret;

  update public.bots
     set token_hash = public.bot_token_hash(v_token),
         token_prefix = substr(v_token, 1, 12)
   where id = p_bot_id;

  return jsonb_build_object('bot_id', p_bot_id, 'token', v_token);
end;
$$;

-- 8) Webhook / mini app / komandalar ------------------------------------
create or replace function public.bot_set_webhook(
  p_bot_id uuid,
  p_url text,
  p_secret text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  if p_url is not null and p_url !~* '^https://' then
    raise exception 'HTTPS_REQUIRED';
  end if;

  update public.bots
     set webhook_url = nullif(btrim(p_url), ''),
         webhook_secret = nullif(btrim(p_secret), '')
   where id = p_bot_id;

  return true;
end;
$$;

create or replace function public.bot_set_mini_app(
  p_bot_id uuid,
  p_app_id uuid,
  p_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  if p_app_id is not null and not public.mini_app_is_service_role() and not public.mini_app_can_manage(p_app_id) then
    raise exception 'FORBIDDEN_APP';
  end if;

  update public.bots
     set mini_app_id = p_app_id,
         mini_app_url = nullif(btrim(p_url), '')
   where id = p_bot_id;

  if p_app_id is not null then
    update public.mini_apps set bot_id = p_bot_id where id = p_app_id;
  end if;

  return true;
end;
$$;

create or replace function public.bot_set_commands(p_bot_id uuid, p_commands jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.mini_app_is_service_role()
     and not exists (select 1 from public.bots b where b.id = p_bot_id and b.owner_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  update public.bots set commands = coalesce(p_commands, '[]'::jsonb) where id = p_bot_id;
  return true;
end;
$$;

-- 9) Token bilan autentifikatsiya (faqat service role = edge function) --
create or replace function public.bot_authenticate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.bots;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_bot from public.bots where token_hash = public.bot_token_hash(p_token);
  if v_bot.id is null or not v_bot.is_active then
    return null;
  end if;

  update public.bots
     set requests_total = requests_total + 1,
         last_used_at = now()
   where id = v_bot.id;

  return jsonb_build_object(
    'id', v_bot.id,
    'username', v_bot.username,
    'display_name', v_bot.display_name,
    'description', v_bot.description,
    'owner_id', v_bot.owner_id,
    'publisher_id', v_bot.publisher_id,
    'mini_app_id', v_bot.mini_app_id,
    'mini_app_url', v_bot.mini_app_url,
    'webhook_url', v_bot.webhook_url,
    'webhook_secret', v_bot.webhook_secret,
    'commands', v_bot.commands,
    'allowed_updates', v_bot.allowed_updates
  );
end;
$$;

-- 10) Update qo'shish (superapp -> bot) ---------------------------------
create or replace function public.bot_push_update(
  p_username text,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bot public.bots;
  v_id bigint;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_uid is null and not public.mini_app_is_service_role() then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_type not in ('message','mini_app_open','web_app_data','callback_query','payment') then
    raise exception 'INVALID_TYPE';
  end if;

  select * into v_bot from public.bots where username = lower(btrim(p_username)) and is_active;
  if v_bot.id is null then
    raise exception 'BOT_NOT_FOUND';
  end if;

  insert into public.bot_updates (bot_id, user_id, update_type, payload)
  values (v_bot.id, v_uid, p_type, v_payload || jsonb_build_object('from_user_id', v_uid))
  returning id into v_id;

  if p_type in ('message','web_app_data') then
    insert into public.bot_messages (bot_id, user_id, direction, kind, text, payload)
    values (
      v_bot.id,
      v_uid,
      'in',
      case when p_type = 'web_app_data' then 'web_app_data' else 'text' end,
      nullif(v_payload->>'text', ''),
      v_payload
    );
  end if;

  return jsonb_build_object(
    'update_id', v_id,
    'bot_id', v_bot.id,
    'webhook_url', v_bot.webhook_url,
    'webhook_secret', v_bot.webhook_secret
  );
end;
$$;

-- 11) getUpdates (long-poll o'rniga navbatdan olish) --------------------
create or replace function public.bot_dequeue_updates(
  p_bot_id uuid,
  p_offset bigint default 0,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(array_agg(id order by id), '{}'::bigint[])
    into v_ids
    from (
      select id
        from public.bot_updates
       where bot_id = p_bot_id
         and consumed_at is null
         and id > coalesce(p_offset, 0)
       order by id
       limit least(greatest(coalesce(p_limit, 20), 1), 100)
    ) s;

  if array_length(v_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  update public.bot_updates set consumed_at = now() where id = any(v_ids);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'update_id', id,
               'type', update_type,
               'payload', payload,
               'date', created_at
             ) order by id
           ),
           '[]'::jsonb
         )
    into v_result
    from public.bot_updates
   where id = any(v_ids);

  return v_result;
end;
$$;

-- 12) sendMessage --------------------------------------------------------
create or replace function public.bot_send_message(
  p_bot_id uuid,
  p_user_id uuid,
  p_text text default null,
  p_payload jsonb default '{}'::jsonb,
  p_kind text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;
  if p_kind not in ('text','photo','document','web_app_data','system') then
    raise exception 'INVALID_KIND';
  end if;

  insert into public.bot_messages (bot_id, user_id, direction, kind, text, payload)
  values (p_bot_id, p_user_id, 'out', p_kind, nullif(btrim(p_text), ''), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- 13) RLS ---------------------------------------------------------------
alter table public.bots enable row level security;
alter table public.bot_updates enable row level security;
alter table public.bot_messages enable row level security;

drop policy if exists bots_owner_select on public.bots;
create policy bots_owner_select on public.bots
  for select using (owner_id = auth.uid());

drop policy if exists bots_owner_update on public.bots;
create policy bots_owner_update on public.bots
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists bots_owner_delete on public.bots;
create policy bots_owner_delete on public.bots
  for delete using (owner_id = auth.uid());

drop policy if exists bot_updates_owner_select on public.bot_updates;
create policy bot_updates_owner_select on public.bot_updates
  for select using (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  );

drop policy if exists bot_messages_read on public.bot_messages;
create policy bot_messages_read on public.bot_messages
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = auth.uid())
  );

-- 14) PostgREST sxemasini yangilash -------------------------------------
notify pgrst, 'reload schema';
