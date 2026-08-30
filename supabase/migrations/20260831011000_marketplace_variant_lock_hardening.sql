-- Follow-up hardening for marketplace product variants.
-- 1) safely handles NEW/OLD in the stock-sync trigger
-- 2) locks variant rows before the LEFT JOIN validation query so checkout
--    cannot oversell and does not hit PostgreSQL outer-join FOR UPDATE errors.

create or replace function public.marketplace_sync_product_variant_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_total integer;
  v_has_variants boolean;
begin
  v_product_id := case
    when tg_op = 'DELETE' then old.product_id
    else new.product_id
  end;

  select
    exists(
      select 1
      from public.product_variants
      where product_id = v_product_id
    ),
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

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
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
  -- Lock selected variants first, in deterministic order.
  -- PostgreSQL cannot FOR UPDATE the nullable side of a LEFT JOIN.
  ------------------------------------------------------------------
  perform 1
    from public.product_variants pv
    join public.cart_items ci
      on ci.product_variant_id = pv.id
   where ci.user_id = v_user
   order by pv.id
     for update of pv;

  ------------------------------------------------------------------
  -- Validate every line and lock base product rows against oversell.
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
       for update of p
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
