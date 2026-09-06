-- =============================================================================
-- Story / Reel publishing hardening
--
-- Finalizes the unified Create pipeline after the post/story foundation:
--   * unpublished/scheduled posts are no longer visible through RLS;
--   * pending collaborators retain explicit preview access;
--   * Story drafts keep their linked post in `draft` until activation;
--   * Story activation publishes the linked post in the same transaction;
--   * Story deletion removes the complete linked DB graph transactionally.
--
-- This migration is intentionally idempotent and safe to re-apply through the
-- Lovable-managed Supabase migration runner.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Canonical post visibility: privacy + publication state in one helper.
-- -----------------------------------------------------------------------------
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
        -- Owners can always inspect their own drafts/scheduled posts.
        p.user_id = auth.uid()

        -- A pending collaboration invite is an explicit owner-granted preview.
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id = p.id
            and pc.user_id = auth.uid()
            and pc.status in ('pending', 'accepted')
        )

        -- Everyone else only sees content after it is actually published.
        or (
          coalesce(nullif(btrim(p.status), ''), 'published') = 'published'
          and (p.published_at is null or p.published_at <= now())
          and (
            coalesce(nullif(btrim(p.visibility), ''), 'public') = 'public'
            or (
              coalesce(nullif(btrim(p.visibility), ''), 'public') = 'friends'
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
          )
        )
      )
  );
$$;

revoke all on function public.can_view_post(uuid) from public;
grant execute on function public.can_view_post(uuid) to anon, authenticated;

-- Reassert the posts policy so every direct post read uses the canonical helper.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));

-- -----------------------------------------------------------------------------
-- 2. Story draft lifecycle: the linked post is a real draft until activation.
-- -----------------------------------------------------------------------------
create or replace function public.create_story_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_story_id uuid;
  v_post_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  v_result := public.publish_story_draft(p_payload);
  v_story_id := nullif(v_result ->> 'storyId', '')::uuid;
  v_post_id := nullif(v_result ->> 'postId', '')::uuid;

  if v_story_id is null or v_post_id is null then
    raise exception 'Story qoralama identifikatori qaytmadi';
  end if;

  update public.stories
  set is_active = false
  where id = v_story_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Story qoralamasi topilmadi';
  end if;

  update public.posts
  set status = 'draft',
      scheduled_at = null,
      published_at = null,
      updated_at = now()
  where id = v_post_id
    and user_id = auth.uid()
    and post_kind = 'story';

  if not found then
    raise exception 'Story post qoralamasi topilmadi';
  end if;

  return v_result;
end
$$;

revoke all on function public.create_story_draft(jsonb) from public, anon;
grant execute on function public.create_story_draft(jsonb) to authenticated;

create or replace function public.activate_story_draft(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

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

  update public.posts
  set status = 'published',
      scheduled_at = null,
      published_at = now(),
      updated_at = now()
  where id = v_post_id
    and user_id = auth.uid();

  update public.stories
  set is_active = true,
      expires_at = now() + interval '24 hours'
  where id = p_story_id
    and user_id = auth.uid();

  return true;
end
$$;

revoke all on function public.activate_story_draft(uuid) from public, anon;
grant execute on function public.activate_story_draft(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Story delete: remove story + canonical post graph in one transaction.
--    Binary object deletion remains a media-service responsibility; this RPC
--    guarantees there are no orphan DB rows (post_media/stickers/polls/etc.).
-- -----------------------------------------------------------------------------
create or replace function public.delete_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_post_id uuid;
  v_storage_bucket text;
  v_storage_key text;
  v_media_url text;
begin
  if v_user_id is null then
    raise exception 'Autentifikatsiya talab qilinadi';
  end if;

  select
    s.user_id,
    s.post_id,
    s.storage_bucket,
    s.storage_key,
    s.media_url
  into
    v_owner_id,
    v_post_id,
    v_storage_bucket,
    v_storage_key,
    v_media_url
  from public.stories s
  where s.id = p_story_id
  for update;

  if not found then
    -- Idempotent delete: already-removed story is a successful terminal state.
    return jsonb_build_object(
      'deleted', true,
      'storyId', p_story_id,
      'alreadyMissing', true
    );
  end if;

  if v_owner_id is distinct from v_user_id then
    raise exception 'Bu Storini o''chirish huquqi yo''q';
  end if;

  delete from public.stories
  where id = p_story_id
    and user_id = v_user_id;

  if v_post_id is not null then
    delete from public.posts
    where id = v_post_id
      and user_id = v_user_id
      and post_kind = 'story';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'storyId', p_story_id,
    'postId', v_post_id,
    'storageBucket', v_storage_bucket,
    'storageKey', v_storage_key,
    'mediaUrl', v_media_url
  );
end
$$;

revoke all on function public.delete_story(uuid) from public, anon;
grant execute on function public.delete_story(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Story reads: hidden drafts are owner-only; live linked stories inherit
--    the publication + privacy decision from can_view_post().
-- -----------------------------------------------------------------------------
drop policy if exists "Stories viewable by authenticated" on public.stories;
drop policy if exists "stories_select_visible" on public.stories;

create policy "stories_select_visible"
  on public.stories
  for select
  using (
    user_id = auth.uid()
    or (
      is_active is distinct from false
      and expires_at > now()
      and (
        post_id is null
        or public.can_view_post(post_id)
      )
    )
  );

-- Retrieval indexes for the two main public surfaces.
create index if not exists posts_publish_state_visibility_idx
  on public.posts (status, visibility, published_at desc);

create index if not exists stories_live_expiry_idx
  on public.stories (expires_at desc, user_id)
  where is_active is distinct from false;

commit;

notify pgrst, 'reload schema';
