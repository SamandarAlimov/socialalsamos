-- Ensure every existing and future Alsamos account has a wallet account number.
-- Safe to run even when earlier wallet migrations were partially deployed.

create extension if not exists pgcrypto;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  currency text not null default 'UZS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.alsamos_wallet_account_seq
  as bigint
  start with 100000000001
  increment by 1
  no cycle;

create or replace function public.generate_wallet_account_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'ALS' || lpad(nextval('public.alsamos_wallet_account_seq')::text, 12, '0');
end;
$$;

alter table public.wallets
  add column if not exists account_number text,
  add column if not exists status text not null default 'active',
  add column if not exists last_activity_at timestamptz;

alter table public.wallets alter column account_number set default public.generate_wallet_account_number();

-- Move the sequence ahead of any account numbers that may already exist.
do $$
declare
  v_max bigint;
begin
  select max(substring(account_number from 4)::bigint)
    into v_max
    from public.wallets
   where account_number ~ '^ALS[0-9]{12}$';

  perform setval(
    'public.alsamos_wallet_account_seq',
    greatest(coalesce(v_max, 100000000000), 100000000000),
    true
  );
end $$;

-- First create wallets for every historical auth user.
insert into public.wallets (user_id, balance)
select u.id, 0
from auth.users u
where not exists (
  select 1 from public.wallets w where w.user_id = u.id
)
on conflict (user_id) do nothing;

-- Then repair historical wallet rows that predate account numbers.
update public.wallets
set account_number = public.generate_wallet_account_number(),
    updated_at = now()
where account_number is null or btrim(account_number) = '';

alter table public.wallets alter column account_number set not null;

create unique index if not exists wallets_account_number_uidx
  on public.wallets (account_number);

alter table public.wallets drop constraint if exists wallets_status_check;
alter table public.wallets
  add constraint wallets_status_check
  check (status in ('active', 'restricted', 'suspended', 'closed'));

alter table public.wallets enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own
  on public.wallets
  for select to authenticated
  using (auth.uid() = user_id);

-- Authenticated users can ask the server to repair/provision only their own wallet.
create or replace function public.ensure_my_wallet()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallets;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  update public.wallets
     set account_number = public.generate_wallet_account_number(),
         updated_at = now()
   where user_id = v_user
     and (account_number is null or btrim(account_number) = '');

  select * into v_wallet
    from public.wallets
   where user_id = v_user;

  return jsonb_build_object(
    'id', v_wallet.id,
    'user_id', v_wallet.user_id,
    'account_number', v_wallet.account_number,
    'balance', v_wallet.balance,
    'currency', v_wallet.currency,
    'status', v_wallet.status,
    'last_activity_at', v_wallet.last_activity_at,
    'created_at', v_wallet.created_at,
    'updated_at', v_wallet.updated_at
  );
end;
$$;

revoke all on function public.ensure_my_wallet() from public, anon;
grant execute on function public.ensure_my_wallet() to authenticated;

create or replace function public.bootstrap_alsamos_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute function public.bootstrap_alsamos_wallet();

-- Monetary rows remain server-owned.
revoke insert, update, delete on public.wallets from authenticated, anon;

notify pgrst, 'reload schema';
