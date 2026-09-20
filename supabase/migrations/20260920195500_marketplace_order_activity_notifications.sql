-- Realtime marketplace activity notifications for buyers and sellers.

create unique index if not exists marketplace_notifications_event_dedupe
  on public.marketplace_notifications (user_id, type, ((data->>'event_key')))
  where data ? 'event_key';

create or replace function public.marketplace_notify_order_item_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_seller_user_id uuid;
  v_order_label text;
begin
  select * into v_order
  from public.orders
  where id = new.order_id;

  if not found then
    return new;
  end if;

  select user_id into v_seller_user_id
  from public.sellers
  where id = v_order.seller_id;

  v_order_label := coalesce(nullif(v_order.order_number, ''), upper(left(v_order.id::text, 8)));

  if v_seller_user_id is not null then
    insert into public.marketplace_notifications (
      user_id, type, title, body, data, action_url
    )
    values (
      v_seller_user_id,
      'new_order',
      'Yangi buyurtma',
      new.title || case when new.quantity > 1 then ' · ' || new.quantity::text || ' dona' else '' end,
      jsonb_build_object(
        'role', 'seller',
        'order_id', v_order.id,
        'seller_id', v_order.seller_id,
        'buyer_id', v_order.buyer_id,
        'product_id', new.product_id,
        'product_title', new.title,
        'order_number', v_order_label,
        'status', v_order.status,
        'event_key', 'order:' || v_order.id::text || ':created:seller'
      ),
      '/marketplace?tab=selling&view=orders&order=' || v_order.id::text
    )
    on conflict do nothing;
  end if;

  insert into public.marketplace_notifications (
    user_id, type, title, body, data, action_url
  )
  values (
    v_order.buyer_id,
    'order_status',
    'Buyurtma qabul qilindi',
    new.title || case when new.quantity > 1 then ' · ' || new.quantity::text || ' dona' else '' end,
    jsonb_build_object(
      'role', 'buyer',
      'order_id', v_order.id,
      'seller_id', v_order.seller_id,
      'buyer_id', v_order.buyer_id,
      'product_id', new.product_id,
      'product_title', new.title,
      'order_number', v_order_label,
      'status', v_order.status,
      'event_key', 'order:' || v_order.id::text || ':created:buyer'
    ),
    '/marketplace?tab=orders&order=' || v_order.id::text
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists marketplace_order_item_created_notification on public.order_items;
create trigger marketplace_order_item_created_notification
after insert on public.order_items
for each row execute function public.marketplace_notify_order_item_created();

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
begin
  select user_id into v_seller_user_id
  from public.sellers
  where id = new.seller_id;

  v_order_label := coalesce(nullif(new.order_number, ''), upper(left(new.id::text, 8)));

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
        'Buyurtma #' || v_order_label || ' holati yangilandi',
        jsonb_build_object(
          'role', 'buyer',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
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
        'Buyurtma #' || v_order_label || ' · ' || v_status_label,
        jsonb_build_object(
          'role', 'seller',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
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
        'Buyurtma #' || v_order_label,
        jsonb_build_object(
          'role', 'buyer',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
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
        'Buyurtma #' || v_order_label,
        jsonb_build_object(
          'role', 'seller',
          'order_id', new.id,
          'seller_id', new.seller_id,
          'buyer_id', new.buyer_id,
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

drop trigger if exists marketplace_order_changed_notification on public.orders;
create trigger marketplace_order_changed_notification
after update of status, payment_status on public.orders
for each row
when (
  old.status is distinct from new.status
  or old.payment_status is distinct from new.payment_status
)
execute function public.marketplace_notify_order_changed();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketplace_notifications'
  ) then
    alter publication supabase_realtime add table public.marketplace_notifications;
  end if;
end
$$;
