-- =============================================================================
-- Post Creator: resumeable live-location sharing
-- =============================================================================

create or replace function public.my_active_live_locations()
returns table (
  post_id uuid,
  live_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pl.post_id, pl.live_until
  from public.post_locations pl
  join public.posts p on p.id = pl.post_id
  where p.user_id = auth.uid()
    and pl.mode = 'live'
    and pl.live_until is not null
    and pl.live_until > now()
  order by pl.live_until asc;
$$;

revoke all on function public.my_active_live_locations() from public;
grant execute on function public.my_active_live_locations() to authenticated;
