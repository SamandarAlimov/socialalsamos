-- Xarita uchun premium imkoniyatlar:
--   1) saqlangan joylar (favorites / kolleksiyalar)
--   2) tashriflar tarixi (Blink uslubida: qayerda, soat nechida, qancha turdi)
--   3) mavjud taksi parklari (o'z taksoparkimiz emas - integratsiya)

-- 1) SAQLANGAN JOYLAR --------------------------------------------------------
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  external_id text,
  external_source text,
  collection text not null default 'favorites',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);
create index if not exists saved_places_collection_idx on public.saved_places (user_id, collection);

alter table public.saved_places enable row level security;

drop policy if exists saved_places_own on public.saved_places;
create policy saved_places_own on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) TASHRIFLAR TARIXI -------------------------------------------------------
create table if not exists public.place_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  address text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  arrived_at timestamptz not null default now(),
  left_at timestamptz,
  dwell_seconds integer not null default 0,
  source text not null default 'auto',
  device_id text,
  created_at timestamptz not null default now()
);

create index if not exists place_visits_user_idx on public.place_visits (user_id, arrived_at desc);
create index if not exists place_visits_geo_idx on public.place_visits (user_id, latitude, longitude);

alter table public.place_visits enable row level security;

drop policy if exists place_visits_own on public.place_visits;
create policy place_visits_own on public.place_visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tashrifni yozish: yaqin (150 m) va yaqin vaqtdagi (2 soat) yozuv bo'lsa -
-- yangi qator qo'shmasdan turgan vaqtni uzaytiradi.
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
as $$
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
$$;

-- 3) TAKSI PROVAYDERLARI -----------------------------------------------------
create table if not exists public.taxi_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  deep_link text,
  web_link text,
  phone text,
  base_fare numeric not null default 0,
  per_km numeric not null default 0,
  per_min numeric not null default 0,
  min_fare numeric not null default 0,
  currency text not null default 'UZS',
  city text,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.taxi_providers enable row level security;

drop policy if exists taxi_providers_read on public.taxi_providers;
create policy taxi_providers_read on public.taxi_providers
  for select using (true);

insert into public.taxi_providers (slug, name, phone, base_fare, per_km, per_min, min_fare, position)
values
  ('yandex_go', 'Yandex Go', null, 8000, 2200, 350, 12000, 1),
  ('mytaxi', 'MyTaxi', '+998712000909', 7000, 2000, 300, 10000, 2),
  ('indrive', 'inDrive', null, 6000, 1800, 250, 9000, 3),
  ('millennium', 'Millennium 1080', '1080', 6000, 1700, 250, 9000, 4)
on conflict (slug) do nothing;
