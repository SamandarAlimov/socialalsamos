-- Mini Apps -> Wallet settlement
--
-- Security model:
-- 1. A mini app may only create a payment intent for the authenticated user.
-- 2. No money moves when requestPayment() is called.
-- 3. The payer must explicitly confirm the intent.
-- 4. Settlement reuses the canonical wallet_transfer() RPC so balance locking,
--    ledger writes and idempotency stay in one source of truth.
-- 5. The browser never receives a service-role credential and cannot choose a
--    different merchant than the approved mini app owner.

create table if not exists public.mini_app_payment_intents (
  id uuid primary key default gen_random_uuid(),
  payer_user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.mini_apps(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (char_length(currency) between 3 and 8),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'expired')),
  transfer_id uuid,
  idempotency_key uuid,
  failure_code text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mini_app_payment_intents_payer_created_idx
  on public.mini_app_payment_intents (payer_user_id, created_at desc);
create index if not exists mini_app_payment_intents_merchant_created_idx
  on public.mini_app_payment_intents (merchant_user_id, created_at desc);
create index if not exists mini_app_payment_intents_app_created_idx
  on public.mini_app_payment_intents (app_id, created_at desc);
create index if not exists mini_app_payment_intents_pending_expiry_idx
  on public.mini_app_payment_intents (status, expires_at)
  where status = 'pending';
create unique index if not exists mini_app_payment_intents_idempotency_idx
  on public.mini_app_payment_intents (payer_user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.mini_app_payment_intents enable row level security;

revoke all on table public.mini_app_payment_intents from anon, authenticated;
grant select on table public.mini_app_payment_intents to authenticated;

-- A payer can see their own intents. The merchant owner can also see payments
-- directed to them for reconciliation, but cannot mutate them directly.
drop policy if exists mini_app_payment_intents_select_parties on public.mini_app_payment_intents;
create policy mini_app_payment_intents_select_parties
on public.mini_app_payment_intents
for select
to authenticated
using (auth.uid() = payer_user_id or auth.uid() = merchant_user_id);

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
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_status text;
  v_permissions text;
  v_currency text := upper(trim(coalesce(p_currency, 'UZS')));
  v_payer_currency text;
  v_merchant_currency text;
  v_intent_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- Guard against accidental/abusive huge client-side requests. Product-level
  -- limits can be made stricter later without changing the SDK contract.
  if p_amount > 1000000000 then
    raise exception 'amount_too_large';
  end if;

  if v_currency = '' or char_length(v_currency) > 8 then
    raise exception 'invalid_currency';
  end if;

  select
    owner_id,
    status::text,
    permissions::text
  into v_owner_id, v_status, v_permissions
  from public.mini_apps
  where id = p_app_id;

  if not found then
    raise exception 'mini_app_not_found';
  end if;

  if v_status <> 'approved' then
    raise exception 'mini_app_not_approved';
  end if;

  if position('payments' in coalesce(v_permissions, '')) = 0 then
    raise exception 'payments_permission_required';
  end if;

  if v_owner_id is null then
    raise exception 'merchant_not_configured';
  end if;

  if v_owner_id = v_user_id then
    raise exception 'cannot_pay_self';
  end if;

  -- The canonical wallet layer is currency-specific. Do not silently convert
  -- money inside Mini Apps; conversion belongs to Payments/Wallet FX rails.
  select upper(currency), status::text
  into v_payer_currency, v_status
  from public.wallets
  where user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if v_status <> 'active' then
    raise exception 'wallet_restricted';
  end if;

  select upper(currency), status::text
  into v_merchant_currency, v_status
  from public.wallets
  where user_id = v_owner_id
  limit 1;

  if not found then
    raise exception 'merchant_wallet_not_found';
  end if;

  if v_status <> 'active' then
    raise exception 'merchant_wallet_restricted';
  end if;

  if v_payer_currency <> v_currency or v_merchant_currency <> v_currency then
    raise exception 'currency_mismatch';
  end if;

  -- Keep at most a small number of live checkout intents for one payer/app.
  -- This prevents a malicious iframe from filling the database with pending rows.
  if (
    select count(*)
    from public.mini_app_payment_intents
    where payer_user_id = v_user_id
      and app_id = p_app_id
      and status = 'pending'
      and expires_at > now()
  ) >= 5 then
    raise exception 'too_many_pending_payments';
  end if;

  insert into public.mini_app_payment_intents (
    payer_user_id,
    app_id,
    merchant_user_id,
    amount,
    currency,
    description
  ) values (
    v_user_id,
    p_app_id,
    v_owner_id,
    round(p_amount::numeric, 2),
    v_currency,
    nullif(left(trim(coalesce(p_description, '')), 280), '')
  )
  returning id into v_intent_id;

  return v_intent_id;
end;
$$;

create or replace function public.mini_app_payment_confirm(
  p_payment_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.mini_app_payment_intents%rowtype;
  v_recipient text;
  v_transfer jsonb;
  v_transfer_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  select * into v_intent
  from public.mini_app_payment_intents
  where id = p_payment_id
  for update;

  if not found or v_intent.payer_user_id <> v_user_id then
    raise exception 'payment_not_found';
  end if;

  if v_intent.status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'payment_id', v_intent.id,
      'transfer_id', v_intent.transfer_id,
      'status', 'paid',
      'amount', v_intent.amount,
      'currency', v_intent.currency
    );
  end if;

  if v_intent.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', v_intent.status,
      'error', 'payment_not_pending'
    );
  end if;

  if v_intent.expires_at <= now() then
    update public.mini_app_payment_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id;

    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', 'expired',
      'error', 'payment_expired'
    );
  end if;

  select coalesce(nullif(account_number, ''), '@' || nullif(p.username, ''))
  into v_recipient
  from public.wallets w
  left join public.profiles p on p.id = w.user_id
  where w.user_id = v_intent.merchant_user_id
    and w.status = 'active'
  limit 1;

  if v_recipient is null then
    raise exception 'merchant_wallet_not_found';
  end if;

  begin
    select public.wallet_transfer(
      v_recipient,
      v_intent.amount,
      coalesce(v_intent.description, 'Mini App: ' || v_intent.app_id::text),
      p_idempotency_key,
      'mini_app_payment',
      v_intent.id
    ) into v_transfer;
  exception when others then
    update public.mini_app_payment_intents
    set failure_code = left(sqlerrm, 160), updated_at = now()
    where id = v_intent.id;

    return jsonb_build_object(
      'success', false,
      'payment_id', v_intent.id,
      'status', 'pending',
      'error', sqlerrm
    );
  end;

  begin
    v_transfer_id := nullif(v_transfer ->> 'transfer_id', '')::uuid;
  exception when others then
    v_transfer_id := null;
  end;

  update public.mini_app_payment_intents
  set
    status = 'paid',
    transfer_id = v_transfer_id,
    idempotency_key = p_idempotency_key,
    failure_code = null,
    paid_at = now(),
    updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_intent.id,
    'transfer_id', v_transfer_id,
    'status', 'paid',
    'amount', v_intent.amount,
    'currency', v_intent.currency,
    'wallet', v_transfer
  );
end;
$$;

create or replace function public.mini_app_payment_cancel(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_intent public.mini_app_payment_intents%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_intent
  from public.mini_app_payment_intents
  where id = p_payment_id
  for update;

  if not found or v_intent.payer_user_id <> v_user_id then
    raise exception 'payment_not_found';
  end if;

  if v_intent.status = 'pending' then
    update public.mini_app_payment_intents
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_intent.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_intent.id,
    'status', case when v_intent.status = 'pending' then 'cancelled' else v_intent.status end
  );
end;
$$;

grant execute on function public.mini_app_payment_create(uuid, numeric, text, text) to authenticated;
grant execute on function public.mini_app_payment_confirm(uuid, uuid) to authenticated;
grant execute on function public.mini_app_payment_cancel(uuid) to authenticated;

revoke execute on function public.mini_app_payment_create(uuid, numeric, text, text) from anon;
revoke execute on function public.mini_app_payment_confirm(uuid, uuid) from anon;
revoke execute on function public.mini_app_payment_cancel(uuid) from anon;
