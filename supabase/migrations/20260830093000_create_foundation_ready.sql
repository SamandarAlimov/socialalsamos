-- =============================================================================
-- Create P0 readiness marker
--
-- This function is intentionally the LAST P0 migration marker. Frontend can
-- safely switch /create to the modular composer only when this RPC exists.
-- If any earlier migration fails or has not been deployed, the function is
-- absent and the app falls back to the legacy Create page instead of exposing
-- half-working controls.
-- =============================================================================

create or replace function public.create_foundation_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    to_regclass('public.post_media') is not null
    and to_regclass('public.polls') is not null
    and to_regclass('public.post_locations') is not null
    and to_regclass('public.music_tracks') is not null
    and to_regclass('public.post_collaborators') is not null
    and to_regclass('public.hashtags') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'post_media'
        and column_name = 'storage_bucket'
    );
$$;

revoke all on function public.create_foundation_ready() from public;
grant execute on function public.create_foundation_ready() to authenticated;
