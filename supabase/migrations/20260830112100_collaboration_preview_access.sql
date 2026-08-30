-- =============================================================================
-- Collaboration invite preview access
-- A pending invite is an explicit owner-granted permission to inspect the post
-- before accepting. Declined/revoked users immediately lose this access.
-- =============================================================================

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
            and pc.status in ('pending', 'accepted')
        )
      )
  );
$$;
