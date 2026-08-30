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
