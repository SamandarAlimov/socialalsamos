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
