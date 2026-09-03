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
