-- Marketplace media: product_images endi rasm ham, video ham saqlaydi.
-- Migratsiya additiv va idempotent: mavjud satrlar o'zgarmaydi.

-- 1. Ustunlar ------------------------------------------------------------
alter table public.product_images
  add column if not exists media_type text not null default 'image';

alter table public.product_images
  add column if not exists thumbnail_url text;

alter table public.product_images
  add column if not exists duration_seconds integer;

-- 2. Cheklovlar ----------------------------------------------------------
alter table public.product_images
  drop constraint if exists product_images_media_type_check;
alter table public.product_images
  add constraint product_images_media_type_check
  check (media_type in ('image', 'video'));

alter table public.product_images
  drop constraint if exists product_images_duration_check;
alter table public.product_images
  add constraint product_images_duration_check
  check (
    duration_seconds is null
    or (duration_seconds > 0 and duration_seconds <= 60)
  );

-- Video uchun poster majburiy: kartochka va galereya hech qachon bo'sh
-- ramka ko'rsatmasligi kerak.
alter table public.product_images
  drop constraint if exists product_images_video_thumbnail_check;
alter table public.product_images
  add constraint product_images_video_thumbnail_check
  check (
    media_type <> 'video'
    or (thumbnail_url is not null and length(btrim(thumbnail_url)) > 0)
  );

-- 3. Indeks --------------------------------------------------------------
-- Kartochka faqat muqovani (position = 0) o'qiydi.
create index if not exists product_images_cover_idx
  on public.product_images (product_id, position)
  where position = 0;

create index if not exists product_images_media_type_idx
  on public.product_images (product_id, media_type);

-- 4. Qoidalar triggeri ---------------------------------------------------
-- Frontend ham shu limitlarni tekshiradi, lekin baza oxirgi himoya bo'lishi
-- kerak: API orqali to'g'ridan-to'g'ri yozishga ham ta'sir qiladi.
create or replace function public.marketplace_check_product_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  media_count integer;
  video_count integer;
begin
  select
    count(*),
    count(*) filter (where media_type = 'video')
  into media_count, video_count
  from public.product_images
  where product_id = new.product_id
    and id <> new.id;

  if media_count + 1 > 10 then
    raise exception 'too_many_media';
  end if;

  if new.media_type = 'video' and video_count + 1 > 2 then
    raise exception 'too_many_videos';
  end if;

  -- Muqova doim rasm bo'ladi.
  if new.position = 0 and new.media_type <> 'image' then
    raise exception 'cover_must_be_image';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_product_media_guard on public.product_images;
create trigger marketplace_product_media_guard
  before insert or update on public.product_images
  for each row execute function public.marketplace_check_product_media();

-- 5. Eski satrlarni normallashtirish -------------------------------------
update public.product_images
set media_type = 'image'
where media_type is null;

notify pgrst, 'reload schema';
