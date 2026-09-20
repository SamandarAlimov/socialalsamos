-- Marketplace promotion / promo-code engine.
-- Server-authoritative eligibility, usage limits, targeting and checkout discount allocation.

create table if not exists public.marketplace_promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  owner_type text not null default 'seller'
    check (owner_type in ('platform','seller')),
  seller_id uuid references public.sellers(id) on delete cascade,
  discount_type text not null
    check (discount_type in ('percent','fixed')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  max_discount_amount numeric(14,2),
  min_subtotal numeric(14,2) not null default 0 check (min_subtotal >= 0),
  currency text not null default 'UZS',
  scope_type text not null default 'all'
    check (scope_type in ('all','categories','products')),
  audience_type text not null default 'all'
    check (audience_type in ('all','new_customers','returning_customers','specific_users')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (
    (owner_type = 'seller' and seller_id is not null)
    or (owner_type = 'platform' and seller_id is null)
  ),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (max_discount_amount is null or max_discount_amount > 0),
  check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists marketplace_promotions_code_unique
  on public.marketplace_promotions ((upper(code)))
  where deleted_at is null;

create index if not exists marketplace_promotions_seller_idx
  on public.marketplace_promotions (seller_id, is_active, starts_at, ends_at)
  where deleted_at is null;

create index if not exists marketplace_promotions_active_idx
  on public.marketplace_promotions (is_active, starts_at, ends_at)
  where deleted_at is null;

create table if not exists public.marketplace_promotion_products (
  promotion_id uuid not null references public.marketplace_promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, product_id)
);

create table if not exists public.marketplace_promotion_categories (
  promotion_id uuid not null references public.marketplace_promotions(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, category_id)
);

create table if not exists public.marketplace_promotion_users (
  promotion_id uuid not null references public.marketplace_promotions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, user_id)
);

create table if not exists public.marketplace_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.marketplace_promotions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  checkout_id uuid not null default gen_random_uuid(),
  order_ids uuid[] not null default '{}'::uuid[],
  eligible_subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  status text not null default 'redeemed'
    check (status in ('redeemed','voided')),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (promotion_id, checkout_id)
);

create index if not exists marketplace_promotion_redemptions_usage_idx
  on public.marketplace_promotion_redemptions (promotion_id, status, created_at desc);

create index if not exists marketplace_promotion_redemptions_user_idx
  on public.marketplace_promotion_redemptions (promotion_id, user_id, status, created_at desc);

alter table public.orders
  add column if not exists original_subtotal numeric(14,2),
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists promotion_id uuid references public.marketplace_promotions(id) on delete set null,
  add column if not exists promo_code text;

update public.orders
set original_subtotal = subtotal
where original_subtotal is null;

alter table public.marketplace_promotions enable row level security;
alter table public.marketplace_promotion_products enable row level security;
alter table public.marketplace_promotion_categories enable row level security;
alter table public.marketplace_promotion_users enable row level security;
alter table public.marketplace_promotion_redemptions enable row level security;

insert into public.admin_permissions (key, category, label, description)
values (
  'marketplace.promotions.manage',
  'marketplace',
  'Marketplace promokodlarini boshqarish',
  'Platform darajasidagi promo kampaniyalarini yaratish, tahrirlash va to‘xtatish.'
)
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description;

insert into public.admin_role_permissions (role_key, permission_key)
values
  ('marketplace_reviewer', 'marketplace.promotions.manage'),
  ('finance', 'marketplace.promotions.manage')
on conflict (role_key, permission_key) do nothing;

create or replace function public.marketplace_normalize_promo_code(_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(_code, '')), '[[:space:]]+', '', 'g'));
$$;

create or replace function public.marketplace_promo_applies_to_product(
  _promotion_id uuid,
  _product_id uuid,
  _category_id uuid,
  _seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_promotions mp
    where mp.id = _promotion_id
      and mp.deleted_at is null
      and (
        mp.owner_type = 'platform'
        or (mp.owner_type = 'seller' and mp.seller_id = _seller_id)
      )
      and (
        mp.scope_type = 'all'
        or (
          mp.scope_type = 'products'
          and exists (
            select 1
            from public.marketplace_promotion_products mpp
            where mpp.promotion_id = mp.id
              and mpp.product_id = _product_id
          )
        )
        or (
          mp.scope_type = 'categories'
          and _category_id is not null
          and exists (
            select 1
            from public.marketplace_promotion_categories mpc
            where mpc.promotion_id = mp.id
              and mpc.category_id = _category_id
          )
        )
      )
  );
$$;

revoke all on function public.marketplace_promo_applies_to_product(uuid,uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.marketplace_promo_quote_for(
  _promotion_id uuid,
  _user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_promo public.marketplace_promotions;
  v_eligible_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_usage integer := 0;
  v_user_usage integer := 0;
  v_has_orders boolean := false;
  v_currency_count integer := 0;
  v_currency text;
begin
  select *
    into v_promo
  from public.marketplace_promotions
  where id = _promotion_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('success', false, 'error', 'promo_not_found');
  end if;

  if not v_promo.is_active then
    return jsonb_build_object('success', false, 'error', 'promo_inactive');
  end if;

  if now() < v_promo.starts_at then
    return jsonb_build_object('success', false, 'error', 'promo_not_started');
  end if;

  if v_promo.ends_at is not null and now() >= v_promo.ends_at then
    return jsonb_build_object('success', false, 'error', 'promo_expired');
  end if;

  select count(*)::integer
    into v_usage
  from public.marketplace_promotion_redemptions
  where promotion_id = v_promo.id
    and status = 'redeemed';

  if v_promo.usage_limit is not null and v_usage >= v_promo.usage_limit then
    return jsonb_build_object('success', false, 'error', 'promo_usage_limit');
  end if;

  select count(*)::integer
    into v_user_usage
  from public.marketplace_promotion_redemptions
  where promotion_id = v_promo.id
    and user_id = _user_id
    and status = 'redeemed';

  if v_promo.per_user_limit is not null and v_user_usage >= v_promo.per_user_limit then
    return jsonb_build_object('success', false, 'error', 'promo_user_limit');
  end if;

  select exists (
    select 1
    from public.orders o
    where o.buyer_id = _user_id
      and coalesce(o.status, 'pending') <> 'cancelled'
  ) into v_has_orders;

  if v_promo.audience_type = 'new_customers' and v_has_orders then
    return jsonb_build_object('success', false, 'error', 'promo_audience');
  end if;

  if v_promo.audience_type = 'returning_customers' and not v_has_orders then
    return jsonb_build_object('success', false, 'error', 'promo_audience');
  end if;

  if v_promo.audience_type = 'specific_users'
     and not exists (
       select 1
       from public.marketplace_promotion_users mpu
       where mpu.promotion_id = v_promo.id
         and mpu.user_id = _user_id
     ) then
    return jsonb_build_object('success', false, 'error', 'promo_audience');
  end if;

  select
    count(distinct coalesce(p.currency, 'UZS'))::integer,
    min(coalesce(p.currency, 'UZS'))
    into v_currency_count, v_currency
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = _user_id
    and public.marketplace_promo_applies_to_product(
      v_promo.id,
      p.id,
      p.category_id,
      p.seller_id
    );

  if coalesce(v_currency_count, 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'promo_no_eligible_items');
  end if;

  if v_currency_count > 1 or upper(coalesce(v_currency, '')) <> upper(v_promo.currency) then
    return jsonb_build_object('success', false, 'error', 'promo_currency_mismatch');
  end if;

  select coalesce(sum(coalesce(pv.price, p.price) * ci.quantity), 0)::numeric(14,2)
    into v_eligible_subtotal
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.product_variants pv
    on pv.id = ci.product_variant_id
   and pv.product_id = p.id
  where ci.user_id = _user_id
    and public.marketplace_promo_applies_to_product(
      v_promo.id,
      p.id,
      p.category_id,
      p.seller_id
    );

  if v_eligible_subtotal <= 0 then
    return jsonb_build_object('success', false, 'error', 'promo_no_eligible_items');
  end if;

  if v_eligible_subtotal < v_promo.min_subtotal then
    return jsonb_build_object(
      'success', false,
      'error', 'promo_min_subtotal',
      'min_subtotal', v_promo.min_subtotal,
      'eligible_subtotal', v_eligible_subtotal,
      'currency', v_promo.currency
    );
  end if;

  if v_promo.discount_type = 'percent' then
    v_discount := round(v_eligible_subtotal * v_promo.discount_value / 100, 2);
    if v_promo.max_discount_amount is not null then
      v_discount := least(v_discount, v_promo.max_discount_amount);
    end if;
  else
    v_discount := least(v_promo.discount_value, v_eligible_subtotal);
  end if;

  v_discount := greatest(0, round(v_discount, 2));

  return jsonb_build_object(
    'success', true,
    'promotion_id', v_promo.id,
    'code', v_promo.code,
    'name', v_promo.name,
    'description', v_promo.description,
    'owner_type', v_promo.owner_type,
    'seller_id', v_promo.seller_id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'max_discount_amount', v_promo.max_discount_amount,
    'min_subtotal', v_promo.min_subtotal,
    'scope_type', v_promo.scope_type,
    'audience_type', v_promo.audience_type,
    'eligible_subtotal', v_eligible_subtotal,
    'discount_amount', v_discount,
    'currency', v_promo.currency,
    'ends_at', v_promo.ends_at
  );
end;
$$;

revoke all on function public.marketplace_promo_quote_for(uuid,uuid) from public, anon, authenticated;

create or replace function public.marketplace_quote_promo(
  _code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := public.marketplace_normalize_promo_code(_code);
  v_promo_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if v_code = '' then
    return jsonb_build_object('success', false, 'error', 'promo_code_required');
  end if;

  select id
    into v_promo_id
  from public.marketplace_promotions
  where upper(code) = v_code
    and deleted_at is null
  limit 1;

  if v_promo_id is null then
    return jsonb_build_object('success', false, 'error', 'promo_not_found');
  end if;

  return public.marketplace_promo_quote_for(v_promo_id, v_user);
end;
$$;

revoke all on function public.marketplace_quote_promo(text) from public, anon;
grant execute on function public.marketplace_quote_promo(text) to authenticated;

create or replace function public.marketplace_save_promotion(
  _promotion_id uuid,
  _payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := _promotion_id;
  v_owner_type text := lower(coalesce(_payload->>'owner_type', 'seller'));
  v_seller_id uuid;
  v_code text := public.marketplace_normalize_promo_code(_payload->>'code');
  v_name text := trim(coalesce(_payload->>'name', ''));
  v_description text := nullif(trim(coalesce(_payload->>'description', '')), '');
  v_discount_type text := lower(coalesce(_payload->>'discount_type', 'percent'));
  v_discount_value numeric(14,2);
  v_max_discount numeric(14,2);
  v_min_subtotal numeric(14,2);
  v_currency text := upper(coalesce(nullif(trim(_payload->>'currency'), ''), 'UZS'));
  v_scope_type text := lower(coalesce(_payload->>'scope_type', 'all'));
  v_audience_type text := lower(coalesce(_payload->>'audience_type', 'all'));
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_usage_limit integer;
  v_per_user_limit integer;
  v_is_active boolean := coalesce((_payload->>'is_active')::boolean, true);
  v_product_id uuid;
  v_category_id uuid;
  v_user_id uuid;
  v_is_admin boolean := false;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  v_is_admin := public.has_admin_permission(v_actor, 'marketplace.promotions.manage');

  if v_owner_type = 'platform' then
    if not v_is_admin then
      raise exception 'not_authorized';
    end if;
    v_seller_id := null;
  elsif v_owner_type = 'seller' then
    begin
      v_seller_id := nullif(_payload->>'seller_id', '')::uuid;
    exception when others then
      v_seller_id := null;
    end;

    if v_seller_id is null then
      select id into v_seller_id
      from public.sellers
      where user_id = v_actor
        and status = 'active'
      limit 1;
    end if;

    if v_seller_id is null then
      raise exception 'seller_required';
    end if;

    if not v_is_admin and not exists (
      select 1
      from public.sellers
      where id = v_seller_id
        and user_id = v_actor
        and status = 'active'
    ) then
      raise exception 'not_authorized';
    end if;
  else
    raise exception 'invalid_promo_owner';
  end if;

  if v_code = '' or length(v_code) < 3 or length(v_code) > 32
     or v_code !~ '^[A-Z0-9_-]+$' then
    raise exception 'invalid_promo_code';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'invalid_promo_name';
  end if;

  begin
    v_discount_value := (_payload->>'discount_value')::numeric;
    v_max_discount := nullif(_payload->>'max_discount_amount', '')::numeric;
    v_min_subtotal := coalesce(nullif(_payload->>'min_subtotal', '')::numeric, 0);
    v_starts_at := coalesce(nullif(_payload->>'starts_at', '')::timestamptz, now());
    v_ends_at := nullif(_payload->>'ends_at', '')::timestamptz;
    v_usage_limit := nullif(_payload->>'usage_limit', '')::integer;
    v_per_user_limit := nullif(_payload->>'per_user_limit', '')::integer;
  exception when others then
    raise exception 'invalid_promo_values';
  end;

  if v_discount_type not in ('percent','fixed')
     or v_discount_value is null
     or v_discount_value <= 0
     or (v_discount_type = 'percent' and v_discount_value > 100)
     or (v_max_discount is not null and v_max_discount <= 0)
     or v_min_subtotal < 0
     or (v_ends_at is not null and v_ends_at <= v_starts_at)
     or (v_usage_limit is not null and v_usage_limit <= 0)
     or (v_per_user_limit is not null and v_per_user_limit <= 0) then
    raise exception 'invalid_promo_values';
  end if;

  if v_scope_type not in ('all','categories','products') then
    raise exception 'invalid_promo_scope';
  end if;

  if v_audience_type not in ('all','new_customers','returning_customers','specific_users') then
    raise exception 'invalid_promo_audience';
  end if;

  if v_id is not null then
    if not exists (
      select 1
      from public.marketplace_promotions mp
      where mp.id = v_id
        and mp.deleted_at is null
        and (
          v_is_admin
          or (
            mp.owner_type = 'seller'
            and exists (
              select 1
              from public.sellers s
              where s.id = mp.seller_id
                and s.user_id = v_actor
            )
          )
        )
    ) then
      raise exception 'promo_not_found_or_forbidden';
    end if;

    update public.marketplace_promotions
    set code = v_code,
        name = v_name,
        description = v_description,
        owner_type = v_owner_type,
        seller_id = v_seller_id,
        discount_type = v_discount_type,
        discount_value = v_discount_value,
        max_discount_amount = v_max_discount,
        min_subtotal = v_min_subtotal,
        currency = v_currency,
        scope_type = v_scope_type,
        audience_type = v_audience_type,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        usage_limit = v_usage_limit,
        per_user_limit = v_per_user_limit,
        is_active = v_is_active,
        metadata = coalesce(_payload->'metadata', '{}'::jsonb),
        updated_at = now()
    where id = v_id;
  else
    insert into public.marketplace_promotions (
      code, name, description, owner_type, seller_id,
      discount_type, discount_value, max_discount_amount, min_subtotal,
      currency, scope_type, audience_type, starts_at, ends_at,
      usage_limit, per_user_limit, is_active, created_by, metadata
    ) values (
      v_code, v_name, v_description, v_owner_type, v_seller_id,
      v_discount_type, v_discount_value, v_max_discount, v_min_subtotal,
      v_currency, v_scope_type, v_audience_type, v_starts_at, v_ends_at,
      v_usage_limit, v_per_user_limit, v_is_active, v_actor,
      coalesce(_payload->'metadata', '{}'::jsonb)
    )
    returning id into v_id;
  end if;

  delete from public.marketplace_promotion_products where promotion_id = v_id;
  delete from public.marketplace_promotion_categories where promotion_id = v_id;
  delete from public.marketplace_promotion_users where promotion_id = v_id;

  if v_scope_type = 'products' then
    for v_product_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(_payload->'product_ids', '[]'::jsonb))
    loop
      if not exists (
        select 1
        from public.products p
        where p.id = v_product_id
          and p.status <> 'deleted'
          and (v_owner_type = 'platform' or p.seller_id = v_seller_id)
      ) then
        raise exception 'invalid_promo_product';
      end if;

      insert into public.marketplace_promotion_products (promotion_id, product_id)
      values (v_id, v_product_id)
      on conflict do nothing;
    end loop;

    if not exists (
      select 1 from public.marketplace_promotion_products where promotion_id = v_id
    ) then
      raise exception 'promo_products_required';
    end if;
  elsif v_scope_type = 'categories' then
    for v_category_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(_payload->'category_ids', '[]'::jsonb))
    loop
      if not exists (select 1 from public.product_categories where id = v_category_id) then
        raise exception 'invalid_promo_category';
      end if;
      insert into public.marketplace_promotion_categories (promotion_id, category_id)
      values (v_id, v_category_id)
      on conflict do nothing;
    end loop;

    if not exists (
      select 1 from public.marketplace_promotion_categories where promotion_id = v_id
    ) then
      raise exception 'promo_categories_required';
    end if;
  end if;

  if v_audience_type = 'specific_users' then
    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(_payload->'user_ids', '[]'::jsonb))
    loop
      if not exists (select 1 from public.profiles where id = v_user_id) then
        raise exception 'invalid_promo_user';
      end if;
      insert into public.marketplace_promotion_users (promotion_id, user_id)
      values (v_id, v_user_id)
      on conflict do nothing;
    end loop;

    if not exists (
      select 1 from public.marketplace_promotion_users where promotion_id = v_id
    ) then
      raise exception 'promo_users_required';
    end if;
  end if;

  return jsonb_build_object('success', true, 'promotion_id', v_id, 'code', v_code);
exception
  when unique_violation then
    raise exception 'promo_code_exists';
end;
$$;

revoke all on function public.marketplace_save_promotion(uuid,jsonb) from public, anon;
grant execute on function public.marketplace_save_promotion(uuid,jsonb) to authenticated;

create or replace function public.marketplace_set_promotion_active(
  _promotion_id uuid,
  _active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  v_is_admin := public.has_admin_permission(v_actor, 'marketplace.promotions.manage');

  update public.marketplace_promotions mp
  set is_active = _active,
      updated_at = now()
  where mp.id = _promotion_id
    and mp.deleted_at is null
    and (
      v_is_admin
      or (
        mp.owner_type = 'seller'
        and exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = v_actor
        )
      )
    );

  if not found then raise exception 'promo_not_found_or_forbidden'; end if;
  return true;
end;
$$;

revoke all on function public.marketplace_set_promotion_active(uuid,boolean) from public, anon;
grant execute on function public.marketplace_set_promotion_active(uuid,boolean) to authenticated;

create or replace function public.marketplace_delete_promotion(
  _promotion_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  v_is_admin := public.has_admin_permission(v_actor, 'marketplace.promotions.manage');

  update public.marketplace_promotions mp
  set deleted_at = now(),
      is_active = false,
      updated_at = now()
  where mp.id = _promotion_id
    and mp.deleted_at is null
    and (
      v_is_admin
      or (
        mp.owner_type = 'seller'
        and exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = v_actor
        )
      )
    );

  if not found then raise exception 'promo_not_found_or_forbidden'; end if;
  return true;
end;
$$;

revoke all on function public.marketplace_delete_promotion(uuid) from public, anon;
grant execute on function public.marketplace_delete_promotion(uuid) to authenticated;

create or replace function public.marketplace_list_manageable_promotions(
  _mode text default 'seller'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_seller_id uuid;
  v_is_admin boolean;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;

  v_is_admin := public.has_admin_permission(v_actor, 'marketplace.promotions.manage');

  if lower(coalesce(_mode, 'seller')) = 'admin' then
    if not v_is_admin then raise exception 'not_authorized'; end if;
  else
    select id into v_seller_id
    from public.sellers
    where user_id = v_actor
    limit 1;

    if v_seller_id is null then
      return '[]'::jsonb;
    end if;
  end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'id', mp.id,
      'code', mp.code,
      'name', mp.name,
      'description', mp.description,
      'owner_type', mp.owner_type,
      'seller_id', mp.seller_id,
      'seller_name', s.business_name,
      'discount_type', mp.discount_type,
      'discount_value', mp.discount_value,
      'max_discount_amount', mp.max_discount_amount,
      'min_subtotal', mp.min_subtotal,
      'currency', mp.currency,
      'scope_type', mp.scope_type,
      'audience_type', mp.audience_type,
      'starts_at', mp.starts_at,
      'ends_at', mp.ends_at,
      'usage_limit', mp.usage_limit,
      'per_user_limit', mp.per_user_limit,
      'is_active', mp.is_active,
      'created_at', mp.created_at,
      'updated_at', mp.updated_at,
      'usage_count', (
        select count(*)
        from public.marketplace_promotion_redemptions r
        where r.promotion_id = mp.id and r.status = 'redeemed'
      ),
      'total_discount', (
        select coalesce(sum(r.discount_amount), 0)
        from public.marketplace_promotion_redemptions r
        where r.promotion_id = mp.id and r.status = 'redeemed'
      ),
      'product_ids', coalesce((
        select jsonb_agg(mpp.product_id)
        from public.marketplace_promotion_products mpp
        where mpp.promotion_id = mp.id
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) order by p.title)
        from public.marketplace_promotion_products mpp
        join public.products p on p.id = mpp.product_id
        where mpp.promotion_id = mp.id
      ), '[]'::jsonb),
      'category_ids', coalesce((
        select jsonb_agg(mpc.category_id)
        from public.marketplace_promotion_categories mpc
        where mpc.promotion_id = mp.id
      ), '[]'::jsonb),
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'slug', pc.slug) order by pc.position, pc.name)
        from public.marketplace_promotion_categories mpc
        join public.product_categories pc on pc.id = mpc.category_id
        where mpc.promotion_id = mp.id
      ), '[]'::jsonb),
      'user_ids', coalesce((
        select jsonb_agg(mpu.user_id)
        from public.marketplace_promotion_users mpu
        where mpu.promotion_id = mp.id
      ), '[]'::jsonb),
      'users', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pr.id,
          'username', pr.username,
          'display_name', pr.display_name
        ) order by coalesce(pr.display_name, pr.username))
        from public.marketplace_promotion_users mpu
        join public.profiles pr on pr.id = mpu.user_id
        where mpu.promotion_id = mp.id
      ), '[]'::jsonb)
    ) as row_data
    from public.marketplace_promotions mp
    left join public.sellers s on s.id = mp.seller_id
    where mp.deleted_at is null
      and (
        (lower(coalesce(_mode, 'seller')) = 'admin' and v_is_admin)
        or (lower(coalesce(_mode, 'seller')) <> 'admin' and mp.seller_id = v_seller_id)
      )
  ) rows;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.marketplace_list_manageable_promotions(text) from public, anon;
grant execute on function public.marketplace_list_manageable_promotions(text) to authenticated;

create or replace function public.process_marketplace_order_v2(
  _shipping_address jsonb,
  _payment_method text,
  _notes text default null,
  _promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cart_count integer;
  v_item record;
  v_group record;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_payment_status text;
  v_balance numeric(14,2);
  v_receipt text;
  v_currency text := 'USD';
  v_currency_count integer := 0;
  v_is_pickup boolean := coalesce(_shipping_address->>'fulfillment_type', 'delivery') = 'pickup';
  v_seller_count integer := 0;
  v_cart_subtotal numeric(14,2) := 0;
  v_shipping_total numeric(14,2) := 0;
  v_grand_total numeric(14,2) := 0;
  v_promo_id uuid;
  v_promo_code text;
  v_promo_quote jsonb;
  v_discount numeric(14,2) := 0;
  v_eligible_subtotal numeric(14,2) := 0;
  v_discount_remaining numeric(14,2) := 0;
  v_eligible_remaining numeric(14,2) := 0;
  v_group_discount numeric(14,2) := 0;
  v_group_total numeric(14,2) := 0;
  v_checkout_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

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

  select count(*) into v_cart_count
  from public.cart_items
  where user_id = v_user;

  if v_cart_count = 0 then raise exception 'empty_cart'; end if;

  if v_is_pickup then
    select count(distinct p.seller_id)
      into v_seller_count
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = v_user;

    if v_seller_count <> 1
       or exists (
         select 1
         from public.cart_items ci
         join public.products p on p.id = ci.product_id
         join public.sellers s on s.id = p.seller_id
         where ci.user_id = v_user
           and coalesce(s.business_type, '') <> 'restaurant'
       ) then
      raise exception 'pickup_not_available';
    end if;
  end if;

  perform 1
  from public.product_variants pv
  join public.cart_items ci on ci.product_variant_id = pv.id
  where ci.user_id = v_user
  order by pv.id
  for update of pv;

  for v_item in
    select ci.product_id,
           ci.product_variant_id,
           ci.quantity,
           coalesce(pv.price, p.price) as price,
           case when ci.product_variant_id is null then p.quantity else pv.quantity end as stock,
           p.status,
           p.currency,
           case when v_is_pickup then 0 else coalesce(p.shipping_price, 0) end as shipping_price,
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

    if v_item.quantity < 1 then raise exception 'invalid_quantity'; end if;
    if coalesce(v_item.stock, 0) < v_item.quantity then raise exception 'insufficient_stock'; end if;

    v_currency := coalesce(v_item.currency, v_currency);
    v_cart_subtotal := v_cart_subtotal + (v_item.price * v_item.quantity);
    v_shipping_total := v_shipping_total + (v_item.shipping_price * v_item.quantity);
  end loop;

  select count(distinct coalesce(p.currency, 'USD'))::integer
    into v_currency_count
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = v_user;

  if v_currency_count > 1 then raise exception 'mixed_currency_cart'; end if;

  if nullif(public.marketplace_normalize_promo_code(_promo_code), '') is not null then
    v_promo_code := public.marketplace_normalize_promo_code(_promo_code);

    select id
      into v_promo_id
    from public.marketplace_promotions
    where upper(code) = v_promo_code
      and deleted_at is null
    for update;

    if v_promo_id is null then raise exception 'promo_not_found'; end if;

    v_promo_quote := public.marketplace_promo_quote_for(v_promo_id, v_user);
    if not coalesce((v_promo_quote->>'success')::boolean, false) then
      raise exception '%', coalesce(v_promo_quote->>'error', 'promo_invalid');
    end if;

    v_discount := coalesce((v_promo_quote->>'discount_amount')::numeric, 0);
    v_eligible_subtotal := coalesce((v_promo_quote->>'eligible_subtotal')::numeric, 0);
    v_discount_remaining := v_discount;
    v_eligible_remaining := v_eligible_subtotal;
  end if;

  v_grand_total := greatest(v_cart_subtotal + v_shipping_total - v_discount, 0);

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

  for v_group in
    select
      p.seller_id,
      sum(coalesce(pv.price, p.price) * ci.quantity)::numeric(14,2) as subtotal,
      sum(
        case when v_is_pickup
          then 0
          else coalesce(p.shipping_price, 0) * ci.quantity
        end
      )::numeric(14,2) as shipping,
      sum(
        case
          when v_promo_id is not null
           and public.marketplace_promo_applies_to_product(
             v_promo_id,
             p.id,
             p.category_id,
             p.seller_id
           )
          then coalesce(pv.price, p.price) * ci.quantity
          else 0
        end
      )::numeric(14,2) as eligible_subtotal
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    left join public.product_variants pv
      on pv.id = ci.product_variant_id
     and pv.product_id = p.id
    where ci.user_id = v_user
    group by p.seller_id
    order by p.seller_id
  loop
    v_group_discount := 0;

    if v_promo_id is not null and coalesce(v_group.eligible_subtotal, 0) > 0 then
      if v_group.eligible_subtotal >= v_eligible_remaining then
        v_group_discount := v_discount_remaining;
      else
        v_group_discount := least(
          v_discount_remaining,
          round(v_discount * v_group.eligible_subtotal / nullif(v_eligible_subtotal, 0), 2)
        );
      end if;

      v_discount_remaining := greatest(v_discount_remaining - v_group_discount, 0);
      v_eligible_remaining := greatest(v_eligible_remaining - v_group.eligible_subtotal, 0);
    end if;

    v_group_total := greatest(v_group.subtotal + v_group.shipping - v_group_discount, 0);

    v_receipt := case when v_payment_status = 'paid'
                      then public.marketplace_generate_receipt_number()
                      else null end;

    insert into public.orders (
      order_number, buyer_id, seller_id, status, payment_status, payment_method,
      subtotal, original_subtotal, shipping_cost, discount_amount, total, currency,
      shipping_address, notes, receipt_number, paid_at, promotion_id, promo_code
    ) values (
      public.marketplace_generate_order_number(), v_user, v_group.seller_id,
      'pending', v_payment_status, _payment_method,
      v_group.subtotal, v_group.subtotal, v_group.shipping, v_group_discount,
      v_group_total, v_currency, _shipping_address, _notes, v_receipt,
      case when v_payment_status = 'paid' then now() else null end,
      v_promo_id, case when v_promo_id is not null then v_promo_code else null end
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

    if v_payment_status = 'paid' then
      insert into public.marketplace_payments (
        user_id, order_id, direction, amount, currency, method,
        status, receipt_number, metadata
      ) values (
        v_user, v_order_id, 'debit', v_group_total, v_currency,
        _payment_method, 'succeeded', v_receipt,
        jsonb_build_object(
          'seller_id', v_group.seller_id,
          'fulfillment_type', case when v_is_pickup then 'pickup' else 'delivery' end,
          'promotion_id', v_promo_id,
          'promo_code', case when v_promo_id is not null then v_promo_code else null end,
          'discount_amount', v_group_discount
        )
      );
    end if;
  end loop;

  update public.product_variants pv
  set quantity = greatest(pv.quantity - ci.quantity, 0),
      updated_at = now()
  from public.cart_items ci
  where ci.product_variant_id = pv.id
    and ci.user_id = v_user;

  update public.products p
  set quantity = p.quantity - ci.quantity,
      status = case when (p.quantity - ci.quantity) <= 0 then 'sold' else p.status end
  from public.cart_items ci
  where ci.product_id = p.id
    and ci.product_variant_id is null
    and ci.user_id = v_user;

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

  if v_promo_id is not null and v_discount > 0 then
    insert into public.marketplace_promotion_redemptions (
      promotion_id, user_id, checkout_id, order_ids,
      eligible_subtotal, discount_amount, status
    ) values (
      v_promo_id, v_user, v_checkout_id, v_order_ids,
      v_eligible_subtotal, v_discount, 'redeemed'
    );
  end if;

  update public.sellers s
  set total_sales = coalesce(s.total_sales, 0) + 1
  where s.id in (
    select seller_id from public.orders where id = any(v_order_ids)
  );

  delete from public.cart_items where user_id = v_user;

  return jsonb_build_object(
    'success', true,
    'order_ids', to_jsonb(v_order_ids),
    'payment_status', v_payment_status,
    'subtotal', v_cart_subtotal,
    'shipping_total', v_shipping_total,
    'discount_amount', v_discount,
    'promo_code', case when v_promo_id is not null then v_promo_code else null end,
    'total', v_grand_total,
    'currency', v_currency,
    'fulfillment_type', case when v_is_pickup then 'pickup' else 'delivery' end
  );
end;
$$;

revoke all on function public.process_marketplace_order_v2(jsonb,text,text,text) from public, anon;
grant execute on function public.process_marketplace_order_v2(jsonb,text,text,text) to authenticated;

create or replace function public.marketplace_void_promo_redemption_when_orders_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.marketplace_promotion_redemptions r
    set status = 'voided',
        voided_at = now()
    where r.status = 'redeemed'
      and new.id = any(r.order_ids)
      and not exists (
        select 1
        from public.orders o
        where o.id = any(r.order_ids)
          and coalesce(o.status, 'pending') <> 'cancelled'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_void_promo_redemption_on_cancel on public.orders;
create trigger marketplace_void_promo_redemption_on_cancel
after update of status on public.orders
for each row execute function public.marketplace_void_promo_redemption_when_orders_cancelled();

grant select on public.marketplace_promotions to authenticated;
grant select on public.marketplace_promotion_products to authenticated;
grant select on public.marketplace_promotion_categories to authenticated;
grant select on public.marketplace_promotion_users to authenticated;
grant select on public.marketplace_promotion_redemptions to authenticated;

drop policy if exists "Manage own or admin promotions" on public.marketplace_promotions;
create policy "Manage own or admin promotions"
on public.marketplace_promotions
for select
to authenticated
using (
  public.has_admin_permission(auth.uid(), 'marketplace.promotions.manage')
  or (
    owner_type = 'seller'
    and exists (
      select 1 from public.sellers s
      where s.id = seller_id and s.user_id = auth.uid()
    )
  )
);

drop policy if exists "Promotion product targets visible to managers" on public.marketplace_promotion_products;
create policy "Promotion product targets visible to managers"
on public.marketplace_promotion_products
for select
to authenticated
using (
  exists (
    select 1
    from public.marketplace_promotions mp
    where mp.id = promotion_id
      and (
        public.has_admin_permission(auth.uid(), 'marketplace.promotions.manage')
        or exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Promotion category targets visible to managers" on public.marketplace_promotion_categories;
create policy "Promotion category targets visible to managers"
on public.marketplace_promotion_categories
for select
to authenticated
using (
  exists (
    select 1
    from public.marketplace_promotions mp
    where mp.id = promotion_id
      and (
        public.has_admin_permission(auth.uid(), 'marketplace.promotions.manage')
        or exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Promotion audience visible to managers" on public.marketplace_promotion_users;
create policy "Promotion audience visible to managers"
on public.marketplace_promotion_users
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.marketplace_promotions mp
    where mp.id = promotion_id
      and (
        public.has_admin_permission(auth.uid(), 'marketplace.promotions.manage')
        or exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Promotion redemptions visible to owners" on public.marketplace_promotion_redemptions;
create policy "Promotion redemptions visible to owners"
on public.marketplace_promotion_redemptions
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.marketplace_promotions mp
    where mp.id = promotion_id
      and (
        public.has_admin_permission(auth.uid(), 'marketplace.promotions.manage')
        or exists (
          select 1 from public.sellers s
          where s.id = mp.seller_id and s.user_id = auth.uid()
        )
      )
  )
);

notify pgrst, 'reload schema';
