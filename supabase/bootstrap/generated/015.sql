-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260901050000_mini_app_developer_api.sql
-- SHA256 5ce0872f9b26bd405fbfaf6b2c5dffb47993b59dddfa09336fa1192e736cff7b
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260901060000_mini_app_submit_metadata.sql
-- SHA256 90f37f6864c130343975e2f6126afe3751476f9c2f4c3c8e621ada36f01ba51b
-- ============================================================================
-- Mini app yuborish oqimi uchun qo'shimcha metadata va @nom bandligini tekshirish.
-- Additive: mavjud ustun/funksiyalarni buzmaydi.

-- 1) Kerakli ustunlar (avvalgi migratsiyalarda bo'lmasa qo'shiladi).
alter table public.mini_apps add column if not exists price_model text default 'free';
alter table public.mini_apps add column if not exists screenshots jsonb default '[]'::jsonb;
alter table public.mini_apps add column if not exists deep_link text;
alter table public.mini_apps add column if not exists privacy_url text;
alter table public.mini_apps add column if not exists support_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mini_apps_price_model_check'
  ) then
    alter table public.mini_apps
      add constraint mini_apps_price_model_check
      check (price_model in ('free', 'freemium', 'paid'));
  end if;
end $$;

update public.mini_apps set price_model = 'free' where price_model is null;
update public.mini_apps set screenshots = '[]'::jsonb where screenshots is null;

-- 2) @nom bandligini tekshirish.
-- Ilova nomlari ham, publisher nomlari ham bitta bo'shliqda: takrorlanmasligi kerak.
create or replace function public.mini_app_handle_available(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_taken boolean := false;
begin
  v_handle := lower(coalesce(p_handle, ''));
  v_handle := regexp_replace(v_handle, '[^a-z0-9_]+', '_', 'g');
  v_handle := regexp_replace(v_handle, '_+', '_', 'g');
  v_handle := trim(both '_' from v_handle);

  if length(v_handle) < 3 or length(v_handle) > 32 then
    return jsonb_build_object('available', false, 'handle', v_handle, 'reason', 'INVALID_LENGTH');
  end if;

  if v_handle !~ '^[a-z][a-z0-9_]*$' then
    return jsonb_build_object('available', false, 'handle', v_handle, 'reason', 'INVALID_FORMAT');
  end if;

  select exists (select 1 from public.mini_apps where lower(handle) = v_handle) into v_taken;

  if not v_taken then
    select exists (select 1 from public.publishers where lower(handle) = v_handle) into v_taken;
  end if;

  return jsonb_build_object(
    'available', not v_taken,
    'handle', v_handle,
    'reason', case when v_taken then 'TAKEN' else null end
  );
end $$;

grant execute on function public.mini_app_handle_available(text) to authenticated, anon;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260901170000_video_watch_segments.sql
-- SHA256 8abde31d993909dbdc283df20cad02256c72650d0edaed13ee265303f07353bf
-- ============================================================================
-- Videolar uchun haqiqiy "eng ko'p qayta ko'rilgan qism" (YouTube: most
-- replayed) va watch-time statistikasi.
--
-- 1) video_watch_segments - har bir video 100 ta teng bo'lakka bo'linadi
--    (bucket 0..99) va har bo'lak necha marta ko'rilgani jamlanadi. Bu
--    agregat, shaxsiy bo'lmagan ma'lumot: hamma o'qiy oladi, lekin yozish
--    faqat SECURITY DEFINER funksiya orqali amalga oshadi.
-- 2) video_watch_sessions - har bir ko'rish seansi: qancha soniya sof
--    ko'rilgan, video uzunligi, oxirgi nuqta, tugatilganmi. Retention va
--    completion rate shu jadvaldan hisoblanadi.

-- ============================ Segmentlar (heatmap) ==========================

create table if not exists public.video_watch_segments (
  post_id uuid not null references public.posts(id) on delete cascade,
  bucket smallint not null,
  views bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (post_id, bucket),
  constraint video_watch_segments_bucket_range check (bucket >= 0 and bucket < 100)
);

create index if not exists video_watch_segments_post_idx
  on public.video_watch_segments (post_id);

alter table public.video_watch_segments enable row level security;

drop policy if exists "video_watch_segments_public_read" on public.video_watch_segments;
create policy "video_watch_segments_public_read"
  on public.video_watch_segments
  for select
  using (true);

-- Yozish uchun policy ataylab yo'q: faqat record_video_watch() yozadi.

-- ============================ Seanslar (watch-time) ========================

create table if not exists public.video_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  watched_seconds numeric(10, 2) not null default 0,
  duration_seconds numeric(10, 2),
  max_position_seconds numeric(10, 2),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists video_watch_sessions_post_idx
  on public.video_watch_sessions (post_id, created_at desc);

create index if not exists video_watch_sessions_user_idx
  on public.video_watch_sessions (user_id, created_at desc);

alter table public.video_watch_sessions enable row level security;

-- Foydalanuvchi o'z seanslarini, muallif esa o'z postining seanslarini ko'radi.
drop policy if exists "video_watch_sessions_select_own_or_author" on public.video_watch_sessions;
create policy "video_watch_sessions_select_own_or_author"
  on public.video_watch_sessions
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = video_watch_sessions.post_id
        and p.user_id = auth.uid()
    )
  );

-- ================================== Yozish =================================

create or replace function public.record_video_watch(
  post_id_param uuid,
  buckets_param integer[] default null,
  watched_seconds_param numeric default 0,
  duration_seconds_param numeric default null,
  max_position_seconds_param numeric default null,
  completed_param boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  safe_duration numeric;
  safe_watched numeric;
  safe_position numeric;
begin
  if post_id_param is null or actor is null then
    return;
  end if;

  if not exists (select 1 from public.posts p where p.id = post_id_param) then
    return;
  end if;

  safe_duration := nullif(greatest(coalesce(duration_seconds_param, 0), 0), 0);
  safe_watched := greatest(coalesce(watched_seconds_param, 0), 0);
  safe_position := greatest(coalesce(max_position_seconds_param, 0), 0);

  -- Soxta katta qiymatlardan himoya: sof ko'rish vaqti uzunlikning 5
  -- barobaridan oshmaydi (loop hisobga olingan).
  if safe_duration is not null then
    safe_watched := least(safe_watched, safe_duration * 5);
    safe_position := least(safe_position, safe_duration);
  else
    safe_watched := least(safe_watched, 43200);
  end if;

  -- 1 soniyadan kam ko'rish statistika uchun shovqin.
  if safe_watched < 1 then
    return;
  end if;

  insert into public.video_watch_sessions (
    post_id,
    user_id,
    watched_seconds,
    duration_seconds,
    max_position_seconds,
    completed
  )
  values (
    post_id_param,
    actor,
    round(safe_watched, 2),
    case when safe_duration is null then null else round(safe_duration, 2) end,
    round(safe_position, 2),
    coalesce(completed_param, false)
  );

  if buckets_param is null or array_length(buckets_param, 1) is null then
    return;
  end if;

  insert into public.video_watch_segments as s (post_id, bucket, views)
  select post_id_param, b::smallint, count(*)::bigint
  from unnest(buckets_param) as b
  where b >= 0 and b < 100
  group by b
  on conflict (post_id, bucket) do update
    set views = s.views + excluded.views,
        updated_at = now();
end;
$$;

revoke all on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) from public;
grant execute on function public.record_video_watch(uuid, integer[], numeric, numeric, numeric, boolean) to authenticated;

-- ================================== O'qish =================================

create or replace function public.get_video_heatmap(post_id_param uuid)
returns table (bucket smallint, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.bucket, s.views
  from public.video_watch_segments s
  where s.post_id = post_id_param
  order by s.bucket;
$$;

grant execute on function public.get_video_heatmap(uuid) to anon, authenticated;

create or replace function public.get_video_watch_stats(post_id_param uuid)
returns table (
  sessions bigint,
  avg_watched_seconds numeric,
  avg_retention numeric,
  completion_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as sessions,
    round(coalesce(avg(w.watched_seconds), 0), 2) as avg_watched_seconds,
    round(
      coalesce(
        avg(
          case
            when w.duration_seconds is not null and w.duration_seconds > 0
              then least(1, w.watched_seconds / w.duration_seconds)
            else null
          end
        ),
        0
      ),
      4
    ) as avg_retention,
    round(
      (count(*) filter (where w.completed))::numeric / greatest(count(*), 1),
      4
    ) as completion_rate
  from public.video_watch_sessions w
  where w.post_id = post_id_param;
$$;

grant execute on function public.get_video_watch_stats(uuid) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260901185022_4a83e56a-0eb0-4bcf-8ed3-251a78bc2c3b.sql
-- SHA256 f42f3bd01b61ad54482e46637d3da867ff83ed7e52d1214319a0d61a249f54b9
-- ============================================================================
-- Blocking (NO ACTION) FKs to auth.users / public.profiles prevent user deletion.
-- Nullable admin/moderator columns -> SET NULL; NOT NULL ownership columns -> CASCADE.

-- CASCADE (NOT NULL ownership)
ALTER TABLE public.pinned_messages DROP CONSTRAINT pinned_messages_pinned_by_fkey,
  ADD CONSTRAINT pinned_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.call_history DROP CONSTRAINT call_history_caller_id_fkey,
  ADD CONSTRAINT call_history_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders DROP CONSTRAINT orders_buyer_id_fkey,
  ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_reviews DROP CONSTRAINT product_reviews_user_id_fkey,
  ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_messages DROP CONSTRAINT product_messages_sender_id_fkey,
  ADD CONSTRAINT product_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_messages DROP CONSTRAINT product_messages_receiver_id_fkey,
  ADD CONSTRAINT product_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.video_calls DROP CONSTRAINT video_calls_host_id_fkey,
  ADD CONSTRAINT video_calls_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SET NULL (nullable admin / moderation references)
ALTER TABLE public.call_history DROP CONSTRAINT call_history_callee_id_fkey,
  ADD CONSTRAINT call_history_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.verification_requests DROP CONSTRAINT verification_requests_reviewed_by_fkey,
  ADD CONSTRAINT verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_granted_by_fkey,
  ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products DROP CONSTRAINT products_moderated_by_fkey,
  ADD CONSTRAINT products_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.channel_join_requests DROP CONSTRAINT channel_join_requests_reviewed_by_fkey,
  ADD CONSTRAINT channel_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_status_history DROP CONSTRAINT order_status_history_created_by_fkey,
  ADD CONSTRAINT order_status_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.seller_verification_requests DROP CONSTRAINT seller_verification_requests_reviewed_by_fkey,
  ADD CONSTRAINT seller_verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.product_reports DROP CONSTRAINT product_reports_moderator_id_fkey,
  ADD CONSTRAINT product_reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reports DROP CONSTRAINT reports_reviewed_by_fkey,
  ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_released_to_fkey,
  ADD CONSTRAINT reserved_usernames_released_to_fkey FOREIGN KEY (released_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_reserved_by_fkey,
  ADD CONSTRAINT reserved_usernames_reserved_by_fkey FOREIGN KEY (reserved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_released_by_fkey,
  ADD CONSTRAINT reserved_usernames_released_by_fkey FOREIGN KEY (released_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flags DROP CONSTRAINT feature_flags_updated_by_fkey,
  ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- SOURCE B-web: 20260902000000_ensure_chat_media_storage_buckets.sql
-- SHA256 467fa8c0bf4359fe82ab184f2bee79fb72aeb38e4deba445b412e0f7d0c7f398
-- ============================================================================
-- =============================================================================
-- Storage recovery: ensure every bucket used by the current chat/media code exists.
--
-- Root cause addressed here:
--   * chat/media rendering can reference legacy chat-media/message-attachments
--     objects after those buckets were made private;
--   * current uploads use the public `media` bucket;
--   * private Create assets use `media-private`.
--
-- The statements are idempotent so this migration is safe on databases where
-- some or all buckets already exist.
-- =============================================================================

-- Current public media bucket used by chat uploads, posts, stories, etc.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 536870912)
on conflict (id) do update
set public = true,
    file_size_limit = 536870912;

-- Current private bucket used by friends/private Create media.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
set public = false,
    file_size_limit = 536870912;

-- Legacy chat buckets. Keep them private: old messages can be repaired with
-- participant-authorized signed URLs instead of making historical media public.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat-media', 'chat-media', false, 536870912),
  ('message-attachments', 'message-attachments', false, 536870912)
on conflict (id) do update
set public = false,
    file_size_limit = 536870912;

-- ---------------------------------------------------------------------------
-- Public `media`: authenticated users can manage their own user-prefixed files.
-- ---------------------------------------------------------------------------
drop policy if exists "Media files are publicly readable" on storage.objects;
create policy "Media files are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'media');

drop policy if exists "Users can upload their own media" on storage.objects;
create policy "Users can upload their own media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own media" on storage.objects;
create policy "Users can update their own media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own media" on storage.objects;
create policy "Users can delete their own media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Private `media-private`: owner manages objects; viewers are handled by the
-- existing post/media visibility policies created by earlier migrations.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can upload their private media" on storage.objects;
create policy "Users can upload their private media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their private media" on storage.objects;
create policy "Users can update their private media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their private media" on storage.objects;
create policy "Users can delete their private media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Legacy private chat buckets: owner OR conversation participant can read;
-- upload/update/delete remains restricted to the object's owner/user folder.
-- ---------------------------------------------------------------------------
drop policy if exists "Chat media owner or participant read" on storage.objects;
create policy "Chat media owner or participant read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = (storage.foldername(name))[1]
          and cp.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can upload legacy chat media" on storage.objects;
create policy "Users can upload legacy chat media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('chat-media', 'message-attachments')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = (storage.foldername(name))[1]
          and cp.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update legacy chat media" on storage.objects;
create policy "Users can update legacy chat media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  )
  with check (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  );

drop policy if exists "Users can delete legacy chat media" on storage.objects;
create policy "Users can delete legacy chat media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('chat-media', 'message-attachments')
    and owner = auth.uid()
  );


-- ============================================================================
-- SOURCE B-web: 20260902001000_repair_media_storage_buckets.sql
-- SHA256 1cc67684e3c7f4fc6f8efc0086adc5f61ea67458e10566cf5b75a12fa47eea50
-- ============================================================================
-- ============================================================================
-- Media storage repair
--
-- AI/chat uploads use the public `media` bucket from src/lib/mediaUpload.ts.
-- The application can receive `Bucket not found` when the bucket was removed
-- manually or when an older production database is ahead of the migration
-- history. Re-create the buckets idempotently without changing existing
-- storage.objects policies.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = 536870912;

insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = 536870912;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat-media', 'chat-media', false, 536870912),
  ('message-attachments', 'message-attachments', false, 536870912)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = 536870912;


-- ============================================================================
-- SOURCE B-web: 20260903010000_premium_notification_events.sql
-- SHA256 7e51a5a32794615ee7f388626c845c7c99e97e6f0985f7908e14a70d002d8daa
-- ============================================================================
-- Premium notification semantics: reply/comment-like context + richer mention payloads.
-- UI is backward-compatible with older rows; these events become available once
-- this migration reaches the production Supabase project.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'message', 'like', 'comment', 'follow', 'mention',
      'reply', 'comment_like', 'comment_mention',
      'collaboration_invite', 'collaboration_accepted', 'collaboration_declined',
      'collaboration_revoked', 'collaboration_removed', 'collaboration_left'
    )
  );

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commenter_name text;
  v_post_owner uuid;
  v_parent_author uuid;
  v_preview text;
begin
  select display_name into v_commenter_name from public.profiles where id = new.user_id;
  select user_id into v_post_owner from public.posts where id = new.post_id;
  v_preview := left(regexp_replace(new.content, '\s+', ' ', 'g'), 180);

  -- Post egasi o'zidan boshqa comment uchun notification oladi.
  if v_post_owner is distinct from new.user_id
     and coalesce((select notify_comments from public.user_settings where user_id = v_post_owner), true)
  then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_post_owner,
      'comment',
      'Yangi izoh',
      coalesce(v_commenter_name, 'Foydalanuvchi') || ' postingizga izoh qoldirdi',
      jsonb_build_object(
        'post_id', new.post_id,
        'comment_id', new.id,
        'parent_comment_id', new.parent_id,
        'commenter_id', new.user_id,
        'content_preview', v_preview
      )
    );
  end if;

  -- Reply muallifi ham aniq javob notification oladi.
  if new.parent_id is not null then
    select user_id into v_parent_author from public.comments where id = new.parent_id;

    if v_parent_author is not null
       and v_parent_author is distinct from new.user_id
       and v_parent_author is distinct from v_post_owner
       and coalesce((select notify_comments from public.user_settings where user_id = v_parent_author), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_parent_author,
        'reply',
        'Izohingizga javob',
        coalesce(v_commenter_name, 'Foydalanuvchi') || ' izohingizga javob berdi',
        jsonb_build_object(
          'post_id', new.post_id,
          'comment_id', new.id,
          'parent_comment_id', new.parent_id,
          'replier_id', new.user_id,
          'content_preview', v_preview
        )
      );
    end if;
  end if;

  return new;
end
$$;

create or replace function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_user_id uuid;
  v_author_name text;
  v_preview text;
begin
  select display_name into v_author_name from public.profiles where id = new.user_id;
  v_preview := left(regexp_replace(new.content, '\s+', ' ', 'g'), 180);

  for v_username in
    select distinct (regexp_matches(new.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  loop
    select id into v_user_id from public.profiles where lower(username) = lower(v_username);

    if v_user_id is not null
       and v_user_id is distinct from new.user_id
       and coalesce((select notify_mentions from public.user_settings where user_id = v_user_id), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_user_id,
        'mention',
        'Izohda eslatish',
        coalesce(v_author_name, 'Foydalanuvchi') || ' izohda sizni belgiladi',
        jsonb_build_object(
          'post_id', new.post_id,
          'comment_id', new.id,
          'parent_comment_id', new.parent_id,
          'mentioner_id', new.user_id,
          'mention_context', case when new.parent_id is null then 'comment' else 'reply' end,
          'content_preview', v_preview
        )
      );
    end if;
  end loop;

  return new;
end
$$;

create or replace function public.notify_on_post_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_user_id uuid;
  v_author_name text;
  v_preview text;
begin
  select display_name into v_author_name from public.profiles where id = new.user_id;
  v_preview := left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 180);

  for v_username in
    select distinct (regexp_matches(coalesce(new.content, ''), '@([a-zA-Z0-9_]+)', 'g'))[1]
  loop
    select id into v_user_id from public.profiles where lower(username) = lower(v_username);

    if v_user_id is not null
       and v_user_id is distinct from new.user_id
       and coalesce((select notify_mentions from public.user_settings where user_id = v_user_id), true)
    then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        v_user_id,
        'mention',
        'Postda eslatish',
        coalesce(v_author_name, 'Foydalanuvchi') || ' postda sizni belgiladi',
        jsonb_build_object(
          'post_id', new.id,
          'mentioner_id', new.user_id,
          'mention_context', 'post',
          'content_preview', v_preview
        )
      );
    end if;
  end loop;

  return new;
end
$$;

create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment public.comments;
  v_liker_name text;
begin
  select * into v_comment from public.comments where id = new.comment_id;
  if v_comment.id is null or v_comment.user_id = new.user_id then
    return new;
  end if;

  if not coalesce((select notify_comments from public.user_settings where user_id = v_comment.user_id), true) then
    return new;
  end if;

  select display_name into v_liker_name from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_comment.user_id,
    'comment_like',
    'Izoh yoqtirildi',
    coalesce(v_liker_name, 'Foydalanuvchi') || ' izohingizni yoqtirdi',
    jsonb_build_object(
      'post_id', v_comment.post_id,
      'comment_id', v_comment.id,
      'liker_id', new.user_id,
      'content_preview', left(regexp_replace(v_comment.content, '\s+', ' ', 'g'), 180)
    )
  );

  return new;
end
$$;

drop trigger if exists on_comment_like_notification on public.comment_likes;
create trigger on_comment_like_notification
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();

revoke execute on function public.notify_on_comment_like() from public, anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260903020000_home_recommendation_indexes.sql
-- SHA256 a089828435750de9da23bbb4b4eb6d436090a2d50d19b2fe58c19ef87f9b8c59
-- ============================================================================
-- Home recommendation retrieval + personalization signal indexes.
-- No new user profiling table is needed: ranking uses first-party behavior that
-- already exists (likes, comments, saves, reposts, views, follows, hides,
-- hashtags and video retention).

create index if not exists posts_home_recommendation_fresh_idx
  on public.posts (created_at desc)
  where visibility = 'public';

create index if not exists posts_home_recommendation_quality_idx
  on public.posts (likes_count desc, comments_count desc, created_at desc)
  where visibility = 'public';

create index if not exists follows_home_affinity_idx
  on public.follows (follower_id, following_id);

create index if not exists post_likes_home_affinity_idx
  on public.post_likes (user_id, created_at desc, post_id);

create index if not exists comments_home_affinity_idx
  on public.comments (user_id, created_at desc, post_id);

create index if not exists bookmarks_home_affinity_idx
  on public.bookmarks (user_id, created_at desc, post_id);

create index if not exists reposts_home_affinity_idx
  on public.reposts (user_id, created_at desc, post_id);

create index if not exists post_views_home_affinity_idx
  on public.post_views (user_id, viewed_at desc, post_id);

create index if not exists content_hides_home_affinity_idx
  on public.content_hides (user_id, created_at desc, post_id);

create index if not exists post_hashtags_home_affinity_idx
  on public.post_hashtags (post_id, hashtag);

create index if not exists video_watch_sessions_home_affinity_idx
  on public.video_watch_sessions (user_id, created_at desc, post_id);


-- ============================================================================
-- SOURCE B-web: 20260903130000_video_recommendation_rankings.sql
-- SHA256 f3431fcfa5afd77b42cd61a4ca7a29498b4a175852d6fc9c55b14f115554b15c
-- ============================================================================
-- Professional video recommendation global quality layer.
--
-- Personalized ranking stays client/session-specific, while this table contains
-- non-personal global priors calculated from retention/completion + engagement
-- + freshness. This prevents pure popularity sorting and gives high-retention
-- videos a chance even when their raw view count is smaller.

create table if not exists public.recommendation_global_rankings (
  post_id uuid primary key references public.posts(id) on delete cascade,
  content_mode text not null default 'feed',
  score double precision not null default 0,
  quality_score double precision not null default 0,
  engagement_score double precision not null default 0,
  freshness_score double precision not null default 0,
  calculated_at timestamptz not null default now()
);

create index if not exists recommendation_global_video_score_idx
  on public.recommendation_global_rankings
  (content_mode, score desc, calculated_at desc);

create index if not exists posts_video_recommendation_quality_idx
  on public.posts
  (likes_count desc, comments_count desc, views_count desc, created_at desc)
  where visibility = 'public' and media_type = 'video';

alter table public.recommendation_global_rankings enable row level security;

drop policy if exists "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings;
create policy "recommendation_global_rankings_public_read"
  on public.recommendation_global_rankings
  for select
  using (true);

grant select on public.recommendation_global_rankings to anon, authenticated;

-- The user's event stream is private and can only be written/read by that user.
alter table public.recommendation_events enable row level security;

drop policy if exists "recommendation_events_select_own"
  on public.recommendation_events;
create policy "recommendation_events_select_own"
  on public.recommendation_events
  for select
  using (user_id = auth.uid());

drop policy if exists "recommendation_events_insert_own"
  on public.recommendation_events;
create policy "recommendation_events_insert_own"
  on public.recommendation_events
  for insert
  with check (user_id = auth.uid());

grant select, insert on public.recommendation_events to authenticated;

create or replace function public.recalculate_video_recommendation_rank(
  post_id_param uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  session_count bigint := 0;
  avg_retention double precision := 0;
  completion_rate double precision := 0;
  freshness double precision := 0;
  engagement double precision := 0;
  quality double precision := 0;
  confidence double precision := 0;
  final_score double precision := 0;
begin
  select
    id,
    media_type,
    visibility,
    created_at,
    coalesce(likes_count, 0)::double precision as likes_count,
    coalesce(comments_count, 0)::double precision as comments_count,
    coalesce(shares_count, 0)::double precision as shares_count,
    coalesce(bookmarks_count, 0)::double precision as bookmarks_count,
    coalesce(views_count, 0)::double precision as views_count
  into p
  from public.posts
  where id = post_id_param;

  if not found or p.media_type <> 'video' or p.visibility <> 'public' then
    delete from public.recommendation_global_rankings
    where post_id = post_id_param;
    return;
  end if;

  select
    count(*)::bigint,
    coalesce(
      avg(
        case
          when duration_seconds is not null and duration_seconds > 0
            then least(1.5, watched_seconds / duration_seconds)
          else null
        end
      ),
      0
    )::double precision,
    coalesce(
      (count(*) filter (where completed))::double precision
        / greatest(count(*), 1),
      0
    )::double precision
  into session_count, avg_retention, completion_rate
  from public.video_watch_sessions
  where post_id = post_id_param
    and created_at >= now() - interval '90 days';

  confidence := least(
    1.0,
    ln(1 + greatest(session_count, 0)::double precision) / ln(31.0)
  );

  freshness :=
    3.4 * exp(
      -greatest(
        extract(epoch from (now() - coalesce(p.created_at, now()))) / 3600.0,
        0
      ) / 120.0
    )
    + 0.7 * exp(
      -greatest(
        extract(epoch from (now() - coalesce(p.created_at, now()))) / 86400.0,
        0
      ) / 45.0
    );

  engagement :=
    ln(
      1
      + p.likes_count * 1.7
      + p.comments_count * 3.6
      + p.shares_count * 3.1
      + p.bookmarks_count * 4.4
    )
    + ln(1 + p.views_count) * 0.17;

  quality :=
    (
      least(1.25, greatest(avg_retention, 0)) * 5.2
      + least(1, greatest(completion_rate, 0)) * 4.8
    ) * confidence;

  final_score := freshness + engagement * 0.9 + quality;

  insert into public.recommendation_global_rankings (
    post_id,
    content_mode,
    score,
    quality_score,
    engagement_score,
    freshness_score,
    calculated_at
  )
  values (
    post_id_param,
    'video',
    final_score,
    quality,
    engagement,
    freshness,
    now()
  )
  on conflict (post_id) do update
    set content_mode = excluded.content_mode,
        score = excluded.score,
        quality_score = excluded.quality_score,
        engagement_score = excluded.engagement_score,
        freshness_score = excluded.freshness_score,
        calculated_at = excluded.calculated_at;
end;
$$;

revoke all on function public.recalculate_video_recommendation_rank(uuid)
  from public;

create or replace function public.refresh_video_rank_from_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_video_recommendation_rank(new.id);
  return new;
end;
$$;

drop trigger if exists posts_refresh_video_recommendation_rank
  on public.posts;
create trigger posts_refresh_video_recommendation_rank
after insert or update of
  likes_count,
  comments_count,
  shares_count,
  bookmarks_count,
  views_count,
  visibility,
  media_type
on public.posts
for each row
execute function public.refresh_video_rank_from_post();

create or replace function public.refresh_video_rank_from_watch()
returns trigger
language plpgsql
security definer
set search_path = public
as $video_rank_watch$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_video_recommendation_rank(old.post_id);
    return old;
  end if;

  perform public.recalculate_video_recommendation_rank(new.post_id);
  return new;
end;
$video_rank_watch$;

drop trigger if exists video_watch_refresh_recommendation_rank
  on public.video_watch_sessions;
create trigger video_watch_refresh_recommendation_rank
after insert or delete on public.video_watch_sessions
for each row
execute function public.refresh_video_rank_from_watch();

-- Seed existing public videos. Triggered updates keep the table fresh afterwards.
do $$
declare
  row_item record;
begin
  for row_item in
    select id
    from public.posts
    where media_type = 'video'
      and visibility = 'public'
  loop
    perform public.recalculate_video_recommendation_rank(row_item.id);
  end loop;
end;
$$;


-- ============================================================================
-- SOURCE B-web: 20260903224500_search_engine_public_index.sql
-- SHA256 821c4d9aff1927a78b7390f2ec3a75b56f8c0f3cdcd78cd5311cb0acc35b4b4a
-- ============================================================================
-- Search-engine discoverability for public Alsamos entities.
-- Exposes only intentionally public metadata through SECURITY DEFINER RPCs.
-- Private/friends posts, private groups/channels and inactive products are excluded.

create or replace function public.seo_public_sitemap(
  p_kind text,
  p_limit integer default 50000,
  p_offset integer default 0
)
returns table (
  url_path text,
  lastmod timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50000), 50000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  case lower(coalesce(p_kind, ''))
    when 'profiles' then
      return query
      select '/user/' || p.username,
             coalesce(p.updated_at, p.created_at, now())
      from public.profiles p
      where p.username is not null and length(trim(p.username)) > 0
      order by coalesce(p.updated_at, p.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'posts' then
      return query
      select '/post/' || p.id::text,
             coalesce(p.updated_at, p.created_at, now())
      from public.posts p
      where p.visibility = 'public'
        and coalesce(p.is_hidden, false) = false
      order by coalesce(p.updated_at, p.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'channels' then
      return query
      select '/channel/' || coalesce(nullif(c.username, ''), c.id::text),
             coalesce(c.updated_at, c.created_at, now())
      from public.channels c
      where c.channel_type = 'public'
      order by coalesce(c.updated_at, c.created_at) desc
      limit v_limit offset v_offset;

    when 'groups' then
      return query
      select '/group/' || coalesce(nullif(c.username, ''), c.id::text),
             coalesce(c.last_message_at, c.created_at, now())
      from public.conversations c
      where c.type = 'group'
        and c.is_public is true
      order by coalesce(c.last_message_at, c.created_at) desc nulls last
      limit v_limit offset v_offset;

    when 'products' then
      return query
      select '/marketplace/product/' || p.id::text,
             coalesce(p.updated_at, p.created_at, now())
      from public.products p
      where p.status = 'active'
        and (p.moderation_status is null or p.moderation_status = 'approved')
      order by coalesce(p.updated_at, p.created_at) desc
      limit v_limit offset v_offset;

    when 'hashtags' then
      return query
      select '/hashtag/' || h.tag,
             coalesce(h.last_used_at, now())
      from public.hashtags h
      where coalesce(h.post_count, 0) > 0
      order by h.last_used_at desc nulls last, coalesce(h.post_count, 0) desc
      limit v_limit offset v_offset;

    else
      return;
  end case;
end;
$$;

revoke all on function public.seo_public_sitemap(text, integer, integer) from public;
grant execute on function public.seo_public_sitemap(text, integer, integer) to anon, authenticated;

create or replace function public.seo_public_entity(
  p_kind text,
  p_value text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_kind text := lower(coalesce(p_kind, ''));
  v_value text := trim(coalesce(p_value, ''));
begin
  if v_value = '' then return null; end if;

  if v_kind = 'profile' then
    select jsonb_build_object(
      'kind', 'profile',
      'canonicalPath', '/user/' || p.username,
      'title', coalesce(nullif(p.display_name, ''), '@' || p.username),
      'description', coalesce(nullif(p.bio, ''), '@' || p.username || ' — Alsamos profili.'),
      'image', p.avatar_url,
      'username', p.username,
      'followersCount', coalesce(p.followers_count, 0),
      'postsCount', coalesce(p.posts_count, 0),
      'updatedAt', coalesce(p.updated_at, p.created_at)
    )
    into result
    from public.profiles p
    where p.username is not null
      and lower(p.username) = lower(v_value)
    limit 1;

  elsif v_kind = 'post' then
    select jsonb_build_object(
      'kind', 'post',
      'canonicalPath', '/post/' || p.id::text,
      'title', coalesce(
        nullif(left(regexp_replace(coalesce(p.content, ''), E'\\s+', ' ', 'g'), 90), ''),
        coalesce(nullif(pr.display_name, ''), '@' || pr.username, 'Alsamos posti')
      ),
      'description', coalesce(
        nullif(left(regexp_replace(coalesce(p.content, ''), E'\\s+', ' ', 'g'), 300), ''),
        'Alsamos dagi ommaviy post.'
      ),
      'image', coalesce(p.thumbnail_url, case when p.media_urls is not null then p.media_urls[1] else null end),
      'authorName', coalesce(nullif(pr.display_name, ''), pr.username),
      'authorUsername', pr.username,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at,
      'likesCount', coalesce(p.likes_count, 0),
      'commentsCount', coalesce(p.comments_count, 0),
      'viewsCount', coalesce(p.views_count, 0),
      'hashtags', coalesce(to_jsonb(p.hashtags), '[]'::jsonb)
    )
    into result
    from public.posts p
    left join public.profiles pr on pr.id = p.user_id
    where p.id::text = v_value
      and p.visibility = 'public'
      and coalesce(p.is_hidden, false) = false
    limit 1;

  elsif v_kind = 'channel' then
    select jsonb_build_object(
      'kind', 'channel',
      'canonicalPath', '/channel/' || coalesce(nullif(c.username, ''), c.id::text),
      'title', c.name,
      'description', coalesce(nullif(c.description, ''), c.name || ' — Alsamos ommaviy kanali.'),
      'image', c.avatar_url,
      'username', c.username,
      'subscriberCount', coalesce(c.subscriber_count, 0),
      'postsCount', coalesce(c.posts_count, 0),
      'updatedAt', c.updated_at
    )
    into result
    from public.channels c
    where c.channel_type = 'public'
      and (lower(coalesce(c.username, '')) = lower(v_value) or c.id::text = v_value)
    limit 1;

  elsif v_kind = 'group' then
    select jsonb_build_object(
      'kind', 'group',
      'canonicalPath', '/group/' || coalesce(nullif(c.username, ''), c.id::text),
      'title', coalesce(nullif(c.name, ''), 'Alsamos guruhi'),
      'description', coalesce(nullif(c.description, ''), coalesce(nullif(c.name, ''), 'Alsamos guruhi') || ' — ommaviy Alsamos guruhi.'),
      'image', c.avatar_url,
      'username', c.username,
      'memberCount', greatest(coalesce(c.subscriber_count, 0), coalesce(c.subscribers_count, 0)),
      'updatedAt', coalesce(c.last_message_at, c.created_at)
    )
    into result
    from public.conversations c
    where c.type = 'group'
      and c.is_public is true
      and (lower(coalesce(c.username, '')) = lower(v_value) or c.id::text = v_value)
    limit 1;

  elsif v_kind = 'product' then
    select jsonb_build_object(
      'kind', 'product',
      'canonicalPath', '/marketplace/product/' || p.id::text,
      'title', p.title,
      'description', coalesce(nullif(p.description, ''), p.title || ' — Alsamos Bozor mahsuloti.'),
      'image', pm.url,
      'price', p.price,
      'currency', coalesce(p.currency, 'USD'),
      'availability', case when coalesce(p.quantity, 0) > 0 then 'InStock' else 'OutOfStock' end,
      'sellerName', s.business_name,
      'updatedAt', p.updated_at
    )
    into result
    from public.products p
    left join public.sellers s on s.id = p.seller_id
    left join lateral (
      select m.url
      from public.product_images m
      where m.product_id = p.id
      order by m.position asc nulls last, m.created_at asc
      limit 1
    ) pm on true
    where p.id::text = v_value
      and p.status = 'active'
      and (p.moderation_status is null or p.moderation_status = 'approved')
    limit 1;

  elsif v_kind = 'hashtag' then
    select jsonb_build_object(
      'kind', 'hashtag',
      'canonicalPath', '/hashtag/' || h.tag,
      'title', '#' || h.tag,
      'description', '#' || h.tag || ' bo‘yicha Alsamos dagi ommaviy postlar.',
      'postsCount', coalesce(h.post_count, 0),
      'updatedAt', h.last_used_at
    )
    into result
    from public.hashtags h
    where lower(h.tag) = lower(trim(both '#' from v_value))
      and coalesce(h.post_count, 0) > 0
    limit 1;
  end if;

  return result;
end;
$$;

revoke all on function public.seo_public_entity(text, text) from public;
grant execute on function public.seo_public_entity(text, text) to anon, authenticated;


-- ============================================================================
-- SOURCE B-web: 20260903233000_disable_group_channel_boost.sql
-- SHA256 635132683bb0ec710f69f75e81a1be1b524f604d5c96c466d03ade82086bdddf
-- ============================================================================
-- Alsamos groups/channels: Boost is intentionally disabled for now.
-- Keep legacy columns/table for forward compatibility, but expose no client write path.

drop policy if exists boosts_manage_own on public.conversation_boosts;
drop policy if exists boosts_select on public.conversation_boosts;

delete from public.conversation_boosts;

update public.conversations
set boost_level = 0,
    boosts_count = 0
where coalesce(boost_level, 0) <> 0
   or coalesce(boosts_count, 0) <> 0;

alter table public.conversation_boosts enable row level security;


-- ============================================================================
-- SOURCE B-web: 20260903234500_sync_chat_list_activity.sql
-- SHA256 b65cc6c5c4012fcba281e488c969da04c1b06d7cba286817c2ebc869f4cc8112
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260903234600_harden_chat_activity_trigger.sql
-- SHA256 e008ca34d1bebe6c95c6e7c0ef1ca4a50446c1f1a6bede7d059d762b990ae80a
-- ============================================================================
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

