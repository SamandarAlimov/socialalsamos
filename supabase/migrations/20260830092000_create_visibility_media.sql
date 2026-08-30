-- =============================================================================
-- Create P0: visibility-aware posts and private media references
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical post visibility
--    "friends" = ikki tomonlama follow (mutual follow).
-- ---------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.visibility = 'public'
        or p.user_id = auth.uid()
        or (
          p.visibility = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.user_id
          )
          and exists (
            select 1
            from public.follows f
            where f.follower_id = p.user_id
              and f.following_id = auth.uid()
          )
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status = 'accepted'
        )
      )
  );
$$;

-- Dastlabki policy friends semantikasini bilmaydi. Bitta canonical SELECT
-- policy qoldiramiz; metadata jadvallari ham xuddi shu funksiyaga tayanadi.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));


-- post_hashtags eski DBlarda noma'lum SELECT policy bilan kelgan bo'lishi mumkin.
-- Barcha SELECT policy nomlarini katalogdan olib tashlab, bitta canonical policy
-- yaratamiz. Write'lar posts triggeri orqali SECURITY DEFINER bilan bajariladi.
do $
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'post_hashtags'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.post_hashtags',
      v_policy.policyname
    );
  end loop;
end
$;

create policy "post_hashtags_select"
  on public.post_hashtags
  for select
  using (public.can_view_post(post_id));

-- Public hashtag katalogi private/friends postlar borligini count/search orqali
-- oshkor qilmasin. Faqat public postlar katalog countiga kiradi.
create or replace function public.sync_hashtag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_id uuid;
begin
  v_id := coalesce(new.hashtag_id, old.hashtag_id);

  update public.hashtags h
  set posts_count = (
    select count(*)
    from public.post_hashtags ph
    join public.posts p on p.id = ph.post_id
    where ph.hashtag_id = h.id
      and p.visibility = 'public'
  )
  where h.id = v_id;

  return null;
end
$;

update public.hashtags h
set posts_count = (
  select count(*)
  from public.post_hashtags ph
  join public.posts p on p.id = ph.post_id
  where ph.hashtag_id = h.id
    and p.visibility = 'public'
);

create or replace function public.search_hashtags(p_query text, p_limit int default 12)
returns table (id uuid, tag text, posts_count int)
language sql
stable
security definer
set search_path = public
as $
  with q as (select lower(trim(both '#' from coalesce(p_query, ''))) as term)
  select h.id, h.tag, h.posts_count
  from public.hashtags h, q
  where h.posts_count > 0
    and (q.term = '' or h.tag like q.term || '%' or h.tag % q.term)
  order by
    case when q.term <> '' and h.tag like q.term || '%' then 0 else 1 end,
    h.posts_count desc,
    h.last_used_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$;

-- ---------------------------------------------------------------------------
-- 2. Stable Storage references
--    Private signed URL vaqtinchalik bo'lgani uchun DB ga URL emas,
--    bucket + key yoziladi. storage_url legacy/public compatibility uchun qoladi.
-- ---------------------------------------------------------------------------
alter table public.post_media
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_key text;

create index if not exists post_media_storage_object_idx
  on public.post_media (storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;

create index if not exists post_media_thumbnail_object_idx
  on public.post_media (thumbnail_bucket, thumbnail_key)
  where thumbnail_bucket is not null and thumbnail_key is not null;

create or replace function public.normalize_post_media_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_ref text;
begin
  -- storage://bucket/path/to/object ni bucket/key ga ajratamiz.
  if new.storage_bucket is null
     and new.storage_key is null
     and new.storage_url like 'storage://%' then
    v_ref := substring(new.storage_url from 11);
    new.storage_bucket := split_part(v_ref, '/', 1);
    new.storage_key := substring(v_ref from length(new.storage_bucket) + 2);
  end if;

  if new.thumbnail_bucket is null
     and new.thumbnail_key is null
     and new.thumbnail_url like 'storage://%' then
    v_ref := substring(new.thumbnail_url from 11);
    new.thumbnail_bucket := split_part(v_ref, '/', 1);
    new.thumbnail_key := substring(v_ref from length(new.thumbnail_bucket) + 2);
  end if;

  select p.visibility into v_visibility
  from public.posts p
  where p.id = new.post_id;

  if v_visibility is null then
    raise exception 'Post topilmadi';
  end if;

  -- Friends/private post hech qachon ommaviy bucket obyektiga bog'lanmasin.
  if v_visibility <> 'public' then
    if new.storage_bucket is distinct from 'media-private'
       or new.storage_key is null
       or length(new.storage_key) = 0 then
      raise exception 'Maxfiy post fayli private storage da bo''lishi shart';
    end if;

    if new.thumbnail_url is not null
       and (
         new.thumbnail_bucket is distinct from 'media-private'
         or new.thumbnail_key is null
         or length(new.thumbnail_key) = 0
       ) then
      raise exception 'Maxfiy post preview fayli private storage da bo''lishi shart';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists post_media_normalize_storage on public.post_media;
create trigger post_media_normalize_storage
  before insert or update of storage_url, thumbnail_url, storage_bucket, storage_key,
    thumbnail_bucket, thumbnail_key
  on public.post_media
  for each row execute function public.normalize_post_media_storage();

-- Storage RLS uchun SECURITY DEFINER helper. Viewer faqat o'zi ko'ra oladigan
-- postga bog'langan private obyektga signed URL ola oladi.
create or replace function public.can_view_post_media_object(
  p_bucket text,
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.post_media pm
    where (
      (pm.storage_bucket = p_bucket and pm.storage_key = p_key)
      or (pm.thumbnail_bucket = p_bucket and pm.thumbnail_key = p_key)
    )
      and public.can_view_post(pm.post_id)
  );
$$;

revoke all on function public.can_view_post_media_object(text, text) from public;
grant execute on function public.can_view_post_media_object(text, text) to authenticated;

-- Old owner-only reader is replaced with post visibility aware reader.
drop policy if exists "Private media readable by owner" on storage.objects;
drop policy if exists "Private media readable by post viewers" on storage.objects;

create policy "Private media readable by post viewers"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_post_media_object(bucket_id, name)
    )
  );
