-- Alsamos Mini App Developer API.
--
-- Falsafa: Alsamos'da mini apps MUSTAQIL bo'lim. Shuning uchun API ulanishi
-- botga bog'liq emas — har bir mini app o'zining `client_id` + `secret` juftini
-- oladi va bevosita `mini-app-api` orqali ishlaydi. Bot esa faqat IXTIYORIY
-- qo'shimcha kanal (`bots` jadvali, alohida migratsiya).
--
-- Qoidalar: enum yo'q (text + check), citext yo'q, cron yo'q, additive, idempotent.

-- 1) API kalitlari --------------------------------------------------------
create table if not exists public.mini_app_credentials (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  client_id text not null,
  secret_hash text not null,
  secret_prefix text not null,
  label text,
  scopes jsonb not null default '["profile","updates","notifications","payments","stats"]'::jsonb,
  webhook_url text,
  webhook_secret text,
  environment text not null default 'live' check (environment in ('live','test')),
  is_active boolean not null default true,
  requests_total bigint not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mini_app_credentials_client_id_key unique (client_id)
);

create index if not exists mini_app_credentials_app_idx on public.mini_app_credentials (app_id);
create index if not exists mini_app_credentials_secret_idx on public.mini_app_credentials (secret_hash);

-- 2) Update navbati (superapp -> mini app serveri) ----------------------
create table if not exists public.mini_app_updates (
  id bigserial primary key,
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  update_type text not null check (update_type in (
    'app_open','app_close','web_app_data','install','uninstall','payment','notification_reply','custom'
  )),
  payload jsonb not null default '{}'::jsonb,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mini_app_updates_queue_idx
  on public.mini_app_updates (app_id, id) where consumed_at is null;

-- 3) Mini app -> foydalanuvchi bildirishnomalari ------------------------
create table if not exists public.mini_app_notifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text,
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mini_app_notifications_user_idx
  on public.mini_app_notifications (user_id, created_at desc);

-- 4) updated_at ----------------------------------------------------------
create or replace function public.mini_app_credentials_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mini_app_credentials_touch_trg on public.mini_app_credentials;
create trigger mini_app_credentials_touch_trg
  before update on public.mini_app_credentials
  for each row execute function public.mini_app_credentials_touch();

-- 5) Secret hash ---------------------------------------------------------
create or replace function public.mini_app_secret_hash(p_secret text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_secret, ''), 'utf8')), 'hex')
$$;

-- 6) Kalit yaratish (secret FAQAT bir marta qaytariladi) ----------------
create or replace function public.mini_app_credential_create(
  p_app_id uuid,
  p_label text default null,
  p_environment text default 'live'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_env text := coalesce(nullif(btrim(p_environment), ''), 'live');
  v_id uuid := gen_random_uuid();
  v_client_id text;
  v_secret text;
begin
  if v_uid is null and not public.mini_app_is_service_role() then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(p_app_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_env not in ('live','test') then
    raise exception 'INVALID_ENVIRONMENT';
  end if;

  v_client_id := 'app_' || substr(replace(p_app_id::text, '-', ''), 1, 16);
  if v_env = 'test' then
    v_client_id := v_client_id || '_test';
  end if;
  v_client_id := v_client_id || '_' || substr(replace(v_id::text, '-', ''), 1, 6);

  v_secret := 'sk_' || v_env || '_' ||
              replace(gen_random_uuid()::text, '-', '') ||
              replace(gen_random_uuid()::text, '-', '');

  insert into public.mini_app_credentials (
    id, app_id, created_by, client_id, secret_hash, secret_prefix, label, environment
  ) values (
    v_id,
    p_app_id,
    v_uid,
    v_client_id,
    public.mini_app_secret_hash(v_secret),
    substr(v_secret, 1, 14),
    nullif(btrim(p_label), ''),
    v_env
  );

  return jsonb_build_object(
    'credential_id', v_id,
    'app_id', p_app_id,
    'client_id', v_client_id,
    'secret', v_secret,
    'environment', v_env
  );
end;
$$;

-- 7) Kalitni almashtirish / o'chirish -----------------------------------
create or replace function public.mini_app_credential_rotate(p_credential_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mini_app_credentials;
  v_secret text;
begin
  select * into v_row from public.mini_app_credentials where id = p_credential_id;
  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(v_row.app_id) then
    raise exception 'FORBIDDEN';
  end if;

  v_secret := 'sk_' || v_row.environment || '_' ||
              replace(gen_random_uuid()::text, '-', '') ||
              replace(gen_random_uuid()::text, '-', '');

  update public.mini_app_credentials
     set secret_hash = public.mini_app_secret_hash(v_secret),
         secret_prefix = substr(v_secret, 1, 14),
         is_active = true,
         revoked_at = null
   where id = p_credential_id;

  return jsonb_build_object(
    'credential_id', p_credential_id,
    'client_id', v_row.client_id,
    'secret', v_secret
  );
end;
$$;

create or replace function public.mini_app_credential_revoke(p_credential_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mini_app_credentials;
begin
  select * into v_row from public.mini_app_credentials where id = p_credential_id;
  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(v_row.app_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.mini_app_credentials
     set is_active = false, revoked_at = now()
   where id = p_credential_id;

  return true;
end;
$$;

-- 8) Webhook -------------------------------------------------------------
create or replace function public.mini_app_credential_set_webhook(
  p_credential_id uuid,
  p_url text,
  p_secret text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mini_app_credentials;
begin
  select * into v_row from public.mini_app_credentials where id = p_credential_id;
  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(v_row.app_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_url is not null and btrim(p_url) <> '' and p_url !~* '^https://' then
    raise exception 'HTTPS_REQUIRED';
  end if;

  update public.mini_app_credentials
     set webhook_url = nullif(btrim(p_url), ''),
         webhook_secret = coalesce(
           nullif(btrim(p_secret), ''),
           case when nullif(btrim(p_url), '') is null then null
                else coalesce(v_row.webhook_secret, replace(gen_random_uuid()::text, '-', '')) end
         )
   where id = p_credential_id;

  return true;
end;
$$;

-- 9) O'z kalitlarim ro'yxati (secret qaytarilmaydi) ---------------------
create or replace function public.mini_app_credentials_list(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(p_app_id) then
    raise exception 'FORBIDDEN';
  end if;

  return coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'credential_id', c.id,
                'client_id', c.client_id,
                'secret_prefix', c.secret_prefix,
                'label', c.label,
                'environment', c.environment,
                'scopes', c.scopes,
                'webhook_url', c.webhook_url,
                'is_active', c.is_active,
                'requests_total', c.requests_total,
                'last_used_at', c.last_used_at,
                'created_at', c.created_at
              ) order by c.created_at desc
            )
       from public.mini_app_credentials c
      where c.app_id = p_app_id),
    '[]'::jsonb
  );
end;
$$;

-- 10) API autentifikatsiyasi (faqat service role = edge function) ------
create or replace function public.mini_app_api_authenticate(
  p_client_id text,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mini_app_credentials;
  v_app public.mini_apps;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_row
    from public.mini_app_credentials
   where client_id = btrim(p_client_id)
     and secret_hash = public.mini_app_secret_hash(p_secret)
     and is_active;

  if v_row.id is null then
    return null;
  end if;

  select * into v_app from public.mini_apps where id = v_row.app_id;

  update public.mini_app_credentials
     set requests_total = requests_total + 1,
         last_used_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'credential_id', v_row.id,
    'app_id', v_row.app_id,
    'client_id', v_row.client_id,
    'environment', v_row.environment,
    'scopes', v_row.scopes,
    'webhook_url', v_row.webhook_url,
    'webhook_secret', v_row.webhook_secret,
    'app', jsonb_build_object(
      'id', v_app.id,
      'handle', v_app.handle,
      'name', v_app.name,
      'url', v_app.url,
      'status', v_app.status,
      'app_type', v_app.app_type,
      'display_mode', v_app.display_mode,
      'publisher_id', v_app.publisher_id
    )
  );
end;
$$;

-- 11) Update qo'shish (superapp/foydalanuvchi -> mini app) -------------
create or replace function public.mini_app_push_update(
  p_app_id uuid,
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
  v_id bigint;
  v_cred public.mini_app_credentials;
begin
  if v_uid is null and not public.mini_app_is_service_role() then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_type not in (
    'app_open','app_close','web_app_data','install','uninstall','payment','notification_reply','custom'
  ) then
    raise exception 'INVALID_TYPE';
  end if;
  if not exists (select 1 from public.mini_apps a where a.id = p_app_id) then
    raise exception 'APP_NOT_FOUND';
  end if;

  insert into public.mini_app_updates (app_id, user_id, update_type, payload)
  values (
    p_app_id,
    v_uid,
    p_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('from_user_id', v_uid)
  )
  returning id into v_id;

  select * into v_cred
    from public.mini_app_credentials
   where app_id = p_app_id and is_active and webhook_url is not null
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'update_id', v_id,
    'app_id', p_app_id,
    'webhook_url', v_cred.webhook_url,
    'webhook_secret', v_cred.webhook_secret
  );
end;
$$;

-- 12) Update olish (getUpdates) ----------------------------------------
create or replace function public.mini_app_dequeue_updates(
  p_app_id uuid,
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
        from public.mini_app_updates
       where app_id = p_app_id
         and consumed_at is null
         and id > coalesce(p_offset, 0)
       order by id
       limit least(greatest(coalesce(p_limit, 20), 1), 100)
    ) s;

  if array_length(v_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  update public.mini_app_updates set consumed_at = now() where id = any(v_ids);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'update_id', id,
               'type', update_type,
               'user_id', user_id,
               'payload', payload,
               'date', created_at
             ) order by id
           ),
           '[]'::jsonb
         )
    into v_result
    from public.mini_app_updates
   where id = any(v_ids);

  return v_result;
end;
$$;

-- 13) Bildirishnoma yuborish (mini app -> foydalanuvchi) --------------
create or replace function public.mini_app_notify_user(
  p_app_id uuid,
  p_user_id uuid,
  p_title text default null,
  p_body text default null,
  p_action_url text default null,
  p_payload jsonb default '{}'::jsonb
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
  -- Faqat ilovani o'rnatgan yoki ochgan foydalanuvchiga yuborish mumkin.
  if not exists (
    select 1 from public.mini_app_installs i
     where i.app_id = p_app_id and i.user_id = p_user_id
  ) and not exists (
    select 1 from public.mini_app_events e
     where e.app_id = p_app_id and e.user_id = p_user_id
  ) then
    raise exception 'USER_NOT_LINKED';
  end if;

  insert into public.mini_app_notifications (app_id, user_id, title, body, action_url, payload)
  values (
    p_app_id, p_user_id,
    nullif(btrim(p_title), ''),
    nullif(btrim(p_body), ''),
    nullif(btrim(p_action_url), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 14) Statistika (API orqali) -----------------------------------------
create or replace function public.mini_app_api_stats(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.mini_app_is_service_role() and not public.mini_app_can_manage(p_app_id) then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
           'app_id', p_app_id,
           'opens_30d', coalesce(s.opens_30d, 0),
           'users_30d', coalesce(s.users_30d, 0),
           'rating', coalesce(a.rating, 0),
           'rating_count', coalesce(a.rating_count, 0),
           'installs', (select count(*) from public.mini_app_installs i where i.app_id = p_app_id),
           'pending_updates', (
             select count(*) from public.mini_app_updates u
              where u.app_id = p_app_id and u.consumed_at is null
           )
         )
    into v
    from public.mini_apps a
    left join public.mini_app_stats_cache s on s.app_id = a.id
   where a.id = p_app_id;

  return coalesce(v, jsonb_build_object('app_id', p_app_id));
end;
$$;

-- 15) RLS -------------------------------------------------------------
alter table public.mini_app_credentials enable row level security;
alter table public.mini_app_updates enable row level security;
alter table public.mini_app_notifications enable row level security;

drop policy if exists mini_app_credentials_manage_select on public.mini_app_credentials;
create policy mini_app_credentials_manage_select on public.mini_app_credentials
  for select using (public.mini_app_can_manage(app_id));

drop policy if exists mini_app_updates_manage_select on public.mini_app_updates;
create policy mini_app_updates_manage_select on public.mini_app_updates
  for select using (public.mini_app_can_manage(app_id));

drop policy if exists mini_app_notifications_own_select on public.mini_app_notifications;
create policy mini_app_notifications_own_select on public.mini_app_notifications
  for select using (user_id = auth.uid() or public.mini_app_can_manage(app_id));

drop policy if exists mini_app_notifications_own_update on public.mini_app_notifications;
create policy mini_app_notifications_own_update on public.mini_app_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 16) PostgREST sxemasini yangilash -----------------------------------
notify pgrst, 'reload schema';
