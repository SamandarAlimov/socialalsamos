-- Preserve the timestamp of the FIRST qualified view for each viewer/post pair.
--
-- Historically increment_post_views refreshed post_views.viewed_at on every
-- repeat view. That made the audience sheet show "less than a minute" even
-- when the same person first viewed the post days earlier. `viewed_at` is the
-- canonical first-view timestamp; repeat sessions belong in
-- post_analytics_sessions.last_seen_at instead.

-- Repair rows that can be reconstructed from premium analytics telemetry.
-- post_analytics_sessions.first_seen_at is immutable per session, so MIN()
-- across sessions is the earliest qualified view we still know about.
with first_known_view as (
  select
    pas.post_id,
    pas.viewer_id as user_id,
    min(pas.first_seen_at) as first_seen_at
  from public.post_analytics_sessions pas
  group by pas.post_id, pas.viewer_id
)
update public.post_views pv
set viewed_at = least(pv.viewed_at, fkv.first_seen_at)
from first_known_view fkv
where pv.post_id = fkv.post_id
  and pv.user_id = fkv.user_id
  and fkv.first_seen_at < pv.viewed_at;

-- Repeated qualified views must never move the first-view timestamp forward.
create or replace function public.increment_post_views(post_id_param uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.post_views (post_id, user_id)
  values (post_id_param, auth.uid())
  on conflict (post_id, user_id) do nothing;
end;
$$;

revoke all on function public.increment_post_views(uuid) from public, anon;
grant execute on function public.increment_post_views(uuid) to authenticated, service_role;

-- Browser clients no longer need UPDATE on post_views. This also prevents old
-- code paths from accidentally refreshing viewed_at again.
drop policy if exists "post_views_update_own_timestamp" on public.post_views;
revoke update on public.post_views from authenticated;

comment on column public.post_views.viewed_at is
  'Timestamp of the viewer''s first qualified view of the post; repeat views do not refresh it.';

notify pgrst, 'reload schema';
