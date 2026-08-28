-- =====================================================================
-- Marketplace Order Lifecycle
-- ---------------------------------------------------------------------
-- Orders could be created (see 20260829120000_marketplace_checkout_engine)
-- but never moved forward: there was no way for a seller to accept, ship
-- or deliver an order, and no way to cancel one and give the money back.
--
-- This migration adds a single, guarded state machine:
--
--   pending    -> processing | cancelled
--   processing -> shipped    | cancelled
--   shipped    -> delivered
--   delivered  -> (terminal)
--   cancelled  -> (terminal)
--
-- Rules enforced inside the database (never trust the client):
--   * only the order's seller may accept / ship / deliver
--   * the buyer may only cancel while the order is pending or processing
--   * cancelling restores stock, reopens sold-out listings, refunds the
--     wallet (with a credit ledger row) and rolls back the sales counter
--   * marking a cash / card-on-delivery order as delivered settles the
--     payment and issues a receipt number
--   * every transition is written to marketplace_order_events
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Schema support
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists refunded_at timestamptz;

-- Allow the full lifecycle vocabulary (older constraints may be narrower)
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled'));

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'refunded'));

-- Immutable audit trail for every status change
create table if not exists public.marketplace_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('buyer', 'seller', 'system')),
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_events_order_idx
  on public.marketplace_order_events (order_id, created_at desc);

alter table public.marketplace_order_events enable row level security;

-- Visible to the buyer and to the seller of the related order
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'marketplace_order_events'
      and policyname = 'order_events_select_participants'
  ) then
    create policy order_events_select_participants on public.marketplace_order_events
      for select using (
        exists (
          select 1
            from public.orders o
            left join public.sellers s on s.id = o.seller_id
           where o.id = marketplace_order_events.order_id
             and (o.buyer_id = auth.uid() or s.user_id = auth.uid())
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. The state machine
-- ---------------------------------------------------------------------
create or replace function public.marketplace_update_order_status(
  _order_id uuid,
  _status text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user           uuid := auth.uid();
  v_order          record;
  v_is_seller      boolean := false;
  v_is_buyer       boolean := false;
  v_role           text;
  v_refunded       numeric(14,2) := 0;
  v_balance        numeric(14,2);
  v_receipt        text;
  v_new_payment    text;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _status is null or _status not in ('processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  -- Lock the order for the whole transition
  select o.*
    into v_order
    from public.orders o
   where o.id = _order_id
     for update;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  v_is_buyer := (v_order.buyer_id = v_user);
  select exists (
    select 1 from public.sellers s
     where s.id = v_order.seller_id and s.user_id = v_user
  ) into v_is_seller;

  if not (v_is_buyer or v_is_seller) then
    raise exception 'not_authorized';
  end if;

  v_role := case when v_is_seller then 'seller' else 'buyer' end;

  ------------------------------------------------------------------
  -- Permission matrix
  ------------------------------------------------------------------
  if _status in ('processing', 'shipped', 'delivered') and not v_is_seller then
    raise exception 'seller_only';
  end if;

  if _status = 'cancelled'
     and not v_is_seller
     and v_order.status not in ('pending', 'processing') then
    -- once it is on the way, only the seller can cancel
    raise exception 'cancel_window_closed';
  end if;

  ------------------------------------------------------------------
  -- Allowed transitions
  ------------------------------------------------------------------
  if v_order.status = _status then
    raise exception 'status_unchanged';
  end if;

  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order_finalized';
  end if;

  if not (
       (v_order.status = 'pending'    and _status in ('processing', 'cancelled'))
    or (v_order.status = 'processing' and _status in ('shipped', 'cancelled'))
    or (v_order.status = 'shipped'    and _status in ('delivered', 'cancelled'))
  ) then
    raise exception 'invalid_transition';
  end if;

  ------------------------------------------------------------------
  -- Cancellation: restore inventory and give the money back
  ------------------------------------------------------------------
  if _status = 'cancelled' then
    update public.products p
       set quantity = coalesce(p.quantity, 0) + oi.quantity,
           status   = case when p.status = 'sold' then 'active' else p.status end
      from public.order_items oi
     where oi.order_id = v_order.id
       and p.id = oi.product_id;

    if v_order.payment_status = 'paid' then
      v_refunded := v_order.total;

      insert into public.wallets (user_id, balance, currency)
      values (v_order.buyer_id, 0, coalesce(v_order.currency, 'USD'))
      on conflict (user_id) do nothing;

      update public.wallets
         set balance = balance + v_refunded,
             updated_at = now()
       where user_id = v_order.buyer_id
      returning balance into v_balance;

      v_receipt := public.marketplace_generate_receipt_number();

      insert into public.marketplace_payments (
        user_id, order_id, direction, amount, currency, method,
        status, receipt_number, balance_after, metadata
      ) values (
        v_order.buyer_id, v_order.id, 'credit', v_refunded,
        coalesce(v_order.currency, 'USD'),
        coalesce(v_order.payment_method, 'wallet'),
        'succeeded', v_receipt, v_balance,
        jsonb_build_object('kind', 'refund', 'cancelled_by', v_role)
      );

      v_new_payment := 'refunded';
    end if;

    -- roll back the sales counter that checkout incremented
    update public.sellers s
       set total_sales = greatest(coalesce(s.total_sales, 0) - 1, 0)
     where s.id = v_order.seller_id;

    update public.orders
       set status         = 'cancelled',
           payment_status = coalesce(v_new_payment, payment_status),
           cancel_reason  = _reason,
           cancelled_at   = now(),
           refunded_at    = case when v_new_payment = 'refunded' then now() else refunded_at end,
           updated_at     = now()
     where id = v_order.id;

  ------------------------------------------------------------------
  -- Delivery: settle offline payments and issue the receipt
  ------------------------------------------------------------------
  elsif _status = 'delivered' then
    if v_order.payment_status <> 'paid' then
      v_receipt := public.marketplace_generate_receipt_number();

      insert into public.marketplace_payments (
        user_id, order_id, direction, amount, currency, method,
        status, receipt_number, metadata
      ) values (
        v_order.buyer_id, v_order.id, 'debit', v_order.total,
        coalesce(v_order.currency, 'USD'),
        coalesce(v_order.payment_method, 'cash'),
        'succeeded', v_receipt,
        jsonb_build_object('kind', 'offline_settlement', 'collected_by', 'seller')
      );
    end if;

    update public.orders
       set status         = 'delivered',
           payment_status = 'paid',
           paid_at        = coalesce(paid_at, now()),
           receipt_number = coalesce(receipt_number, v_receipt),
           delivered_at   = now(),
           updated_at     = now()
     where id = v_order.id;

  ------------------------------------------------------------------
  -- Accept / ship
  ------------------------------------------------------------------
  else
    update public.orders
       set status     = _status,
           shipped_at = case when _status = 'shipped' then now() else shipped_at end,
           updated_at = now()
     where id = v_order.id;
  end if;

  insert into public.marketplace_order_events (
    order_id, actor_id, actor_role, from_status, to_status, reason
  ) values (
    v_order.id, v_user, v_role, v_order.status, _status, _reason
  );

  return jsonb_build_object(
    'success',       true,
    'order_id',      v_order.id,
    'from_status',   v_order.status,
    'status',        _status,
    'refunded',      v_refunded,
    'receipt_number', v_receipt
  );
end;
$$;

revoke all on function public.marketplace_update_order_status(uuid, text, text) from public;
grant execute on function public.marketplace_update_order_status(uuid, text, text) to authenticated;
