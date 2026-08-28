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
