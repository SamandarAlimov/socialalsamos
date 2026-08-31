-- Mini Apps Platform 2.0 — Faza 2
-- (b) Mini App SDK sessiyalari va to'lov ko'prigi
-- (c) publisher onboarding + domen tasdiqlash (DNS TXT)
-- (d) admin moderatsiya navbati
--
-- Barcha o'zgarishlar idempotent: migratsiya qayta ishga tushsa ham xato bermaydi.

set local search_path = public;

-- ---------------------------------------------------------------------------
-- (c) Domen tasdiqlash uchun ustunlar
-- ---------------------------------------------------------------------------

alter table public.publisher_domains add column if not exists verification_token text;
alter table public.publisher_domains add column if not exists verified_at timestamptz;
alter table public.publisher_domains add column if not exists last_checked_at timestamptz;
alter table public.publisher_domains add column if not exists check_error text;
alter table public.publisher_domains add column if not exists created_by uuid;

create unique index if not exists publisher_domains_domain_key
  on public.publisher_domains (lower(domain));

-- ---------------------------------------------------------------------------
-- (b) SDK sessiyalari (initData HMAC uchun nonce saqlanadi)
-- ---------------------------------------------------------------------------

create table if not exists public.mini_app_sdk_sessions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce text not null unique,
  platform text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  consumed_at timestamptz
);

create index if not exists mini_app_sdk_sessions_app_idx
  on public.mini_app_sdk_sessions (app_id, issued_at desc);
create index if not exists mini_app_sdk_sessions_expiry_idx
  on public.mini_app_sdk_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- (b) To'lovlar
-- ---------------------------------------------------------------------------

create table if not exists public.mini_app_payments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.mini_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'UZS',
  status text not null default 'pending',
  provider text,
  external_id text,
  description text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mini_app_payments_status_check'
  ) then
    alter table public.mini_app_payments
      add constraint mini_app_payments_status_check
      check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded'));
  end if;
end $$;

create index if not exists mini_app_payments_user_idx
  on public.mini_app_payments (user_id, created_at desc);
create index if not exists mini_app_payments_app_idx
  on public.mini_app_payments (app_id, created_at desc);

-- ---------------------------------------------------------------------------
-- (c) Publisher yaratish va a'zolik
-- ---------------------------------------------------------------------------

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
  v_user uuid := auth.uid();
  v_handle text := lower(trim(p_handle));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'INVALID_HANDLE';
  end if;
  if p_type not in ('individual', 'company', 'government', 'non_profit') then
    raise exception 'INVALID_TYPE';
  end if;

  insert into public.publishers (handle, name, type, verification, owner_id)
  values (v_handle, coalesce(nullif(trim(p_name), ''), v_handle), p_type, 'unverified', v_user)
  returning id into v_id;

  insert into public.publisher_members (publisher_id, user_id, role)
  values (v_id, v_user, 'owner')
  on conflict do nothing;

  return v_id;
end;
$$;

-- Domen qo'shish: TXT yozuvi uchun token qaytaradi.
create or replace function public.mini_app_publisher_add_domain(
  p_publisher_id uuid,
  p_domain text
)
returns table (domain_id uuid, domain text, verification_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_domain text := lower(trim(p_domain));
  v_token text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.publisher_members m
    where m.publisher_id = p_publisher_id
      and m.user_id = v_user
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := split_part(v_domain, '/', 1);
  if v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'INVALID_DOMAIN';
  end if;

  v_token := 'alsamos-verify=' || replace(gen_random_uuid()::text, '-', '');

  insert into public.publisher_domains (publisher_id, domain, verification_token, created_by)
  values (p_publisher_id, v_domain, v_token, v_user)
  on conflict (lower(domain)) do update
    set publisher_id = excluded.publisher_id,
        verification_token = coalesce(public.publisher_domains.verification_token, excluded.verification_token),
        check_error = null
  returning id, public.publisher_domains.verification_token into v_id, v_token;

  return query select v_id, v_domain, v_token;
end;
$$;

-- Faqat service_role: DNS tekshiruvidan keyin natijani yozadi.
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
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  update public.publisher_domains
     set verified_at = case when p_verified then now() else null end,
         last_checked_at = now(),
         check_error = p_error
   where id = p_domain_id
   returning publisher_id into v_publisher;

  if p_verified and v_publisher is not null then
    update public.publishers
       set verification = 'domain_verified'
     where id = v_publisher
       and verification not in ('official');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) To'lov RPC'lari
-- ---------------------------------------------------------------------------

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
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not exists (
    select 1 from public.mini_apps a
    where a.id = p_app_id
      and a.status = 'approved'
      and 'payments' = any (a.permissions)
  ) then
    raise exception 'PAYMENTS_NOT_ALLOWED';
  end if;

  insert into public.mini_app_payments (app_id, user_id, amount, currency, description)
  values (p_app_id, v_user, p_amount, coalesce(nullif(p_currency, ''), 'UZS'), p_description)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.mini_app_payment_set_status(
  p_payment_id uuid,
  p_status text,
  p_provider text default null,
  p_external_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_status not in ('pending', 'paid', 'failed', 'canceled', 'refunded') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.mini_app_payments
     set status = p_status,
         provider = coalesce(p_provider, provider),
         external_id = coalesce(p_external_id, external_id),
         paid_at = case when p_status = 'paid' then now() else paid_at end,
         updated_at = now()
   where id = p_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- (d) Moderatsiya navbati
-- ---------------------------------------------------------------------------

create or replace function public.mini_app_moderation_queue(
  p_status text default 'pending_review',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  app_id uuid,
  name text,
  handle text,
  url text,
  app_type text,
  status text,
  category text,
  owner_id uuid,
  publisher_id uuid,
  publisher_handle text,
  publisher_verification text,
  open_reports bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mini_app_is_service_role() then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  return query
  select a.id,
         a.name,
         a.handle,
         a.url,
         a.app_type,
         a.status,
         a.category,
         a.user_id,
         a.publisher_id,
         p.handle,
         p.verification,
         coalesce(r.open_reports, 0),
         a.created_at,
         a.updated_at
    from public.mini_apps a
    left join public.publishers p on p.id = a.publisher_id
    left join (
      select app_id, count(*) as open_reports
        from public.mini_app_reports
       where resolved_at is null
       group by app_id
    ) r on r.app_id = a.id
   where (p_status is null or a.status = p_status)
   order by coalesce(r.open_reports, 0) desc, a.created_at asc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mini_app_sdk_sessions enable row level security;
alter table public.mini_app_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'mini_app_sdk_sessions'
       and policyname = 'mini_app_sdk_sessions_own_read'
  ) then
    create policy mini_app_sdk_sessions_own_read
      on public.mini_app_sdk_sessions for select
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'mini_app_payments'
       and policyname = 'mini_app_payments_read'
  ) then
    create policy mini_app_payments_read
      on public.mini_app_payments for select
      using (user_id = auth.uid() or public.mini_app_can_manage(app_id));
  end if;
end $$;

grant select on public.mini_app_payments to authenticated;
grant select on public.mini_app_sdk_sessions to authenticated;

grant execute on function public.mini_app_publisher_create(text, text, text) to authenticated;
grant execute on function public.mini_app_publisher_add_domain(uuid, text) to authenticated;
grant execute on function public.mini_app_payment_create(uuid, numeric, text, text) to authenticated;
grant execute on function public.mini_app_publisher_domain_result(uuid, boolean, text) to service_role;
grant execute on function public.mini_app_payment_set_status(uuid, text, text, text) to service_role;
grant execute on function public.mini_app_moderation_queue(text, integer, integer) to service_role;
