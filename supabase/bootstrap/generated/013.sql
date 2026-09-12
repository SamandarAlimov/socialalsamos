-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260831010000_marketplace_product_variants.sql
-- SHA256 56c0f174c011215e279f4b42f00cbe9fd4c7c7013807be0f7d007da6017a7be8
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260831010500_first_party_global_search.sql
-- SHA256 ed3350891d8a3472cd4ca3f5184531f156494ff1ec9e20dd131f9ae63e7a4a79
-- ============================================================================
-- =============================================================================
-- Alsamos first-party Global Search
-- Own crawl/index/search stack. No Google/Bing/Yandex/Brave search APIs.
-- =============================================================================

create extension if not exists pg_trgm;

create table if not exists public.web_search_documents (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  canonical_url text,
  domain text not null,
  path text not null default '/',
  title text not null default '',
  description text not null default '',
  content_text text not null default '',
  language text,
  kind text not null default 'web'
    check (kind in ('web', 'wikipedia', 'news', 'image', 'video')),
  content_type text,
  thumbnail_url text,
  author text,
  published_at timestamptz,
  width integer,
  height integer,
  duration_seconds integer,
  status_code integer,
  content_hash text,
  crawl_depth integer not null default 0,
  rank_score real not null default 0,
  fetched_at timestamptz not null default now(),
  indexed_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(content_text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(domain, '')), 'B')
  ) stored
);

create index if not exists web_search_documents_fts_idx
  on public.web_search_documents using gin (search_vector);

create index if not exists web_search_documents_title_trgm_idx
  on public.web_search_documents using gin (title gin_trgm_ops);

create index if not exists web_search_documents_domain_trgm_idx
  on public.web_search_documents using gin (domain gin_trgm_ops);

create index if not exists web_search_documents_kind_idx
  on public.web_search_documents (kind, indexed_at desc);

create index if not exists web_search_documents_domain_idx
  on public.web_search_documents (domain, indexed_at desc);

create table if not exists public.web_crawl_queue (
  id bigint generated by default as identity primary key,
  url text not null unique,
  depth integer not null default 0,
  priority integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'blocked')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  discovered_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_crawl_queue_pick_idx
  on public.web_crawl_queue (status, next_attempt_at, priority desc, id)
  where status in ('pending', 'failed');

create table if not exists public.search_cache (
  cache_key text primary key,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists search_cache_created_at_idx
  on public.search_cache (created_at);

alter table public.web_search_documents enable row level security;
alter table public.web_crawl_queue enable row level security;
alter table public.search_cache enable row level security;

drop policy if exists web_search_documents_public_read on public.web_search_documents;
create policy web_search_documents_public_read
  on public.web_search_documents
  for select
  using (true);

-- Queue/cache are intentionally service-role only. No public RLS policies.

create or replace function public.search_web_index(
  p_query text,
  p_category text default 'all',
  p_limit integer default 20,
  p_offset integer default 0,
  p_locale text default 'uz'
)
returns table (
  id uuid,
  type text,
  title text,
  snippet text,
  url text,
  display_url text,
  thumbnail_url text,
  source text,
  published_at timestamptz,
  author text,
  width integer,
  height integer,
  duration_seconds integer,
  score real
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      greatest(1, least(coalesce(p_limit, 20), 50)) as lim,
      greatest(0, coalesce(p_offset, 0)) as off,
      case
        when p_category in ('all','web','wikipedia','news','images','videos') then p_category
        else 'all'
      end as cat
  ),
  ranked as (
    select
      d.*,
      (
        5.0 * ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', params.q)) +
        2.0 * similarity(lower(d.title), lower(params.q)) +
        0.8 * similarity(lower(d.domain), lower(params.q)) +
        coalesce(d.rank_score, 0) +
        case
          when d.published_at is not null and d.published_at > now() - interval '30 days' then 0.4
          when d.indexed_at > now() - interval '7 days' then 0.2
          else 0
        end
      )::real as computed_score
    from public.web_search_documents d
    cross join params
    where params.q is not null
      and (
        d.search_vector @@ websearch_to_tsquery('simple', params.q)
        or lower(d.title) % lower(params.q)
        or lower(d.domain) % lower(params.q)
      )
      and (
        params.cat = 'all'
        or (params.cat = 'images' and d.kind = 'image')
        or (params.cat = 'videos' and d.kind = 'video')
        or (params.cat = 'wikipedia' and d.kind = 'wikipedia')
        or (params.cat = 'news' and d.kind = 'news')
        or (params.cat = 'web' and d.kind in ('web','wikipedia','news'))
      )
      and (
        p_locale is null
        or p_locale = ''
        or d.language is null
        or d.language = p_locale
        or d.language = split_part(p_locale, '-', 1)
      )
  )
  select
    r.id,
    case
      when r.kind = 'image' then 'image'
      when r.kind = 'video' then 'video'
      else r.kind
    end as type,
    coalesce(nullif(r.title, ''), r.domain) as title,
    coalesce(
      nullif(r.description, ''),
      nullif(left(r.content_text, 420), ''),
      r.url
    ) as snippet,
    r.url,
    r.domain || case when r.path = '/' then '' else ' › ' || trim(both '/' from r.path) end as display_url,
    r.thumbnail_url,
    r.domain as source,
    r.published_at,
    r.author,
    r.width,
    r.height,
    r.duration_seconds,
    r.computed_score as score
  from ranked r
  cross join params
  order by r.computed_score desc, r.rank_score desc, r.indexed_at desc
  limit params.lim
  offset params.off;
$$;

revoke all on function public.search_web_index(text,text,integer,integer,text) from public;
grant execute on function public.search_web_index(text,text,integer,integer,text) to service_role;

create or replace function public.enqueue_web_url(
  p_url text,
  p_depth integer default 0,
  p_priority integer default 0,
  p_discovered_from text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_url is null or length(trim(p_url)) = 0 then
    return;
  end if;

  insert into public.web_crawl_queue (
    url, depth, priority, status, next_attempt_at, discovered_from, updated_at
  )
  values (
    trim(p_url),
    greatest(0, least(coalesce(p_depth, 0), 32)),
    coalesce(p_priority, 0),
    'pending',
    now(),
    p_discovered_from,
    now()
  )
  on conflict (url) do update
    set priority = greatest(public.web_crawl_queue.priority, excluded.priority),
        depth = least(public.web_crawl_queue.depth, excluded.depth),
        status = case
          when public.web_crawl_queue.status = 'blocked' then 'blocked'
          else 'pending'
        end,
        next_attempt_at = least(public.web_crawl_queue.next_attempt_at, now()),
        updated_at = now();
end;
$$;

revoke all on function public.enqueue_web_url(text,integer,integer,text) from public;
grant execute on function public.enqueue_web_url(text,integer,integer,text) to service_role;

-- Start from Alsamos itself. The crawler follows outbound links, so the graph
-- can grow without relying on another search engine's index.
select public.enqueue_web_url('https://www.alsamos.com/', 0, 100, null);


-- ============================================================================
-- SOURCE B-web: 20260831011000_marketplace_variant_lock_hardening.sql
-- SHA256 b5cadbb1699a68c2d70af3748aac49bbe321bbba9a314d2e59f8aaf310023f98
-- ============================================================================
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


-- ============================================================================
-- SOURCE B-web: 20260831012000_marketplace_variant_stock_final.sql
-- SHA256 9debedcaddfbea33ebb6c4d2442e7da964b6b81e646aa5632f8c7eb5e0ece2fc
-- ============================================================================
-- Final product-variant stock-sync hardening.
-- If the last variant is removed, the product must not fall back to a stale
-- aggregate quantity and become purchasable as a phantom base product.

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

  update public.products
     set quantity = case when v_has_variants then v_total else 0 end,
         status = case
           when status in ('draft', 'deleted') then status
           when not v_has_variants or v_total <= 0 then 'sold'
           else 'active'
         end,
         updated_at = now()
   where id = v_product_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


-- ============================================================================
-- SOURCE B-web: 20260831013000_marketplace_variant_stock_respect_inactive.sql
-- SHA256 fb49bdfaeacf57812661ab75b758e35a46de3a7394a1bc18ed6187f58b55cab0
-- ============================================================================
-- Respect a seller-paused listing in the variant stock trigger.
--
-- The previous version wrote:
--   status = case
--     when status in ('draft', 'deleted') then status
--     when not v_has_variants or v_total <= 0 then 'sold'
--     else 'active'
--   end
--
-- so an 'inactive' product was forced back to 'active' as soon as any active
-- variant had stock. Sellers could not hide an in-stock listing: the trigger
-- fires on every insert/update/delete of product_variants, so the pause was
-- undone by the seller's next stock edit.
--
-- 'inactive' is now protected exactly like 'draft' and 'deleted'. 'sold'
-- deliberately stays automatic so restocking puts a listing back on sale.

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

  update public.products
     set quantity = case when v_has_variants then v_total else 0 end,
         status = case
           -- Seller-controlled states are never overwritten by stock changes.
           when status in ('draft', 'deleted', 'inactive') then status
           when not v_has_variants or v_total <= 0 then 'sold'
           else 'active'
         end,
         updated_at = now()
   where id = v_product_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260831014000_wallet_topup_requests.sql
-- SHA256 2e1dd2ce6d38b68933057ec1ddf7c336bb6d9b1f6c85f4b0b96705fb00e7038e
-- ============================================================================
-- =====================================================================
-- Manual wallet top-up requests
-- ---------------------------------------------------------------------
-- `process_marketplace_order` debits `public.wallets`, but no code path in
-- either client ever credited it. Every wallet therefore sat at 0 forever and
-- the `wallet` payment method could not be used by anyone.
--
-- Uzbek PSPs (Payme / Click / Uzum) require a registered legal entity, which
-- is not available yet, so an automatic rail cannot be built. This migration
-- implements the manual rail instead:
--
--   buyer transfers money out of band
--     -> files a request with the transfer reference
--     -> an operator (service_role) approves it
--     -> wallet is credited and a `credit` ledger row is written
--
-- Money only ever moves inside `approve_wallet_topup`, under a row lock, and
-- only for a request that is still `pending`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The request queue
-- ---------------------------------------------------------------------
create table if not exists public.wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'USD',
  -- How the buyer sent the money. Not a payment provider integration.
  method text not null check (method in ('bank_transfer', 'p2p_card', 'cash_office')),
  -- Transfer id / last 4 digits / whatever lets the operator find the payment.
  reference text,
  proof_url text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  -- Set on approval; the ledger row that actually credited the wallet.
  payment_id uuid references public.marketplace_payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_topup_requests_user_idx
  on public.wallet_topup_requests (user_id, created_at desc);

-- Operator queue: only open requests matter, so keep the index small.
create index if not exists wallet_topup_requests_pending_idx
  on public.wallet_topup_requests (created_at)
  where status = 'pending';

alter table public.wallet_topup_requests enable row level security;

-- A user may read their own requests.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_select_own'
  ) then
    create policy wallet_topup_select_own on public.wallet_topup_requests
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- A user may file their own request, but only as `pending` and only unreviewed.
-- Without these checks a buyer could insert an already-approved row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_insert_own'
  ) then
    create policy wallet_topup_insert_own on public.wallet_topup_requests
      for insert with check (
        auth.uid() = user_id
        and status = 'pending'
        and reviewed_by is null
        and reviewed_at is null
        and payment_id is null
      );
  end if;
end $$;

-- A user may only walk their own pending request back to `cancelled`.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_topup_requests'
      and policyname = 'wallet_topup_cancel_own'
  ) then
    create policy wallet_topup_cancel_own on public.wallet_topup_requests
      for update using (auth.uid() = user_id and status = 'pending')
      with check (auth.uid() = user_id and status in ('pending', 'cancelled'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Filing a request
-- ---------------------------------------------------------------------
create or replace function public.request_wallet_topup(
  _amount numeric,
  _method text,
  _reference text default null,
  _proof_url text default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_currency text;
  v_open     integer;
  v_id       uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if _method is null or _method not in ('bank_transfer', 'p2p_card', 'cash_office') then
    raise exception 'invalid_topup_method';
  end if;

  -- First top-up also creates the wallet, so approval never has to.
  insert into public.wallets (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  select currency into v_currency from public.wallets where user_id = v_user;
  v_currency := coalesce(v_currency, 'USD');

  -- Keep the operator queue usable; an honest user never needs 3 open claims.
  select count(*) into v_open
    from public.wallet_topup_requests
   where user_id = v_user
     and status = 'pending';

  if v_open >= 3 then
    raise exception 'too_many_pending_topups';
  end if;

  insert into public.wallet_topup_requests (
    user_id, amount, currency, method, reference, proof_url, note
  ) values (
    v_user, _amount, v_currency, _method,
    nullif(btrim(coalesce(_reference, '')), ''),
    nullif(btrim(coalesce(_proof_url, '')), ''),
    nullif(btrim(coalesce(_note, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object(
    'success',    true,
    'request_id', v_id,
    'status',     'pending',
    'amount',     _amount,
    'currency',   v_currency
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Buyer-side cancellation
-- ---------------------------------------------------------------------
create or replace function public.cancel_wallet_topup(_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.wallet_topup_requests;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.user_id <> v_user then
    raise exception 'not_authorized';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  update public.wallet_topup_requests
     set status = 'cancelled',
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object('success', true, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Approval: the only place a wallet is ever credited
-- ---------------------------------------------------------------------
-- Locking the request first and requiring `pending` is what makes this safe to
-- retry: a second call sees `approved` and raises instead of crediting twice.
create or replace function public.approve_wallet_topup(
  _request_id uuid,
  _review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.wallet_topup_requests;
  v_balance  numeric(14,2);
  v_receipt  text;
  v_payment  uuid;
begin
  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_row.user_id, 0)
  on conflict (user_id) do nothing;

  -- Lock the wallet before reading, so a concurrent checkout cannot interleave.
  perform 1 from public.wallets where user_id = v_row.user_id for update;

  update public.wallets
     set balance = balance + v_row.amount,
         updated_at = now()
   where user_id = v_row.user_id
  returning balance into v_balance;

  v_receipt := public.marketplace_generate_receipt_number();

  insert into public.marketplace_payments (
    user_id, order_id, direction, amount, currency, method,
    status, receipt_number, balance_after, metadata
  ) values (
    v_row.user_id, null, 'credit', v_row.amount, v_row.currency,
    v_row.method, 'succeeded', v_receipt, v_balance,
    jsonb_build_object(
      'kind',       'wallet_topup',
      'request_id', v_row.id,
      'reference',  v_row.reference,
      'reviewed_by', auth.uid()
    )
  )
  returning id into v_payment;

  update public.wallet_topup_requests
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(_review_note, '')), ''),
         payment_id = v_payment,
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object(
    'success',        true,
    'status',         'approved',
    'user_id',        v_row.user_id,
    'amount',         v_row.amount,
    'currency',       v_row.currency,
    'balance_after',  v_balance,
    'receipt_number', v_receipt,
    'payment_id',     v_payment
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Rejection
-- ---------------------------------------------------------------------
create or replace function public.reject_wallet_topup(
  _request_id uuid,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_topup_requests;
begin
  select * into v_row
    from public.wallet_topup_requests
   where id = _request_id
     for update;

  if v_row.id is null then
    raise exception 'topup_not_found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'topup_already_reviewed';
  end if;

  update public.wallet_topup_requests
     set status = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(_reason, '')), ''),
         updated_at = now()
   where id = _request_id;

  return jsonb_build_object('success', true, 'status', 'rejected');
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------
-- Buyers may file and cancel.
revoke all on function public.request_wallet_topup(numeric, text, text, text, text) from public;
grant execute on function public.request_wallet_topup(numeric, text, text, text, text) to authenticated;

revoke all on function public.cancel_wallet_topup(uuid) from public;
grant execute on function public.cancel_wallet_topup(uuid) to authenticated;

-- Review is an operator action. `authenticated` must never hold it: these
-- functions are security definer, so granting them to end users would let
-- anyone mint balance for themselves.
revoke all on function public.approve_wallet_topup(uuid, text) from public;
revoke all on function public.approve_wallet_topup(uuid, text) from authenticated;
grant execute on function public.approve_wallet_topup(uuid, text) to service_role;

revoke all on function public.reject_wallet_topup(uuid, text) from public;
revoke all on function public.reject_wallet_topup(uuid, text) from authenticated;
grant execute on function public.reject_wallet_topup(uuid, text) to service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260831052300_reconcile_sticker_schema.sql
-- SHA256 59a6eaa1bbb4c743e0be1be331bfe0c91709da23cd9e31fbac27bd4c91e09e3e
-- ============================================================================
-- =============================================================================
-- RETRACTED. This migration is intentionally a no-op. Do not restore it.
--
-- It was written to reconcile two sticker schemas, before the full picture was
-- known. A third-party review of the web repository showed the reconciliation
-- was both redundant and actively harmful.
--
-- What actually exists in the shared database:
--
--   1. supabase/migrations/20260716000000_telegram_stickers.sql (this repo)
--        sticker_packs(title, cover_url, cover_lottie_url, created_by, is_animated)
--        stickers(emoji, image_url, lottie_url, video_url, thumbnail_url, type)
--        user_sticker_packs, recent_stickers
--
--   2. socialalsamos/supabase/migrations/20260829000500_sticker_system.sql and
--      the migrations that follow it (20260829010000_user_stickers,
--      20260829020000_sticker_pack_sharing, 20260829030000_story_stickers,
--      20260829040000_sticker_trends_moderation)
--        adds slug, name, icon_url, default_kind, source, owner_id, is_premium,
--        is_public, review_status, submitted_at to sticker_packs
--        adds kind, full_url, preview_url, keywords, usage_count, is_public,
--        moderation_status, nsfw_score, nsfw_checked_at, nsfw_labels,
--        created_by to stickers
--        adds sticker_usage_events, sticker_reports, sticker_moderators
--
--   3. socialalsamos/supabase/migrations/20260830162000_sticker_schema_compat.sql
--        already bridges the two namings in both directions, with BEFORE
--        triggers sticker_pack_compat_columns and sticker_compat_columns
--
-- Why the retracted version was harmful:
--
--   - It added a third and fourth BEFORE trigger to sticker_packs and stickers,
--     competing with the compat triggers above. Two triggers mirroring
--     overlapping column sets on the same row is a data-integrity hazard.
--   - It added columns that already exist (slug, is_public, install_count,
--     sticker_count, file_url, thumb_url, width, height).
--   - It created a sticker_usage table, which would have been a third parallel
--     recents mechanism next to recent_stickers and sticker_usage_events.
--   - It set stickers.type to default 'static', unaware that the moderation
--     migration added the constraint stickers_public_requires_nsfw_check
--     (is_public = false or nsfw_checked_at is not null). Inserts that set
--     is_public without a completed NSFW check fail regardless of type.
--
-- The single genuinely missing piece, the touch_sticker_usage entry point that
-- src/lib/stickerRecents.ts calls, now lives in:
--   supabase/migrations/20260831060000_sticker_usage_bridge.sql
-- =============================================================================

select 1;


-- ============================================================================
-- SOURCE A-superapp: 20260831053000_reconcile_map_schema.sql
-- SHA256 d033fa3ede6c5b9b6f7f56178cb1b057ac16565353eb9d1ca6895bef89bbd59e
-- ============================================================================
-- Reconcile the web client's map schema with the canonical one.
--
-- Canonical sources:
--   20260712200000_map_p0_features.sql
--     map_pois, saved_place_lists, saved_places, step_history,
--     taxi_live_locations, map_incidents
--   20260803020000_social_map_features.sql
--     check_ins, place_reviews, review_helpful_votes,
--     meet_here_invitations, family_circles, circle_invitations,
--     place_statistics (materialized view)
--
-- The web client independently assumed:
--   saved_places(place_key, collection, category)   -> canonical uses list_id
--   place_reviews(place_key, comment)               -> canonical uses place_id, review_text
--   place_visits, taxi_providers                    -> genuinely new
--   place_rating_summary(p_place_key)               -> canonical has place_statistics
--
-- This is why the reported failure happened:
--   ERROR: 42703: column "collection" does not exist
-- saved_places already existed, CREATE TABLE IF NOT EXISTS did nothing, and the
-- following CREATE INDEX referenced a column that was never added.
--
-- Resolution: the canonical tables stay authoritative. Missing columns are
-- added, backfilled, and kept in sync by triggers, so both clients can read and
-- write either naming.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) saved_places: text collection alongside the canonical list_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS collection text NOT NULL DEFAULT 'default';
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.saved_places ADD COLUMN IF NOT EXISTS place_key text;

-- place_key identifies an external POI. Derive a stable fallback from the
-- coordinates so the unique index below cannot collide on legacy rows.
UPDATE public.saved_places
   SET place_key = round(latitude::numeric, 5)::text || ',' || round(longitude::numeric, 5)::text
 WHERE place_key IS NULL
   AND latitude IS NOT NULL
   AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS saved_places_user_idx ON public.saved_places(user_id);
CREATE INDEX IF NOT EXISTS saved_places_collection_idx ON public.saved_places(user_id, collection);
CREATE UNIQUE INDEX IF NOT EXISTS saved_places_unique_idx
  ON public.saved_places(user_id, place_key)
  WHERE place_key IS NOT NULL;

-- A saved place created through a named list should report that list name as
-- its collection, and vice versa, so neither client sees an empty grouping.
CREATE OR REPLACE FUNCTION public.sync_saved_place_collection()
RETURNS TRIGGER AS $$
DECLARE
  v_list_name text;
BEGIN
  IF NEW.place_key IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.place_key := round(NEW.latitude::numeric, 5)::text || ',' || round(NEW.longitude::numeric, 5)::text;
  END IF;

  IF NEW.list_id IS NOT NULL THEN
    SELECT name INTO v_list_name FROM public.saved_place_lists WHERE id = NEW.list_id;
    IF v_list_name IS NOT NULL AND (NEW.collection IS NULL OR NEW.collection = 'default') THEN
      NEW.collection := v_list_name;
    END IF;
  END IF;

  IF NEW.collection IS NULL THEN
    NEW.collection := 'default';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_saved_place_collection ON public.saved_places;
CREATE TRIGGER sync_saved_place_collection
BEFORE INSERT OR UPDATE ON public.saved_places
FOR EACH ROW
EXECUTE FUNCTION public.sync_saved_place_collection();

-- ---------------------------------------------------------------------------
-- 2) place_reviews: place_key / comment aliases over place_id / review_text
-- ---------------------------------------------------------------------------

ALTER TABLE public.place_reviews ADD COLUMN IF NOT EXISTS place_key text;
ALTER TABLE public.place_reviews ADD COLUMN IF NOT EXISTS comment text;

UPDATE public.place_reviews SET place_key = place_id WHERE place_key IS NULL;
UPDATE public.place_reviews SET comment = review_text WHERE comment IS NULL AND review_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS place_reviews_place_idx ON public.place_reviews(place_key);
CREATE INDEX IF NOT EXISTS place_reviews_user_place_idx ON public.place_reviews(user_id, place_key);

-- place_id and place_name are NOT NULL on the canonical table, so a web insert
-- that only supplies place_key and comment would fail. Fill them here.
CREATE OR REPLACE FUNCTION public.sync_place_review_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.place_id IS NULL THEN
    NEW.place_id := NEW.place_key;
  ELSIF NEW.place_key IS NULL THEN
    NEW.place_key := NEW.place_id;
  END IF;

  IF NEW.review_text IS NULL THEN
    NEW.review_text := NEW.comment;
  ELSIF NEW.comment IS NULL THEN
    NEW.comment := NEW.review_text;
  END IF;

  IF NEW.place_name IS NULL THEN
    NEW.place_name := COALESCE(NEW.place_key, 'Nomsiz joy');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_place_review_aliases ON public.place_reviews;
CREATE TRIGGER sync_place_review_aliases
BEFORE INSERT OR UPDATE ON public.place_reviews
FOR EACH ROW
EXECUTE FUNCTION public.sync_place_review_aliases();

-- The web client calls place_rating_summary. The canonical equivalent is the
-- place_statistics materialized view, which is only refreshed periodically, so
-- this reads the base table directly and stays live.
CREATE OR REPLACE FUNCTION public.place_rating_summary(p_place_key text)
RETURNS TABLE (average_rating numeric, review_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(round(AVG(rating)::numeric, 2), 0)::numeric AS average_rating,
    COUNT(*)::integer AS review_count
  FROM public.place_reviews
  WHERE place_key = p_place_key OR place_id = p_place_key;
$$;

-- ---------------------------------------------------------------------------
-- 3) place_visits: automatic dwell tracking. Genuinely new.
--
-- Distinct from check_ins: check-ins are deliberate and social, visits are
-- passive and private.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.place_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  address text,
  category text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  dwell_seconds integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'auto',
  device_id text,
  arrived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS dwell_seconds integer NOT NULL DEFAULT 0;
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto';
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.place_visits ADD COLUMN IF NOT EXISTS arrived_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS place_visits_user_idx ON public.place_visits(user_id, arrived_at DESC);
CREATE INDEX IF NOT EXISTS place_visits_geo_idx ON public.place_visits(latitude, longitude);

ALTER TABLE public.place_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_visits_own" ON public.place_visits;
CREATE POLICY "place_visits_own" ON public.place_visits
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Upsert-like: extend the dwell time of a recent nearby visit instead of
-- inserting a duplicate row every time the tracker syncs.
CREATE OR REPLACE FUNCTION public.track_place_visit(
  p_latitude double precision,
  p_longitude double precision,
  p_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_dwell_seconds integer DEFAULT 0,
  p_source text DEFAULT 'auto',
  p_device_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_latitude IS NULL OR p_longitude IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.place_visits
   WHERE user_id = auth.uid()
     AND arrived_at > now() - interval '6 hours'
     AND abs(latitude - p_latitude) < 0.0015
     AND abs(longitude - p_longitude) < 0.0015
   ORDER BY arrived_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.place_visits
       SET dwell_seconds = GREATEST(dwell_seconds, COALESCE(p_dwell_seconds, 0)),
           name = COALESCE(name, p_name),
           address = COALESCE(address, p_address),
           category = COALESCE(category, p_category)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.place_visits (
    user_id, name, address, category, latitude, longitude,
    dwell_seconds, source, device_id
  ) VALUES (
    auth.uid(), p_name, p_address, p_category, p_latitude, p_longitude,
    COALESCE(p_dwell_seconds, 0), COALESCE(p_source, 'auto'), p_device_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) taxi_providers: external taxi services we deep-link into. Genuinely new.
--
-- Not related to taxi_live_locations, which tracks our own drivers. We are not
-- running a fleet, we are handing off to existing operators, so deep-link
-- templates and tariffs live in the client (src/lib/taxiProviders.ts) and only
-- the enable/disable state and ordering are stored here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.taxi_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  logo_url text,
  base_fare numeric,
  per_km numeric,
  per_min numeric,
  currency text NOT NULL DEFAULT 'UZS',
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS base_fare numeric;
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS per_km numeric;
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS per_min numeric;
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS';
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.taxi_providers ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS taxi_providers_slug_key ON public.taxi_providers(slug);

ALTER TABLE public.taxi_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxi_providers_read" ON public.taxi_providers;
CREATE POLICY "taxi_providers_read" ON public.taxi_providers
  FOR SELECT
  USING (true);

INSERT INTO public.taxi_providers (slug, name, position)
VALUES
  ('yandex_go', 'Yandex Go', 1),
  ('yandex_maps_taxi', 'Yandex Maps Taxi', 2),
  ('mytaxi', 'MyTaxi', 3),
  ('indrive', 'inDrive', 4),
  ('millennium', 'Millennium', 5)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) products: coordinates for the nearby-listings filter
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS latitude double precision;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS longitude double precision;
    CREATE INDEX IF NOT EXISTS products_geo_idx ON public.products(latitude, longitude);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260831060000_sticker_usage_bridge.sql
-- SHA256 899174c7cfc9973c394aacf834bd2ffac29ef08cc0410d849c11827413993378
-- ============================================================================
-- =============================================================================
-- Sticker usage bridge
--
-- The web client calls a single RPC, touch_sticker_usage(file_url, kind,
-- sticker_id), whenever a sticker or GIF is sent. The canonical stores are
-- sticker_usage_events (event log, powers trending_stickers) and
-- recent_stickers (per-user recents, powers the Flutter picker).
--
-- Rather than introduce a third table, this bridge fans one call out to both
-- canonical stores. Nothing is created here except the function itself.
--
-- Deliberately defensive: the two target tables come from different migration
-- sets that may not both be applied yet, so every write is guarded with
-- to_regclass and issued through EXECUTE. A missing table degrades to a no-op
-- instead of aborting the caller's message send.
--
-- Idempotent.
-- =============================================================================

create or replace function public.touch_sticker_usage(
  p_file_url text,
  p_kind text default 'sticker',
  p_sticker_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_context text;
begin
  -- Anonymous or empty calls are ignored rather than raising: sending a
  -- message must never fail because analytics could not be recorded.
  if v_user is null or coalesce(nullif(trim(p_file_url), ''), null) is null then
    return;
  end if;

  v_context := case when p_kind = 'gif' then 'gif' else 'sticker' end;

  -- 1. Event log. Keyed by URL, so externally hosted GIFs are recorded even
  --    though they have no row in stickers.
  if to_regclass('public.sticker_usage_events') is not null then
    execute
      'insert into public.sticker_usage_events'
      || ' (sticker_id, sticker_key, user_id, context)'
      || ' values ($1, $2, $3, $4)'
      using p_sticker_id, trim(p_file_url), v_user, v_context;
  end if;

  -- 2. Lifetime counter on the sticker row, when there is one.
  if p_sticker_id is not null and to_regclass('public.stickers') is not null then
    begin
      execute
        'update public.stickers set usage_count = usage_count + 1 where id = $1'
        using p_sticker_id;
    exception
      when undefined_column then null;
    end;
  end if;

  -- 3. Per-user recents. Only real stickers qualify, because
  --    recent_stickers.sticker_id is a required foreign key.
  if p_sticker_id is not null and to_regclass('public.recent_stickers') is not null then
    begin
      execute
        'insert into public.recent_stickers (user_id, sticker_id, use_count, last_used)'
        || ' values ($1, $2, 1, now())'
        || ' on conflict (user_id, sticker_id) do update'
        || '   set use_count = recent_stickers.use_count + 1, last_used = now()'
        using v_user, p_sticker_id;
    exception
      when others then null;
    end;
  end if;
end $$;

comment on function public.touch_sticker_usage(text, text, uuid) is
  'Web entry point for sticker and GIF usage. Fans out to sticker_usage_events and recent_stickers; never raises.';

grant execute on function public.touch_sticker_usage(text, text, uuid) to authenticated;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE A-superapp: 20260831061000_place_reviews_upsert_key.sql
-- SHA256 6ca476160a68f3a169c7514d49875cec01ca25f79d541c8ee35e3e0699da192d
-- ============================================================================
-- =============================================================================
-- place_reviews upsert key
--
-- The web client calls:
--   upsert(payload, { onConflict: 'user_id,place_key' })
--
-- PostgREST turns that into ON CONFLICT (user_id, place_key), and Postgres can
-- only infer that target from a NON-PARTIAL unique index on exactly those
-- columns. The earlier reconciliation created a partial unique index
-- (WHERE place_key IS NOT NULL) plus a plain btree index, so the upsert would
-- have failed with:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
--
-- A full unique index is safe here: rows whose place_key is still NULL do not
-- collide, because Postgres treats NULLs as distinct in unique indexes.
--
-- Duplicate (user_id, place_key) pairs cannot pre-exist, because place_key is
-- backfilled from place_id and the canonical table already enforces
-- UNIQUE (user_id, place_id).
--
-- Idempotent.
-- =============================================================================

create unique index if not exists place_reviews_user_place_key_uidx
  on public.place_reviews (user_id, place_key);

-- Superseded by the unique index above.
drop index if exists public.place_reviews_user_place_idx;

-- Kept: supports "all reviews for this place" lookups.
create index if not exists place_reviews_place_key_idx
  on public.place_reviews (place_key);

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260831070000_messages_sender_embed_fk.sql
-- SHA256 140e4211c308a68504f0e7f3382346b61aba6ccbe42af90c2676ba6b4ee9c80d
-- ============================================================================
-- Chat oynasi bo'sh ko'rinishining sababi: PostgREST embed uchun kerak bo'lgan
-- FK nomi (messages_sender_id_fkey) bazada yo'q. useMessages so'rovi
--   select=*,sender:profiles!messages_sender_id_fkey(...)
-- ko'rinishida bo'lgani uchun butun so'rov PGRST200 bilan qaytadi va xabarlar
-- ro'yxati bo'sh qoladi. Chat ro'yxati esa profiles ni alohida so'rov bilan
-- olgani uchun ishlashda davom etadi.
--
-- Migratsiya idempotent: constraint mavjud bo'lsa hech narsa qilinmaydi.
-- NOT VALID - eski qatorlarda profili o'chirilgan sender_id bo'lsa ham DDL
-- to'xtab qolmasligi uchun.

BEGIN;

DO $$
DECLARE
  has_named_fk boolean;
BEGIN
  IF to_regclass('public.messages') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_sender_id_fkey'
      AND conrelid = 'public.messages'::regclass
      AND contype = 'f'
  ) INTO has_named_fk;

  IF has_named_fk THEN
    RETURN;
  END IF;

  EXECUTE $ddl$
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL
      NOT VALID
  $ddl$;
END $$;

-- Reply preview ham xuddi shu embed uslubidan foydalanadi, shuning uchun
-- sender_id bo'yicha qidiruv indeksi ham foydali.
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages(sender_id);

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SOURCE B-web: 20260831093000_scheduled_post_publisher.sql
-- SHA256 0983abad076285de17cbead8701cc669078e44972350f7bf4279b4085dff75f2
-- ============================================================================
-- =============================================================================
-- P1: Rejalashtirilgan postlarni chiqaruvchi navbat
--
-- Muammo: create oqimi `scheduled_at` ni yozib, postni `scheduled` holatida
-- qoldirardi. Uni `published` holatiga o'tkazadigan hech narsa yo'q edi, ya'ni
-- "Rejalashtirish" tugmasi foydalanuvchiga yolg'on aytardi.
--
-- Yechim: navbatni bazadagi bitta funksiya chiqaradi. Edge Function faqat shu
-- funksiyani chaqiradi, shuning uchun web va superapp mijozlari bir xil
-- xatti-harakatni oladi (docs/CREATE-PRO-PLAN.md, "Superapp bilan muvofiqlik").
--
-- Xavfsizlik: funksiya security definer, lekin faqat service_role chaqiradi.
-- Oddiy foydalanuvchi boshqa odamning postini chiqarib yubora olmaydi.
-- =============================================================================

-- Cron har daqiqada ishlaydi, shuning uchun qismli indeks: faqat navbatdagi
-- postlar indeksda bo'ladi, million bosilgan post emas.
create index if not exists posts_scheduled_due_idx
  on public.posts (scheduled_at)
  where status = 'scheduled';

-- Bir nechta ishchi parallel ishlasa ham bitta post ikki marta chiqmaydi:
-- FOR UPDATE SKIP LOCKED band qatorlarni chetlab o'tadi.
create or replace function public.publish_due_scheduled_posts(
  p_limit integer default 200
)
returns table (
  post_id uuid,
  author_id uuid,
  published_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  return query
  with due as (
    select p.id
    from public.posts p
    where p.status = 'scheduled'
      and p.scheduled_at is not null
      and p.scheduled_at <= now()
    order by p.scheduled_at
    limit v_limit
    for update skip locked
  )
  update public.posts p
  set status = 'published',
      published_at = coalesce(p.published_at, now())
  from due
  where p.id = due.id
  returning p.id, p.user_id, p.published_at;
end
$$;

comment on function public.publish_due_scheduled_posts(integer) is
  'P1: vaqti kelgan rejalashtirilgan postlarni chiqaradi. Faqat cron/service_role.';

revoke all on function public.publish_due_scheduled_posts(integer) from public;
revoke all on function public.publish_due_scheduled_posts(integer) from authenticated;
grant execute on function public.publish_due_scheduled_posts(integer) to service_role;

notify pgrst, 'reload schema';

