-- Mini Apps Platform 2.0 — Faza 2/3
--
-- Bu migratsiya 20260831120000_mini_apps_platform_v2.sql ustiga qo'yiladi va
-- quyidagilarni qo'shadi:
--   1. publisher_domains uchun tekshiruv metadatasi (last_checked_at, check_error)
--   2. publisher onboarding RPC lari (yaratish, domen qo'shish, natijani yozish)
--   3. Mini App SDK sessiyalari (initData nonce, replay himoyasi)
--   4. To'lovlar jadvali va RPC lari
--   5. Moderatsiya navbati RPC si
--
-- Diqqat: jadval nomi `public.publishers` (v2 migratsiyasidagi kabi),
-- domen tokeni esa `publisher_domains.verify_token` ustunida saqlanadi.

-- =====================================================================
-- 1. PUBLISHER_DOMAINS — tekshiruv metadatasi
-- =====================================================================

alter table public.publisher_domains
  add column if not exists last_checked_at timestamptz,
  add column if not exists check_error text;

-- =====================================================================
-- 2. PUBLISHER ONBOARDING RPC
-- =====================================================================

create or replace function public.mini_app_publisher_create(
  p_handle text,
  p_name text,
  p_type text default 'individual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_handle text := lower(btrim(coalesce(p_handle, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'INVALID_HANDLE';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'INVALID_NAME';
  end if;
  if coalesce(p_type, 'individual') not in ('individual','company','government','non_profit') then
    raise exception 'INVALID_TYPE';
  end if;
  if exists (select 1 from public.publishers where lower(handle) = v_handle) then
    raise exception 'HANDLE_TAKEN';
  end if;

  insert into public.publishers (owner_id, handle, display_name, type)
  values (auth.uid(), v_handle, btrim(p_name), coalesce(p_type, 'individual'))
  returning id into v_id;

  insert into public.publisher_members (publisher_id, user_id, role)
  values (v_id, auth.uid(), 'owner')
  on conflict (publisher_id, user_id) do update set role = 'owner';

  return v_id;
end $$;

-- Domen qo'shadi va TXT yozuvi uchun tokenni qaytaradi.
create or replace function public.mini_app_publisher_add_domain(
  p_publisher_id uuid,
  p_domain text
)
returns table (domain_id uuid, verification_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'INVALID_DOMAIN';
  end if;

  if not exists (
    select 1 from public.publishers p
     where p.id = p_publisher_id
       and (p.owner_id = auth.uid()
            or exists (select 1 from public.publisher_members m
                        where m.publisher_id = p.id and m.user_id = auth.uid()
                          and m.role in ('owner','admin')))
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select d.id, d.verify_token into v_id, v_token
    from public.publisher_domains d
   where lower(d.domain) = v_domain;

  if v_id is null then
    insert into public.publisher_domains (publisher_id, domain)
    values (p_publisher_id, v_domain)
    returning id, verify_token into v_id, v_token;
  elsif not exists (
    select 1 from public.publisher_domains d
     where d.id = v_id and d.publisher_id = p_publisher_id
  ) then
    raise exception 'DOMAIN_TAKEN';
  end if;

  domain_id := v_id;
  verification_token := 'alsamos-verify=' || v_token;
  return next;
end $$;

-- DNS tekshiruvi natijasini yozadi (faqat edge funksiya / service_role).
create or replace function public.mini_app_publisher_domain_result(
  p_domain_id uuid,
  p_verified boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publisher uuid;
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  update public.publisher_domains
     set verified_at = case when p_verified then coalesce(verified_at, now()) else null end,
         last_checked_at = now(),
         check_error = case when p_verified then null else p_error end
   where id = p_domain_id
  returning publisher_id into v_publisher;

  if p_verified and v_publisher is not null then
    update public.publishers
       set verification = 'domain_verified',
           updated_at = now()
     where id = v_publisher
       and verification <> 'official';
  end if;
end $$;

-- =====================================================================
-- 3. SDK SESSIYALARI (initData nonce)
-- =====================================================================

create table if not exists public.mini_app_sdk_sessions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce text not null unique,
  platform text not null default 'web',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists mini_app_sdk_sessions_app_idx
  on public.mini_app_sdk_sessions (app_id, issued_at desc);

alter table public.mini_app_sdk_sessions enable row level security;

drop policy if exists mini_app_sdk_sessions_own on public.mini_app_sdk_sessions;
create policy mini_app_sdk_sessions_own on public.mini_app_sdk_sessions
  for select to authenticated using (user_id = auth.uid());

-- =====================================================================
-- 4. TO'LOVLAR
-- =====================================================================

create table if not exists public.mini_app_payments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'UZS',
  status text not null default 'pending'
    check (status in ('draft','pending','paid','failed','refunded')),
  description text,
  provider text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mini_app_payments_user_idx
  on public.mini_app_payments (user_id, created_at desc);
create index if not exists mini_app_payments_app_idx
  on public.mini_app_payments (app_id, created_at desc);

alter table public.mini_app_payments enable row level security;

drop policy if exists mini_app_payments_read on public.mini_app_payments;
create policy mini_app_payments_read on public.mini_app_payments
  for select to authenticated using (
    user_id = auth.uid() or public.mini_app_can_manage(app_id)
  );

create or replace function public.mini_app_payment_create(
  p_app_id uuid,
  p_amount numeric,
  p_currency text default 'UZS',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not exists (
    select 1 from public.mini_apps
     where id = p_app_id
       and status = 'approved'
       and permissions ? 'payments'
  ) then
    raise exception 'PAYMENTS_NOT_ALLOWED';
  end if;

  insert into public.mini_app_payments (app_id, user_id, amount, currency, description)
  values (p_app_id, auth.uid(), p_amount, coalesce(p_currency, 'UZS'), p_description)
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.mini_app_payment_set_status(
  p_payment_id uuid,
  p_status text,
  p_provider text default null,
  p_external_id text default null,
  p_payload jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('draft','pending','paid','failed','refunded') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.mini_app_payments
     set status = p_status,
         provider = coalesce(p_provider, provider),
         external_id = coalesce(p_external_id, external_id),
         payload = coalesce(p_payload, payload),
         updated_at = now()
   where id = p_payment_id;
end $$;

-- =====================================================================
-- 5. MODERATSIYA NAVBATI
-- =====================================================================

create or replace function public.mini_app_moderation_queue(
  p_status text default 'pending_review',
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  app_id uuid,
  slug text,
  name text,
  icon_url text,
  app_type text,
  url text,
  status text,
  publisher_id uuid,
  publisher_name text,
  publisher_handle text,
  publisher_verification text,
  open_reports bigint,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    a.id,
    a.handle,
    a.name,
    a.icon_url,
    a.app_type,
    a.url,
    a.status,
    a.publisher_id,
    p.display_name,
    p.handle,
    coalesce(p.verification, 'unverified'),
    (select count(*) from public.mini_app_reports r
      where r.app_id = a.id and r.status = 'open'),
    coalesce(a.updated_at, a.created_at)
  from public.mini_apps a
  left join public.publishers p on p.id = a.publisher_id
  where a.status = coalesce(p_status, 'pending_review')
  order by
    (select count(*) from public.mini_app_reports r
      where r.app_id = a.id and r.status = 'open') desc,
    coalesce(a.updated_at, a.created_at) asc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(0, coalesce(p_offset, 0));
end $$;

-- =====================================================================
-- 6. GRANTLAR
-- =====================================================================

grant execute on function public.mini_app_publisher_create(text, text, text) to authenticated;
grant execute on function public.mini_app_publisher_add_domain(uuid, text) to authenticated;
grant execute on function public.mini_app_publisher_domain_result(uuid, boolean, text) to service_role;
grant execute on function public.mini_app_payment_create(uuid, numeric, text, text) to authenticated;
grant execute on function public.mini_app_payment_set_status(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.mini_app_moderation_queue(text, int, int) to service_role;

-- PostgREST schema keshini yangilash
notify pgrst, 'reload schema';
