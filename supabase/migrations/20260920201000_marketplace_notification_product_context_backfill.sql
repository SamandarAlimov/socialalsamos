-- Enrich marketplace order activity with product context and backfill
-- active orders that predate realtime marketplace notification triggers.

create or replace function public.marketplace_notify_order_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_user_id uuid;
  v_actor uuid := auth.uid();
  v_order_label text;
  v_status_label text;
  v_payment_label text;
  v_product_title text;
  v_item_count integer := 0;
  v_product_context text;
begin
  select user_id into v_seller_user_id
  from public.sellers
  where id = new.seller_id;

  v_order_label := coalesce(nullif(new.order_number, ''), upper(left(new.id::text, 8)));

  select oi.title, totals.item_count
    into v_product_title, v_item_count
  from public.order_items oi
  cross join lateral (
    select count(*)::integer as item_count
    from public.order_items counted
    where counted.order_id = new.id
  ) totals
  where oi.order_id = new.id
  order by oi.created_at asc, oi.id asc
  limit 1;

  v_product_context :=
    coalesce(nullif(trim(v_product_title), ''), 'Buyurtma #' || v_order_label)
    || case
         when coalesce(v_item_count, 0) > 1
           then ' · yana ' || (v_item_count - 1)::text || ' mahsulot'
         else ''
       end;

  if new.status is distinct from old.status then
    v_status_label := case new.status
      when 'pending' then 'Kutilmoqda'
      when 'processing' then 'Buyurtma qabul qilindi'
      when 'shipped' then 'Buyurtma yo‘lga chiqdi'
      when 'delivered' then 'Buyurtma yetkazildi'
      when 'cancelled' then 'Buyurtma bekor qilindi'
      else new.status
    end;

    if new.buyer_id is not null and (v_actor is null or v_actor <> new.buyer_id) then
      insert into public.marketplace_notifications (
        user_id, type, title, body, data, action_url
      )
      values (
        new.buyer_id,
        'order_status',
        v_status_label,
        v_product_context || ' · #' || v_order_label,
        jsonb_build_object(
          'role', 'buyer',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
          'product_title', v_product_title,
          'item_count', v_item_count,
          'order_number', v_order_label,
          'status', new.status,
          'previous_status', old.status,
          'event_key', 'order:' || new.id::text || ':status:' || new.status || ':buyer'
        ),
        '/marketplace?tab=orders&order=' || new.id::text
      )
      on conflict do nothing;
    end if;

    if v_seller_user_id is not null and (v_actor is null or v_actor <> v_seller_user_id) then
      insert into public.marketplace_notifications (
        user_id, type, title, body, data, action_url
      )
      values (
        v_seller_user_id,
        'order_status',
        case
          when new.status = 'cancelled' then 'Buyurtma bekor qilindi'
          else 'Buyurtma holati yangilandi'
        end,
        v_product_context || ' · ' || v_status_label,
        jsonb_build_object(
          'role', 'seller',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
          'product_title', v_product_title,
          'item_count', v_item_count,
          'order_number', v_order_label,
          'status', new.status,
          'previous_status', old.status,
          'event_key', 'order:' || new.id::text || ':status:' || new.status || ':seller'
        ),
        '/marketplace?tab=selling&view=orders&order=' || new.id::text
      )
      on conflict do nothing;
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_payment_label := case new.payment_status
      when 'paid' then 'To‘lov tasdiqlandi'
      when 'pending' then 'To‘lov kutilmoqda'
      when 'refunded' then 'Mablag‘ qaytarildi'
      when 'failed' then 'To‘lov amalga oshmadi'
      else 'To‘lov holati yangilandi'
    end;

    if new.buyer_id is not null and (v_actor is null or v_actor <> new.buyer_id) then
      insert into public.marketplace_notifications (
        user_id, type, title, body, data, action_url
      )
      values (
        new.buyer_id,
        'order_status',
        v_payment_label,
        v_product_context || ' · #' || v_order_label,
        jsonb_build_object(
          'role', 'buyer',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
          'product_title', v_product_title,
          'item_count', v_item_count,
          'order_number', v_order_label,
          'payment_status', new.payment_status,
          'event_key', 'order:' || new.id::text || ':payment:' || new.payment_status || ':buyer'
        ),
        '/marketplace?tab=orders&order=' || new.id::text
      )
      on conflict do nothing;
    end if;

    if v_seller_user_id is not null and (v_actor is null or v_actor <> v_seller_user_id) then
      insert into public.marketplace_notifications (
        user_id, type, title, body, data, action_url
      )
      values (
        v_seller_user_id,
        'order_status',
        v_payment_label,
        v_product_context || ' · #' || v_order_label,
        jsonb_build_object(
          'role', 'seller',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
          'product_title', v_product_title,
          'item_count', v_item_count,
          'order_number', v_order_label,
          'payment_status', new.payment_status,
          'event_key', 'order:' || new.id::text || ':payment:' || new.payment_status || ':seller'
        ),
        '/marketplace?tab=selling&view=orders&order=' || new.id::text
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- Backfill only currently active orders. This intentionally avoids generating
-- a notification flood for old delivered/cancelled history.
with active_orders as (
  select
    o.id,
    o.order_number,
    o.buyer_id,
    o.seller_id,
    o.status,
    s.user_id as seller_user_id,
    item.title as product_title,
    item.item_count
  from public.orders o
  join public.sellers s on s.id = o.seller_id
  left join lateral (
    select
      first_item.title,
      (
        select count(*)::integer
        from public.order_items counted
        where counted.order_id = o.id
      ) as item_count
    from public.order_items first_item
    where first_item.order_id = o.id
    order by first_item.created_at asc, first_item.id asc
    limit 1
  ) item on true
  where o.status in ('pending', 'processing', 'shipped')
)
insert into public.marketplace_notifications (
  user_id, type, title, body, data, action_url
)
select
  active.seller_user_id,
  'new_order',
  case
    when active.status = 'pending' then 'Yangi buyurtma'
    else 'Faol buyurtma'
  end,
  coalesce(nullif(trim(active.product_title), ''), 'Buyurtma')
    || case
         when coalesce(active.item_count, 0) > 1
           then ' · yana ' || (active.item_count - 1)::text || ' mahsulot'
         else ''
       end,
  jsonb_build_object(
    'role', 'seller',
    'order_id', active.id,
    'seller_id', active.seller_id,
    'buyer_id', active.buyer_id,
    'product_title', active.product_title,
    'item_count', active.item_count,
    'order_number', coalesce(nullif(active.order_number, ''), upper(left(active.id::text, 8))),
    'status', active.status,
    'event_key', 'order:' || active.id::text || ':backfill:seller'
  ),
  '/marketplace?tab=selling&view=orders&order=' || active.id::text
from active_orders active
where active.seller_user_id is not null
  and not exists (
    select 1
    from public.marketplace_notifications existing
    where existing.user_id = active.seller_user_id
      and existing.data->>'role' = 'seller'
      and existing.data->>'order_id' = active.id::text
  )
on conflict do nothing;

with active_orders as (
  select
    o.id,
    o.order_number,
    o.buyer_id,
    o.seller_id,
    o.status,
    item.title as product_title,
    item.item_count
  from public.orders o
  left join lateral (
    select
      first_item.title,
      (
        select count(*)::integer
        from public.order_items counted
        where counted.order_id = o.id
      ) as item_count
    from public.order_items first_item
    where first_item.order_id = o.id
    order by first_item.created_at asc, first_item.id asc
    limit 1
  ) item on true
  where o.status in ('pending', 'processing', 'shipped')
)
insert into public.marketplace_notifications (
  user_id, type, title, body, data, action_url
)
select
  active.buyer_id,
  'order_status',
  'Faol buyurtma',
  coalesce(nullif(trim(active.product_title), ''), 'Buyurtma')
    || case
         when coalesce(active.item_count, 0) > 1
           then ' · yana ' || (active.item_count - 1)::text || ' mahsulot'
         else ''
       end,
  jsonb_build_object(
    'role', 'buyer',
    'order_id', active.id,
    'seller_id', active.seller_id,
    'buyer_id', active.buyer_id,
    'product_title', active.product_title,
    'item_count', active.item_count,
    'order_number', coalesce(nullif(active.order_number, ''), upper(left(active.id::text, 8))),
    'status', active.status,
    'event_key', 'order:' || active.id::text || ':backfill:buyer'
  ),
  '/marketplace?tab=orders&order=' || active.id::text
from active_orders active
where active.buyer_id is not null
  and not exists (
    select 1
    from public.marketplace_notifications existing
    where existing.user_id = active.buyer_id
      and existing.data->>'role' = 'buyer'
      and existing.data->>'order_id' = active.id::text
  )
on conflict do nothing;
