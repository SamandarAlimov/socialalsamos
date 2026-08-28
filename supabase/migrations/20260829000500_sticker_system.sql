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
