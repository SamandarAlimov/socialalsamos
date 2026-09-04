-- =============================================================================
-- Restore post visibility compatibility across Home/Profile/Notifications/etc.
--
-- `posts.visibility` has historically been nullable. The original table default
-- was `public`, but older clients / partial writes could still persist NULL.
-- The canonical `can_view_post()` policy introduced later compared visibility
-- with `= 'public'`, so those legacy rows became invisible to everyone except
-- their owner. Any page enriching notifications through `posts` then treated
-- the RLS-hidden row as deleted and could hide/remove the notification too.
--
-- Normalize the legacy public state once, make future rows non-null, and keep
-- one canonical visibility helper for every post-backed surface.
-- =============================================================================

begin;

-- NULL/blank was never a distinct privacy choice in Alsamos. Historically the
-- omitted/default visibility was public, so restoring it does not turn an
-- explicit private/friends post public.
update public.posts
set visibility = 'public'
where visibility is null
   or btrim(visibility) = '';

-- Normalize harmless casing/whitespace drift without changing semantics.
update public.posts
set visibility = lower(btrim(visibility))
where visibility is not null
  and visibility in (' Public ', ' PUBLIC ', ' Friends ', ' FRIENDS ', ' Private ', ' PRIVATE ');

alter table public.posts
  alter column visibility set default 'public',
  alter column visibility set not null;

-- Keep the canonical helper backward-compatible and make every dependent RLS
-- policy (post_media, polls, locations, stories, hashtags, etc.) see the same
-- post set. Owner and accepted collaborator access remain unchanged.
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
        coalesce(nullif(btrim(p.visibility), ''), 'public') = 'public'
        or p.user_id = auth.uid()
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

-- Reassert the canonical posts SELECT policy. RLS policies on related tables
-- already call can_view_post(), so replacing the function repairs them too.
drop policy if exists "Public posts viewable by everyone" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;

create policy "posts_select_visible"
  on public.posts
  for select
  using (public.can_view_post(id));

-- Indexes used by public feed/search retrieval after the data repair.
create index if not exists posts_visibility_created_at_idx
  on public.posts (visibility, created_at desc);

commit;

notify pgrst, 'reload schema';
