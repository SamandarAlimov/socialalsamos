-- =============================================================================
-- Sticker schema compatibility bridge
--
-- Two sticker generations historically used different column names:
-- legacy: title/cover_url/is_animated + file_url/thumb_url
-- current: name/icon_url/default_kind + full_url/preview_url/kind
--
-- CREATE TABLE IF NOT EXISTS cannot evolve an already existing table, so a
-- database that applied the legacy migration first may legitimately miss the
-- current columns. Keep both contracts available while web/Flutter converge.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sticker_kind') then
    create type public.sticker_kind as enum
      ('animated_emoji', 'image', 'gif', 'lottie', 'video');
  end if;

  if not exists (select 1 from pg_type where typname = 'sticker_pack_source') then
    create type public.sticker_pack_source as enum
      ('builtin', 'platform', 'giphy', 'user');
  end if;
end $$;

alter table if exists public.sticker_packs
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists source public.sticker_pack_source default 'platform',
  add column if not exists default_kind public.sticker_kind default 'image',
  add column if not exists icon_url text,
  add column if not exists icon_emoji text,
  add column if not exists icon_key text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists position integer not null default 0,
  add column if not exists title text,
  add column if not exists cover_url text,
  add column if not exists is_animated boolean not null default false,
  add column if not exists install_count integer not null default 0;

alter table if exists public.stickers
  add column if not exists kind public.sticker_kind default 'image',
  add column if not exists name text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists preview_url text,
  add column if not exists full_url text,
  add column if not exists duration_seconds numeric,
  add column if not exists use_count integer not null default 0,
  add column if not exists file_url text,
  add column if not exists thumb_url text;

update public.sticker_packs
set
  name = coalesce(nullif(name, ''), nullif(title, ''), nullif(slug, ''), 'Stikerlar'),
  title = coalesce(nullif(title, ''), nullif(name, ''), nullif(slug, ''), 'Stikerlar'),
  icon_url = coalesce(icon_url, cover_url),
  cover_url = coalesce(cover_url, icon_url),
  default_kind = case
    when is_animated then 'animated_emoji'::public.sticker_kind
    else coalesce(default_kind, 'image'::public.sticker_kind)
  end
where
  name is null or name = ''
  or title is null or title = ''
  or icon_url is null
  or cover_url is null;

update public.stickers
set
  full_url = coalesce(nullif(full_url, ''), nullif(file_url, '')),
  file_url = coalesce(nullif(file_url, ''), nullif(full_url, '')),
  preview_url = coalesce(nullif(preview_url, ''), nullif(thumb_url, ''), nullif(full_url, ''), nullif(file_url, '')),
  thumb_url = coalesce(nullif(thumb_url, ''), nullif(preview_url, ''))
where
  full_url is null or full_url = ''
  or file_url is null or file_url = ''
  or preview_url is null
  or thumb_url is null;

alter table if exists public.sticker_packs
  alter column name set not null;

create or replace function public.sync_sticker_pack_compat_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := coalesce(nullif(new.name, ''), nullif(new.title, ''), nullif(new.slug, ''), 'Stikerlar');
  new.title := coalesce(nullif(new.title, ''), new.name);
  new.icon_url := coalesce(new.icon_url, new.cover_url);
  new.cover_url := coalesce(new.cover_url, new.icon_url);

  if new.is_animated then
    new.default_kind := 'animated_emoji'::public.sticker_kind;
  elsif new.default_kind is null then
    new.default_kind := 'image'::public.sticker_kind;
  end if;

  new.is_animated := new.default_kind in (
    'animated_emoji'::public.sticker_kind,
    'lottie'::public.sticker_kind,
    'video'::public.sticker_kind
  );
  return new;
end
$$;

drop trigger if exists sticker_pack_compat_columns on public.sticker_packs;
create trigger sticker_pack_compat_columns
before insert or update on public.sticker_packs
for each row execute function public.sync_sticker_pack_compat_columns();

create or replace function public.sync_sticker_compat_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.full_url := coalesce(nullif(new.full_url, ''), nullif(new.file_url, ''));
  new.file_url := coalesce(nullif(new.file_url, ''), nullif(new.full_url, ''));
  new.preview_url := coalesce(
    nullif(new.preview_url, ''),
    nullif(new.thumb_url, ''),
    nullif(new.full_url, ''),
    nullif(new.file_url, '')
  );
  new.thumb_url := coalesce(nullif(new.thumb_url, ''), nullif(new.preview_url, ''));
  new.kind := coalesce(new.kind, 'image'::public.sticker_kind);
  return new;
end
$$;

drop trigger if exists sticker_compat_columns on public.stickers;
create trigger sticker_compat_columns
before insert or update on public.stickers
for each row execute function public.sync_sticker_compat_columns();

comment on function public.sync_sticker_pack_compat_columns() is
  'Keeps legacy and canonical sticker-pack columns synchronized during cross-client rollout.';
comment on function public.sync_sticker_compat_columns() is
  'Keeps legacy and canonical sticker asset columns synchronized during cross-client rollout.';
