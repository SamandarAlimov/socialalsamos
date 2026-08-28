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
