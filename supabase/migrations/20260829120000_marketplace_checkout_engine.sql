-- =====================================================================
-- Marketplace Checkout Engine
-- ---------------------------------------------------------------------
-- The frontend called `process_marketplace_order` (src/hooks/useOrders.ts)
-- but the function never existed in the repository, so every real purchase
-- failed. This migration implements the full, atomic purchase pipeline:
--   1. cart validation (ownership, product status, live stock)
--   2. per-seller order splitting
--   3. stock decrement + automatic `sold` transition
--   4. wallet debit with a real ledger entry (marketplace_payments)
--   5. receipt + order number generation
--   6. seller sales counter, cart cleanup
-- Everything runs inside one transaction: either the whole purchase
-- succeeds, or nothing is written.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Supporting schema (idempotent / defensive)
-- ---------------------------------------------------------------------

-- Wallet (checkout reads balance from here)
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallets' and policyname = 'wallets_select_own'
  ) then
    create policy wallets_select_own on public.wallets
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Immutable payment ledger for marketplace transactions
create table if not exists public.marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid,
  direction text not null check (direction in ('debit', 'credit')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'USD',
  method text not null,
  status text not null default 'succeeded',
  receipt_number text,
  balance_after numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_payments_user_idx
  on public.marketplace_payments (user_id, created_at desc);
create index if not exists marketplace_payments_order_idx
  on public.marketplace_payments (order_id);

alter table public.marketplace_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'marketplace_payments'
      and policyname = 'marketplace_payments_select_own'
  ) then
    create policy marketplace_payments_select_own on public.marketplace_payments
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Payment/receipt columns the UI already renders
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists receipt_number text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists failure_reason text;

-- Cart upsert in useMarketplace relies on this conflict target
create unique index if not exists cart_items_user_product_uidx
  on public.cart_items (user_id, product_id);

-- ---------------------------------------------------------------------
-- 1. Human readable identifiers
-- ---------------------------------------------------------------------
create or replace function public.marketplace_generate_order_number()
returns text
language sql
volatile
as $$
  select 'ALS-' || to_char(now(), 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.marketplace_generate_receipt_number()
returns text
language sql
volatile
as $$
  select 'RCP-' || to_char(now(), 'YYMMDDHH24MISS') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

-- ---------------------------------------------------------------------
-- 2. Product view counter (was never incremented anywhere)
-- ---------------------------------------------------------------------
create or replace function public.increment_product_views(_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
     set views_count = coalesce(views_count, 0) + 1
   where id = _product_id
     and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------
-- 3. The real checkout
-- ---------------------------------------------------------------------
create or replace function public.process_marketplace_order(
  _shipping_address jsonb,
  _payment_method text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user            uuid := auth.uid();
  v_cart_count      integer;
  v_item            record;
  v_group           record;
  v_order_id        uuid;
  v_order_ids       uuid[] := '{}';
  v_grand_total     numeric(14,2) := 0;
  v_payment_status  text;
  v_balance         numeric(14,2);
  v_receipt         text;
  v_currency        text := 'USD';
begin
  ------------------------------------------------------------------
  -- Guards
  ------------------------------------------------------------------
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _payment_method is null or _payment_method not in ('wallet', 'card_on_delivery', 'cash') then
    raise exception 'invalid_payment_method';
  end if;

  if _shipping_address is null
     or coalesce(_shipping_address->>'full_name', '') = ''
     or coalesce(_shipping_address->>'phone', '') = ''
     or coalesce(_shipping_address->>'street', '') = ''
     or coalesce(_shipping_address->>'city', '') = '' then
    raise exception 'invalid_shipping_address';
  end if;

  select count(*) into v_cart_count from public.cart_items where user_id = v_user;
  if v_cart_count = 0 then
    raise exception 'empty_cart';
  end if;

  ------------------------------------------------------------------
  -- Validate every line and lock product rows against oversell
  ------------------------------------------------------------------
  for v_item in
    select ci.product_id,
           ci.quantity,
           p.price,
           p.quantity as stock,
           p.status,
           p.currency,
           coalesce(p.shipping_price, 0) as shipping_price
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.user_id = v_user
     order by ci.product_id
       for update of p
  loop
    if v_item.status <> 'active' then
      raise exception 'product_unavailable';
    end if;

    if v_item.quantity < 1 then
      raise exception 'invalid_quantity';
    end if;

    if coalesce(v_item.stock, 0) < v_item.quantity then
      raise exception 'insufficient_stock';
    end if;

    v_currency := coalesce(v_item.currency, v_currency);
    v_grand_total := v_grand_total
                   + (v_item.price * v_item.quantity)
                   + (v_item.shipping_price * v_item.quantity);
  end loop;

  ------------------------------------------------------------------
  -- Wallet solvency check (locks the wallet row)
  ------------------------------------------------------------------
  if _payment_method = 'wallet' then
    select balance into v_balance
      from public.wallets
     where user_id = v_user
       for update;

    if v_balance is null or v_balance < v_grand_total then
      raise exception 'insufficient_balance';
    end if;
  end if;

  v_payment_status := case when _payment_method = 'wallet' then 'paid' else 'pending' end;

  ------------------------------------------------------------------
  -- One order per seller
  ------------------------------------------------------------------
  for v_group in
    select p.seller_id,
           sum(p.price * ci.quantity)                          as subtotal,
           sum(coalesce(p.shipping_price, 0) * ci.quantity)    as shipping
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.user_id = v_user
     group by p.seller_id
  loop
    v_receipt := case when v_payment_status = 'paid'
                      then public.marketplace_generate_receipt_number()
                      else null end;

    insert into public.orders (
      order_number, buyer_id, seller_id, status, payment_status, payment_method,
      subtotal, shipping_cost, total, currency, shipping_address, notes,
      receipt_number, paid_at
    ) values (
      public.marketplace_generate_order_number(), v_user, v_group.seller_id,
      'pending', v_payment_status, _payment_method,
      v_group.subtotal, v_group.shipping, v_group.subtotal + v_group.shipping,
      v_currency, _shipping_address, _notes,
      v_receipt,
      case when v_payment_status = 'paid' then now() else null end
    )
    returning id into v_order_id;

    v_order_ids := v_order_ids || v_order_id;

    insert into public.order_items (order_id, product_id, title, quantity, price, total)
    select v_order_id, p.id, p.title, ci.quantity, p.price, p.price * ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.user_id = v_user
       and p.seller_id = v_group.seller_id;

    -- Ledger entry per order so receipts reconcile 1:1
    if v_payment_status = 'paid' then
      insert into public.marketplace_payments (
        user_id, order_id, direction, amount, currency, method,
        status, receipt_number, metadata
      ) values (
        v_user, v_order_id, 'debit', v_group.subtotal + v_group.shipping, v_currency,
        _payment_method, 'succeeded', v_receipt,
        jsonb_build_object('seller_id', v_group.seller_id)
      );
    end if;
  end loop;

  ------------------------------------------------------------------
  -- Reserve inventory (and auto-close sold-out listings)
  ------------------------------------------------------------------
  update public.products p
     set quantity = p.quantity - ci.quantity,
         status   = case when (p.quantity - ci.quantity) <= 0 then 'sold' else p.status end
    from public.cart_items ci
   where ci.product_id = p.id
     and ci.user_id = v_user;

  ------------------------------------------------------------------
  -- Debit wallet once, after all orders are safely written
  ------------------------------------------------------------------
  if v_payment_status = 'paid' then
    update public.wallets
       set balance = balance - v_grand_total,
           updated_at = now()
     where user_id = v_user
    returning balance into v_balance;

    update public.marketplace_payments
       set balance_after = v_balance
     where order_id = any(v_order_ids);
  end if;

  ------------------------------------------------------------------
  -- Seller counters + cart cleanup
  ------------------------------------------------------------------
  update public.sellers s
     set total_sales = coalesce(s.total_sales, 0) + 1
   where s.id in (select seller_id from public.orders where id = any(v_order_ids));

  delete from public.cart_items where user_id = v_user;

  return jsonb_build_object(
    'success',        true,
    'order_ids',      to_jsonb(v_order_ids),
    'payment_status', v_payment_status,
    'total',          v_grand_total,
    'currency',       v_currency
  );
end;
$$;

revoke all on function public.process_marketplace_order(jsonb, text, text) from public;
grant execute on function public.process_marketplace_order(jsonb, text, text) to authenticated;
grant execute on function public.increment_product_views(uuid) to authenticated, anon;
