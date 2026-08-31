-- =====================================================================
-- Manual wallet top-up requests
-- ---------------------------------------------------------------------
-- `process_marketplace_order` debits `public.wallets`, but no code path in
-- either client ever credited it. Every wallet therefore sat at 0 forever and
-- the `wallet` payment method could not be used by anyone.
--
-- Uzbek PSPs (Payme / Click / Uzum) require a registered legal entity, which
-- is not available yet, so an automatic rail cannot be built. This migration
-- implements the manual rail instead:
--
--   buyer transfers money out of band
--     -> files a request with the transfer reference
--     -> an operator (service_role) approves it
--     -> wallet is credited and a `credit` ledger row is written
--
-- Money only ever moves inside `approve_wallet_topup`, under a row lock, and
-- only for a request that is still `pending`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The request queue
-- ---------------------------------------------------------------------
create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'USD',
  -- How the buyer sent the money. Not a payment provider integration.
  method text not null check (method in ('bank_transfer', 'p2p_card', 'cash_office')),
  -- Transfer id / last 4 digits / whatever lets the operator find the payment.
  reference text,
  proof_url text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  -- Set on approval; the ledger row that actually credited the wallet.
  payment_id uuid references public.marketplace_payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_topup_requests_user_idx
  on public.wallet_topup_requests (user_id, created_at desc);

-- Operator queue: only open requests matter, so keep the index small.
create index if not exists wallet_topup_requests_pending_idx
  on public.wallet_topup_requests (created_at)
  where status = 'pending';

alter table public.wallet_topup_requests enable row level security;

-- A user may read their own requests.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_select_own'
  ) then
    create policy wallet_topup_select_own on public.wallet_topup_requests
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- A user may file their own request, but only as `pending` and only unreviewed.
-- Without these checks a buyer could insert an already-approved row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_insert_own'
  ) then
    create policy wallet_topup_insert_own on public.wallet_topup_requests
      for insert with check (
        auth.uid() = user_id
        and status = 'pending'
        and reviewed_by is null
        and reviewed_at is null
        and payment_id is null
      );
  end if;
end $$;

-- A user may only walk their own pending request back to `cancelled`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_cancel_own'
  ) then
    create policy wallet_topup_cancel_own on public.wallet_topup_requests
      for update using (auth.uid() = user_id and status = 'pending')
      with check (auth.uid() = user_id and status in ('pending', 'cancelled'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Filing a request
-- ---------------------------------------------------------------------
create or replace function public.request_wallet_topup(
  _amount numeric,
  _method text,
  _reference text default null,
  _proof_url text default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_currency text;
  v_open     integer;
  v_id       uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if _method is null or _method not in ('bank_transfer', 'p2p_card', 'cash_office') then
    raise exception 'invalid_topup_method';
  end if;

  -- First top-up also creates the wallet, so approval never has to.
  insert into public.wallets (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  select currency into v_currency from public.wallets where user_id = v_user;
  v_currency := coalesce(v_currency, 'USD');

  -- Keep the operator queue usable; an honest user never needs 3 open claims.
  select count(*) into v_open
    from public.wallet_topup_requests
   where user_id = v_user
     and status = 'pending';

  if v_open >= 3 then
    raise exception 'too_many_pending_topups';
  end if;

  insert into public.wallet_topup_requests (
    user_id, amount, currency, method, reference, proof_url, note
  ) values (
    v_user, _amount, v_currency, _method,
    nullif(btrim(coalesce(_reference, '')), ''),
    nullif(btrim(coalesce(_proof_url, '')), ''),
    nullif(btrim(coalesce(_note, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object(
    'success',    true,
    'request_id', v_id,
    'status',     'pending',
    'amount',     _amount,
    'currency',   v_currency
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Buyer-side cancellation
-- ---------------------------------------------------------------------
create or replace function public.cancel_wallet_topup(_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.wallet_topup_requests;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.user_id <> v_user then
    raise exception 'not_authorized';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  update public.wallet_topup_requests
     set status = 'cancelled',
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object('success', true, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Approval: the only place a wallet is ever credited
-- ---------------------------------------------------------------------
-- Locking the request first and requiring `pending` is what makes this safe to
-- retry: a second call sees `approved` and raises instead of crediting twice.
create or replace function public.approve_wallet_topup(
  _request_id uuid,
  _review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.wallet_topup_requests;
  v_balance  numeric(14,2);
  v_receipt  text;
  v_payment  uuid;
begin
  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_row.user_id, 0)
  on conflict (user_id) do nothing;

  -- Lock the wallet before reading, so a concurrent checkout cannot interleave.
  perform 1 from public.wallets where user_id = v_row.user_id for update;

  update public.wallets
     set balance = balance + v_row.amount,
         updated_at = now()
   where user_id = v_row.user_id
  returning balance into v_balance;

  v_receipt := public.marketplace_generate_receipt_number();

  insert into public.marketplace_payments (
    user_id, order_id, direction, amount, currency, method,
    status, receipt_number, balance_after, metadata
  ) values (
    v_row.user_id, null, 'credit', v_row.amount, v_row.currency,
    v_row.method, 'succeeded', v_receipt, v_balance,
    jsonb_build_object(
      'kind',       'wallet_topup',
      'request_id', v_row.id,
      'reference',  v_row.reference,
      'reviewed_by', auth.uid()
    )
  )
  returning id into v_payment;

  update public.wallet_topup_requests
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(_review_note, '')), ''),
         payment_id = v_payment,
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object(
    'success',        true,
    'status',         'approved',
    'user_id',        v_row.user_id,
    'amount',         v_row.amount,
    'currency',       v_row.currency,
    'balance_after',  v_balance,
    'receipt_number', v_receipt,
    'payment_id',     v_payment
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Rejection
-- ---------------------------------------------------------------------
create or replace function public.reject_wallet_topup(
  _request_id uuid,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_topup_requests;
begin
  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  update public.wallet_topup_requests
     set status = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(_reason, '')), ''),
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object('success', true, 'status', 'rejected');
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------
-- Buyers may file and cancel.
revoke all on function public.request_wallet_topup(numeric, text, text, text, text) from public;
grant execute on function public.request_wallet_topup(numeric, text, text, text, text) to authenticated;

revoke all on function public.cancel_wallet_topup(uuid) from public;
grant execute on function public.cancel_wallet_topup(uuid) to authenticated;

-- Review is an operator action. `authenticated` must never hold it: these
-- functions are security definer, so granting them to end users would let
-- anyone mint balance for themselves.
revoke all on function public.approve_wallet_topup(uuid, text) from public;
revoke all on function public.approve_wallet_topup(uuid, text) from authenticated;
grant execute on function public.approve_wallet_topup(uuid, text) to service_role;

revoke all on function public.reject_wallet_topup(uuid, text) from public;
revoke all on function public.reject_wallet_topup(uuid, text) from authenticated;
grant execute on function public.reject_wallet_topup(uuid, text) to service_role;

notify pgrst, 'reload schema';
