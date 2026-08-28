-- Map premium: oldingi migratsiyani xavfsiz (idempotent) qilish + izohlar/reyting
-- Sabab: saved_places jadvali oldin boshqa ustunlar bilan yaratilgan bo'lsa,
-- "create table if not exists" o'tib ketadi va "collection" ustuni bo'lmaganligi
-- uchun index yaratishda: ERROR 42703: column "collection" does not exist.
-- Yechim: har bir ustunni "add column if not exists" bilan qo'shamiz.

create extension if not exists pgcrypto;

-- 1) SAQLANGAN JOYLAR --------------------------------------------------------
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null
);

alter table public.saved_places add column if not exists address text;
alter table public.saved_places add column if not exists category text;
alter table public.saved_places add column if not exists external_id text;
alter table public.saved_places add column if not exists external_source text;
alter table public.saved_places add column if not exists collection text;
alter table public.saved_places add column if not exists note text;
alter table public.saved_places add column if not exists created_at timestamptz not null default now();

update public.saved_places set collection = 'favorites' where collection is null;
alter table public.saved_places alter column collection set default 'favorites';
alter table public.saved_places alter column collection set not null;

create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);
create index if not exists saved_places_collection_idx on public.saved_places (user_id, collection);
create unique index if not exists saved_places_unique_idx
  on public.saved_places (user_id, round(latitude::numeric, 5), round(longitude::numeric, 5));

alter table public.saved_places enable row level security;
drop policy if exists saved_places_own on public.saved_places;
create policy saved_places_own on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) TASHRIFLAR TARIXI -------------------------------------------------------
create table if not exists public.place_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null
);

alter table public.place_visits add column if not exists name text;
alter table public.place_visits add column if not exists address text;
alter table public.place_visits add column if not exists category text;
alter table public.place_visits add column if not exists arrived_at timestamptz not null default now();
alter table public.place_visits add column if not exists left_at timestamptz;
alter table public.place_visits add column if not exists dwell_seconds integer not null default 0;
alter table public.place_visits add column if not exists source text not null default 'auto';
alter table public.place_visits add column if not exists device_id text;
alter table public.place_visits add column if not exists created_at timestamptz not null default now();

create index if not exists place_visits_user_idx on public.place_visits (user_id, arrived_at desc);
create index if not exists place_visits_geo_idx on public.place_visits (user_id, latitude, longitude);

alter table public.place_visits enable row level security;
drop policy if exists place_visits_own on public.place_visits;
create policy place_visits_own on public.place_visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tashrifni yozish: 150 m ichida va 2 soat ichida yozuv bo'lsa - yangi qator
-- qo'shmasdan turgan vaqtni uzaytiradi.
create or replace function public.track_place_visit(
  p_latitude double precision,
  p_longitude double precision,
  p_name text default null,
  p_address text default null,
  p_category text default null,
  p_dwell_seconds integer default 0,
  p_source text default 'auto',
  p_device_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  select id into v_id
  from public.place_visits
  where user_id = v_user
    and arrived_at > now() - interval '2 hours'
    and (
      6371000 * 2 * asin(
        sqrt(
          power(sin(radians(latitude - p_latitude) / 2), 2) +
          cos(radians(p_latitude)) * cos(radians(latitude)) *
          power(sin(radians(longitude - p_longitude) / 2), 2)
        )
      )
    ) < 150
  order by arrived_at desc
  limit 1;

  if v_id is not null then
    update public.place_visits
       set dwell_seconds = greatest(dwell_seconds, p_dwell_seconds),
           left_at = now(),
           name = coalesce(name, p_name),
           address = coalesce(address, p_address),
           category = coalesce(category, p_category)
     where id = v_id;
    return v_id;
  end if;

  insert into public.place_visits (
    user_id, name, address, category, latitude, longitude,
    dwell_seconds, source, device_id
  ) values (
    v_user, p_name, p_address, p_category, p_latitude, p_longitude,
    coalesce(p_dwell_seconds, 0), coalesce(p_source, 'auto'), p_device_id
  ) returning id into v_id;

  return v_id;
end;
$fn$;

-- 3) TAKSI PROVAYDERLARI -----------------------------------------------------
create table if not exists public.taxi_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null
);

alter table public.taxi_providers add column if not exists logo_url text;
alter table public.taxi_providers add column if not exists deep_link text;
alter table public.taxi_providers add column if not exists web_link text;
alter table public.taxi_providers add column if not exists phone text;
alter table public.taxi_providers add column if not exists base_fare numeric not null default 0;
alter table public.taxi_providers add column if not exists per_km numeric not null default 0;
alter table public.taxi_providers add column if not exists per_min numeric not null default 0;
alter table public.taxi_providers add column if not exists min_fare numeric not null default 0;
alter table public.taxi_providers add column if not exists currency text not null default 'UZS';
alter table public.taxi_providers add column if not exists city text;
alter table public.taxi_providers add column if not exists is_active boolean not null default true;
alter table public.taxi_providers add column if not exists position integer not null default 0;
alter table public.taxi_providers add column if not exists created_at timestamptz not null default now();

create unique index if not exists taxi_providers_slug_key on public.taxi_providers (slug);

alter table public.taxi_providers enable row level security;
drop policy if exists taxi_providers_read on public.taxi_providers;
create policy taxi_providers_read on public.taxi_providers for select using (true);

insert into public.taxi_providers (slug, name, phone, base_fare, per_km, per_min, min_fare, position)
values
  ('yandex_go', 'Yandex Go', null, 8000, 2200, 350, 12000, 1),
  ('mytaxi', 'MyTaxi', '+998712000909', 7000, 2000, 300, 10000, 2),
  ('indrive', 'inDrive', null, 6000, 1800, 250, 9000, 3),
  ('millennium', 'Millennium 1080', '1080', 6000, 1700, 250, 9000, 4)
on conflict (slug) do nothing;

-- 4) JOY IZOHLARI VA REYTINGI (Yandexdagi "Reviews" tabi) --------------------
create table if not exists public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_key text not null,
  place_name text,
  latitude double precision not null,
  longitude double precision not null,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.place_reviews add column if not exists place_name text;
alter table public.place_reviews add column if not exists comment text;
alter table public.place_reviews add column if not exists updated_at timestamptz not null default now();

do $chk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'place_reviews_rating_range'
  ) then
    alter table public.place_reviews
      add constraint place_reviews_rating_range check (rating between 1 and 5);
  end if;
end;
$chk$;

create unique index if not exists place_reviews_user_place_idx
  on public.place_reviews (user_id, place_key);
create index if not exists place_reviews_place_idx
  on public.place_reviews (place_key, created_at desc);

alter table public.place_reviews enable row level security;

drop policy if exists place_reviews_read on public.place_reviews;
create policy place_reviews_read on public.place_reviews for select using (true);

drop policy if exists place_reviews_insert on public.place_reviews;
create policy place_reviews_insert on public.place_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists place_reviews_update on public.place_reviews;
create policy place_reviews_update on public.place_reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists place_reviews_delete on public.place_reviews;
create policy place_reviews_delete on public.place_reviews
  for delete using (auth.uid() = user_id);

-- Reyting yig'indisi: o'rtacha ball va izohlar soni
create or replace function public.place_rating_summary(p_place_key text)
returns table (avg_rating numeric, total bigint)
language sql
stable
security definer
set search_path = public
as $sum$
  select round(avg(rating)::numeric, 1) as avg_rating, count(*) as total
  from public.place_reviews
  where place_key = p_place_key;
$sum$;

-- 5) E'LONLARGA KOORDINATA (xaritada "yaqin e'lonlar" uchun) -----------------
alter table public.products add column if not exists latitude double precision;
alter table public.products add column if not exists longitude double precision;
create index if not exists products_geo_idx on public.products (latitude, longitude);
