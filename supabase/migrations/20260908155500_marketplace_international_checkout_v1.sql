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
