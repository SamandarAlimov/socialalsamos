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
