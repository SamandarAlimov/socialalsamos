-- =============================================================================
-- Compatibility bridge: legacy hashtag schema -> normalized Create schema
--
-- This migration intentionally runs BEFORE 20260828230000_create_flow_foundation.
-- Legacy DBs have:
--   * public.hashtags as a VIEW
--   * public.post_hashtags(post_id, hashtag text, created_at)
-- The Create foundation expects:
--   * public.hashtags as a TABLE with UUID id
--   * public.post_hashtags.hashtag_id UUID
-- =============================================================================

do $
declare
  v_kind "char";
begin
  select c.relkind into v_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'hashtags';

  -- O'chirmaymiz: view OID saqlanadi va eski dependency'lar uzilmaydi.
  -- Keyin public.hashtags nomida normalized table yaratamiz.
  if v_kind = 'v' then
    execute 'alter view public.hashtags rename to hashtags_legacy_view';
  elsif v_kind = 'm' then
    execute 'alter materialized view public.hashtags rename to hashtags_legacy_view';
  end if;
end
$;

create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  posts_count int not null default 0,
  -- Legacy read compatibility: old view exposed post_count.
  post_count int generated always as (posts_count) stored,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists hashtags_tag_uniq on public.hashtags (tag);

-- Legacy post_hashtags exists on current installations. If it does not,
-- create the normalized table now so the next foundation migration is idempotent.
create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag text,
  hashtag_id uuid,
  created_at timestamptz not null default now()
);

alter table public.post_hashtags
  add column if not exists hashtag text,
  add column if not exists hashtag_id uuid;

-- Legacy sxemada primary key (post_id, hashtag) bo'lishi mumkin.
-- PK hashtag ustunini NOT NULL qiladi, shuning uchun avval aynan shu PKni
-- katalogdan topib olib tashlaymiz. Yangi unique(post_id, hashtag_id) quyida yaratiladi.
do $
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'post_hashtags'
      and con.contype = 'p'
      and exists (
        select 1
        from unnest(con.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = rel.oid
         and a.attnum = key.attnum
        where a.attname = 'hashtag'
      )
  loop
    execute format(
      'alter table public.post_hashtags drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$;

-- The old hashtag column was required. New inserts are normalized through
-- hashtag_id, therefore the legacy text column must be optional.
alter table public.post_hashtags
  alter column hashtag drop not null;

-- Migrate every valid legacy tag without losing existing usage timestamps.
insert into public.hashtags (tag, posts_count, last_used_at, created_at)
select
  lower(trim(both '#' from ph.hashtag)) as tag,
  count(*)::int as posts_count,
  max(ph.created_at) as last_used_at,
  min(ph.created_at) as created_at
from public.post_hashtags ph
where ph.hashtag is not null
  and length(trim(both '#' from ph.hashtag)) > 0
group by lower(trim(both '#' from ph.hashtag))
on conflict (tag) do update
set posts_count = excluded.posts_count,
    last_used_at = greatest(public.hashtags.last_used_at, excluded.last_used_at);

update public.post_hashtags ph
set hashtag_id = h.id
from public.hashtags h
where ph.hashtag_id is null
  and ph.hashtag is not null
  and h.tag = lower(trim(both '#' from ph.hashtag));

-- Invalid empty legacy rows cannot be represented in the normalized schema.
delete from public.post_hashtags
where hashtag_id is null;

-- Case-only duplicates can collapse to one normalized hashtag.
delete from public.post_hashtags a
using public.post_hashtags b
where a.ctid < b.ctid
  and a.post_id = b.post_id
  and a.hashtag_id = b.hashtag_id;

alter table public.post_hashtags
  alter column hashtag_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'post_hashtags_hashtag_id_fkey'
      and conrelid = 'public.post_hashtags'::regclass
  ) then
    alter table public.post_hashtags
      add constraint post_hashtags_hashtag_id_fkey
      foreign key (hashtag_id)
      references public.hashtags(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists post_hashtags_post_hashtag_uniq
  on public.post_hashtags (post_id, hashtag_id);

-- Keep the legacy aggregate view name alive for older readers.
create or replace view public.hashtags_aggregated as
select
  h.tag,
  h.posts_count as post_count,
  h.last_used_at
from public.hashtags h;
