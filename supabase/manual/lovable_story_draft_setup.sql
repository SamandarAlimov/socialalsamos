-- ============================================================
-- ALSAMOS / LOVABLE — STORY DRAFT LIFECYCLE SETUP
-- ============================================================
--
-- Fixes PGRST202:
--   public.create_story_draft(p_payload) not found
--
-- This script is designed for Lovable projects where the normal migration
-- chain was not fully applied. It installs the canonical Story foundation +
-- hidden draft lifecycle used by src/components/create/StoryComposer.tsx.
--
-- Prerequisites expected to already exist in Alsamos:
--   public.posts
--   public.post_media
--   public.stories
--   public.publish_post_draft(jsonb)
--   public.can_view_post(uuid)
--
-- Safe to run repeatedly.
-- Tagged dollar quotes are used intentionally for Lovable SQL Editor.
-- ============================================================


-- ============================================================
-- 1. STORY COMPATIBILITY COLUMNS
-- ============================================================

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

alter table public.stories
  add column if not exists media_id uuid references public.post_media(id) on delete set null;

alter table public.stories
  add column if not exists storage_bucket text;

alter table public.stories
  add column if not exists storage_key text;

alter table public.stories
  add column if not exists is_active boolean not null default true;


create unique index if not exists stories_post_id_uniq
  on public.stories (post_id)
  where post_id is not null;

create index if not exists stories_active_post_idx
  on public.stories (expires_at desc, post_id)
  where is_active is distinct from false;


-- ============================================================
-- 2. CANONICAL STORY VISIBILITY POLICY
-- ============================================================

alter table public.stories enable row level security;

drop policy if exists "stories_select_visible"
  on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and (
        post_id is null
        or public.can_view_post(post_id)
      )
    )
  );


-- ============================================================
-- 3. PUBLISH STORY GRAPH
-- ============================================================
--
-- Creates the canonical posts/post_media graph through publish_post_draft()
-- and then adds the compatibility public.stories row.
-- ============================================================

create or replace function public.publish_story_draft(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $publish_story_draft_function$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_post_id uuid;
  v_media_id uuid;
  v_media jsonb;
  v_kind text;
  v_story_id uuid;
begin
  if v_user is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload -> 'media', '[]'::jsonb)) <> 1 then
    raise exception 'Story uchun aynan bitta rasm yoki video kerak';
  end if;

  v_media := p_payload -> 'media' -> 0;
  v_kind := coalesce(v_media ->> 'kind', '');

  if v_kind not in ('image', 'video') then
    raise exception 'Story faqat rasm yoki video bo''lishi mumkin';
  end if;

  if nullif(p_payload ->> 'scheduledAt', '') is not null then
    raise exception 'Story scheduling hali qo''llanmaydi';
  end if;

  v_payload :=
    p_payload
    || jsonb_build_object(
      'postKind', 'story',
      'scheduledAt', null
    );

  v_post_id := public.publish_post_draft(v_payload);

  select pm.id
  into v_media_id
  from public.post_media pm
  where pm.post_id = v_post_id
  order by pm.position asc
  limit 1;

  insert into public.stories (
    user_id,
    post_id,
    media_id,
    media_url,
    storage_bucket,
    storage_key,
    media_type,
    caption,
    duration,
    expires_at,
    is_active
  )
  values (
    v_user,
    v_post_id,
    v_media_id,
    v_media ->> 'storageUrl',
    nullif(v_media ->> 'storageBucket', ''),
    nullif(v_media ->> 'storageKey', ''),
    v_kind,
    nullif(p_payload ->> 'content', ''),
    nullif(v_media ->> 'durationSeconds', '')::numeric,
    now() + interval '24 hours',
    true
  )
  returning id into v_story_id;

  return jsonb_build_object(
    'storyId', v_story_id,
    'postId', v_post_id,
    'mediaId', v_media_id
  );
end;
$publish_story_draft_function$;

revoke all
  on function public.publish_story_draft(jsonb)
  from public, anon;

grant execute
  on function public.publish_story_draft(jsonb)
  to authenticated;


-- ============================================================
-- 4. CREATE HIDDEN STORY DRAFT
-- ============================================================
--
-- StoryComposer uploads media first, then calls this RPC. The new story stays
-- hidden while the owner configures interactive stickers.
-- ============================================================

create or replace function public.create_story_draft(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_story_draft_function$
declare
  v_result jsonb;
  v_story_id uuid;
begin
  v_result := public.publish_story_draft(p_payload);
  v_story_id := (v_result ->> 'storyId')::uuid;

  update public.stories
  set is_active = false
  where id = v_story_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Story qoralamasi yaratilmadi';
  end if;

  return v_result;
end;
$create_story_draft_function$;

revoke all
  on function public.create_story_draft(jsonb)
  from public, anon;

grant execute
  on function public.create_story_draft(jsonb)
  to authenticated;


-- ============================================================
-- 5. ACTIVATE STORY DRAFT
-- ============================================================

create or replace function public.activate_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $activate_story_draft_function$
declare
  v_post_id uuid;
begin
  select s.post_id
  into v_post_id
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.user_id = auth.uid()
      and p.post_kind = 'story'
  ) then
    raise exception 'Story post topilmadi';
  end if;

  update public.stories
  set
    is_active = true,
    expires_at = now() + interval '24 hours'
  where id = p_story_id
    and user_id = auth.uid();

  update public.posts
  set
    published_at = now(),
    updated_at = now()
  where id = v_post_id
    and user_id = auth.uid();

  return true;
end;
$activate_story_draft_function$;

revoke all
  on function public.activate_story_draft(uuid)
  from public, anon;

grant execute
  on function public.activate_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 6. DISCARD HIDDEN STORY DRAFT
-- ============================================================

create or replace function public.discard_story_draft(
  p_story_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $discard_story_draft_function$
declare
  v_post_id uuid;
  v_is_active boolean;
begin
  select
    s.post_id,
    coalesce(s.is_active, true)
  into
    v_post_id,
    v_is_active
  from public.stories s
  where s.id = p_story_id
    and s.user_id = auth.uid()
  for update;

  if v_post_id is null then
    return true;
  end if;

  if v_is_active then
    raise exception 'Live Story qoralama sifatida o''chirilmaydi';
  end if;

  delete from public.stories
  where id = p_story_id
    and user_id = auth.uid();

  delete from public.posts
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  return true;
end;
$discard_story_draft_function$;

revoke all
  on function public.discard_story_draft(uuid)
  from public, anon;

grant execute
  on function public.discard_story_draft(uuid)
  to authenticated;


-- ============================================================
-- 7. FORCE POSTGREST SCHEMA CACHE REFRESH
-- ============================================================
--
-- Supabase/PostgREST normally notices DDL automatically, but Lovable projects
-- can retain a stale function schema cache for a short period.
-- ============================================================

notify pgrst, 'reload schema';


-- ============================================================
-- 8. OPTIONAL VERIFICATION
-- ============================================================

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'publish_story_draft',
    'create_story_draft',
    'activate_story_draft',
    'discard_story_draft'
  )
order by p.proname;


-- ============================================================
-- DONE
-- ============================================================
