-- International Logistics v1 for Alsamos Marketplace.
-- Separates commerce order state from physical shipment state so one order can
-- move through truck/air/sea/rail legs, export/import customs and last-mile delivery.

begin;

create table if not exists public.marketplace_carriers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  modes text[] not null default '{}'::text[],
  tracking_url_template text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_carriers (code, name, modes, is_active)
values (
  'ALSAMOS',
  'Alsamos Logistics',
  array['courier','truck','air','sea','rail','multimodal']::text[],
  true
)
on conflict (code) do update
set name = excluded.name,
    modes = excluded.modes,
    is_active = true,
    updated_at = now();

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_id uuid not null,
  carrier_id uuid references public.marketplace_carriers(id) on delete set null,
  carrier_name text,
  service_level text not null default 'standard',
  transport_mode text not null default 'multimodal'
    check (transport_mode in ('courier','truck','air','sea','rail','multimodal','pickup')),
  tracking_number text,
  status text not null default 'draft'
    check (status in (
      'draft','booked','handed_over','customs_export','in_transit','customs_import',
      'customs_hold','out_for_delivery','delivered','exception','cancelled'
    )),
  origin_country text,
  destination_country text,
  current_country text,
  current_location text,
  incoterm text not null default 'DAP' check (incoterm in ('DDP','DAP')),
  duties_payer text not null default 'buyer' check (duties_payer in ('buyer','seller','included')),
  declared_value numeric(18,2) not null default 0 check (declared_value >= 0),
  currency text not null default 'USD',
  customs_status text not null default 'not_required'
    check (customs_status in (
      'not_required','documents_required','export_review','export_cleared',
      'import_review','payment_required','hold','cleared','rejected'
    )),
  estimated_departure_at timestamptz,
  estimated_delivery_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipments_order_id_idx on public.shipments(order_id, created_at desc);
create index if not exists shipments_buyer_id_idx on public.shipments(buyer_id, created_at desc);
create index if not exists shipments_seller_id_idx on public.shipments(seller_id, created_at desc);
create index if not exists shipments_tracking_idx on public.shipments(tracking_number) where tracking_number is not null;

create table if not exists public.shipment_legs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  mode text not null check (mode in ('courier','truck','air','sea','rail','multimodal','pickup')),
  carrier_name text,
  tracking_number text,
  origin_name text,
  origin_country text,
  destination_name text,
  destination_country text,
  status text not null default 'planned'
    check (status in ('planned','booked','in_progress','completed','exception','cancelled')),
  estimated_departure_at timestamptz,
  estimated_arrival_at timestamptz,
  departed_at timestamptz,
  arrived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, position)
);

create index if not exists shipment_legs_shipment_idx on public.shipment_legs(shipment_id, position);

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  leg_id uuid references public.shipment_legs(id) on delete set null,
  status text not null,
  event_code text not null,
  title text not null,
  description text,
  location text,
  country_code text,
  occurred_at timestamptz not null default now(),
  is_public boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shipment_events_shipment_idx on public.shipment_events(shipment_id, occurred_at desc);

create table if not exists public.customs_declarations (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments(id) on delete cascade,
  hs_code text,
  origin_country text,
  destination_country text,
  declared_value numeric(18,2) not null default 0 check (declared_value >= 0),
  currency text not null default 'USD',
  invoice_number text,
  incoterm text not null default 'DAP' check (incoterm in ('DDP','DAP')),
  items jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  duty_amount numeric(18,2) not null default 0 check (duty_amount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  fees_amount numeric(18,2) not null default 0 check (fees_amount >= 0),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','estimated','required','paid','waived')),
  clearance_status text not null default 'draft'
    check (clearance_status in ('draft','submitted','review','hold','payment_required','cleared','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_carriers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_legs enable row level security;
alter table public.shipment_events enable row level security;
alter table public.customs_declarations enable row level security;

drop policy if exists marketplace_carriers_read on public.marketplace_carriers;
create policy marketplace_carriers_read
on public.marketplace_carriers for select
using (is_active = true);

drop policy if exists shipments_party_read on public.shipments;
create policy shipments_party_read
on public.shipments for select
to authenticated
using (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipments_seller_insert on public.shipments;
create policy shipments_seller_insert
on public.shipments for insert
to authenticated
with check (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipments_seller_update on public.shipments;
create policy shipments_seller_update
on public.shipments for update
to authenticated
using (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sellers s
    where s.id = shipments.seller_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipment_legs_party_read on public.shipment_legs;
create policy shipment_legs_party_read
on public.shipment_legs for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = shipment_legs.shipment_id
      and (
        sh.buyer_id = auth.uid()
        or exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
      )
  )
);

drop policy if exists shipment_legs_seller_write on public.shipment_legs;
create policy shipment_legs_seller_write
on public.shipment_legs for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_legs.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_legs.shipment_id and s.user_id = auth.uid()
  )
);

drop policy if exists shipment_events_party_read on public.shipment_events;
create policy shipment_events_party_read
on public.shipment_events for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = shipment_events.shipment_id
      and (
        exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
        or (sh.buyer_id = auth.uid() and shipment_events.is_public = true)
      )
  )
);

drop policy if exists shipment_events_seller_write on public.shipment_events;
create policy shipment_events_seller_write
on public.shipment_events for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_events.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = shipment_events.shipment_id and s.user_id = auth.uid()
  )
);

drop policy if exists customs_party_read on public.customs_declarations;
create policy customs_party_read
on public.customs_declarations for select
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    where sh.id = customs_declarations.shipment_id
      and (
        sh.buyer_id = auth.uid()
        or exists (select 1 from public.sellers s where s.id = sh.seller_id and s.user_id = auth.uid())
      )
  )
);

drop policy if exists customs_seller_write on public.customs_declarations;
create policy customs_seller_write
on public.customs_declarations for all
to authenticated
using (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = customs_declarations.shipment_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shipments sh
    join public.sellers s on s.id = sh.seller_id
    where sh.id = customs_declarations.shipment_id and s.user_id = auth.uid()
  )
);

create or replace function public.marketplace_create_shipment(
  _order_id uuid,
  _transport_mode text default 'multimodal',
  _service_level text default 'standard',
  _carrier_name text default 'Alsamos Logistics',
  _tracking_number text default null,
  _origin_country text default null,
  _destination_country text default null,
  _incoterm text default 'DAP',
  _estimated_delivery_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.orders%rowtype;
  _seller_user uuid;
  _shipment_id uuid;
  _carrier_id uuid;
  _mode text := lower(coalesce(nullif(trim(_transport_mode), ''), 'multimodal'));
  _term text := upper(coalesce(nullif(trim(_incoterm), ''), 'DAP'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into _order from public.orders where id = _order_id;
  if not found then raise exception 'order_not_found'; end if;

  select user_id into _seller_user from public.sellers where id = _order.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;
  if _order.status in ('cancelled','delivered') then raise exception 'order_finalized'; end if;
  if _mode not in ('courier','truck','air','sea','rail','multimodal','pickup') then raise exception 'invalid_transport_mode'; end if;
  if _term not in ('DDP','DAP') then raise exception 'invalid_incoterm'; end if;

  select id into _carrier_id from public.marketplace_carriers where code = 'ALSAMOS' limit 1;

  insert into public.shipments (
    order_id, seller_id, buyer_id, carrier_id, carrier_name, service_level,
    transport_mode, tracking_number, status, origin_country, destination_country,
    incoterm, duties_payer, declared_value, currency, customs_status,
    estimated_delivery_at
  ) values (
    _order.id,
    _order.seller_id,
    _order.buyer_id,
    _carrier_id,
    coalesce(nullif(trim(_carrier_name), ''), 'Alsamos Logistics'),
    coalesce(nullif(trim(_service_level), ''), 'standard'),
    _mode,
    nullif(trim(_tracking_number), ''),
    'booked',
    upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')),
    _term,
    case when _term = 'DDP' then 'included' else 'buyer' end,
    greatest(coalesce(_order.total, 0), 0),
    coalesce(_order.currency, 'USD'),
    case
      when nullif(trim(_origin_country), '') is not null
       and nullif(trim(_destination_country), '') is not null
       and upper(trim(_origin_country)) <> upper(trim(_destination_country))
      then 'documents_required'
      else 'not_required'
    end,
    _estimated_delivery_at
  ) returning id into _shipment_id;

  insert into public.shipment_legs (
    shipment_id, position, mode, carrier_name, tracking_number,
    origin_country, destination_country, status, estimated_arrival_at
  ) values (
    _shipment_id, 0, _mode, coalesce(nullif(trim(_carrier_name), ''), 'Alsamos Logistics'),
    nullif(trim(_tracking_number), ''), upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')), 'booked', _estimated_delivery_at
  );

  insert into public.shipment_events (
    shipment_id, status, event_code, title, description, country_code, occurred_at
  ) values (
    _shipment_id, 'booked', 'shipment_booked', 'Yetkazma yaratildi',
    'Sotuvchi transport va yo‘nalishni tayyorladi.', upper(nullif(trim(_origin_country), '')), now()
  );

  return jsonb_build_object('success', true, 'shipment_id', _shipment_id);
end;
$$;

create or replace function public.marketplace_add_shipment_event(
  _shipment_id uuid,
  _status text,
  _event_code text,
  _title text,
  _description text default null,
  _location text default null,
  _country_code text default null,
  _occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _shipment public.shipments%rowtype;
  _seller_user uuid;
  _next_status text := lower(trim(_status));
  _order_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into _shipment from public.shipments where id = _shipment_id;
  if not found then raise exception 'shipment_not_found'; end if;
  select user_id into _seller_user from public.sellers where id = _shipment.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;

  if _next_status not in (
    'draft','booked','handed_over','customs_export','in_transit','customs_import',
    'customs_hold','out_for_delivery','delivered','exception','cancelled'
  ) then raise exception 'invalid_shipment_status'; end if;

  update public.shipments
  set status = _next_status,
      current_location = coalesce(nullif(trim(_location), ''), current_location),
      current_country = coalesce(upper(nullif(trim(_country_code), '')), current_country),
      customs_status = case
        when _next_status = 'customs_export' then 'export_review'
        when _next_status = 'customs_import' then 'import_review'
        when _next_status = 'customs_hold' then 'hold'
        when _next_status = 'out_for_delivery' and customs_status in ('import_review','payment_required','hold') then 'cleared'
        else customs_status
      end,
      shipped_at = case when _next_status = 'handed_over' then coalesce(shipped_at, _occurred_at) else shipped_at end,
      delivered_at = case when _next_status = 'delivered' then coalesce(delivered_at, _occurred_at) else delivered_at end,
      updated_at = now()
  where id = _shipment_id;

  insert into public.shipment_events (
    shipment_id, status, event_code, title, description, location, country_code, occurred_at
  ) values (
    _shipment_id, _next_status, coalesce(nullif(trim(_event_code), ''), _next_status),
    coalesce(nullif(trim(_title), ''), _next_status), nullif(trim(_description), ''),
    nullif(trim(_location), ''), upper(nullif(trim(_country_code), '')), coalesce(_occurred_at, now())
  );

  select status into _order_status from public.orders where id = _shipment.order_id;
  if _next_status in ('handed_over','customs_export','in_transit','customs_import','customs_hold','out_for_delivery')
     and _order_status = 'processing' then
    perform public.marketplace_update_order_status(_shipment.order_id, 'shipped', 'shipment_handed_over');
  elsif _next_status = 'delivered' and _order_status = 'shipped' then
    perform public.marketplace_update_order_status(_shipment.order_id, 'delivered', 'shipment_delivered');
  end if;

  return jsonb_build_object('success', true, 'shipment_id', _shipment_id, 'status', _next_status);
end;
$$;

create or replace function public.marketplace_upsert_customs_declaration(
  _shipment_id uuid,
  _hs_code text default null,
  _origin_country text default null,
  _destination_country text default null,
  _declared_value numeric default 0,
  _currency text default 'USD',
  _invoice_number text default null,
  _incoterm text default 'DAP',
  _duty_amount numeric default 0,
  _tax_amount numeric default 0,
  _fees_amount numeric default 0,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _shipment public.shipments%rowtype;
  _seller_user uuid;
  _declaration_id uuid;
  _term text := upper(coalesce(nullif(trim(_incoterm), ''), 'DAP'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into _shipment from public.shipments where id = _shipment_id;
  if not found then raise exception 'shipment_not_found'; end if;
  select user_id into _seller_user from public.sellers where id = _shipment.seller_id;
  if _seller_user is distinct from auth.uid() then raise exception 'seller_only'; end if;
  if _term not in ('DDP','DAP') then raise exception 'invalid_incoterm'; end if;

  insert into public.customs_declarations (
    shipment_id, hs_code, origin_country, destination_country, declared_value,
    currency, invoice_number, incoterm, duty_amount, tax_amount, fees_amount,
    payment_status, clearance_status, notes
  ) values (
    _shipment_id, nullif(trim(_hs_code), ''), upper(nullif(trim(_origin_country), '')),
    upper(nullif(trim(_destination_country), '')), greatest(coalesce(_declared_value, 0), 0),
    coalesce(nullif(trim(_currency), ''), 'USD'), nullif(trim(_invoice_number), ''), _term,
    greatest(coalesce(_duty_amount, 0), 0), greatest(coalesce(_tax_amount, 0), 0),
    greatest(coalesce(_fees_amount, 0), 0),
    case when coalesce(_duty_amount, 0) + coalesce(_tax_amount, 0) + coalesce(_fees_amount, 0) > 0 then 'estimated' else 'not_required' end,
    'draft', nullif(trim(_notes), '')
  )
  on conflict (shipment_id) do update
  set hs_code = excluded.hs_code,
      origin_country = excluded.origin_country,
      destination_country = excluded.destination_country,
      declared_value = excluded.declared_value,
      currency = excluded.currency,
      invoice_number = excluded.invoice_number,
      incoterm = excluded.incoterm,
      duty_amount = excluded.duty_amount,
      tax_amount = excluded.tax_amount,
      fees_amount = excluded.fees_amount,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      updated_at = now()
  returning id into _declaration_id;

  update public.shipments
  set incoterm = _term,
      duties_payer = case when _term = 'DDP' then 'included' else 'buyer' end,
      customs_status = case when customs_status = 'not_required' then 'documents_required' else customs_status end,
      updated_at = now()
  where id = _shipment_id;

  return jsonb_build_object('success', true, 'declaration_id', _declaration_id);
end;
$$;

revoke all on function public.marketplace_create_shipment(uuid,text,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.marketplace_add_shipment_event(uuid,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.marketplace_upsert_customs_declaration(uuid,text,text,text,numeric,text,text,text,numeric,numeric,numeric,text) from public;

grant execute on function public.marketplace_create_shipment(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.marketplace_add_shipment_event(uuid,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.marketplace_upsert_customs_declaration(uuid,text,text,text,numeric,text,text,text,numeric,numeric,numeric,text) to authenticated;

grant select on public.marketplace_carriers to anon, authenticated;
grant select on public.shipments, public.shipment_legs, public.shipment_events, public.customs_declarations to authenticated;
grant insert, update, delete on public.shipments, public.shipment_legs, public.shipment_events, public.customs_declarations to authenticated;

commit;
