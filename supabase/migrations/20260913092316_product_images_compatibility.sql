alter table public.products
  add column if not exists images text[] not null default '{}'::text[];

create or replace function public.refresh_product_images_cache(p_product_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products p
     set images = coalesce((
       select array_agg(pi.url order by pi.position nulls last, pi.created_at, pi.id)
       from public.product_images pi
       where pi.product_id = p_product_id
         and nullif(btrim(pi.url), '') is not null
     ), '{}'::text[])
   where p.id = p_product_id;
$$;

revoke all on function public.refresh_product_images_cache(uuid) from public, anon, authenticated;
grant execute on function public.refresh_product_images_cache(uuid) to service_role;

create or replace function public.sync_product_images_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_product_images_cache(old.product_id);
    return old;
  end if;

  perform public.refresh_product_images_cache(new.product_id);
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    perform public.refresh_product_images_cache(old.product_id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_product_images_cache() from public, anon, authenticated;
grant execute on function public.sync_product_images_cache() to service_role;

drop trigger if exists trg_sync_product_images_cache on public.product_images;
create trigger trg_sync_product_images_cache
after insert or update or delete on public.product_images
for each row execute function public.sync_product_images_cache();

update public.products p
set images = coalesce((
  select array_agg(pi.url order by pi.position nulls last, pi.created_at, pi.id)
  from public.product_images pi
  where pi.product_id = p.id
    and nullif(btrim(pi.url), '') is not null
), '{}'::text[]);

comment on column public.products.images is
  'Compatibility cache of product_images.url for legacy/current clients. Canonical product media remains public.product_images.';
