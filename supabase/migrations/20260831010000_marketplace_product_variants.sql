-- Marketplace product variants/options, end-to-end cart/order support.

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  options jsonb not null default '{}'::jsonb,
  price numeric(12,2),
  compare_at_price numeric(12,2),
  quantity integer not null default 0 check (quantity >= 0),
  image_url text,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_options_object check (jsonb_typeof(options) = 'object'),
  constraint product_variants_price_nonnegative check (price is null or price >= 0),
  constraint product_variants_compare_nonnegative check (compare_at_price is null or compare_at_price >= 0)
);

create index if not exists product_variants_product_idx
  on public.product_variants(product_id, position, created_at);

create unique index if not exists product_variants_product_options_uidx
  on public.product_variants(product_id, md5(options::text))
  where is_active;

alter table public.product_variants enable row level security;

drop policy if exists "Active product variants viewable by everyone" on public.product_variants;
drop policy if exists "Sellers can insert product variants" on public.product_variants;
drop policy if exists "Sellers can update product variants" on public.product_variants;
drop policy if exists "Sellers can delete product variants" on public.product_variants;

create policy "Active product variants viewable by everyone"
on public.product_variants for select
using (
  is_active
  or exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_variants.product_id
      and s.user_id = auth.uid()
  )
);

create policy "Sellers can insert product variants"
on public.product_variants for insert
with check (
  exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_variants.product_id
      and s.user_id = auth.uid()
  )
);

create policy "Sellers can update product variants"
on public.product_variants for update
using (
  exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_variants.product_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_variants.product_id
      and s.user_id = auth.uid()
  )
);

create policy "Sellers can delete product variants"
on public.product_variants for delete
using (
  exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_variants.product_id
      and s.user_id = auth.uid()
  )
);

alter table public.cart_items
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null;

alter table public.order_items
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_options jsonb not null default '{}'::jsonb;

alter table public.cart_items
  drop constraint if exists cart_items_user_id_product_id_key;
drop index if exists public.cart_items_user_product_uidx;

create unique index if not exists cart_items_user_product_variant_uidx
  on public.cart_items(
    user_id,
    product_id,
    coalesce(product_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create or replace function public.marketplace_sync_product_variant_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid := coalesce(new.product_id, old.product_id);
  v_total integer;
  v_has_variants boolean;
begin
  select
    exists(select 1 from public.product_variants where product_id = v_product_id),
    coalesce(sum(quantity) filter (where is_active), 0)
  into v_has_variants, v_total
  from public.product_variants
  where product_id = v_product_id;

  if v_has_variants then
    update public.products
       set quantity = v_total,
           status = case
             when status in ('draft', 'deleted') then status
             when v_total <= 0 then 'sold'
             else 'active'
           end,
           updated_at = now()
     where id = v_product_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists marketplace_product_variant_stock_trigger on public.product_variants;
create trigger marketplace_product_variant_stock_trigger
after insert or update of quantity, is_active or delete
on public.product_variants
for each row execute function public.marketplace_sync_product_variant_stock();

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
           ci.product_variant_id,
           ci.quantity,
           coalesce(pv.price, p.price) as price,
           case when ci.product_variant_id is null then p.quantity else pv.quantity end as stock,
           p.status,
           p.currency,
           coalesce(p.shipping_price, 0) as shipping_price,
           pv.id as variant_id,
           pv.is_active as variant_active
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
     where ci.user_id = v_user
     order by ci.product_id, ci.product_variant_id nulls first
       for update of p, pv
  loop
    if v_item.status <> 'active'
       or (
         v_item.product_variant_id is not null
         and (v_item.variant_id is null or coalesce(v_item.variant_active, false) = false)
       ) then
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
           sum(coalesce(pv.price, p.price) * ci.quantity)       as subtotal,
           sum(coalesce(p.shipping_price, 0) * ci.quantity)     as shipping
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
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

    insert into public.order_items (
      order_id, product_id, product_variant_id, variant_options,
      title, quantity, price, total
    )
    select
      v_order_id,
      p.id,
      ci.product_variant_id,
      coalesce(pv.options, '{}'::jsonb),
      p.title,
      ci.quantity,
      coalesce(pv.price, p.price),
      coalesce(pv.price, p.price) * ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id
       and pv.product_id = p.id
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
  update public.product_variants pv
     set quantity = greatest(pv.quantity - ci.quantity, 0),
         updated_at = now()
    from public.cart_items ci
   where ci.product_variant_id = pv.id
     and ci.user_id = v_user;

  update public.products p
     set quantity = p.quantity - ci.quantity,
         status   = case when (p.quantity - ci.quantity) <= 0 then 'sold' else p.status end
    from public.cart_items ci
   where ci.product_id = p.id
     and ci.product_variant_id is null
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
    update public.product_variants pv
       set quantity = coalesce(pv.quantity, 0) + oi.quantity,
           updated_at = now()
      from public.order_items oi
     where oi.order_id = v_order.id
       and oi.product_variant_id = pv.id;

    update public.products p
       set quantity = coalesce(p.quantity, 0) + oi.quantity,
           status   = case when p.status = 'sold' then 'active' else p.status end
      from public.order_items oi
     where oi.order_id = v_order.id
       and oi.product_variant_id is null
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
