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
