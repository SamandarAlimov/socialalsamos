-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260908155500_marketplace_international_checkout_v1.sql
-- SHA256 7370492b7782e6f7c72adb812b0c4d52da5695c04acb35240d1b80c1d604b65a
-- ============================================================================
-- International Marketplace checkout v1.
-- Adds product logistics metadata, authoritative server-side shipping estimates,
-- and a dedicated cross-border checkout RPC without changing domestic/restaurant checkout.

alter table public.products
  add column if not exists origin_country_code text,
  add column if not exists origin_city text,
  add column if not exists weight_kg numeric(10,3),
  add column if not exists package_length_cm numeric(10,2),
  add column if not exists package_width_cm numeric(10,2),
  add column if not exists package_height_cm numeric(10,2),
  add column if not exists hs_code text,
  add column if not exists customs_category text,
  add column if not exists hazardous_materials boolean not null default false,
  add column if not exists battery_included boolean not null default false,
  add column if not exists temperature_controlled boolean not null default false;

alter table public.products drop constraint if exists products_origin_country_code_check;
alter table public.products add constraint products_origin_country_code_check
  check (origin_country_code is null or origin_country_code ~ '^[A-Z]{2}$');
alter table public.products drop constraint if exists products_weight_kg_check;
alter table public.products add constraint products_weight_kg_check
  check (weight_kg is null or weight_kg > 0);
alter table public.products drop constraint if exists products_package_dimensions_check;
alter table public.products add constraint products_package_dimensions_check
  check (
    (package_length_cm is null or package_length_cm > 0) and
    (package_width_cm is null or package_width_cm > 0) and
    (package_height_cm is null or package_height_cm > 0)
  );

create table if not exists public.marketplace_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  origin_country_code text not null,
  destination_country_code text not null,
  service_level text not null check (service_level in ('economy','standard','express')),
  incoterm text not null check (incoterm in ('DAP','DDP')),
  transport_mode text not null,
  currency text not null default 'USD',
  cart_value numeric(14,2) not null default 0,
  billable_weight_kg numeric(12,3) not null default 0,
  shipping_charge numeric(14,2) not null default 0,
  estimated_duty numeric(14,2) not null default 0,
  estimated_vat numeric(14,2) not null default 0,
  customs_handling numeric(14,2) not null default 0,
  estimated_import_charges numeric(14,2) not null default 0,
  checkout_total numeric(14,2) not null default 0,
  estimated_landed_total numeric(14,2) not null default 0,
  eta_days_min integer not null,
  eta_days_max integer not null,
  estimate_only boolean not null default true,
  metadata_complete boolean not null default false,
  warnings jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_shipping_quotes_user_idx
  on public.marketplace_shipping_quotes(user_id, created_at desc);
create index if not exists marketplace_shipping_quotes_expiry_idx
  on public.marketplace_shipping_quotes(expires_at);

alter table public.marketplace_shipping_quotes enable row level security;
drop policy if exists marketplace_shipping_quotes_read_own on public.marketplace_shipping_quotes;
create policy marketplace_shipping_quotes_read_own
  on public.marketplace_shipping_quotes for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.marketplace_quote_shipping(
  _destination_country_code text,
  _service_level text default 'standard',
  _incoterm text default 'DAP'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_destination text := upper(trim(coalesce(_destination_country_code, '')));
  v_service text := lower(trim(coalesce(_service_level, 'standard')));
  v_incoterm text := upper(trim(coalesce(_incoterm, 'DAP')));
  v_cart_count integer;
  v_seller_count integer;
  v_origin_count integer;
  v_currency_count integer;
  v_seller_id uuid;
  v_origin text;
  v_currency text;
  v_cart_value numeric(14,2);
  v_weight numeric(12,3);
  v_metadata_complete boolean;
  v_has_hazmat boolean;
  v_has_battery boolean;
  v_temp_control boolean;
  v_transport text;
  v_base numeric(14,4);
  v_per_kg numeric(14,4);
  v_route_factor numeric(10,4);
  v_shipping numeric(14,2);
  v_duty numeric(14,2);
  v_vat numeric(14,2);
  v_handling numeric(14,2);
  v_import numeric(14,2);
  v_checkout_total numeric(14,2);
  v_landed_total numeric(14,2);
  v_eta_min integer;
  v_eta_max integer;
  v_quote_id uuid;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if v_destination !~ '^[A-Z]{2}$' then raise exception 'invalid_destination_country'; end if;
  if v_service not in ('economy','standard','express') then raise exception 'invalid_service_level'; end if;
  if v_incoterm not in ('DAP','DDP') then raise exception 'invalid_incoterm'; end if;

  select count(*), count(distinct p.seller_id),
         count(distinct coalesce(nullif(p.origin_country_code,''), 'UZ')),
         count(distinct coalesce(nullif(p.currency,''), 'USD'))
    into v_cart_count, v_seller_count, v_origin_count, v_currency_count
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
   where ci.user_id = v_user;

  if v_cart_count = 0 then raise exception 'empty_cart'; end if;
  if v_seller_count <> 1 then raise exception 'international_single_seller_required'; end if;
  if v_origin_count <> 1 then raise exception 'mixed_origin_not_supported'; end if;
  if v_currency_count <> 1 then raise exception 'mixed_currency_not_supported'; end if;

  if exists (
    select 1 from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = v_user and coalesce(p.is_food, false) = true
  ) then
    raise exception 'restaurant_international_not_supported';
  end if;

  select
    min(p.seller_id::text)::uuid,
    min(coalesce(nullif(p.origin_country_code,''), 'UZ')),
    min(coalesce(nullif(p.currency,''), 'USD')),
    round(sum(coalesce(pv.price, p.price) * ci.quantity)::numeric, 2),
    round(sum(
      greatest(
        coalesce(p.weight_kg, 0.5),
        (coalesce(p.package_length_cm, 20) * coalesce(p.package_width_cm, 15) * coalesce(p.package_height_cm, 10)) / 5000.0
      ) * ci.quantity
    )::numeric, 3),
    bool_and(
      p.origin_country_code is not null and
      p.weight_kg is not null and
      p.package_length_cm is not null and
      p.package_width_cm is not null and
      p.package_height_cm is not null
    ),
    bool_or(coalesce(p.hazardous_materials, false)),
    bool_or(coalesce(p.battery_included, false)),
    bool_or(coalesce(p.temperature_controlled, false))
  into v_seller_id, v_origin, v_currency, v_cart_value, v_weight,
       v_metadata_complete, v_has_hazmat, v_has_battery, v_temp_control
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.product_variants pv
    on pv.id = ci.product_variant_id and pv.product_id = p.id
  where ci.user_id = v_user;

  if v_origin = v_destination then
    v_transport := case when v_service = 'express' then 'courier' else 'road' end;
    v_base := case v_service when 'economy' then 4 when 'standard' then 7 else 12 end;
    v_per_kg := case v_service when 'economy' then 0.7 when 'standard' then 1.1 else 1.8 end;
    v_eta_min := case v_service when 'economy' then 3 when 'standard' then 2 else 1 end;
    v_eta_max := case v_service when 'economy' then 7 when 'standard' then 5 else 2 end;
    v_route_factor := 1;
  else
    if v_service = 'economy' then
      v_transport := case when v_weight >= 120 then 'sea' else 'multimodal' end;
      v_base := 18; v_per_kg := 2.20; v_eta_min := 8; v_eta_max := 18;
    elsif v_service = 'standard' then
      v_transport := case when v_has_hazmat or v_weight > 70 then 'multimodal' else 'air' end;
      v_base := 28; v_per_kg := 4.20; v_eta_min := 5; v_eta_max := 10;
    else
      if v_has_hazmat or v_weight > 70 then raise exception 'express_not_available'; end if;
      v_transport := 'air';
      v_base := 45; v_per_kg := 7.50; v_eta_min := 2; v_eta_max := 5;
    end if;

    v_route_factor := case
      when v_origin = 'UZ' and v_destination in ('KZ','KG','TJ','TM','AF') then 1.05
      when v_destination in ('KZ','KG','TJ','TM','AF','AZ','GE','TR','CN','RU') then 1.20
      else 1.35
    end;
  end if;

  v_shipping := round((v_base + (greatest(v_weight, 0.25) * v_per_kg * v_route_factor)
    + case when v_has_battery then 8 else 0 end
    + case when v_temp_control then 18 else 0 end)::numeric, 2);

  if v_origin = v_destination then
    v_duty := 0; v_vat := 0; v_handling := 0;
  else
    -- Customs is intentionally an estimate until a live tariff/settlement provider
    -- is connected. We never silently treat these assumptions as a final tax bill.
    v_duty := round((v_cart_value * 0.05)::numeric, 2);
    v_vat := round(((v_cart_value + v_shipping + v_duty) * 0.12)::numeric, 2);
    v_handling := 8;
  end if;
  v_import := round((v_duty + v_vat + v_handling)::numeric, 2);
  v_checkout_total := round((v_cart_value + v_shipping)::numeric, 2);
  v_landed_total := round((v_checkout_total + v_import)::numeric, 2);

  if not coalesce(v_metadata_complete, false) then
    v_warnings := v_warnings || jsonb_build_array('Mahsulot logistika o‘lchamlari to‘liq emas — standart vazn/o‘lcham taxmini ishlatildi.');
  end if;
  if v_has_battery then
    v_warnings := v_warnings || jsonb_build_array('Batareyali mahsulot: tashuvchi dangerous-goods tekshiruvini talab qilishi mumkin.');
  end if;
  if v_has_hazmat then
    v_warnings := v_warnings || jsonb_build_array('Xavfli yuk: avia/express cheklangan, maxsus tashuvchi talab qilinadi.');
  end if;
  if v_temp_control then
    v_warnings := v_warnings || jsonb_build_array('Harorat nazorati talab qilinadi — maxsus logistika qo‘shimcha xarajati qo‘shildi.');
  end if;
  if v_origin <> v_destination then
    v_warnings := v_warnings || jsonb_build_array('Boj va VAT taxminiy. Yakuniy summa HS kod, kelib chiqish va qabul qiluvchi davlat qoidalariga bog‘liq.');
  end if;
  if v_incoterm = 'DDP' and v_origin <> v_destination then
    v_warnings := v_warnings || jsonb_build_array('DDP hozir estimate-only: bojxona settlement provayderi ulanmaguncha import to‘lovlari checkoutda undirilmaydi.');
  end if;

  insert into public.marketplace_shipping_quotes (
    user_id, seller_id, origin_country_code, destination_country_code,
    service_level, incoterm, transport_mode, currency, cart_value,
    billable_weight_kg, shipping_charge, estimated_duty, estimated_vat,
    customs_handling, estimated_import_charges, checkout_total,
    estimated_landed_total, eta_days_min, eta_days_max, estimate_only,
    metadata_complete, warnings
  ) values (
    v_user, v_seller_id, v_origin, v_destination,
    v_service, v_incoterm, v_transport, v_currency, v_cart_value,
    v_weight, v_shipping, v_duty, v_vat,
    v_handling, v_import, v_checkout_total,
    v_landed_total, v_eta_min, v_eta_max, true,
    coalesce(v_metadata_complete, false), v_warnings
  ) returning id into v_quote_id;

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'origin_country_code', v_origin,
    'destination_country_code', v_destination,
    'international', v_origin <> v_destination,
    'service_level', v_service,
    'incoterm', v_incoterm,
    'transport_mode', v_transport,
    'currency', v_currency,
    'cart_value', v_cart_value,
    'billable_weight_kg', v_weight,
    'shipping_charge', v_shipping,
    'estimated_duty', v_duty,
    'estimated_vat', v_vat,
    'customs_handling', v_handling,
    'estimated_import_charges', v_import,
    'checkout_total', v_checkout_total,
    'estimated_landed_total', v_landed_total,
    'eta_days_min', v_eta_min,
    'eta_days_max', v_eta_max,
    'estimate_only', true,
    'customs_collected_at_checkout', false,
    'metadata_complete', coalesce(v_metadata_complete, false),
    'warnings', v_warnings,
    'expires_at', now() + interval '30 minutes',
    'rate_source', 'alsamos_estimate_v1'
  );
end;
$$;

revoke all on function public.marketplace_quote_shipping(text, text, text) from public;
grant execute on function public.marketplace_quote_shipping(text, text, text) to authenticated;

create or replace function public.process_marketplace_international_order(
  _shipping_address jsonb,
  _payment_method text,
  _destination_country_code text,
  _service_level text default 'standard',
  _incoterm text default 'DAP',
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cart_count integer;
  v_seller_count integer;
  v_seller_id uuid;
  v_item record;
  v_order_id uuid;
  v_payment_status text;
  v_balance numeric(14,2);
  v_receipt text;
  v_currency text := 'USD';
  v_subtotal numeric(14,2) := 0;
  v_shipping numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_quote jsonb;
  v_address jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if _payment_method is null or _payment_method not in ('wallet','card_on_delivery','cash') then
    raise exception 'invalid_payment_method';
  end if;
  if _shipping_address is null
     or coalesce(_shipping_address->>'full_name','') = ''
     or coalesce(_shipping_address->>'phone','') = ''
     or coalesce(_shipping_address->>'street','') = ''
     or coalesce(_shipping_address->>'city','') = '' then
    raise exception 'invalid_shipping_address';
  end if;

  select count(*), count(distinct p.seller_id), min(p.seller_id::text)::uuid
    into v_cart_count, v_seller_count, v_seller_id
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
   where ci.user_id = v_user;

  if v_cart_count = 0 then raise exception 'empty_cart'; end if;
  if v_seller_count <> 1 then raise exception 'international_single_seller_required'; end if;
  if exists (
    select 1 from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = v_user and coalesce(p.is_food,false) = true
  ) then raise exception 'restaurant_international_not_supported'; end if;

  -- Lock inventory first; the quote and order are then created in the same transaction.
  for v_item in
    select ci.product_id, ci.product_variant_id, ci.quantity,
           coalesce(pv.price,p.price) as price,
           case when ci.product_variant_id is null then p.quantity else pv.quantity end as stock,
           p.status, p.currency, pv.id as variant_id, pv.is_active as variant_active
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      left join public.product_variants pv
        on pv.id = ci.product_variant_id and pv.product_id = p.id
     where ci.user_id = v_user
     order by ci.product_id, ci.product_variant_id nulls first
     for update of p, pv
  loop
    if v_item.status <> 'active'
       or (v_item.product_variant_id is not null and (v_item.variant_id is null or coalesce(v_item.variant_active,false) = false)) then
      raise exception 'product_unavailable';
    end if;
    if v_item.quantity < 1 then raise exception 'invalid_quantity'; end if;
    if coalesce(v_item.stock,0) < v_item.quantity then raise exception 'insufficient_stock'; end if;
    v_currency := coalesce(v_item.currency, v_currency);
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;

  v_quote := public.marketplace_quote_shipping(_destination_country_code, _service_level, _incoterm);
  v_shipping := coalesce((v_quote->>'shipping_charge')::numeric,0);
  v_total := round((v_subtotal + v_shipping)::numeric,2);

  if abs(v_subtotal - coalesce((v_quote->>'cart_value')::numeric, v_subtotal)) > 0.01 then
    raise exception 'quote_cart_changed';
  end if;

  if _payment_method = 'wallet' then
    select balance into v_balance from public.wallets where user_id = v_user for update;
    if v_balance is null or v_balance < v_total then raise exception 'insufficient_balance'; end if;
  end if;

  v_payment_status := case when _payment_method = 'wallet' then 'paid' else 'pending' end;
  v_receipt := case when v_payment_status = 'paid' then public.marketplace_generate_receipt_number() else null end;
  v_address := _shipping_address || jsonb_build_object(
    'fulfillment_type','international_delivery',
    'country_code', upper(trim(_destination_country_code)),
    'logistics', v_quote
  );

  insert into public.orders (
    order_number,buyer_id,seller_id,status,payment_status,payment_method,
    subtotal,shipping_cost,total,currency,shipping_address,notes,receipt_number,paid_at
  ) values (
    public.marketplace_generate_order_number(),v_user,v_seller_id,'pending',v_payment_status,_payment_method,
    v_subtotal,v_shipping,v_total,v_currency,v_address,_notes,v_receipt,
    case when v_payment_status='paid' then now() else null end
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id,product_id,product_variant_id,variant_options,title,quantity,price,total
  )
  select v_order_id,p.id,ci.product_variant_id,coalesce(pv.options,'{}'::jsonb),
         p.title,ci.quantity,coalesce(pv.price,p.price),coalesce(pv.price,p.price)*ci.quantity
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    left join public.product_variants pv on pv.id=ci.product_variant_id and pv.product_id=p.id
   where ci.user_id=v_user;

  update public.product_variants pv
     set quantity=greatest(pv.quantity-ci.quantity,0),updated_at=now()
    from public.cart_items ci
   where ci.product_variant_id=pv.id and ci.user_id=v_user;

  update public.products p
     set quantity=p.quantity-ci.quantity,
         status=case when (p.quantity-ci.quantity)<=0 then 'sold' else p.status end
    from public.cart_items ci
   where ci.product_id=p.id and ci.product_variant_id is null and ci.user_id=v_user;

  if v_payment_status='paid' then
    update public.wallets set balance=balance-v_total,updated_at=now()
     where user_id=v_user returning balance into v_balance;

    insert into public.marketplace_payments (
      user_id,order_id,direction,amount,currency,method,status,receipt_number,balance_after,metadata
    ) values (
      v_user,v_order_id,'debit',v_total,v_currency,_payment_method,'succeeded',v_receipt,v_balance,
      jsonb_build_object('seller_id',v_seller_id,'fulfillment_type','international_delivery','quote_id',v_quote->>'quote_id')
    );
  end if;

  update public.sellers set total_sales=coalesce(total_sales,0)+1 where id=v_seller_id;
  delete from public.cart_items where user_id=v_user;

  return jsonb_build_object(
    'success',true,
    'order_ids',jsonb_build_array(v_order_id),
    'payment_status',v_payment_status,
    'total',v_total,
    'currency',v_currency,
    'quote',v_quote,
    'fulfillment_type','international_delivery'
  );
end;
$$;

revoke all on function public.process_marketplace_international_order(jsonb,text,text,text,text,text) from public;
grant execute on function public.process_marketplace_international_order(jsonb,text,text,text,text,text) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260908160500_marketplace_auto_seed_international_shipment.sql
-- SHA256 770c2f818e90b2b2f38bd98ab538aa16f5f51bc3d76628621efcfa6c1767cc9c
-- ============================================================================
-- Automatically seed the physical shipment layer for an international order.
-- The checkout RPC stores its trusted quote snapshot inside shipping_address.logistics;
-- this trigger turns that snapshot into a trackable shipment immediately.

create or replace function public.marketplace_seed_international_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logistics jsonb;
  v_origin text;
  v_destination text;
  v_mode text;
  v_service text;
  v_incoterm text;
  v_carrier_id uuid;
  v_shipment_id uuid;
  v_eta_days integer;
  v_eta timestamptz;
  v_duty numeric(18,2);
  v_vat numeric(18,2);
  v_handling numeric(18,2);
begin
  if coalesce(new.shipping_address->>'fulfillment_type','') <> 'international_delivery' then
    return new;
  end if;

  if exists (select 1 from public.shipments where order_id = new.id) then
    return new;
  end if;

  v_logistics := coalesce(new.shipping_address->'logistics','{}'::jsonb);
  v_origin := upper(nullif(trim(v_logistics->>'origin_country_code'),''));
  v_destination := upper(coalesce(
    nullif(trim(v_logistics->>'destination_country_code'),''),
    nullif(trim(new.shipping_address->>'country_code'),'')
  ));
  v_mode := lower(coalesce(nullif(trim(v_logistics->>'transport_mode'),''),'multimodal'));
  -- Quote code may use the semantic name `road`; the physical shipment schema
  -- consistently calls that leg `truck`.
  if v_mode = 'road' then v_mode := 'truck'; end if;
  if v_mode not in ('courier','truck','air','sea','rail','multimodal','pickup') then
    v_mode := 'multimodal';
  end if;
  v_service := lower(coalesce(nullif(trim(v_logistics->>'service_level'),''),'standard'));
  v_incoterm := upper(coalesce(nullif(trim(v_logistics->>'incoterm'),''),'DAP'));
  if v_incoterm not in ('DAP','DDP') then v_incoterm := 'DAP'; end if;
  v_eta_days := greatest(coalesce((v_logistics->>'eta_days_max')::integer, 7), 1);
  v_eta := now() + make_interval(days => v_eta_days);
  v_duty := greatest(coalesce((v_logistics->>'estimated_duty')::numeric,0),0);
  v_vat := greatest(coalesce((v_logistics->>'estimated_vat')::numeric,0),0);
  v_handling := greatest(coalesce((v_logistics->>'customs_handling')::numeric,0),0);

  select id into v_carrier_id
    from public.marketplace_carriers
   where code='ALSAMOS' and is_active=true
   limit 1;

  insert into public.shipments (
    order_id,seller_id,buyer_id,carrier_id,carrier_name,service_level,
    transport_mode,status,origin_country,destination_country,current_country,
    incoterm,duties_payer,declared_value,currency,customs_status,
    estimated_delivery_at,metadata
  ) values (
    new.id,new.seller_id,new.buyer_id,v_carrier_id,'Alsamos Logistics',v_service,
    v_mode,'booked',v_origin,v_destination,v_origin,
    v_incoterm,case when v_incoterm='DDP' then 'included' else 'buyer' end,
    greatest(coalesce(new.subtotal,0),0),coalesce(new.currency,'USD'),
    case when v_origin is not null and v_destination is not null and v_origin<>v_destination then 'documents_required' else 'not_required' end,
    v_eta,
    jsonb_build_object(
      'quote_id',v_logistics->>'quote_id',
      'rate_source',v_logistics->>'rate_source',
      'estimate_only',coalesce((v_logistics->>'estimate_only')::boolean,true),
      'shipping_charge',new.shipping_cost,
      'estimated_import_charges',coalesce((v_logistics->>'estimated_import_charges')::numeric,0)
    )
  ) returning id into v_shipment_id;

  insert into public.shipment_legs (
    shipment_id,position,mode,carrier_name,origin_country,destination_country,status,estimated_arrival_at,metadata
  ) values (
    v_shipment_id,0,v_mode,'Alsamos Logistics',v_origin,v_destination,'booked',v_eta,
    jsonb_build_object('service_level',v_service,'quote_id',v_logistics->>'quote_id')
  );

  insert into public.shipment_events (
    shipment_id,status,event_code,title,description,country_code,occurred_at,is_public,metadata
  ) values (
    v_shipment_id,'booked','international_order_created','Xalqaro yetkazma yaratildi',
    'Buyurtma uchun logistika yo‘nalishi bron qilindi. Sotuvchi yukni tashuvchiga tayyorlaydi.',
    v_origin,now(),true,jsonb_build_object('service_level',v_service,'transport_mode',v_mode)
  );

  if v_origin is not null and v_destination is not null and v_origin<>v_destination then
    insert into public.customs_declarations (
      shipment_id,origin_country,destination_country,declared_value,currency,incoterm,
      duty_amount,tax_amount,fees_amount,payment_status,clearance_status,notes
    ) values (
      v_shipment_id,v_origin,v_destination,greatest(coalesce(new.subtotal,0),0),coalesce(new.currency,'USD'),v_incoterm,
      v_duty,v_vat,v_handling,'estimated','draft',
      'Alsamos quote asosidagi taxmin. Yakuniy boj/VAT HS code va bojxona qaroriga bog‘liq.'
    )
    on conflict (shipment_id) do nothing;
  end if;

  return new;
exception
  when others then
    -- Commerce order creation must not be lost because a logistics projection
    -- failed. The seller can still create/rebuild the shipment from Shipment Center.
    return new;
end;
$$;

drop trigger if exists marketplace_seed_international_shipment_trigger on public.orders;
create trigger marketplace_seed_international_shipment_trigger
after insert on public.orders
for each row
execute function public.marketplace_seed_international_shipment();


-- ============================================================================
-- SOURCE B-web: 20260909155500_reconcile_post_like_counts.sql
-- SHA256 f54d52f20c39079803a500e4df038dcb39aa98019bb3a2dd6986f9e95ad99c29
-- ============================================================================
-- Keep posts.likes_count as a denormalized cache of the canonical post_likes rows.
-- The original schema created both tables but no trigger connecting them, so the
-- counter could drift indefinitely from the real liker rows.

CREATE OR REPLACE FUNCTION public.reconcile_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_id uuid;
BEGIN
  -- If a like is ever moved between posts, reconcile the old post as well.
  IF TG_OP = 'UPDATE' AND OLD.post_id IS DISTINCT FROM NEW.post_id THEN
    UPDATE public.posts AS p
    SET likes_count = (
      SELECT COUNT(*)::integer
      FROM public.post_likes AS pl
      WHERE pl.post_id = OLD.post_id
    )
    WHERE p.id = OLD.post_id;
  END IF;

  target_post_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;

  UPDATE public.posts AS p
  SET likes_count = (
    SELECT COUNT(*)::integer
    FROM public.post_likes AS pl
    WHERE pl.post_id = target_post_id
  )
  WHERE p.id = target_post_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS zzz_reconcile_post_likes_count ON public.post_likes;

-- The zzz prefix deliberately places this reconciliation after ordinary
-- alphabetically ordered AFTER triggers, so the final cached value is exact.
CREATE TRIGGER zzz_reconcile_post_likes_count
AFTER INSERT OR DELETE OR UPDATE OF post_id
ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_post_likes_count();

-- Repair all historical drift in one idempotent backfill. post_likes already
-- has UNIQUE(post_id, user_id), whose index makes these per-post counts cheap.
UPDATE public.posts AS p
SET likes_count = (
  SELECT COUNT(*)::integer
  FROM public.post_likes AS pl
  WHERE pl.post_id = p.id
)
WHERE p.likes_count IS DISTINCT FROM (
  SELECT COUNT(*)::integer
  FROM public.post_likes AS pl
  WHERE pl.post_id = p.id
);


-- ============================================================================
-- SOURCE B-web: 20260911070000_marketplace_currency_uzs.sql
-- SHA256 d2420534f83dea32cab2634eda5913740ae26483ebf107063df4ad0b0dcb6905
-- ============================================================================
-- Alsamos Marketplace prices are denominated in Uzbek so'm (UZS).
-- Historical rows inherited the old USD default even though sellers entered
-- UZS amounts, which caused dollar signs to appear throughout the storefront.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN currency SET DEFAULT 'UZS';

    UPDATE public.products
    SET currency = 'UZS'
    WHERE currency IS DISTINCT FROM 'UZS';
  END IF;
END
$$;


-- ============================================================================
-- SOURCE B-web: 20260912093000_order_handoff_verification.sql
-- SHA256 108087a2b49ead19cd078362ba42cc78d5fb905ab83d514c0c5122c18f7a3778
-- ============================================================================
-- Secure one-time handoff verification for marketplace orders.
-- The code is generated server-side, displayed to the buyer as text/barcode,
-- and can only be consumed by the seller that owns the order.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handoff_code text,
  ADD COLUMN IF NOT EXISTS handoff_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_handoff_code_unique_idx
  ON public.orders (handoff_code)
  WHERE handoff_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.marketplace_generate_handoff_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    -- Eight uppercase hexadecimal characters are short enough for manual entry
    -- while remaining easy to encode in Code 128 for handheld scanners.
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.orders
      WHERE handoff_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

ALTER TABLE public.orders
  ALTER COLUMN handoff_code SET DEFAULT public.marketplace_generate_handoff_code();

-- Give currently active orders a code as well, so rollout does not leave an
-- in-flight order without a handoff credential.
UPDATE public.orders
SET handoff_code = public.marketplace_generate_handoff_code()
WHERE handoff_code IS NULL
  AND status IN ('pending', 'processing', 'shipped');

CREATE OR REPLACE FUNCTION public.marketplace_verify_order_handoff(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(_code, '')));
  v_order public.orders%ROWTYPE;
  v_lifecycle_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authenticated';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'marketplace_handoff:invalid_code';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.handoff_code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:code_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sellers s
    WHERE s.id = v_order.seller_id
      AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authorized';
  END IF;

  IF v_order.handoff_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  -- Handoff is only valid after the seller has marked the order ready/shipped.
  -- This keeps the existing marketplace lifecycle as the source of truth.
  IF v_order.status <> 'shipped' THEN
    RAISE EXCEPTION 'marketplace_handoff:not_ready';
  END IF;

  -- Reuse the existing guarded lifecycle RPC instead of bypassing payment,
  -- receipt, inventory, analytics, or other delivered-state side effects.
  SELECT public.marketplace_update_order_status(v_order.id, 'delivered', 'handoff_verified')
  INTO v_lifecycle_result;

  UPDATE public.orders
  SET handoff_verified_at = now(),
      handoff_verified_by = v_user_id
  WHERE id = v_order.id
    AND handoff_verified_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'delivered',
    'verified_at', now(),
    'lifecycle', coalesce(v_lifecycle_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_verify_order_handoff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_verify_order_handoff(text) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260912094500_require_handoff_scan_for_delivery.sql
-- SHA256 8608612787e35b3dfd9ce0c5bad5cb4104ee19fde8188328ab56eaf63ce1f4f9
-- ============================================================================
-- Enforce the handoff code at the database boundary.
-- Any normal attempt to move an order into `delivered` is rejected unless it
-- is happening inside marketplace_verify_order_handoff for that exact order.

CREATE OR REPLACE FUNCTION public.marketplace_require_handoff_for_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_verified_order_id text := current_setting('app.marketplace_handoff_order_id', true);
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status IS DISTINCT FROM 'delivered'
     AND OLD.handoff_code IS NOT NULL
     AND OLD.handoff_verified_at IS NULL
     AND v_verified_order_id IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'marketplace_handoff:verification_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_handoff_for_delivery ON public.orders;
CREATE TRIGGER orders_require_handoff_for_delivery
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.marketplace_require_handoff_for_delivery();

CREATE OR REPLACE FUNCTION public.marketplace_verify_order_handoff(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(_code, '')));
  v_order public.orders%ROWTYPE;
  v_lifecycle_result jsonb;
  v_verified_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authenticated';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'marketplace_handoff:invalid_code';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.handoff_code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:code_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sellers s
    WHERE s.id = v_order.seller_id
      AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'marketplace_handoff:not_authorized';
  END IF;

  IF v_order.handoff_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  IF v_order.status <> 'shipped' THEN
    RAISE EXCEPTION 'marketplace_handoff:not_ready';
  END IF;

  -- The trigger only accepts delivered for the exact order currently being
  -- verified. The setting is transaction-local and disappears automatically.
  PERFORM set_config('app.marketplace_handoff_order_id', v_order.id::text, true);

  SELECT public.marketplace_update_order_status(v_order.id, 'delivered', 'handoff_verified')
  INTO v_lifecycle_result;

  v_verified_at := now();

  UPDATE public.orders
  SET handoff_verified_at = v_verified_at,
      handoff_verified_by = v_user_id
  WHERE id = v_order.id
    AND handoff_verified_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace_handoff:already_verified';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'delivered',
    'verified_at', v_verified_at,
    'lifecycle', coalesce(v_lifecycle_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_verify_order_handoff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_verify_order_handoff(text) TO authenticated;


-- ============================================================================
-- SOURCE B-web: 20260913062000_first_party_auth_password_verifier.sql
-- SHA256 b1e7b76851c3d5d771c4c67f2c92f40666715adfc824f298d240552a494c4c8e
-- ============================================================================
-- Alsamos @alsamos.com addresses are an internal identity namespace, not
-- deliverable mailboxes. This helper lets the trusted account-signup Edge
-- Function repair a user that was accidentally created while Supabase's
-- Confirm Email setting was enabled.
--
-- SECURITY: the function is deliberately service_role-only. It never returns
-- password material; it returns the user id only when the supplied password
-- matches auth.users.encrypted_password.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.verify_alsamos_identity_password(
  _email text,
  _password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email text := lower(trim(coalesce(_email, '')));
  v_user_id uuid;
  v_hash text;
BEGIN
  IF v_email !~ '^[a-z0-9._%+\-]{1,64}@alsamos\.com$'
     OR v_email LIKE '%@accounts.alsamos.com'
     OR coalesce(_password, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id, u.encrypted_password
    INTO v_user_id, v_hash
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL OR coalesce(v_hash, '') = '' THEN
    RETURN NULL;
  END IF;

  IF v_hash = crypt(_password, v_hash) THEN
    RETURN v_user_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_alsamos_identity_password(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_alsamos_identity_password(text, text) TO service_role;

COMMENT ON FUNCTION public.verify_alsamos_identity_password(text, text) IS
  'Server-only ownership proof for @alsamos.com identities accidentally left unconfirmed. Never expose to browser roles.';


-- ============================================================================
-- SOURCE B-web: 20260913090000_backfill_existing_auth_profiles.sql
-- SHA256 a3c59b7fccaa6ea0fb5d900b78505e4d9b68312bda367fcdd487b73f1498e28b
-- ============================================================================
-- Users may have been created in Supabase Auth before the Alsamos public schema
-- was restored. The auth.users -> public.profiles trigger only runs for future
-- inserts, so backfill any already-existing Auth users after profiles exists.
--
-- Username is intentionally left NULL for backfilled rows to avoid colliding
-- with an existing unique username. The normal profile/onboarding flow can set
-- it later. public.profiles.id is the critical FK used by posts/messages/etc.

INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'display_name', ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Foydalanuvchi'
  ) AS display_name,
  NULLIF(u.raw_user_meta_data ->> 'avatar_url', '') AS avatar_url
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: _combined_phase1_3_idempotent.sql
-- SHA256 b4ac5e87548fa3c5d7e21f89333b6a795acf279df362241c446b6233307de30d
-- ============================================================================
BEGIN;

-- Phase 1: read receipt upsert policies.
CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can mark as read" ON public.message_reads;
DROP POLICY IF EXISTS "Users can update own read receipts" ON public.message_reads;

CREATE POLICY "Users can mark as read" ON public.message_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own read receipts" ON public.message_reads
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );

-- Phase 1: client-side message id dedup.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_message_id_idx
  ON public.messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Phase 2: message interactions.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_name text,
  ADD COLUMN IF NOT EXISTS is_silent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_messages_forwarded_from_message_id
  ON public.messages(forwarded_from_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at
  ON public.messages(conversation_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_messages_updated_at
  ON public.messages(conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
  ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id
  ON public.message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_updated_at
  ON public.message_reactions(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.message_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  editor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_content text,
  new_content text,
  edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_edit_history_message_id
  ON public.message_edit_history(message_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_edit_history_conversation_id
  ON public.message_edit_history(conversation_id, edited_at DESC);

ALTER TABLE public.message_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view edit history" ON public.message_edit_history;
CREATE POLICY "Participants can view edit history"
  ON public.message_edit_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = message_edit_history.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Message sender can write edit history" ON public.message_edit_history;
CREATE POLICY "Message sender can write edit history"
  ON public.message_edit_history FOR INSERT
  WITH CHECK (
    editor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_edit_history.message_id
        AND m.sender_id = auth.uid()
        AND m.conversation_id = message_edit_history.conversation_id
    )
  );

CREATE TABLE IF NOT EXISTS public.message_drafts (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_drafts_user_updated
  ON public.message_drafts(user_id, updated_at DESC);

ALTER TABLE public.message_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own drafts" ON public.message_drafts;
CREATE POLICY "Users can read own drafts"
  ON public.message_drafts FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can upsert own drafts in joined conversations" ON public.message_drafts;
CREATE POLICY "Users can upsert own drafts in joined conversations"
  ON public.message_drafts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = message_drafts.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own drafts" ON public.message_drafts;
CREATE POLICY "Users can update own drafts"
  ON public.message_drafts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.link_previews (
  url text PRIMARY KEY,
  title text,
  description text,
  image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_previews_updated_at
  ON public.link_previews(updated_at DESC);

ALTER TABLE public.link_previews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read link previews" ON public.link_previews;
CREATE POLICY "Authenticated users can read link previews"
  ON public.link_previews FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can cache link previews" ON public.link_previews;
CREATE POLICY "Authenticated users can cache link previews"
  ON public.link_previews FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can refresh link previews" ON public.link_previews;
CREATE POLICY "Authenticated users can refresh link previews"
  ON public.link_previews FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_silent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_time
  ON public.scheduled_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sender_time
  ON public.scheduled_messages(sender_id, scheduled_for);

DROP POLICY IF EXISTS "Participants can update message tombstones" ON public.messages;
CREATE POLICY "Participants can update message tombstones"
  ON public.messages FOR UPDATE
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- Phase 3: realtime presence and read-state.
CREATE TABLE IF NOT EXISTS public.user_privacy_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN ('allow', 'deny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_privacy_exceptions_user_target
  ON public.user_privacy_exceptions(user_id, target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_privacy_exceptions_target
  ON public.user_privacy_exceptions(target_user_id);

ALTER TABLE public.user_privacy_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own privacy exceptions" ON public.user_privacy_exceptions;
CREATE POLICY "Users manage own privacy exceptions"
  ON public.user_privacy_exceptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_message_reads_message_read_at
  ON public.message_reads(message_id, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_read_at
  ON public.message_reads(user_id, read_at DESC);

DROP POLICY IF EXISTS "Users can mark as read" ON public.message_reads;
CREATE POLICY "Users can mark as read"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND coalesce((
      SELECT us.read_receipts_enabled
      FROM public.user_settings us
      WHERE us.user_id = auth.uid()
    ), true)
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own read receipts" ON public.message_reads;
CREATE POLICY "Users can update own read receipts"
  ON public.message_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND coalesce((
      SELECT us.read_receipts_enabled
      FROM public.user_settings us
      WHERE us.user_id = auth.uid()
    ), true)
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.are_contacts(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.follows f1
    JOIN public.follows f2
      ON f2.follower_id = b AND f2.following_id = a
    WHERE f1.follower_id = a AND f1.following_id = b
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_presence(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer uuid := auth.uid();
  visibility text;
  exception_rule text;
BEGIN
  IF viewer IS NULL THEN
    RETURN false;
  END IF;
  IF viewer = target_user_id THEN
    RETURN true;
  END IF;

  SELECT rule INTO exception_rule
  FROM public.user_privacy_exceptions
  WHERE user_id = target_user_id AND target_user_id = viewer
  LIMIT 1;

  IF exception_rule = 'allow' THEN
    RETURN true;
  ELSIF exception_rule = 'deny' THEN
    RETURN false;
  END IF;

  SELECT coalesce(last_seen_visibility, 'everyone') INTO visibility
  FROM public.user_settings
  WHERE user_id = target_user_id;

  visibility := coalesce(visibility, 'everyone');

  IF visibility = 'everyone' THEN
    RETURN true;
  ELSIF visibility = 'contacts' THEN
    RETURN public.are_contacts(target_user_id, viewer);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_visible_presence(target_user_id uuid)
RETURNS TABLE(user_id uuid, is_online boolean, last_seen timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    CASE WHEN public.can_view_presence(target_user_id) THEN coalesce(p.is_online, false) ELSE false END AS is_online,
    CASE WHEN public.can_view_presence(target_user_id) THEN p.last_seen ELSE null END AS last_seen
  FROM public.profiles p
  WHERE p.id = target_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.are_contacts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_presence(uuid) TO authenticated;

DO $$
DECLARE
  table_names text[] := ARRAY[
    'message_reactions',
    'message_edit_history',
    'message_drafts',
    'message_reads',
    'typing_indicators',
    'profiles'
  ];
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY table_names LOOP
      IF to_regclass(format('public.%I', table_name)) IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = table_name
         ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

