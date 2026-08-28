-- Telegramdagidek stiker paketlari, stikerlar, o'rnatilgan paketlar va
-- "tez-tez ishlatiladigan" stikerlar statistikasi.
--
-- Qo'shimcha: messages.message_type endi 'sticker' va 'gif' qiymatlarini ham
-- qabul qiladi (avval ular 'image' sifatida ketardi).

-- 1) Stiker paketlari
create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  author_id uuid references auth.users(id) on delete set null,
  cover_url text,
  is_public boolean not null default true,
  is_animated boolean not null default false,
  sticker_count integer not null default 0,
  install_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Paket ichidagi stikerlar
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  file_url text not null,
  thumb_url text,
  emoji text,
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stickers_pack_id_idx on public.stickers(pack_id, position);

-- 3) Foydalanuvchi o'rnatgan paketlar
create table if not exists public.sticker_pack_installs (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  position integer not null default 0,
  installed_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

-- 4) Tez-tez ishlatiladigan stikerlar (Telegramdagi "Frequently used")
create table if not exists public.sticker_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  sticker_id uuid references public.stickers(id) on delete cascade,
  -- GIF/tashqi stikerlar uchun (Giphy va h.k.) - id bo'lmasa URL saqlanadi
  file_url text not null,
  kind text not null default 'sticker' check (kind in ('sticker', 'gif')),
  use_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  primary key (user_id, file_url)
);

create index if not exists sticker_usage_recent_idx
  on public.sticker_usage(user_id, kind, last_used_at desc);
create index if not exists sticker_usage_frequent_idx
  on public.sticker_usage(user_id, kind, use_count desc);

-- RLS
alter table public.sticker_packs enable row level security;
alter table public.stickers enable row level security;
alter table public.sticker_pack_installs enable row level security;
alter table public.sticker_usage enable row level security;

-- Ommaviy paketlarni hamma ko'radi, yopiq paketni faqat muallifi
drop policy if exists "sticker_packs_select" on public.sticker_packs;
create policy "sticker_packs_select" on public.sticker_packs
  for select using (is_public or author_id = auth.uid());

drop policy if exists "sticker_packs_insert" on public.sticker_packs;
create policy "sticker_packs_insert" on public.sticker_packs
  for insert with check (author_id = auth.uid());

drop policy if exists "sticker_packs_update" on public.sticker_packs;
create policy "sticker_packs_update" on public.sticker_packs
  for update using (author_id = auth.uid());

drop policy if exists "sticker_packs_delete" on public.sticker_packs;
create policy "sticker_packs_delete" on public.sticker_packs
  for delete using (author_id = auth.uid());

-- Stikerlar: ko'rinishi paketining ko'rinishiga bog'liq
drop policy if exists "stickers_select" on public.stickers;
create policy "stickers_select" on public.stickers
  for select using (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id and (p.is_public or p.author_id = auth.uid())
    )
  );

drop policy if exists "stickers_write" on public.stickers;
create policy "stickers_write" on public.stickers
  for all using (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id and p.author_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.sticker_packs p
      where p.id = stickers.pack_id and p.author_id = auth.uid()
    )
  );

-- O'rnatilgan paketlar va statistikani faqat egasi ko'radi/o'zgartiradi
drop policy if exists "sticker_pack_installs_own" on public.sticker_pack_installs;
create policy "sticker_pack_installs_own" on public.sticker_pack_installs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sticker_usage_own" on public.sticker_usage;
create policy "sticker_usage_own" on public.sticker_usage
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Stiker/GIF yuborilganda statistikani oshiruvchi funksiya
create or replace function public.touch_sticker_usage(
  p_file_url text,
  p_kind text default 'sticker',
  p_sticker_id uuid default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.sticker_usage (user_id, sticker_id, file_url, kind, use_count, last_used_at)
  values (auth.uid(), p_sticker_id, p_file_url, coalesce(p_kind, 'sticker'), 1, now())
  on conflict (user_id, file_url) do update
    set use_count = public.sticker_usage.use_count + 1,
        last_used_at = now(),
        kind = excluded.kind,
        sticker_id = coalesce(excluded.sticker_id, public.sticker_usage.sticker_id);
end;
$$;

-- messages.message_type endi 'sticker' va 'gif' ni ham qabul qiladi
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%message_type%'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
exception
  when undefined_table then null;
end $$;
