-- GENERATED FILE: deterministic fresh Alsamos Supabase bootstrap
-- Sources: SamandarAlimov/alsamos-superapp + SamandarAlimov/socialalsamos
-- Test fixture migrations are intentionally excluded.
-- Do not edit this generated file directly.

-- ============================================================================
-- SOURCE B-web: 20260829000500_sticker_system.sql
-- SHA256 1a27b4c6412369fc7b26bc53be5384f1b50f16be9cff272d47ef22b6e3605fd7
-- ============================================================================
-- =============================================================================
-- Premium stiker tizimi
--
-- Eski holat: stikerlar faqat kodda qattiq yozilgan emoji massivi edi — paket
-- qo'shish, sevimliga olish, oxirgi ishlatilganlar va qidiruv yo'q edi.
--
-- Yangi holat: stikerlar bazada, foydalanuvchi paket qo'shadi, o'z stikerini
-- yuklaydi, sevimlilarini saqlaydi. Barcha jadvallar RLS bilan himoyalangan.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sticker_kind') then
    create type public.sticker_kind as enum ('animated_emoji', 'image', 'gif', 'lottie', 'video');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sticker_pack_source') then
    create type public.sticker_pack_source as enum ('builtin', 'platform', 'giphy', 'user');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Paketlar
-- -----------------------------------------------------------------------------

create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  source public.sticker_pack_source not null default 'platform',
  default_kind public.sticker_kind not null default 'image',
  icon_url text,
  icon_emoji text,
  -- Professional ikonka kaliti (lucide): 'smile', 'heart', 'party-popper' ...
  icon_key text,
  is_premium boolean not null default false,
  is_public boolean not null default true,
  owner_id uuid references auth.users (id) on delete cascade,
  position integer not null default 0,
  sticker_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sticker_packs_public_idx
  on public.sticker_packs (is_public, position, created_at desc);
create index if not exists sticker_packs_owner_idx
  on public.sticker_packs (owner_id);

alter table public.sticker_packs enable row level security;

drop policy if exists "sticker_packs_select" on public.sticker_packs;
create policy "sticker_packs_select"
  on public.sticker_packs for select
  using (is_public = true or owner_id = auth.uid());

drop policy if exists "sticker_packs_insert_own" on public.sticker_packs;
create policy "sticker_packs_insert_own"
  on public.sticker_packs for insert
  with check (owner_id = auth.uid() and source = 'user');

drop policy if exists "sticker_packs_update_own" on public.sticker_packs;
create policy "sticker_packs_update_own"
  on public.sticker_packs for update
  using (owner_id = auth.uid());

drop policy if exists "sticker_packs_delete_own" on public.sticker_packs;
create policy "sticker_packs_delete_own"
  on public.sticker_packs for delete
  using (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Stikerlar
-- -----------------------------------------------------------------------------

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.sticker_packs (id) on delete cascade,
  kind public.sticker_kind not null default 'image',
  -- Animatsion emoji uchun glif, boshqa turlarda NULL
  emoji text,
  name text,
  keywords text[] not null default '{}',
  preview_url text,
  full_url text,
  width integer,
  height integer,
  duration_seconds numeric,
  position integer not null default 0,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  -- Har bir stikerda ko'rsatiladigan biror narsa bo'lishi shart
  constraint stickers_has_payload check (
    emoji is not null or full_url is not null
  )
);

create index if not exists stickers_pack_idx on public.stickers (pack_id, position);
create index if not exists stickers_use_count_idx on public.stickers (use_count desc);
create index if not exists stickers_keywords_idx on public.stickers using gin (keywords);

alter table public.stickers enable row level security;

drop policy if exists "stickers_select" on public.stickers;
create policy "stickers_select"
  on public.stickers for select
  using (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id
        and (p.is_public = true or p.owner_id = auth.uid())
    )
  );

drop policy if exists "stickers_write_own_pack" on public.stickers;
create policy "stickers_write_own_pack"
  on public.stickers for all
  using (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id and p.owner_id = auth.uid()
    )
  );

-- Paketdagi stiker sonini avtomatik yuritamiz
create or replace function public.sync_sticker_pack_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.sticker_packs
      set sticker_count = sticker_count + 1
      where id = new.pack_id;
  elsif tg_op = 'DELETE' then
    update public.sticker_packs
      set sticker_count = greatest(sticker_count - 1, 0)
      where id = old.pack_id;
  end if;
  return null;
end $$;

drop trigger if exists sync_sticker_pack_count_trigger on public.stickers;
create trigger sync_sticker_pack_count_trigger
  after insert or delete on public.stickers
  for each row execute function public.sync_sticker_pack_count();

-- -----------------------------------------------------------------------------
-- Foydalanuvchi paketlari
-- -----------------------------------------------------------------------------

create table if not exists public.user_sticker_packs (
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id uuid not null references public.sticker_packs (id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

alter table public.user_sticker_packs enable row level security;

drop policy if exists "user_sticker_packs_own" on public.user_sticker_packs;
create policy "user_sticker_packs_own"
  on public.user_sticker_packs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Oxirgi ishlatilganlar va sevimlilar
--
-- `sticker_key` — stikerning barqaror kaliti: emoji glifi yoki URL.
-- Shu sababli tashqi (GIPHY) stikerlar ham saqlanadi.
-- -----------------------------------------------------------------------------

create table if not exists public.sticker_recents (
  user_id uuid not null references auth.users (id) on delete cascade,
  sticker_key text not null,
  kind public.sticker_kind not null default 'image',
  sticker_id uuid references public.stickers (id) on delete set null,
  preview_url text,
  full_url text,
  use_count integer not null default 1,
  used_at timestamptz not null default now(),
  primary key (user_id, sticker_key)
);

create index if not exists sticker_recents_used_idx
  on public.sticker_recents (user_id, used_at desc);

alter table public.sticker_recents enable row level security;

drop policy if exists "sticker_recents_own" on public.sticker_recents;
create policy "sticker_recents_own"
  on public.sticker_recents for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.sticker_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  sticker_key text not null,
  kind public.sticker_kind not null default 'image',
  sticker_id uuid references public.stickers (id) on delete set null,
  preview_url text,
  full_url text,
  created_at timestamptz not null default now(),
  primary key (user_id, sticker_key)
);

create index if not exists sticker_favorites_created_idx
  on public.sticker_favorites (user_id, created_at desc);

alter table public.sticker_favorites enable row level security;

drop policy if exists "sticker_favorites_own" on public.sticker_favorites;
create policy "sticker_favorites_own"
  on public.sticker_favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RPC lar
-- -----------------------------------------------------------------------------

-- Nom va kalit so'zlar bo'yicha qidiruv (o'z paketlari ham qamrab olinadi)
create or replace function public.search_stickers(
  p_query text,
  p_limit integer default 60
)
returns table (
  id uuid,
  pack_id uuid,
  pack_name text,
  kind public.sticker_kind,
  emoji text,
  name text,
  preview_url text,
  full_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.pack_id, p.name, s.kind, s.emoji, s.name, s.preview_url, s.full_url
  from public.stickers s
  join public.sticker_packs p on p.id = s.pack_id
  where (p.is_public = true or p.owner_id = auth.uid())
    and (
      p_query is null
      or length(trim(p_query)) = 0
      or coalesce(s.name, '') ilike '%' || p_query || '%'
      or s.emoji = p_query
      or exists (
        select 1 from unnest(s.keywords) k
        where k ilike '%' || p_query || '%'
      )
    )
  order by s.use_count desc, s.position asc
  limit least(coalesce(p_limit, 60), 200);
$$;

-- Stiker ishlatilganda chaqiriladi: recent ro'yxati va statistika yangilanadi
create or replace function public.touch_sticker_recent(
  p_sticker_key text,
  p_kind public.sticker_kind default 'image',
  p_preview_url text default null,
  p_full_url text default null,
  p_sticker_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_sticker_key is null then
    return;
  end if;

  insert into public.sticker_recents as r
    (user_id, sticker_key, kind, sticker_id, preview_url, full_url)
  values
    (auth.uid(), p_sticker_key, p_kind, p_sticker_id, p_preview_url, p_full_url)
  on conflict (user_id, sticker_key) do update
    set use_count = r.use_count + 1,
        used_at = now(),
        preview_url = coalesce(excluded.preview_url, r.preview_url),
        full_url = coalesce(excluded.full_url, r.full_url);

  if p_sticker_id is not null then
    update public.stickers
      set use_count = use_count + 1
      where id = p_sticker_id;
  end if;
end $$;

create or replace function public.top_sticker_recents(p_limit integer default 32)
returns setof public.sticker_recents
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.sticker_recents
  where user_id = auth.uid()
  order by used_at desc
  limit least(coalesce(p_limit, 32), 100);
$$;

-- Platformada eng ko'p ishlatilgan stikerlar ("Trend" bo'limi uchun)
create or replace function public.popular_stickers(p_limit integer default 40)
returns setof public.stickers
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.stickers s
  join public.sticker_packs p on p.id = s.pack_id
  where p.is_public = true
  order by s.use_count desc, s.created_at desc
  limit least(coalesce(p_limit, 40), 100);
$$;

-- -----------------------------------------------------------------------------
-- Boshlang'ich paketlar (faqat metadata — animatsion emoji stikerlari
-- kod tomonida CDN dan keladi, shuning uchun bazaga fayl yozilmaydi)
-- -----------------------------------------------------------------------------

insert into public.sticker_packs (slug, name, source, default_kind, icon_emoji, icon_key, position)
values
  ('reactions', 'Reaksiyalar', 'builtin', 'animated_emoji', '👍', 'thumbs-up', 1),
  ('emotions', 'Hissiyot', 'builtin', 'animated_emoji', '😂', 'smile', 2),
  ('love', 'Sevgi', 'builtin', 'animated_emoji', '❤️', 'heart', 3),
  ('party', 'Bayram', 'builtin', 'animated_emoji', '🎉', 'party-popper', 4),
  ('animals', 'Hayvonlar', 'builtin', 'animated_emoji', '🐶', 'paw-print', 5),
  ('gestures', 'Imo-ishora', 'builtin', 'animated_emoji', '👋', 'hand', 6),
  ('food', 'Ovqat', 'builtin', 'animated_emoji', '🍔', 'utensils-crossed', 7),
  ('nature', 'Tabiat', 'builtin', 'animated_emoji', '🌈', 'leaf', 8)
on conflict (slug) do nothing;


-- ============================================================================
-- SOURCE B-web: 20260829010000_map_premium_fix.sql
-- SHA256 afa3cfc13693ae398bed7593dcb10c89d74a5250081f462944d4a9f773070f97
-- ============================================================================
-- DEPRECATED - DO NOT APPLY. This file intentionally does nothing.
--
-- This migration expected to own the premium map schema:
--   saved_places(place_key, collection, category, ...)
--   place_visits(...)
--   place_reviews(place_key, comment, rating)
--   taxi_providers(...)
--   track_place_visit(...), place_rating_summary(p_place_key)
--
-- Two of those tables already existed, with different column names:
--
--   saved_places, from 20260712200000_map_p0_features.sql
--     id, user_id, list_id -> saved_place_lists(id), name, latitude,
--     longitude, address, notes, icon, is_favorite, visited_at,
--     created_at, updated_at
--     No collection column. Grouping is done through list_id.
--
--   place_reviews, from 20260803020000_social_map_features.sql
--     id, user_id, place_id, place_name, rating, review_text, categories,
--     category_ratings, photo_urls, helpful_count, visit_date,
--     created_at, updated_at, UNIQUE(user_id, place_id)
--     No place_key, no comment.
--
-- This is the direct cause of the reported failure:
--   ERROR: 42703: column "collection" does not exist
-- CREATE TABLE IF NOT EXISTS did nothing because saved_places was already
-- there, so collection was never added, and the CREATE INDEX that followed
-- referenced a column that does not exist. Adding per-column ALTER statements
-- fixed the symptom but not the cause: the web client was still assuming it
-- owned tables it did not own.
--
-- Genuinely new, and therefore kept in the replacement migration:
--   place_visits    - passive dwell tracking, distinct from the deliberate,
--                     social check_ins table
--   taxi_providers  - external operators we deep-link into, distinct from
--                     taxi_live_locations, which tracks our own drivers
--
-- Replaced by:
--   alsamos-superapp/supabase/migrations/20260831053000_reconcile_map_schema.sql
--
-- That migration keeps the canonical tables authoritative and adds:
--   * saved_places.collection / category / place_key, with a trigger that
--     derives collection from the list name and place_key from coordinates
--   * place_reviews.place_key / comment, with a trigger that fills the NOT NULL
--     place_id and place_name so web inserts succeed
--   * place_rating_summary(p_place_key), reading the base table so it stays
--     live, unlike the place_statistics materialized view
--   * place_visits, taxi_providers, track_place_visit()
--   * products.latitude / longitude and products_geo_idx
--
-- See docs/CONTRACTS/db-schema.md section 4 for the full verified diff.

SELECT 1;


-- ============================================================================
-- SOURCE B-web: 20260829010000_user_stickers.sql
-- SHA256 d8f64c4b52ad635b5dbabc9e51f3ff917bb0ccf5891d99edeb717c5bba6694a2
-- ============================================================================
-- Bosqich C: foydalanuvchi stikerlari
--
-- Maqsad: foydalanuvchi rasm yuklab, fonini o‘chirib, o‘zining shaxsiy
-- stiker paketiga qo‘shishi. Fayllar 512x512 WebP ko‘rinishida 'stickers'
-- chelagida saqlanadi.
--
-- Bu migratsiya idempotent: bir necha marta ishga tushsa ham xato bermaydi.

-- ---------------------------------------------------------------------------
-- 1. Saqlash chelagi
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('stickers', 'stickers', true)
on conflict (id) do nothing;

-- Har bir foydalanuvchi faqat o‘z papkasiga yozadi: stickers/<user_id>/...
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Stickers are publicly readable'
  ) then
    create policy "Stickers are publicly readable"
      on storage.objects for select
      using (bucket_id = 'stickers');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users upload own stickers'
  ) then
    create policy "Users upload own stickers"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'stickers'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users update own stickers'
  ) then
    create policy "Users update own stickers"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'stickers'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users delete own stickers'
  ) then
    create policy "Users delete own stickers"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'stickers'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Moderatsiya holati (Bosqich F shu ustunlar ustida quriladi)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sticker_moderation_status') then
    create type sticker_moderation_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

alter table public.stickers
  add column if not exists created_by uuid references auth.users(id) on delete cascade,
  add column if not exists is_public boolean not null default false,
  add column if not exists moderation_status sticker_moderation_status not null default 'approved',
  add column if not exists nsfw_score numeric,
  add column if not exists file_size integer,
  add column if not exists storage_path text;

-- Boshqa foydalanuvchiga ko‘rinadigan stiker albatta tekshiruvdan o‘tgan
-- bo‘lishi kerak — bu shart Bosqich F uchun poydevor.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stickers_public_requires_approval'
  ) then
    alter table public.stickers
      add constraint stickers_public_requires_approval
      check (is_public = false or moderation_status = 'approved');
  end if;
end $$;

create index if not exists stickers_created_by_idx
  on public.stickers (created_by, created_at desc);

create index if not exists stickers_moderation_idx
  on public.stickers (moderation_status)
  where moderation_status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Shaxsiy paket
-- ---------------------------------------------------------------------------

-- Foydalanuvchining shaxsiy paketini topadi, bo‘lmasa yaratadi.
-- Bitta foydalanuvchi = bitta "Mening stikerlarim" paketi.
create or replace function public.ensure_personal_sticker_pack()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pack uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select id into v_pack
  from public.sticker_packs
  where owner_id = v_user and source = 'user'
  order by created_at
  limit 1;

  if v_pack is not null then
    return v_pack;
  end if;

  insert into public.sticker_packs (slug, name, source, owner_id, icon_key, is_premium, position)
  values (
    'user-' || replace(v_user::text, '-', ''),
    'Mening stikerlarim',
    'user',
    v_user,
    'UserRound',
    false,
    -1
  )
  returning id into v_pack;

  return v_pack;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Kvota
-- ---------------------------------------------------------------------------

-- Cheksiz yuklash saqlash xarajatini va moderatsiya navbatini bo‘g‘ib
-- qo‘yadi, shuning uchun kunlik chegara hisoblanadi.
create or replace function public.sticker_upload_quota_used(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.stickers
  where created_by = p_user_id
    and created_at > now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS — o‘z stikerini boshqarish
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stickers'
      and policyname = 'Users insert stickers into own packs'
  ) then
    create policy "Users insert stickers into own packs"
      on public.stickers for insert
      to authenticated
      with check (
        created_by = auth.uid()
        and exists (
          select 1 from public.sticker_packs p
          where p.id = pack_id and p.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stickers'
      and policyname = 'Users manage own stickers'
  ) then
    create policy "Users manage own stickers"
      on public.stickers for update
      to authenticated
      using (created_by = auth.uid())
      with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stickers'
      and policyname = 'Users delete own stickers'
  ) then
    create policy "Users delete own stickers"
      on public.stickers for delete
      to authenticated
      using (created_by = auth.uid());
  end if;
end $$;

grant execute on function public.ensure_personal_sticker_pack() to authenticated;
grant execute on function public.sticker_upload_quota_used(uuid) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260829020000_sticker_pack_sharing.sql
-- SHA256 77aa53d19645c90ceab4d6fcb0bf54de7340e469373c2b24f2aaf2173f4dd6a3
-- ============================================================================
-- Bosqich C yakuni: stiker paketini ulashish va ommaga ochish
--
-- Model: paket egasi "ommaga ochish" so‘rovini yuboradi, paket va uning
-- stikerlari moderatsiya navbatiga tushadi. Tasdiqlanmagan paket boshqa
-- foydalanuvchiga ko‘rinmaydi — bu shart bazaning o‘zida.
--
-- Migratsiya idempotent.

alter table public.sticker_packs
  add column if not exists is_public boolean not null default false,
  add column if not exists review_status sticker_moderation_status not null default 'approved',
  add column if not exists submitted_at timestamptz,
  add column if not exists install_count integer not null default 0;

-- Ommaviy paket albatta tasdiqlangan bo‘lishi kerak.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sticker_packs_public_requires_approval'
  ) then
    alter table public.sticker_packs
      add constraint sticker_packs_public_requires_approval
      check (is_public = false or review_status = 'approved');
  end if;
end $$;

create index if not exists sticker_packs_public_idx
  on public.sticker_packs (is_public, install_count desc)
  where is_public = true;

create index if not exists sticker_packs_review_idx
  on public.sticker_packs (review_status, submitted_at)
  where review_status = 'pending';

-- ---------------------------------------------------------------------------
-- Ommaviy paketlarni o‘qish
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sticker_packs'
      and policyname = 'Approved public packs are readable'
  ) then
    create policy "Approved public packs are readable"
      on public.sticker_packs for select
      using (is_public = true and review_status = 'approved');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stickers'
      and policyname = 'Stickers of approved public packs are readable'
  ) then
    create policy "Stickers of approved public packs are readable"
      on public.stickers for select
      using (
        exists (
          select 1 from public.sticker_packs p
          where p.id = pack_id
            and p.is_public = true
            and p.review_status = 'approved'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ommaga ochish so‘rovi
-- ---------------------------------------------------------------------------

-- Bo‘sh yoki bir-ikki stikerli paket moderatsiya navbatini behuda
-- to‘ldiradi, shuning uchun minimal 3 stiker talab qilinadi.
create or replace function public.request_public_sticker_pack(p_pack_id uuid)
returns sticker_moderation_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select owner_id into v_owner
  from public.sticker_packs
  where id = p_pack_id;

  if v_owner is null or v_owner <> v_user then
    raise exception 'Bu paket sizga tegishli emas';
  end if;

  select count(*) into v_count
  from public.stickers
  where pack_id = p_pack_id;

  if v_count < 3 then
    raise exception 'Kamida 3 ta stiker kerak';
  end if;

  update public.stickers
  set moderation_status = 'pending'
  where pack_id = p_pack_id
    and moderation_status <> 'approved';

  update public.sticker_packs
  set review_status = 'pending',
      submitted_at = now()
  where id = p_pack_id;

  return 'pending'::sticker_moderation_status;
end $$;

-- ---------------------------------------------------------------------------
-- Havola orqali paketni qo‘shish
-- ---------------------------------------------------------------------------

create or replace function public.add_sticker_pack_by_slug(p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pack uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  select id into v_pack
  from public.sticker_packs
  where slug = p_slug
    and (
      (is_public = true and review_status = 'approved')
      or owner_id = v_user
    );

  if v_pack is null then
    raise exception 'Paket topilmadi yoki hali tasdiqlanmagan';
  end if;

  insert into public.user_sticker_packs (user_id, pack_id)
  values (v_user, v_pack)
  on conflict do nothing;

  update public.sticker_packs
  set install_count = install_count + 1
  where id = v_pack;

  return v_pack;
end $$;

grant execute on function public.request_public_sticker_pack(uuid) to authenticated;
grant execute on function public.add_sticker_pack_by_slug(text) to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260829030000_story_stickers.sql
-- SHA256 19458f1201eb6ca6d9b3a936689f0a9956b847957b7bff47986f5860855265f0
-- ============================================================================
-- Bosqich D: interaktiv story/reel stikerlari
--
-- Nima uchun alohida jadval?
-- Oddiy bezak stikerlari `post_media.edit_state.stickers` ichida qoladi — ular
-- shunchaki rasm. Interaktiv stikerlar esa javob qabul qiladi, natija
-- hisoblaydi va RLS talab qiladi; JSONB ichida bunday narsani to‘g‘ri
-- boshqarib bo‘lmaydi. Shuning uchun ular normal jadvalda.
--
-- Migratsiya idempotent.

-- ---------------------------------------------------------------------------
-- Turlar
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'story_sticker_type') then
    create type story_sticker_type as enum (
      'poll',
      'question',
      'quiz',
      'slider',
      'location',
      'music',
      'mention',
      'hashtag',
      'link',
      'countdown'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stikerlar
-- ---------------------------------------------------------------------------

create table if not exists public.story_stickers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid references public.post_media(id) on delete cascade,
  type story_sticker_type not null,

  -- Joylashuv 0..1 nisbiy koordinatalarda (ADR-006 dagi model bilan bir xil).
  x numeric not null default 0.5,
  y numeric not null default 0.5,
  scale numeric not null default 0.6,
  rotation numeric not null default 0,
  z integer not null default 0,

  -- Reel uchun stiker ko‘rinadigan vaqt oynasi (sekundlarda).
  start_seconds numeric,
  end_seconds numeric,

  -- Turga xos sozlamalar: savol matni, variantlar, to‘g‘ri javob va h.k.
  config jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint story_stickers_position_check
    check (x >= -0.5 and x <= 1.5 and y >= -0.5 and y <= 1.5),
  constraint story_stickers_scale_check
    check (scale > 0 and scale <= 3),
  constraint story_stickers_window_check
    check (
      start_seconds is null
      or end_seconds is null
      or end_seconds > start_seconds
    ),
  constraint story_stickers_window_positive_check
    check (
      (start_seconds is null or start_seconds >= 0)
      and (end_seconds is null or end_seconds >= 0)
    )
);

create index if not exists story_stickers_post_idx
  on public.story_stickers (post_id, z);

create index if not exists story_stickers_media_idx
  on public.story_stickers (media_id);

-- ---------------------------------------------------------------------------
-- Javoblar
-- ---------------------------------------------------------------------------

create table if not exists public.story_sticker_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  option_index integer,       -- poll, quiz
  numeric_value numeric,      -- slider
  text_answer text,           -- question

  created_at timestamptz not null default now(),
  unique (sticker_id, user_id)
);

create index if not exists story_sticker_responses_sticker_idx
  on public.story_sticker_responses (sticker_id);

-- Javob turga mos kelishini baza darajasida tekshiramiz: klient xato
-- yuborsa ham noto‘g‘ri ma’lumot saqlanmaydi.
create or replace function public.validate_story_sticker_response()
returns trigger
language plpgsql
as $$
declare
  v_type story_sticker_type;
  v_config jsonb;
  v_options integer;
begin
  select type, config into v_type, v_config
  from public.story_stickers
  where id = new.sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if v_type in ('poll', 'quiz') then
    v_options := coalesce(jsonb_array_length(v_config -> 'options'), 0);

    if new.option_index is null then
      raise exception 'Variant tanlanishi kerak';
    end if;

    if new.option_index < 0 or new.option_index >= v_options then
      raise exception 'Variant mavjud emas';
    end if;

    new.numeric_value := null;
    new.text_answer := null;

  elsif v_type = 'slider' then
    if new.numeric_value is null then
      raise exception 'Slayder qiymati kerak';
    end if;

    if new.numeric_value < 0 or new.numeric_value > 100 then
      raise exception 'Slayder qiymati 0..100 oralig‘ida bo‘lishi kerak';
    end if;

    new.option_index := null;
    new.text_answer := null;

  elsif v_type = 'question' then
    if new.text_answer is null or length(btrim(new.text_answer)) = 0 then
      raise exception 'Javob matni bo‘sh bo‘lmasligi kerak';
    end if;

    new.text_answer := left(btrim(new.text_answer), 280);
    new.option_index := null;
    new.numeric_value := null;

  else
    -- location, music, mention, hashtag, link, countdown javob qabul qilmaydi.
    raise exception 'Bu stiker turi javob qabul qilmaydi';
  end if;

  return new;
end $$;

drop trigger if exists validate_story_sticker_response_trigger on public.story_sticker_responses;
create trigger validate_story_sticker_response_trigger
  before insert or update on public.story_sticker_responses
  for each row execute function public.validate_story_sticker_response();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.story_stickers enable row level security;
alter table public.story_sticker_responses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_stickers' and policyname = 'Story stickers are readable'
  ) then
    create policy "Story stickers are readable"
      on public.story_stickers for select
      using (
        exists (select 1 from public.posts p where p.id = post_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_stickers' and policyname = 'Post owner manages story stickers'
  ) then
    create policy "Post owner manages story stickers"
      on public.story_stickers for all
      using (
        exists (
          select 1 from public.posts p
          where p.id = post_id and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.posts p
          where p.id = post_id and p.user_id = auth.uid()
        )
      );
  end if;

  -- Javoblarni faqat javob egasi va post egasi ko‘radi.
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_sticker_responses' and policyname = 'Own and owner readable responses'
  ) then
    create policy "Own and owner readable responses"
      on public.story_sticker_responses for select
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from public.story_stickers s
          join public.posts p on p.id = s.post_id
          where s.id = sticker_id and p.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_sticker_responses' and policyname = 'Users write own responses'
  ) then
    create policy "Users write own responses"
      on public.story_sticker_responses for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Javob berish
-- ---------------------------------------------------------------------------

create or replace function public.respond_story_sticker(
  p_sticker_id uuid,
  p_option_index integer default null,
  p_numeric_value numeric default null,
  p_text_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  insert into public.story_sticker_responses (
    sticker_id, user_id, option_index, numeric_value, text_answer
  )
  values (p_sticker_id, v_user, p_option_index, p_numeric_value, p_text_answer)
  on conflict (sticker_id, user_id) do update
    set option_index = excluded.option_index,
        numeric_value = excluded.numeric_value,
        text_answer = excluded.text_answer,
        created_at = now()
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Natijalar
-- ---------------------------------------------------------------------------

-- Natija jamlanmasi hammaga ko‘rinadi, lekin savol stikerining matnli
-- javoblari faqat post egasiga qaytariladi.
create or replace function public.story_sticker_results(p_sticker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_total integer;
  v_result jsonb;
begin
  select s.type, s.config, (p.user_id = v_user)
  into v_type, v_config, v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  select count(*) into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts', coalesce(jsonb_object_agg(option_index::text, cnt), '{}'::jsonb),
      'myChoice', (
        select option_index from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      ),
      'correctIndex', case
        when v_type = 'quiz' then v_config -> 'correctIndex'
        else null
      end
    )
    into v_result
    from (
      select option_index, count(*) as cnt
      from public.story_sticker_responses
      where sticker_id = p_sticker_id
      group by option_index
    ) grouped;

  elsif v_type = 'slider' then
    select jsonb_build_object(
      'type', 'slider',
      'total', v_total,
      'average', round(coalesce(avg(numeric_value), 0), 1),
      'myValue', (
        select numeric_value from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers', case
        when v_is_owner then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', user_id,
            'text', text_answer,
            'createdAt', created_at
          ) order by created_at desc), '[]'::jsonb)
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
        )
        else '[]'::jsonb
      end
    );

  else
    v_result := jsonb_build_object('type', v_type, 'total', 0);
  end if;

  return coalesce(v_result, jsonb_build_object('type', v_type, 'total', v_total));
end $$;

grant execute on function public.respond_story_sticker(uuid, integer, numeric, text) to authenticated;
grant execute on function public.story_sticker_results(uuid) to authenticated;

-- Realtime: natijalar tirik yangilanishi uchun.
do $$
begin
  begin
    alter publication supabase_realtime add table public.story_sticker_responses;
  exception when others then
    null;
  end;
end $$;


-- ============================================================================
-- SOURCE B-web: 20260829040000_sticker_trends_moderation.sql
-- SHA256 f3e9a75d8e97cd0b1a3a7ef55a9f70cf15ac0778f865483a3f4da82575b408e0
-- ============================================================================
-- Bosqich F: stiker statistikasi, moderatsiya navbati va NSFW tekshiruvi
--
-- Asosiy qoida: yuklangan stiker ommaga faqat (1) NSFW tekshiruvidan o‘tgan
-- va (2) tasdiqlangan bo‘lsa chiqadi. Bu shart bazada, ya’ni klient yoki
-- Edge Function xato ishlasa ham buzilmaydi.
--
-- Migratsiya idempotent.

alter table public.stickers
  add column if not exists nsfw_checked_at timestamptz,
  add column if not exists nsfw_labels jsonb,
  add column if not exists moderation_reason text,
  add column if not exists usage_count integer not null default 0;

-- Tekshirilmagan stiker ommaviy bo‘lishi mumkin emas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stickers_public_requires_nsfw_check'
  ) then
    alter table public.stickers
      add constraint stickers_public_requires_nsfw_check
      check (is_public = false or nsfw_checked_at is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ishlatilish statistikasi
-- ---------------------------------------------------------------------------

-- Nima uchun alohida hodisalar jadvali? Faqat `usage_count` ni oshirib
-- borsak, "oxirgi 48 soatda trend" degan savolga javob bera olmaymiz.
create table if not exists public.sticker_usage_events (
  id bigserial primary key,
  sticker_id uuid references public.stickers(id) on delete cascade,
  sticker_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  context text not null default 'post',
  created_at timestamptz not null default now()
);

create index if not exists sticker_usage_events_recent_idx
  on public.sticker_usage_events (created_at desc);

create index if not exists sticker_usage_events_sticker_idx
  on public.sticker_usage_events (sticker_id, created_at desc);

alter table public.sticker_usage_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'sticker_usage_events' and policyname = 'Users log own sticker usage'
  ) then
    create policy "Users log own sticker usage"
      on public.sticker_usage_events for insert
      with check (user_id = auth.uid());
  end if;
end $$;

create or replace function public.log_sticker_usage(
  p_sticker_key text,
  p_sticker_id uuid default null,
  p_context text default 'post'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  insert into public.sticker_usage_events (sticker_id, sticker_key, user_id, context)
  values (p_sticker_id, p_sticker_key, v_user, coalesce(p_context, 'post'));

  if p_sticker_id is not null then
    update public.stickers
    set usage_count = usage_count + 1
    where id = p_sticker_id;
  end if;
end $$;

-- Trend hisobi: oyna ichidagi hodisalar soni asosiy mezon, umumiy son
-- ikkilamchi. Shu sababli yangi stiker eski "gigant" stikerlarni bosib
-- o‘tishga imkon topadi.
create or replace function public.trending_stickers(
  p_limit integer default 24,
  p_window_hours integer default 48
)
returns table (
  sticker_id uuid,
  sticker_key text,
  recent_uses bigint,
  total_uses integer,
  preview_url text,
  full_url text,
  kind sticker_kind
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.sticker_id,
    e.sticker_key,
    count(*) as recent_uses,
    coalesce(max(s.usage_count), 0) as total_uses,
    max(s.preview_url) as preview_url,
    max(s.full_url) as full_url,
    max(s.kind) as kind
  from public.sticker_usage_events e
  left join public.stickers s on s.id = e.sticker_id
  where e.created_at > now() - make_interval(hours => greatest(1, p_window_hours))
    and (
      s.id is null
      or s.moderation_status = 'approved'
      or s.created_by is null
    )
  group by e.sticker_id, e.sticker_key
  order by count(*) desc, coalesce(max(s.usage_count), 0) desc
  limit greatest(1, least(100, p_limit));
$$;

-- ---------------------------------------------------------------------------
-- Shikoyatlar
-- ---------------------------------------------------------------------------

create table if not exists public.sticker_reports (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.stickers(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (sticker_id, reporter_id)
);

alter table public.sticker_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'sticker_reports' and policyname = 'Users create own reports'
  ) then
    create policy "Users create own reports"
      on public.sticker_reports for insert
      with check (reporter_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Moderatorlar
-- ---------------------------------------------------------------------------

-- Alohida jadval: loyihada hozircha umumiy rollar tizimi yo‘q va
-- moderatsiya uni kutib turmasligi kerak. Rollar tizimi paydo bo‘lganda
-- faqat is_sticker_moderator() ichi o‘zgaradi.
create table if not exists public.sticker_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.sticker_moderators enable row level security;

create or replace function public.is_sticker_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sticker_moderators where user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Moderatsiya navbati
-- ---------------------------------------------------------------------------

create or replace function public.pending_sticker_moderation(p_limit integer default 50)
returns table (
  sticker_id uuid,
  pack_id uuid,
  pack_name text,
  owner_id uuid,
  preview_url text,
  full_url text,
  nsfw_score numeric,
  nsfw_labels jsonb,
  report_count bigint,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_sticker_moderator() then
    raise exception 'Ruxsat yo‘q';
  end if;

  return query
  select
    s.id,
    s.pack_id,
    p.name,
    s.created_by,
    s.preview_url,
    s.full_url,
    s.nsfw_score,
    s.nsfw_labels,
    (select count(*) from public.sticker_reports r where r.sticker_id = s.id),
    p.submitted_at
  from public.stickers s
  join public.sticker_packs p on p.id = s.pack_id
  where s.moderation_status = 'pending'
  order by
    (select count(*) from public.sticker_reports r where r.sticker_id = s.id) desc,
    coalesce(s.nsfw_score, 0) desc,
    p.submitted_at nulls last
  limit greatest(1, least(200, p_limit));
end $$;

-- Moderator qarori. Paketdagi barcha stikerlar tasdiqlanganda paket
-- avtomatik ommaviy holatga o‘tadi — egasi ikkinchi marta so‘rov
-- yuborishi shart emas.
create or replace function public.review_sticker(
  p_sticker_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns sticker_moderation_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack uuid;
  v_status sticker_moderation_status;
  v_pending integer;
begin
  if not public.is_sticker_moderator() then
    raise exception 'Ruxsat yo‘q';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.stickers
  set moderation_status = v_status,
      moderation_reason = p_reason,
      is_public = case when p_approve then is_public else false end
  where id = p_sticker_id
  returning pack_id into v_pack;

  if v_pack is null then
    raise exception 'Stiker topilmadi';
  end if;

  select count(*) into v_pending
  from public.stickers
  where pack_id = v_pack and moderation_status = 'pending';

  if v_pending = 0 then
    update public.sticker_packs
    set review_status = 'approved',
        is_public = true
    where id = v_pack
      and review_status = 'pending'
      and exists (
        select 1 from public.stickers
        where pack_id = v_pack and moderation_status = 'approved'
      );
  end if;

  return v_status;
end $$;

create or replace function public.report_sticker(p_sticker_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reports integer;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  insert into public.sticker_reports (sticker_id, reporter_id, reason)
  values (p_sticker_id, v_user, left(coalesce(p_reason, ''), 400))
  on conflict (sticker_id, reporter_id) do update
    set reason = excluded.reason;

  select count(*) into v_reports
  from public.sticker_reports
  where sticker_id = p_sticker_id;

  -- Uch va undan ko‘p shikoyat — stiker moderator qarorigacha ommadan
  -- olinadi. Bu qaror inson tekshiruvini kutib turmaydi.
  if v_reports >= 3 then
    update public.stickers
    set moderation_status = 'pending',
        is_public = false
    where id = p_sticker_id
      and moderation_status <> 'rejected';
  end if;
end $$;

grant execute on function public.log_sticker_usage(text, uuid, text) to authenticated;
grant execute on function public.trending_stickers(integer, integer) to authenticated;
grant execute on function public.pending_sticker_moderation(integer) to authenticated;
grant execute on function public.review_sticker(uuid, boolean, text) to authenticated;
grant execute on function public.report_sticker(uuid, text) to authenticated;
grant execute on function public.is_sticker_moderator() to authenticated;


-- ============================================================================
-- SOURCE B-web: 20260829120000_marketplace_checkout_engine.sql
-- SHA256 aa2de42666186cdbaa0bf8a6b6b8a2f93672f754c4a5dc50bc61903bc5decf1c
-- ============================================================================
-- =====================================================================
-- Marketplace Checkout Engine
-- ---------------------------------------------------------------------
-- The frontend called `process_marketplace_order` (src/hooks/useOrders.ts)
-- but the function never existed in the repository, so every real purchase
-- failed. This migration implements the full, atomic purchase pipeline:
--   1. cart validation (ownership, product status, live stock)
--   2. per-seller order splitting
--   3. stock decrement + automatic `sold` transition
--   4. wallet debit with a real ledger entry (marketplace_payments)
--   5. receipt + order number generation
--   6. seller sales counter, cart cleanup
-- Everything runs inside one transaction: either the whole purchase
-- succeeds, or nothing is written.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Supporting schema (idempotent / defensive)
-- ---------------------------------------------------------------------

-- Wallet (checkout reads balance from here)
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallets' and policyname = 'wallets_select_own'
  ) then
    create policy wallets_select_own on public.wallets
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Immutable payment ledger for marketplace transactions
create table if not exists public.marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid,
  direction text not null check (direction in ('debit', 'credit')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'USD',
  method text not null,
  status text not null default 'succeeded',
  receipt_number text,
  balance_after numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_payments_user_idx
  on public.marketplace_payments (user_id, created_at desc);
create index if not exists marketplace_payments_order_idx
  on public.marketplace_payments (order_id);

alter table public.marketplace_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'marketplace_payments'
      and policyname = 'marketplace_payments_select_own'
  ) then
    create policy marketplace_payments_select_own on public.marketplace_payments
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Payment/receipt columns the UI already renders
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists receipt_number text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists failure_reason text;

-- Cart upsert in useMarketplace relies on this conflict target
create unique index if not exists cart_items_user_product_uidx
  on public.cart_items (user_id, product_id);

-- ---------------------------------------------------------------------
-- 1. Human readable identifiers
-- ---------------------------------------------------------------------
create or replace function public.marketplace_generate_order_number()
returns text
language sql
volatile
as $$
  select 'ALS-' || to_char(now(), 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.marketplace_generate_receipt_number()
returns text
language sql
volatile
as $$
  select 'RCP-' || to_char(now(), 'YYMMDDHH24MISS') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

-- ---------------------------------------------------------------------
-- 2. Product view counter (was never incremented anywhere)
-- ---------------------------------------------------------------------
create or replace function public.increment_product_views(_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
     set views_count = coalesce(views_count, 0) + 1
   where id = _product_id
     and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------
-- 3. The real checkout
-- ---------------------------------------------------------------------
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
           ci.quantity,
           p.price,
           p.quantity as stock,
           p.status,
           p.currency,
           coalesce(p.shipping_price, 0) as shipping_price
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.user_id = v_user
     order by ci.product_id
       for update of p
  loop
    if v_item.status <> 'active' then
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
           sum(p.price * ci.quantity)                          as subtotal,
           sum(coalesce(p.shipping_price, 0) * ci.quantity)    as shipping
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
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

    insert into public.order_items (order_id, product_id, title, quantity, price, total)
    select v_order_id, p.id, p.title, ci.quantity, p.price, p.price * ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
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
  update public.products p
     set quantity = p.quantity - ci.quantity,
         status   = case when (p.quantity - ci.quantity) <= 0 then 'sold' else p.status end
    from public.cart_items ci
   where ci.product_id = p.id
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
grant execute on function public.increment_product_views(uuid) to authenticated, anon;


-- ============================================================================
-- SOURCE B-web: 20260829130000_marketplace_order_lifecycle.sql
-- SHA256 1f4ccb9b8725166aed25dab63efbbf3bd3ad21f42add1d381552d8fab1a03b78
-- ============================================================================
-- =====================================================================
-- Marketplace Order Lifecycle
-- ---------------------------------------------------------------------
-- Orders could be created (see 20260829120000_marketplace_checkout_engine)
-- but never moved forward: there was no way for a seller to accept, ship
-- or deliver an order, and no way to cancel one and give the money back.
--
-- This migration adds a single, guarded state machine:
--
--   pending    -> processing | cancelled
--   processing -> shipped    | cancelled
--   shipped    -> delivered
--   delivered  -> (terminal)
--   cancelled  -> (terminal)
--
-- Rules enforced inside the database (never trust the client):
--   * only the order's seller may accept / ship / deliver
--   * the buyer may only cancel while the order is pending or processing
--   * cancelling restores stock, reopens sold-out listings, refunds the
--     wallet (with a credit ledger row) and rolls back the sales counter
--   * marking a cash / card-on-delivery order as delivered settles the
--     payment and issues a receipt number
--   * every transition is written to marketplace_order_events
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Schema support
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists refunded_at timestamptz;

-- Allow the full lifecycle vocabulary (older constraints may be narrower)
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled'));

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'refunded'));

-- Immutable audit trail for every status change
create table if not exists public.marketplace_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('buyer', 'seller', 'system')),
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_events_order_idx
  on public.marketplace_order_events (order_id, created_at desc);

alter table public.marketplace_order_events enable row level security;

-- Visible to the buyer and to the seller of the related order
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'marketplace_order_events'
      and policyname = 'order_events_select_participants'
  ) then
    create policy order_events_select_participants on public.marketplace_order_events
      for select using (
        exists (
          select 1
            from public.orders o
            left join public.sellers s on s.id = o.seller_id
           where o.id = marketplace_order_events.order_id
             and (o.buyer_id = auth.uid() or s.user_id = auth.uid())
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. The state machine
-- ---------------------------------------------------------------------
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
    update public.products p
       set quantity = coalesce(p.quantity, 0) + oi.quantity,
           status   = case when p.status = 'sold' then 'active' else p.status end
      from public.order_items oi
     where oi.order_id = v_order.id
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
-- SOURCE B-web: 20260830090000_create_p0_poll_storage.sql
-- SHA256 b4e1fdcf71bcf6590e9dfdfc08b43d5f9ee834d72ba8ba715e40d06f1f415049
-- ============================================================================
-- =============================================================================
-- Create P0 corrective foundation
-- 1) restore strict poll-vote validation after poll type extension
-- 2) allow numeric slider/rating votes without option_id
-- 3) align Storage object limits with Create's 512 MiB video limit
-- 4) provision a private bucket for non-public Create assets without breaking
--    existing public media URLs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Poll vote schema + validation
-- ---------------------------------------------------------------------------
alter table public.poll_votes
  alter column option_id drop not null;

-- Slider/rating votes have no option_id, therefore the old
-- unique(option_id, user_id) constraint cannot prevent repeated numeric votes.
create unique index if not exists poll_votes_numeric_user_uniq
  on public.poll_votes (poll_id, user_id)
  where option_id is null;

create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_existing int;
begin
  select * into v_poll
  from public.polls
  where id = new.poll_id;

  if v_poll.id is null then
    raise exception 'So''rovnoma topilmadi';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'So''rovnoma yakunlangan';
  end if;

  if v_poll.poll_type in ('slider', 'rating') then
    if new.option_id is not null then
      raise exception 'Slayder/reyting ovozida variant yuborilmaydi';
    end if;

    if new.numeric_value is null then
      raise exception 'Slayder/reyting uchun qiymat majburiy';
    end if;

    if v_poll.min_value is not null and new.numeric_value < v_poll.min_value then
      raise exception 'Qiymat ruxsat etilgan diapazondan kichik';
    end if;

    if v_poll.max_value is not null and new.numeric_value > v_poll.max_value then
      raise exception 'Qiymat ruxsat etilgan diapazondan katta';
    end if;

    if v_poll.step is not null
       and v_poll.min_value is not null
       and mod(new.numeric_value - v_poll.min_value, v_poll.step) <> 0 then
      raise exception 'Qiymat so''rovnoma qadamiga mos emas';
    end if;
  else
    if new.option_id is null then
      raise exception 'Variant tanlanmagan';
    end if;

    if new.numeric_value is not null then
      raise exception 'Bu so''rovnoma turi raqamli ovoz qabul qilmaydi';
    end if;

    if not exists (
      select 1
      from public.poll_options o
      where o.id = new.option_id
        and o.poll_id = new.poll_id
    ) then
      raise exception 'Variant bu so''rovnomaga tegishli emas';
    end if;

    select count(*) into v_existing
    from public.poll_votes v
    where v.poll_id = new.poll_id
      and v.user_id = new.user_id
      and (tg_op = 'INSERT' or v.id <> new.id);

    if not v_poll.allow_multiple and v_existing >= 1 then
      raise exception 'Bu so''rovnomada faqat bitta variant tanlanadi';
    end if;

    if v_poll.allow_multiple
       and v_poll.max_choices is not null
       and v_existing >= v_poll.max_choices then
      raise exception 'Eng ko''p % variant tanlash mumkin', v_poll.max_choices;
    end if;
  end if;

  return new;
end
$$;

-- Remove both historical trigger names so only one validator is active.
drop trigger if exists poll_votes_validate on public.poll_votes;
drop trigger if exists validate_poll_vote_trigger on public.poll_votes;

create trigger poll_votes_validate
  before insert or update on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- ---------------------------------------------------------------------------
-- Storage limits + private bucket foundation
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 536870912
where id = 'media';

insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
  set public = false,
      file_size_limit = 536870912;

drop policy if exists "Private media readable by owner" on storage.objects;
create policy "Private media readable by owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their private media" on storage.objects;
create policy "Users can upload their private media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their private media" on storage.objects;
create policy "Users can update their private media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their private media" on storage.objects;
create policy "Users can delete their private media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

