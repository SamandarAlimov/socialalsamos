-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260903235900_wallet_platform_core.sql
-- SHA256 bce19376dd8574f0f6934bb10d028282347f63ce144fd8a3444fd29f989ad269
-- ============================================================================
-- =====================================================================
-- Alsamos Wallet Core
-- One wallet/account per platform account, atomic P2P transfers, immutable
-- ledger, message transfer rail, and marketplace seller settlement.
-- External fiat rails remain provider-gated; internal Alsamos money movement
-- is fully server-authoritative.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Wallet identity / account number
-- ---------------------------------------------------------------------
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

alter table public.wallets drop constraint if exists wallets_status_check;
alter table public.wallets
  add constraint wallets_status_check
  check (status in ('active', 'restricted', 'suspended', 'closed'));

update public.wallets
set account_number = public.generate_wallet_account_number()
where account_number is null or btrim(account_number) = '';

alter table public.wallets alter column account_number set default public.generate_wallet_account_number();
alter table public.wallets alter column account_number set not null;

create unique index if not exists wallets_account_number_uidx
  on public.wallets (account_number);

create index if not exists wallets_user_status_idx
  on public.wallets (user_id, status);

-- Wallets are created by the database, never by arbitrary client writes.
insert into public.wallets (user_id, balance)
select u.id, 0
from auth.users u
where not exists (
  select 1 from public.wallets w where w.user_id = u.id
)
on conflict (user_id) do nothing;

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

-- ---------------------------------------------------------------------
-- 2. Atomic transfer + immutable ledger
-- ---------------------------------------------------------------------
create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  status text not null default 'completed' check (status in ('completed', 'reversed')),
  note text,
  context_type text not null default 'p2p',
  context_id uuid,
  created_at timestamptz not null default now(),
  constraint wallet_transfer_not_self check (sender_id <> recipient_id),
  unique (idempotency_key)
);

create index if not exists wallet_transfers_sender_idx
  on public.wallet_transfers (sender_id, created_at desc);
create index if not exists wallet_transfers_recipient_idx
  on public.wallet_transfers (recipient_id, created_at desc);
create index if not exists wallet_transfers_context_idx
  on public.wallet_transfers (context_type, context_id)
  where context_id is not null;

alter table public.wallet_transfers enable row level security;

drop policy if exists wallet_transfers_select_participant on public.wallet_transfers;
create policy wallet_transfers_select_participant
  on public.wallet_transfers
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  kind text not null,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'reversed')),
  description text,
  counterparty_user_id uuid references auth.users(id) on delete set null,
  transfer_id uuid references public.wallet_transfers(id) on delete set null,
  context_type text,
  context_id uuid,
  source_table text,
  source_id uuid,
  balance_after numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_user_idx
  on public.wallet_ledger (user_id, created_at desc);
create index if not exists wallet_ledger_context_idx
  on public.wallet_ledger (context_type, context_id)
  where context_id is not null;
create unique index if not exists wallet_ledger_source_uidx
  on public.wallet_ledger (source_table, source_id)
  where source_table is not null and source_id is not null;
create unique index if not exists wallet_marketplace_settlement_uidx
  on public.wallet_ledger (user_id, context_id)
  where kind = 'marketplace_settlement' and context_type = 'marketplace_order';

alter table public.wallet_ledger enable row level security;

drop policy if exists wallet_ledger_select_own on public.wallet_ledger;
create policy wallet_ledger_select_own
  on public.wallet_ledger
  for select to authenticated
  using (auth.uid() = user_id);

-- Prevent client mutation of authoritative monetary rows.
revoke insert, update, delete on public.wallets from authenticated, anon;
revoke insert, update, delete on public.wallet_transfers from authenticated, anon;
revoke insert, update, delete on public.wallet_ledger from authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Recipient resolution and P2P transfer
-- ---------------------------------------------------------------------
create or replace function public.wallet_lookup_recipient(_identifier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_identifier text := btrim(coalesce(_identifier, ''));
  v_compact text;
  v_rec record;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if length(v_identifier) < 3 or length(v_identifier) > 64 then
    raise exception 'invalid_recipient';
  end if;

  v_compact := upper(regexp_replace(v_identifier, '[^A-Za-z0-9]', '', 'g'));

  select
    w.user_id,
    w.account_number,
    p.username,
    p.display_name,
    p.avatar_url
  into v_rec
  from public.wallets w
  left join public.profiles p on p.id = w.user_id
  where w.status = 'active'
    and w.user_id <> v_user
    and (
      upper(regexp_replace(w.account_number, '[^A-Za-z0-9]', '', 'g')) = v_compact
      or lower(coalesce(p.username, '')) = lower(regexp_replace(v_identifier, '^@', ''))
    )
  limit 1;

  if v_rec.user_id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'user_id', v_rec.user_id,
    'account_number', v_rec.account_number,
    'username', v_rec.username,
    'display_name', v_rec.display_name,
    'avatar_url', v_rec.avatar_url
  );
end;
$$;

create or replace function public.wallet_transfer(
  _recipient text,
  _amount numeric,
  _note text default null,
  _idempotency_key uuid default gen_random_uuid(),
  _context_type text default 'p2p',
  _context_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_recipient_account text;
  v_sender_wallet public.wallets;
  v_recipient_wallet public.wallets;
  v_transfer public.wallet_transfers;
  v_sender_balance numeric(14,2);
  v_recipient_balance numeric(14,2);
  v_identifier text := btrim(coalesce(_recipient, ''));
  v_compact text;
begin
  if v_sender is null then
    raise exception 'not_authenticated';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- Defensive upper bound against accidental extra zeroes; provider rails may
  -- introduce jurisdiction-specific limits later.
  if _amount > 1000000000 then
    raise exception 'amount_too_large';
  end if;

  if _idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  select * into v_transfer
  from public.wallet_transfers
  where idempotency_key = _idempotency_key
  limit 1;

  if v_transfer.id is not null then
    if v_transfer.sender_id <> v_sender then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transfer_id', v_transfer.id,
      'amount', v_transfer.amount,
      'currency', v_transfer.currency,
      'recipient_id', v_transfer.recipient_id
    );
  end if;

  v_compact := upper(regexp_replace(v_identifier, '[^A-Za-z0-9]', '', 'g'));

  select w.user_id, w.account_number
  into v_recipient, v_recipient_account
  from public.wallets w
  left join public.profiles p on p.id = w.user_id
  where w.status = 'active'
    and (
      upper(regexp_replace(w.account_number, '[^A-Za-z0-9]', '', 'g')) = v_compact
      or lower(coalesce(p.username, '')) = lower(regexp_replace(v_identifier, '^@', ''))
      or w.user_id::text = v_identifier
    )
  limit 1;

  if v_recipient is null then
    raise exception 'recipient_not_found';
  end if;

  if v_recipient = v_sender then
    raise exception 'cannot_transfer_to_self';
  end if;

  -- Stable lock order prevents deadlocks when two users transfer concurrently.
  perform 1
  from public.wallets
  where user_id in (v_sender, v_recipient)
  order by user_id
  for update;

  select * into v_sender_wallet
  from public.wallets
  where user_id = v_sender;

  select * into v_recipient_wallet
  from public.wallets
  where user_id = v_recipient;

  if v_sender_wallet.id is null or v_recipient_wallet.id is null then
    raise exception 'wallet_not_found';
  end if;

  if v_sender_wallet.status <> 'active' or v_recipient_wallet.status <> 'active' then
    raise exception 'wallet_restricted';
  end if;

  if v_sender_wallet.currency <> v_recipient_wallet.currency then
    raise exception 'currency_mismatch';
  end if;

  if v_sender_wallet.balance < _amount then
    raise exception 'insufficient_balance';
  end if;

  update public.wallets
  set balance = balance - _amount,
      updated_at = now(),
      last_activity_at = now()
  where id = v_sender_wallet.id
  returning balance into v_sender_balance;

  update public.wallets
  set balance = balance + _amount,
      updated_at = now(),
      last_activity_at = now()
  where id = v_recipient_wallet.id
  returning balance into v_recipient_balance;

  insert into public.wallet_transfers (
    idempotency_key, sender_id, recipient_id, amount, currency, note,
    context_type, context_id
  ) values (
    _idempotency_key, v_sender, v_recipient, _amount, v_sender_wallet.currency,
    nullif(btrim(coalesce(_note, '')), ''),
    coalesce(nullif(btrim(coalesce(_context_type, '')), ''), 'p2p'),
    _context_id
  )
  returning * into v_transfer;

  insert into public.wallet_ledger (
    wallet_id, user_id, direction, amount, currency, kind, description,
    counterparty_user_id, transfer_id, context_type, context_id, balance_after
  ) values
  (
    v_sender_wallet.id, v_sender, 'debit', _amount, v_sender_wallet.currency,
    case when _context_type = 'message' then 'message_transfer' else 'p2p_transfer' end,
    nullif(btrim(coalesce(_note, '')), ''), v_recipient, v_transfer.id,
    coalesce(_context_type, 'p2p'), _context_id, v_sender_balance
  ),
  (
    v_recipient_wallet.id, v_recipient, 'credit', _amount, v_recipient_wallet.currency,
    case when _context_type = 'message' then 'message_transfer' else 'p2p_transfer' end,
    nullif(btrim(coalesce(_note, '')), ''), v_sender, v_transfer.id,
    coalesce(_context_type, 'p2p'), _context_id, v_recipient_balance
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transfer_id', v_transfer.id,
    'amount', _amount,
    'currency', v_sender_wallet.currency,
    'sender_balance', v_sender_balance,
    'recipient_id', v_recipient,
    'recipient_account', v_recipient_account
  );
end;
$$;

create or replace function public.wallet_transfer_to_conversation(
  _conversation_id uuid,
  _amount numeric,
  _note text default null,
  _idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type text;
  v_recipient uuid;
  v_account text;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select type into v_type
  from public.conversations
  where id = _conversation_id;

  if v_type is null then
    raise exception 'conversation_not_found';
  end if;

  if v_type <> 'private' then
    raise exception 'private_conversation_required';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = _conversation_id and user_id = v_user
  ) then
    raise exception 'not_conversation_participant';
  end if;

  select cp.user_id into v_recipient
  from public.conversation_participants cp
  where cp.conversation_id = _conversation_id
    and cp.user_id <> v_user
  order by cp.joined_at nulls last
  limit 1;

  if v_recipient is null then
    raise exception 'recipient_not_found';
  end if;

  select account_number into v_account
  from public.wallets
  where user_id = v_recipient and status = 'active';

  if v_account is null then
    raise exception 'recipient_wallet_not_found';
  end if;

  return public.wallet_transfer(
    v_account,
    _amount,
    _note,
    _idempotency_key,
    'message',
    _conversation_id
  );
end;
$$;

revoke all on function public.wallet_lookup_recipient(text) from public;
grant execute on function public.wallet_lookup_recipient(text) to authenticated;
revoke all on function public.wallet_transfer(text, numeric, text, uuid, text, uuid) from public;
grant execute on function public.wallet_transfer(text, numeric, text, uuid, text, uuid) to authenticated;
revoke all on function public.wallet_transfer_to_conversation(uuid, numeric, text, uuid) from public;
grant execute on function public.wallet_transfer_to_conversation(uuid, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Mirror wallet-affecting marketplace payments into the unified ledger
-- ---------------------------------------------------------------------
create or replace function public.mirror_marketplace_payment_to_wallet_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_kind text;
begin
  if not (
    new.method = 'wallet'
    or coalesce(new.metadata->>'kind', '') in ('wallet_topup', 'refund')
  ) then
    return new;
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = new.user_id;

  if v_wallet.id is null then
    return new;
  end if;

  v_kind := case
    when new.metadata->>'kind' = 'wallet_topup' then 'topup'
    when new.metadata->>'kind' = 'refund' then 'refund'
    when new.direction = 'debit' and new.order_id is not null then 'marketplace_purchase'
    else 'wallet_adjustment'
  end;

  insert into public.wallet_ledger (
    wallet_id, user_id, direction, amount, currency, kind, status,
    description, context_type, context_id, source_table, source_id,
    balance_after, metadata, created_at
  ) values (
    v_wallet.id, new.user_id, new.direction, new.amount, new.currency, v_kind,
    case when new.status in ('succeeded', 'completed') then 'completed' else 'pending' end,
    case
      when v_kind = 'topup' then 'Hisob to‘ldirildi'
      when v_kind = 'refund' then 'Marketplace qaytarimi'
      when v_kind = 'marketplace_purchase' then 'Marketplace xaridi'
      else 'Hamyon operatsiyasi'
    end,
    case when new.order_id is not null then 'marketplace_order' else 'wallet' end,
    new.order_id,
    'marketplace_payments',
    new.id,
    new.balance_after,
    new.metadata,
    new.created_at
  )
  on conflict (source_table, source_id) where source_table is not null and source_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists marketplace_payment_wallet_ledger on public.marketplace_payments;
create trigger marketplace_payment_wallet_ledger
  after insert on public.marketplace_payments
  for each row execute function public.mirror_marketplace_payment_to_wallet_ledger();

-- Backfill existing wallet-affecting payment rows.
insert into public.wallet_ledger (
  wallet_id, user_id, direction, amount, currency, kind, status,
  description, context_type, context_id, source_table, source_id,
  balance_after, metadata, created_at
)
select
  w.id,
  mp.user_id,
  mp.direction,
  mp.amount,
  mp.currency,
  case
    when mp.metadata->>'kind' = 'wallet_topup' then 'topup'
    when mp.metadata->>'kind' = 'refund' then 'refund'
    when mp.direction = 'debit' and mp.order_id is not null then 'marketplace_purchase'
    else 'wallet_adjustment'
  end,
  case when mp.status in ('succeeded', 'completed') then 'completed' else 'pending' end,
  case
    when mp.metadata->>'kind' = 'wallet_topup' then 'Hisob to‘ldirildi'
    when mp.metadata->>'kind' = 'refund' then 'Marketplace qaytarimi'
    when mp.direction = 'debit' and mp.order_id is not null then 'Marketplace xaridi'
    else 'Hamyon operatsiyasi'
  end,
  case when mp.order_id is not null then 'marketplace_order' else 'wallet' end,
  mp.order_id,
  'marketplace_payments',
  mp.id,
  mp.balance_after,
  mp.metadata,
  mp.created_at
from public.marketplace_payments mp
join public.wallets w on w.user_id = mp.user_id
where (
  mp.method = 'wallet'
  or coalesce(mp.metadata->>'kind', '') in ('wallet_topup', 'refund')
)
on conflict (source_table, source_id) where source_table is not null and source_id is not null
do nothing;

-- ---------------------------------------------------------------------
-- 5. Marketplace wallet settlement to seller on delivery
-- ---------------------------------------------------------------------
create or replace function public.settle_marketplace_wallet_order_to_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_user uuid;
  v_wallet public.wallets;
  v_balance numeric(14,2);
begin
  if new.status <> 'delivered'
     or old.status = 'delivered'
     or new.payment_method <> 'wallet'
     or new.payment_status <> 'paid' then
    return new;
  end if;

  select s.user_id into v_seller_user
  from public.sellers s
  where s.id = new.seller_id;

  if v_seller_user is null then
    raise exception 'seller_user_not_found';
  end if;

  if exists (
    select 1 from public.wallet_ledger
    where user_id = v_seller_user
      and kind = 'marketplace_settlement'
      and context_type = 'marketplace_order'
      and context_id = new.id
  ) then
    return new;
  end if;

  insert into public.wallets (user_id, balance, currency)
  values (v_seller_user, 0, coalesce(new.currency, 'USD'))
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.wallets
  where user_id = v_seller_user
  for update;

  if v_wallet.status <> 'active' then
    raise exception 'seller_wallet_restricted';
  end if;

  if v_wallet.currency <> coalesce(new.currency, v_wallet.currency) then
    if v_wallet.balance = 0 then
      update public.wallets
      set currency = coalesce(new.currency, v_wallet.currency)
      where id = v_wallet.id
      returning * into v_wallet;
    else
      raise exception 'seller_wallet_currency_mismatch';
    end if;
  end if;

  update public.wallets
  set balance = balance + new.total,
      updated_at = now(),
      last_activity_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.wallet_ledger (
    wallet_id, user_id, direction, amount, currency, kind, description,
    counterparty_user_id, context_type, context_id, balance_after,
    metadata
  ) values (
    v_wallet.id, v_seller_user, 'credit', new.total,
    coalesce(new.currency, v_wallet.currency),
    'marketplace_settlement',
    'Marketplace savdosi',
    new.buyer_id,
    'marketplace_order',
    new.id,
    v_balance,
    jsonb_build_object('seller_id', new.seller_id, 'order_number', new.order_number)
  );

  return new;
end;
$$;

drop trigger if exists orders_wallet_seller_settlement on public.orders;
create trigger orders_wallet_seller_settlement
  after update of status, payment_status on public.orders
  for each row execute function public.settle_marketplace_wallet_order_to_seller();

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260904001000_wallet_provider_topups.sql
-- SHA256 47facb3b48a4a3290695421659b93a15319408ce33e028f5cb4a7b9db7122c86
-- ============================================================================
-- =====================================================================
-- Real provider top-ups for Alsamos Wallet (Payme first-party rail)
-- ---------------------------------------------------------------------
-- Internal wallet/P2P already moves value atomically. This migration adds a
-- provider-backed inbound money rail with one-time payment intents and an
-- idempotent Payme Merchant API state machine.
--
-- IMPORTANT: live money starts only after PAYME merchant credentials are
-- configured in Supabase Edge Function secrets and the merchant endpoint is
-- registered/tested in Payme Business.
-- =====================================================================

-- Uzbek acquiring rails settle in UZS. Do not silently convert non-zero legacy
-- wallets; only zero-balance wallets can safely switch from the old USD default.
alter table public.wallets alter column currency set default 'UZS';

update public.wallets
set currency = 'UZS',
    updated_at = now()
where currency = 'USD'
  and balance = 0;

-- ---------------------------------------------------------------------
-- 1. Provider payment intents
-- ---------------------------------------------------------------------
create table if not exists public.wallet_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  provider text not null check (provider in ('payme', 'click')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'UZS',
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'cancelled', 'failed', 'expired')),
  return_url text,
  provider_transaction_id text,
  provider_time bigint,
  provider_create_time bigint,
  provider_perform_time bigint,
  provider_cancel_time bigint,
  provider_state integer,
  provider_reason integer,
  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_payment_intents_user_idx
  on public.wallet_payment_intents (user_id, created_at desc);

create unique index if not exists wallet_payment_intents_provider_tx_uidx
  on public.wallet_payment_intents (provider, provider_transaction_id)
  where provider_transaction_id is not null;

alter table public.wallet_payment_intents enable row level security;

drop policy if exists wallet_payment_intents_select_own on public.wallet_payment_intents;
create policy wallet_payment_intents_select_own
  on public.wallet_payment_intents
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.wallet_payment_intents from authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. Create a one-time top-up intent from the authenticated app
-- ---------------------------------------------------------------------
create or replace function public.create_wallet_payment_intent(
  _provider text,
  _amount numeric,
  _return_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallets;
  v_intent public.wallet_payment_intents;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _provider not in ('payme', 'click') then
    raise exception 'unsupported_provider';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if _amount > 1000000000 then
    raise exception 'amount_too_large';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_user
  for update;

  if v_wallet.id is null then
    raise exception 'wallet_not_found';
  end if;

  if v_wallet.status <> 'active' then
    raise exception 'wallet_restricted';
  end if;

  if v_wallet.currency <> 'UZS' then
    raise exception 'provider_requires_uzs_wallet';
  end if;

  insert into public.wallet_payment_intents (
    user_id, wallet_id, provider, amount, currency, return_url
  ) values (
    v_user, v_wallet.id, _provider, round(_amount, 2), v_wallet.currency,
    nullif(btrim(coalesce(_return_url, '')), '')
  )
  returning * into v_intent;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'amount', v_intent.amount,
    'currency', v_intent.currency,
    'status', v_intent.status,
    'expires_at', v_intent.expires_at
  );
end;
$$;

revoke all on function public.create_wallet_payment_intent(text, numeric, text) from public;
grant execute on function public.create_wallet_payment_intent(text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Payme state machine
-- ---------------------------------------------------------------------
-- Payme amounts are supplied in tiyin. 100 tiyin = 1 UZS.
create or replace function public.payme_wallet_check_intent(
  _intent_id uuid,
  _amount_tiyin bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.wallet_payment_intents;
  v_expected bigint;
begin
  select * into v_intent
  from public.wallet_payment_intents
  where id = _intent_id
    and provider = 'payme'
  for update;

  if v_intent.id is null then
    raise exception 'intent_not_found';
  end if;

  if v_intent.expires_at <= now() and v_intent.status in ('created', 'pending') then
    update public.wallet_payment_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id;
    raise exception 'intent_expired';
  end if;

  if v_intent.status not in ('created', 'pending') then
    raise exception 'intent_not_payable';
  end if;

  v_expected := round(v_intent.amount * 100)::bigint;
  if _amount_tiyin <> v_expected then
    raise exception 'invalid_amount';
  end if;

  return jsonb_build_object(
    'allow', true,
    'intent_id', v_intent.id,
    'amount_tiyin', v_expected
  );
end;
$$;

create or replace function public.payme_wallet_create_transaction(
  _intent_id uuid,
  _payme_id text,
  _payme_time bigint,
  _amount_tiyin bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.wallet_payment_intents;
  v_existing public.wallet_payment_intents;
  v_expected bigint;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if nullif(btrim(coalesce(_payme_id, '')), '') is null then
    raise exception 'invalid_provider_transaction';
  end if;

  -- Retry with the same Payme transaction must return exactly the same state.
  select * into v_existing
  from public.wallet_payment_intents
  where provider = 'payme'
    and provider_transaction_id = _payme_id
  for update;

  if v_existing.id is not null then
    if v_existing.id <> _intent_id then
      raise exception 'provider_transaction_conflict';
    end if;

    return jsonb_build_object(
      'create_time', coalesce(v_existing.provider_create_time, v_now_ms),
      'transaction', v_existing.id::text,
      'state', coalesce(v_existing.provider_state, 1)
    );
  end if;

  select * into v_intent
  from public.wallet_payment_intents
  where id = _intent_id
    and provider = 'payme'
  for update;

  if v_intent.id is null then
    raise exception 'intent_not_found';
  end if;

  if v_intent.expires_at <= now() and v_intent.status in ('created', 'pending') then
    update public.wallet_payment_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id;
    raise exception 'intent_expired';
  end if;

  v_expected := round(v_intent.amount * 100)::bigint;
  if _amount_tiyin <> v_expected then
    raise exception 'invalid_amount';
  end if;

  if v_intent.status <> 'created'
     or v_intent.provider_transaction_id is not null then
    raise exception 'operation_not_allowed';
  end if;

  update public.wallet_payment_intents
  set status = 'pending',
      provider_transaction_id = _payme_id,
      provider_time = _payme_time,
      provider_create_time = v_now_ms,
      provider_state = 1,
      updated_at = now()
  where id = v_intent.id
  returning * into v_intent;

  return jsonb_build_object(
    'create_time', v_intent.provider_create_time,
    'transaction', v_intent.id::text,
    'state', 1
  );
end;
$$;

create or replace function public.payme_wallet_perform_transaction(
  _payme_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.wallet_payment_intents;
  v_wallet public.wallets;
  v_balance numeric(14,2);
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  select * into v_intent
  from public.wallet_payment_intents
  where provider = 'payme'
    and provider_transaction_id = _payme_id
  for update;

  if v_intent.id is null then
    raise exception 'transaction_not_found';
  end if;

  -- Idempotent Payme retry.
  if v_intent.provider_state = 2 and v_intent.status = 'paid' then
    return jsonb_build_object(
      'transaction', v_intent.id::text,
      'perform_time', v_intent.provider_perform_time,
      'state', 2
    );
  end if;

  if v_intent.provider_state <> 1 or v_intent.status <> 'pending' then
    raise exception 'operation_not_allowed';
  end if;

  select * into v_wallet
  from public.wallets
  where id = v_intent.wallet_id
  for update;

  if v_wallet.id is null then
    raise exception 'wallet_not_found';
  end if;

  if v_wallet.status <> 'active' then
    raise exception 'wallet_restricted';
  end if;

  if v_wallet.currency <> v_intent.currency then
    raise exception 'currency_mismatch';
  end if;

  update public.wallets
  set balance = balance + v_intent.amount,
      updated_at = now(),
      last_activity_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  update public.wallet_payment_intents
  set status = 'paid',
      provider_state = 2,
      provider_perform_time = v_now_ms,
      paid_at = now(),
      updated_at = now()
  where id = v_intent.id
  returning * into v_intent;

  insert into public.wallet_ledger (
    wallet_id, user_id, direction, amount, currency, kind, status,
    description, context_type, context_id, source_table, source_id,
    balance_after, metadata
  ) values (
    v_wallet.id, v_intent.user_id, 'credit', v_intent.amount, v_intent.currency,
    'provider_topup', 'completed', 'Payme orqali hisob to‘ldirildi',
    'wallet_topup', v_intent.id, 'wallet_payment_intents', v_intent.id,
    v_balance,
    jsonb_build_object(
      'provider', 'payme',
      'provider_transaction_id', v_intent.provider_transaction_id
    )
  )
  on conflict (source_table, source_id) where source_table is not null and source_id is not null
  do nothing;

  return jsonb_build_object(
    'transaction', v_intent.id::text,
    'perform_time', v_intent.provider_perform_time,
    'state', 2
  );
end;
$$;

create or replace function public.payme_wallet_cancel_transaction(
  _payme_id text,
  _reason integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.wallet_payment_intents;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  select * into v_intent
  from public.wallet_payment_intents
  where provider = 'payme'
    and provider_transaction_id = _payme_id
  for update;

  if v_intent.id is null then
    raise exception 'transaction_not_found';
  end if;

  -- Once wallet value has been credited, the top-up service has been provided.
  -- Do not create an unsafe clawback/negative balance through an automatic
  -- cancellation. Refunds after settlement require a controlled refund flow.
  if v_intent.provider_state = 2 or v_intent.status = 'paid' then
    raise exception 'service_already_delivered';
  end if;

  if v_intent.provider_state = -1 and v_intent.status = 'cancelled' then
    return jsonb_build_object(
      'transaction', v_intent.id::text,
      'cancel_time', v_intent.provider_cancel_time,
      'state', -1
    );
  end if;

  if v_intent.provider_state <> 1 or v_intent.status <> 'pending' then
    raise exception 'operation_not_allowed';
  end if;

  update public.wallet_payment_intents
  set status = 'cancelled',
      provider_state = -1,
      provider_reason = _reason,
      provider_cancel_time = v_now_ms,
      updated_at = now()
  where id = v_intent.id
  returning * into v_intent;

  return jsonb_build_object(
    'transaction', v_intent.id::text,
    'cancel_time', v_intent.provider_cancel_time,
    'state', -1
  );
end;
$$;

create or replace function public.payme_wallet_check_transaction(
  _payme_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.wallet_payment_intents;
begin
  select * into v_intent
  from public.wallet_payment_intents
  where provider = 'payme'
    and provider_transaction_id = _payme_id;

  if v_intent.id is null then
    raise exception 'transaction_not_found';
  end if;

  return jsonb_build_object(
    'create_time', coalesce(v_intent.provider_create_time, 0),
    'perform_time', coalesce(v_intent.provider_perform_time, 0),
    'cancel_time', coalesce(v_intent.provider_cancel_time, 0),
    'transaction', v_intent.id::text,
    'state', coalesce(v_intent.provider_state, 0),
    'reason', v_intent.provider_reason
  );
end;
$$;

revoke all on function public.payme_wallet_check_intent(uuid, bigint) from public, anon, authenticated;
revoke all on function public.payme_wallet_create_transaction(uuid, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.payme_wallet_perform_transaction(text) from public, anon, authenticated;
revoke all on function public.payme_wallet_cancel_transaction(text, integer) from public, anon, authenticated;
revoke all on function public.payme_wallet_check_transaction(text) from public, anon, authenticated;

grant execute on function public.payme_wallet_check_intent(uuid, bigint) to service_role;
grant execute on function public.payme_wallet_create_transaction(uuid, text, bigint, bigint) to service_role;
grant execute on function public.payme_wallet_perform_transaction(text) to service_role;
grant execute on function public.payme_wallet_cancel_transaction(text, integer) to service_role;
grant execute on function public.payme_wallet_check_transaction(text) to service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260904021000_ai_projects.sql
-- SHA256 ae3949e6787dc8f196b065deb22667b04135011be96314f67663cdfd5f2e6c52
-- ============================================================================
-- Persistent Alsamos AI projects: a real project is no longer just a pinned chat.
-- Projects own instructions and group multiple conversations so the agent can
-- carry project context across chats.

create table if not exists public.ai_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_projects_user_updated_idx
  on public.ai_projects (user_id, updated_at desc);

alter table public.ai_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can read own AI projects'
  ) then
    create policy "Users can read own AI projects"
      on public.ai_projects for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can create own AI projects'
  ) then
    create policy "Users can create own AI projects"
      on public.ai_projects for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can update own AI projects'
  ) then
    create policy "Users can update own AI projects"
      on public.ai_projects for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects' and policyname = 'Users can delete own AI projects'
  ) then
    create policy "Users can delete own AI projects"
      on public.ai_projects for delete
      using (auth.uid() = user_id);
  end if;
end $$;

alter table if exists public.ai_conversations
  add column if not exists project_id uuid references public.ai_projects(id) on delete set null;

create index if not exists ai_conversations_project_idx
  on public.ai_conversations (project_id, updated_at desc);


-- ============================================================================
-- SOURCE B-web: 20260904023000_ai_memory_and_media_jobs.sql
-- SHA256 d46750db0f380a53abd7d0a00b5cf1fade0e39147c6331cb5c8a753acd6d1dc7
-- ============================================================================
-- Durable Alsamos AI memory + asynchronous media jobs.
-- This migration is deliberately additive so it is safe on projects where an
-- earlier experimental ai_memories table already exists.

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text,
  kind text not null default 'fact',
  "key" text,
  "value" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_memories add column if not exists content text;
alter table public.ai_memories add column if not exists kind text not null default 'fact';
alter table public.ai_memories add column if not exists "key" text;
alter table public.ai_memories add column if not exists "value" text;
alter table public.ai_memories add column if not exists created_at timestamptz not null default now();
alter table public.ai_memories add column if not exists updated_at timestamptz not null default now();

-- Keep both the older agent key/value contract and the newer UI content/kind
-- contract alive during the rollout. Either side can write; the other side can
-- immediately read the same memory.
create or replace function public.sync_ai_memory_shapes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.content is null or btrim(new.content) = '') and new."value" is not null then
    new.content := concat_ws(': ', nullif(btrim(coalesce(new."key", '')), ''), btrim(new."value"));
  end if;

  if (new."value" is null or btrim(new."value") = '') and new.content is not null then
    new."value" := new.content;
  end if;

  if (new."key" is null or btrim(new."key") = '') and new.content is not null then
    new."key" := left(coalesce(nullif(new.kind, ''), 'memory') || '-' || md5(lower(btrim(new.content))), 80);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_ai_memory_shapes_trigger on public.ai_memories;
create trigger sync_ai_memory_shapes_trigger
before insert or update on public.ai_memories
for each row execute function public.sync_ai_memory_shapes();

update public.ai_memories
set
  content = coalesce(nullif(content, ''), concat_ws(': ', nullif("key", ''), nullif("value", ''))),
  "value" = coalesce(nullif("value", ''), content),
  "key" = coalesce(
    nullif("key", ''),
    left(coalesce(nullif(kind, ''), 'memory') || '-' || md5(lower(btrim(coalesce(content, "value", 'memory')))), 80)
  );

create index if not exists ai_memories_user_created_idx
  on public.ai_memories (user_id, created_at desc);
create unique index if not exists ai_memories_user_key_idx
  on public.ai_memories (user_id, "key")
  where "key" is not null;

alter table public.ai_memories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can read own AI memories'
  ) then
    create policy "Users can read own AI memories"
      on public.ai_memories for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can create own AI memories'
  ) then
    create policy "Users can create own AI memories"
      on public.ai_memories for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can update own AI memories'
  ) then
    create policy "Users can update own AI memories"
      on public.ai_memories for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_memories' and policyname = 'Users can delete own AI memories'
  ) then
    create policy "Users can delete own AI memories"
      on public.ai_memories for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'video',
  status text not null default 'queued',
  prompt text,
  params jsonb not null default '{}'::jsonb,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_media_jobs_kind_check check (kind in ('image', 'video')),
  constraint ai_media_jobs_status_check check (status in ('queued', 'running', 'done', 'failed'))
);

create index if not exists ai_media_jobs_user_created_idx
  on public.ai_media_jobs (user_id, created_at desc);
create index if not exists ai_media_jobs_running_idx
  on public.ai_media_jobs (status, created_at)
  where status in ('queued', 'running');

alter table public.ai_media_jobs enable row level security;

do $$
begin
  -- The edge function writes with the service role. The browser only needs to
  -- read the authenticated user's own job while an async render finishes.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs' and policyname = 'Users can read own AI media jobs'
  ) then
    create policy "Users can read own AI media jobs"
      on public.ai_media_jobs for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs' and policyname = 'Users can delete own AI media jobs'
  ) then
    create policy "Users can delete own AI media jobs"
      on public.ai_media_jobs for delete
      using (auth.uid() = user_id);
  end if;
end $$;


-- ============================================================================
-- SOURCE B-web: 20260904064500_ensure_wallet_accounts.sql
-- SHA256 5fae1c66f1ad57de2b3ee732d3df0db28293d9d65be521806147a35895d37ef8
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260904170000_restore_legacy_post_visibility.sql
-- SHA256 cd042871a2c1d0dbc7ae185d23715b72d6c742a77ff7a570652e86083cfc4d82
-- ============================================================================
-- =============================================================================
-- Restore post visibility compatibility across Home/Profile/Notifications/etc.
--
-- `posts.visibility` has historically been nullable. The original table default
-- was `public`, but older clients / partial writes could still persist NULL.
-- The canonical `can_view_post()` policy introduced later compared visibility
-- with `= 'public'`, so those legacy rows became invisible to everyone except
-- their owner. Any page enriching notifications through `posts` then treated
-- the RLS-hidden row as deleted and could hide/remove the notification too.
--
-- Normalize the legacy public state once, make future rows non-null, and keep
-- one canonical visibility helper for every post-backed surface.
-- =============================================================================

begin;

-- NULL/blank was never a distinct privacy choice in Alsamos. Historically the
-- omitted/default visibility was public, so restoring it does not turn an
-- explicit private/friends post public.
update public.posts
set visibility = 'public'
where visibility is null
   or btrim(visibility) = '';

-- Normalize harmless casing/whitespace drift without changing semantics.
update public.posts
set visibility = lower(btrim(visibility))
where visibility is not null
  and visibility in (' Public ', ' PUBLIC ', ' Friends ', ' FRIENDS ', ' Private ', ' PRIVATE ');

alter table public.posts
  alter column visibility set default 'public',
  alter column visibility set not null;

-- Keep the canonical helper backward-compatible and make every dependent RLS
-- policy (post_media, polls, locations, stories, hashtags, etc.) see the same
-- post set. Owner and accepted collaborator access remain unchanged.
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        coalesce(nullif(btrim(p.visibility), ''), 'public') = 'public'
        or p.user_id = auth.uid()
        or (
          coalesce(nullif(btrim(p.visibility), ''), 'public') = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
          and exists (
            select 1
            from public.follows f
            where f.follower_id = p.user_id
              and f.following_id = auth.uid()
          )
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

-- Reassert the canonical posts SELECT policy. RLS policies on related tables
-- already call can_view_post(), so replacing the function repairs them too.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));

-- Indexes used by public feed/search retrieval after the data repair.
create index if not exists posts_visibility_created_at_idx
  on public.posts (visibility, created_at desc);

commit;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260904175500_ai_workspace_runtime_repair.sql
-- SHA256 6e4a46e2eb70d804ee3c2083be67fa59a9eb3b500bdd3ba6470bf80ea5376a77
-- ============================================================================
-- Alsamos AI runtime drift repair.
--
-- The first AI project/media migrations may be recorded as applied while an
-- older production database is still missing one of the runtime objects. This
-- migration is deliberately idempotent and reasserts only the schema the live
-- AI workspace needs for Projects and real video generation.

create table if not exists public.ai_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_projects_user_updated_idx
  on public.ai_projects (user_id, updated_at desc);

alter table public.ai_projects enable row level security;

create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'video',
  status text not null default 'queued',
  prompt text,
  params jsonb not null default '{}'::jsonb,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an experimental table existed, make sure every column required by
-- _shared/aiTools.ts / geminiMedia.ts exists.
alter table public.ai_media_jobs add column if not exists kind text not null default 'video';
alter table public.ai_media_jobs add column if not exists status text not null default 'queued';
alter table public.ai_media_jobs add column if not exists prompt text;
alter table public.ai_media_jobs add column if not exists params jsonb not null default '{}'::jsonb;
alter table public.ai_media_jobs add column if not exists output_url text;
alter table public.ai_media_jobs add column if not exists error text;
alter table public.ai_media_jobs add column if not exists created_at timestamptz not null default now();
alter table public.ai_media_jobs add column if not exists updated_at timestamptz not null default now();

create index if not exists ai_media_jobs_user_created_idx
  on public.ai_media_jobs (user_id, created_at desc);
create index if not exists ai_media_jobs_running_idx
  on public.ai_media_jobs (status, created_at)
  where status in ('queued', 'running');

alter table public.ai_media_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can read own AI projects'
  ) then
    create policy "Users can read own AI projects"
      on public.ai_projects for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can create own AI projects'
  ) then
    create policy "Users can create own AI projects"
      on public.ai_projects for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can update own AI projects'
  ) then
    create policy "Users can update own AI projects"
      on public.ai_projects for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_projects'
      and policyname = 'Users can delete own AI projects'
  ) then
    create policy "Users can delete own AI projects"
      on public.ai_projects for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs'
      and policyname = 'Users can read own AI media jobs'
  ) then
    create policy "Users can read own AI media jobs"
      on public.ai_media_jobs for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_media_jobs'
      and policyname = 'Users can delete own AI media jobs'
  ) then
    create policy "Users can delete own AI media jobs"
      on public.ai_media_jobs for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.ai_conversations') is not null then
    alter table public.ai_conversations
      add column if not exists project_id uuid references public.ai_projects(id) on delete set null;
    create index if not exists ai_conversations_project_idx
      on public.ai_conversations (project_id, updated_at desc);
  end if;
end $$;


-- ============================================================================
-- SOURCE B-web: 20260905093000_repair_legacy_post_media.sql
-- SHA256 40cea3318102af0008262d42517330645e1ab6f263702e73252ef6d9cf96291f
-- ============================================================================
-- =============================================================================
-- Repair legacy post media after the structured-media migration wave.
--
-- Historical context:
--   * legacy posts stored only posts.media_urls + posts.media_type;
--   * post_media backfills copied those URLs verbatim;
--   * some old rows therefore have no stable bucket/key and some were assigned
--     the wrong media kind;
--   * foreign/old Supabase project URLs must NOT be rewritten to the current
--     project unless the DB already has a canonical bucket/key.
--
-- This migration is intentionally non-destructive: external legacy URLs are
-- preserved, while stable references and strong file-type evidence are repaired.
-- =============================================================================

alter table public.post_media
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_key text;

-- ---------------------------------------------------------------------------
-- 1. Repair media kind from strong MIME/extension evidence.
--    This fixes legacy videos that were backfilled as image when media_type was
--    incomplete, without guessing when the object is opaque.
-- ---------------------------------------------------------------------------
with inferred as (
  select
    pm.id,
    case
      when lower(coalesce(pm.mime_type, '')) like 'video/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
        then 'video'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) like 'audio/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
        then 'audio'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) like 'image/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
        then 'image'::public.media_kind
      when lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
        then 'archive'::public.media_kind
      when lower(coalesce(pm.mime_type, '')) = 'application/pdf'
        or lower(coalesce(pm.mime_type, '')) like 'text/%'
        or lower(split_part(split_part(coalesce(pm.file_name, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        or lower(split_part(split_part(coalesce(pm.storage_key, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        or lower(split_part(split_part(coalesce(pm.storage_url, ''), '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
        then 'document'::public.media_kind
      else null
    end as kind
  from public.post_media pm
)
update public.post_media pm
set kind = inferred.kind
from inferred
where inferred.id = pm.id
  and inferred.kind is not null
  and pm.kind is distinct from inferred.kind;

-- ---------------------------------------------------------------------------
-- 2. Canonicalize storage:// references. These always identify a bucket/key
--    intentionally, so resolving them through the current project is safe.
-- ---------------------------------------------------------------------------
with refs as (
  select
    id,
    split_part(substring(storage_url from 11), '/', 1) as bucket,
    substring(
      substring(storage_url from 11)
      from length(split_part(substring(storage_url from 11), '/', 1)) + 2
    ) as object_key
  from public.post_media
  where storage_url like 'storage://%'
    and (storage_bucket is null or storage_key is null)
)
update public.post_media pm
set
  storage_bucket = coalesce(pm.storage_bucket, nullif(refs.bucket, '')),
  storage_key = coalesce(pm.storage_key, nullif(refs.object_key, ''))
from refs
where refs.id = pm.id
  and nullif(refs.bucket, '') is not null
  and nullif(refs.object_key, '') is not null;

with refs as (
  select
    id,
    split_part(substring(thumbnail_url from 11), '/', 1) as bucket,
    substring(
      substring(thumbnail_url from 11)
      from length(split_part(substring(thumbnail_url from 11), '/', 1)) + 2
    ) as object_key
  from public.post_media
  where thumbnail_url like 'storage://%'
    and (thumbnail_bucket is null or thumbnail_key is null)
)
update public.post_media pm
set
  thumbnail_bucket = coalesce(pm.thumbnail_bucket, nullif(refs.bucket, '')),
  thumbnail_key = coalesce(pm.thumbnail_key, nullif(refs.object_key, ''))
from refs
where refs.id = pm.id
  and nullif(refs.bucket, '') is not null
  and nullif(refs.object_key, '') is not null;

-- ---------------------------------------------------------------------------
-- 3. Recover bucket/key from absolute URLs ONLY for the production Supabase
--    project that this repository deploys to. We intentionally leave other
--    Supabase hosts untouched because those objects may still live there.
-- ---------------------------------------------------------------------------
with raw_refs as (
  select
    id,
    case
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/%'
        then split_part(storage_url, '/storage/v1/object/public/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/sign/%'
        then split_part(storage_url, '/storage/v1/object/sign/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/authenticated/%'
        then split_part(storage_url, '/storage/v1/object/authenticated/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/public/%'
        then split_part(storage_url, '/storage/v1/render/image/public/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/sign/%'
        then split_part(storage_url, '/storage/v1/render/image/sign/', 2)
      when storage_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/authenticated/%'
        then split_part(storage_url, '/storage/v1/render/image/authenticated/', 2)
      else null
    end as raw_ref
  from public.post_media
  where (storage_bucket is null or storage_key is null)
), cleaned as (
  select id, split_part(split_part(raw_ref, '?', 1), '#', 1) as ref
  from raw_refs
  where raw_ref is not null
), parsed as (
  select
    id,
    split_part(ref, '/', 1) as bucket,
    substring(ref from length(split_part(ref, '/', 1)) + 2) as object_key
  from cleaned
)
update public.post_media pm
set
  storage_bucket = coalesce(pm.storage_bucket, nullif(parsed.bucket, '')),
  storage_key = coalesce(pm.storage_key, nullif(parsed.object_key, ''))
from parsed
where parsed.id = pm.id
  and nullif(parsed.bucket, '') is not null
  and nullif(parsed.object_key, '') is not null;

with raw_refs as (
  select
    id,
    case
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/%'
        then split_part(thumbnail_url, '/storage/v1/object/public/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/sign/%'
        then split_part(thumbnail_url, '/storage/v1/object/sign/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/authenticated/%'
        then split_part(thumbnail_url, '/storage/v1/object/authenticated/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/public/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/public/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/sign/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/sign/', 2)
      when thumbnail_url like 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/render/image/authenticated/%'
        then split_part(thumbnail_url, '/storage/v1/render/image/authenticated/', 2)
      else null
    end as raw_ref
  from public.post_media
  where thumbnail_url is not null
    and (thumbnail_bucket is null or thumbnail_key is null)
), cleaned as (
  select id, split_part(split_part(raw_ref, '?', 1), '#', 1) as ref
  from raw_refs
  where raw_ref is not null
), parsed as (
  select
    id,
    split_part(ref, '/', 1) as bucket,
    substring(ref from length(split_part(ref, '/', 1)) + 2) as object_key
  from cleaned
)
update public.post_media pm
set
  thumbnail_bucket = coalesce(pm.thumbnail_bucket, nullif(parsed.bucket, '')),
  thumbnail_key = coalesce(pm.thumbnail_key, nullif(parsed.object_key, ''))
from parsed
where parsed.id = pm.id
  and nullif(parsed.bucket, '') is not null
  and nullif(parsed.object_key, '') is not null;

-- ---------------------------------------------------------------------------
-- 4. Fill genuinely missing structured rows from legacy posts.media_urls.
--    Extension evidence wins; posts.media_type is only a fallback for opaque
--    legacy URLs. Existing rows are never overwritten here.
-- ---------------------------------------------------------------------------
insert into public.post_media (
  post_id,
  position,
  kind,
  storage_url,
  thumbnail_url,
  created_at
)
select
  p.id,
  (media_item.ordinality - 1)::integer,
  case
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)$'
      then 'video'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|amr)$'
      then 'audio'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|heic|heif|tif|tiff)$'
      then 'image'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(zip|rar|7z|tar|gz|bz2|xz)$'
      then 'archive'::public.media_kind
    when lower(split_part(split_part(media_item.value, '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|rtf|odt|txt|md|csv|xls|xlsx|ods|ppt|pptx|odp|epub|json|xml)$'
      then 'document'::public.media_kind
    when lower(coalesce(p.media_type, '')) in ('video', 'reel', 'short')
      then 'video'::public.media_kind
    when lower(coalesce(p.media_type, '')) = 'audio'
      then 'audio'::public.media_kind
    else 'image'::public.media_kind
  end,
  media_item.value,
  case when media_item.ordinality = 1 then p.thumbnail_url else null end,
  coalesce(p.created_at, now())
from public.posts p
cross join lateral unnest(coalesce(p.media_urls, array[]::text[]))
  with ordinality as media_item(value, ordinality)
where nullif(media_item.value, '') is not null
  and not exists (
    select 1
    from public.post_media pm
    where pm.post_id = p.id
      and pm.position = (media_item.ordinality - 1)::integer
  );

-- Empty structured URL is unusable, but a legacy URL at the same position can
-- restore it safely without changing any non-empty structured URL.
update public.post_media pm
set storage_url = p.media_urls[pm.position + 1]
from public.posts p
where p.id = pm.post_id
  and nullif(pm.storage_url, '') is null
  and array_length(p.media_urls, 1) >= pm.position + 1
  and nullif(p.media_urls[pm.position + 1], '') is not null;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260905103000_ads_delivery_v2.sql
-- SHA256 5ec6669acdff2883742760d8d175abb8092b1f72f639a0dc2b6e4b7064274740
-- ============================================================================
-- Ads Delivery V2
--
-- Goal: move Alsamos ads away from a blind "every N posts" model toward a
-- platform-grade delivery system with server-side candidate eligibility,
-- frequency caps, user feedback, deduplicated delivery events and configurable
-- placement policy.
--
-- This migration is additive. Existing public.ads / ad_impressions / ad_clicks /
-- ad_reach remain the compatibility source used by the current UI.

CREATE TABLE IF NOT EXISTS public.ad_delivery_config (
  placement text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  min_session_seconds integer NOT NULL DEFAULT 0 CHECK (min_session_seconds >= 0),
  min_organic_before_first integer NOT NULL DEFAULT 0 CHECK (min_organic_before_first >= 0),
  min_organic_gap integer NOT NULL DEFAULT 0 CHECK (min_organic_gap >= 0),
  min_time_gap_seconds integer NOT NULL DEFAULT 0 CHECK (min_time_gap_seconds >= 0),
  session_cap integer NOT NULL DEFAULT 1 CHECK (session_cap >= 0),
  daily_cap integer NOT NULL DEFAULT 3 CHECK (daily_cap >= 0),
  same_ad_daily_cap integer NOT NULL DEFAULT 1 CHECK (same_ad_daily_cap >= 0),
  same_ad_gap_seconds integer NOT NULL DEFAULT 1800 CHECK (same_ad_gap_seconds >= 0),
  hide_cooldown_seconds integer NOT NULL DEFAULT 1800 CHECK (hide_cooldown_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ad_delivery_config (
  placement,
  enabled,
  min_session_seconds,
  min_organic_before_first,
  min_organic_gap,
  min_time_gap_seconds,
  session_cap,
  daily_cap,
  same_ad_daily_cap,
  same_ad_gap_seconds,
  hide_cooldown_seconds
) VALUES
  ('feed',     true, 45, 10, 12, 180, 2, 5, 2, 2700, 1200),
  ('discover', true, 90,  0,  0, 300, 1, 2, 1, 7200, 1800),
  ('video',    true, 120, 12, 20, 480, 2, 3, 1, 86400, 1800),
  ('story',    true, 120,  8, 12, 300, 2, 3, 1, 7200, 1800),
  ('channel',  true, 180,  0,  0, 600, 1, 2, 1, 14400, 3600)
ON CONFLICT (placement) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  min_session_seconds = EXCLUDED.min_session_seconds,
  min_organic_before_first = EXCLUDED.min_organic_before_first,
  min_organic_gap = EXCLUDED.min_organic_gap,
  min_time_gap_seconds = EXCLUDED.min_time_gap_seconds,
  session_cap = EXCLUDED.session_cap,
  daily_cap = EXCLUDED.daily_cap,
  same_ad_daily_cap = EXCLUDED.same_ad_daily_cap,
  same_ad_gap_seconds = EXCLUDED.same_ad_gap_seconds,
  hide_cooldown_seconds = EXCLUDED.hide_cooldown_seconds,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.ad_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  placement text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'dismiss', 'feedback')),
  session_id text,
  slot_key text,
  device_type text,
  score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_delivery_events_user_time_idx
  ON public.ad_delivery_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_ad_time_idx
  ON public.ad_delivery_events(ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_placement_time_idx
  ON public.ad_delivery_events(placement, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_delivery_events_session_idx
  ON public.ad_delivery_events(session_id, placement, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ad_user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  feedback_type text NOT NULL CHECK (
    feedback_type IN ('hide', 'not_relevant', 'seen_too_often', 'report')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_user_feedback_user_ad_idx
  ON public.ad_user_feedback(user_id, ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_user_feedback_user_time_idx
  ON public.ad_user_feedback(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ad_frequency_counters (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  placement text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  dismissals integer NOT NULL DEFAULT 0 CHECK (dismissals >= 0),
  first_impression_at timestamptz,
  last_impression_at timestamptz,
  last_click_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ad_id, placement, day)
);

CREATE INDEX IF NOT EXISTS ad_frequency_counters_user_day_idx
  ON public.ad_frequency_counters(user_id, day, placement);

ALTER TABLE public.ad_delivery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_frequency_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ad delivery config" ON public.ad_delivery_config;
CREATE POLICY "Authenticated users can read ad delivery config"
  ON public.ad_delivery_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can read their ad feedback" ON public.ad_user_feedback;
CREATE POLICY "Users can read their ad feedback"
  ON public.ad_user_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add their ad feedback" ON public.ad_user_feedback;
CREATE POLICY "Users can add their ad feedback"
  ON public.ad_user_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.ad_delivery_config TO authenticated;
GRANT SELECT, INSERT ON public.ad_user_feedback TO authenticated;

-- Returns a ranked candidate pool. Timing/organic-content gates stay in the
-- client policy for now so an ad fetch at page load does not permanently lose
-- later opportunities. Server-side daily/session/same-ad fatigue still applies.
CREATE OR REPLACE FUNCTION public.get_eligible_ads_v2(
  p_placement text,
  p_limit integer DEFAULT 6,
  p_session_id text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.ads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT *
    FROM public.ad_delivery_config
    WHERE placement = p_placement
      AND enabled = true
    LIMIT 1
  ),
  context AS (
    SELECT
      NULLIF(lower(trim(p_context->>'country')), '') AS country,
      NULLIF(lower(trim(p_context->>'gender')), '') AS gender,
      CASE
        WHEN COALESCE(p_context->>'age', '') ~ '^[0-9]{1,3}$'
          THEN (p_context->>'age')::integer
        ELSE NULL
      END AS age,
      CASE
        WHEN jsonb_typeof(p_context->'interests') = 'array'
          THEN ARRAY(SELECT lower(value) FROM jsonb_array_elements_text(p_context->'interests'))
        ELSE ARRAY[]::text[]
      END AS interests
  ),
  candidates AS (
    SELECT
      a.id,
      a.created_at,
      (
        (GREATEST(COALESCE(a.bid_amount, 0), 0.01) + 0.01)
        * (1 + LEAST(
            0.50,
            COALESCE(a.clicks_count, 0)::numeric
              / GREATEST(COALESCE(a.impressions_count, 0), 20)::numeric
              * 5
          ))
        / (1 + COALESCE(fc.impressions, 0) * 0.75)
      ) AS delivery_score
    FROM public.ads a
    CROSS JOIN context c
    LEFT JOIN public.ad_frequency_counters fc
      ON fc.user_id = auth.uid()
     AND fc.ad_id = a.id
     AND fc.placement = p_placement
     AND fc.day = CURRENT_DATE
    CROSS JOIN cfg
    WHERE a.status = 'active'
      AND a.user_id IS DISTINCT FROM auth.uid()
      AND (a.start_date IS NULL OR a.start_date <= now())
      AND (a.end_date IS NULL OR a.end_date >= now())
      AND COALESCE(a.spent, 0) < COALESCE(NULLIF(a.budget, 0), 1e18)
      AND (
        (p_placement = 'story' AND a.ad_type IN ('story', 'both'))
        OR
        (p_placement <> 'story' AND a.ad_type IN ('feed', 'both'))
      )
      AND (
        COALESCE(cardinality(a.target_countries), 0) = 0
        OR c.country IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(a.target_countries) country_value
          WHERE lower(country_value) = c.country
        )
      )
      AND (a.target_gender IS NULL OR c.gender IS NULL OR lower(a.target_gender) = c.gender)
      AND (a.target_age_min IS NULL OR c.age IS NULL OR c.age >= a.target_age_min)
      AND (a.target_age_max IS NULL OR c.age IS NULL OR c.age <= a.target_age_max)
      AND (
        COALESCE(cardinality(a.target_interests), 0) = 0
        OR cardinality(c.interests) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(a.target_interests) interest_value
          WHERE lower(interest_value) = ANY(c.interests)
        )
      )
      AND COALESCE(fc.impressions, 0) < cfg.same_ad_daily_cap
      AND (
        fc.last_impression_at IS NULL
        OR fc.last_impression_at < now() - make_interval(secs => cfg.same_ad_gap_seconds)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.ad_user_feedback f
        WHERE f.user_id = auth.uid()
          AND f.ad_id = a.id
          AND (
            (f.feedback_type IN ('hide', 'not_relevant') AND f.created_at > now() - interval '30 days')
            OR (f.feedback_type = 'seen_too_often' AND f.created_at > now() - interval '7 days')
            OR (f.feedback_type = 'report')
          )
      )
      AND (
        auth.uid() IS NULL
        OR (
          SELECT count(*)
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.created_at >= CURRENT_DATE
        ) < cfg.daily_cap
      )
      AND (
        auth.uid() IS NULL
        OR p_session_id IS NULL
        OR (
          SELECT count(*)
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.session_id = p_session_id
        ) < cfg.session_cap
      )
      AND (
        auth.uid() IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.ad_delivery_events e
          WHERE e.user_id = auth.uid()
            AND e.placement = p_placement
            AND e.event_type = 'impression'
            AND e.created_at > now() - make_interval(secs => cfg.min_time_gap_seconds)
        )
      )
  )
  SELECT a.*
  FROM candidates c
  JOIN public.ads a ON a.id = c.id
  ORDER BY c.delivery_score DESC, c.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;

-- Compatibility-aware event recorder. It writes the new delivery event first;
-- only a newly accepted event is mirrored into legacy impression/click tables.
CREATE OR REPLACE FUNCTION public.record_ad_delivery_event_v2(
  p_ad_id uuid,
  p_placement text,
  p_event_type text,
  p_session_id text DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_slot_key text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_score numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'dismiss', 'feedback') THEN
    RAISE EXCEPTION 'unsupported_ad_event';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ads WHERE id = p_ad_id AND status = 'active') THEN
    RETURN false;
  END IF;

  INSERT INTO public.ad_delivery_events (
    event_key,
    ad_id,
    user_id,
    placement,
    event_type,
    session_id,
    slot_key,
    device_type,
    score,
    metadata
  ) VALUES (
    p_event_key,
    p_ad_id,
    v_user_id,
    p_placement,
    p_event_type,
    p_session_id,
    p_slot_key,
    p_device_type,
    p_score,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_event_type = 'impression' THEN
    INSERT INTO public.ad_impressions (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_reach (ad_id, user_id)
      VALUES (p_ad_id, v_user_id)
      ON CONFLICT (ad_id, user_id) DO NOTHING;

      INSERT INTO public.ad_frequency_counters (
        user_id,
        ad_id,
        placement,
        day,
        impressions,
        first_impression_at,
        last_impression_at,
        updated_at
      ) VALUES (
        v_user_id,
        p_ad_id,
        p_placement,
        CURRENT_DATE,
        1,
        now(),
        now(),
        now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        impressions = public.ad_frequency_counters.impressions + 1,
        first_impression_at = COALESCE(public.ad_frequency_counters.first_impression_at, EXCLUDED.first_impression_at),
        last_impression_at = EXCLUDED.last_impression_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'click' THEN
    INSERT INTO public.ad_clicks (ad_id, user_id, placement, device_type)
    VALUES (p_ad_id, v_user_id, p_placement, p_device_type);

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.ad_frequency_counters (
        user_id,
        ad_id,
        placement,
        day,
        clicks,
        last_click_at,
        updated_at
      ) VALUES (
        v_user_id,
        p_ad_id,
        p_placement,
        CURRENT_DATE,
        1,
        now(),
        now()
      )
      ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
        clicks = public.ad_frequency_counters.clicks + 1,
        last_click_at = EXCLUDED.last_click_at,
        updated_at = now();
    END IF;
  ELSIF p_event_type = 'dismiss' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.ad_frequency_counters (
      user_id,
      ad_id,
      placement,
      day,
      dismissals,
      updated_at
    ) VALUES (
      v_user_id,
      p_ad_id,
      p_placement,
      CURRENT_DATE,
      1,
      now()
    )
    ON CONFLICT (user_id, ad_id, placement, day) DO UPDATE SET
      dismissals = public.ad_frequency_counters.dismissals + 1,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_ad_feedback_v2(
  p_ad_id uuid,
  p_placement text,
  p_feedback_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_feedback_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF p_feedback_type NOT IN ('hide', 'not_relevant', 'seen_too_often', 'report') THEN
    RAISE EXCEPTION 'unsupported_feedback_type';
  END IF;

  INSERT INTO public.ad_user_feedback (
    user_id,
    ad_id,
    placement,
    feedback_type,
    metadata
  ) VALUES (
    v_user_id,
    p_ad_id,
    p_placement,
    p_feedback_type,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_feedback_id;

  PERFORM public.record_ad_delivery_event_v2(
    p_ad_id,
    p_placement,
    CASE WHEN p_feedback_type = 'hide' THEN 'dismiss' ELSE 'feedback' END,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('feedback_type', p_feedback_type) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_feedback_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_ads_v2(text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_delivery_event_v2(uuid, text, text, text, text, text, text, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_feedback_v2(uuid, text, text, jsonb) TO authenticated;

