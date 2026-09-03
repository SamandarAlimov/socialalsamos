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
