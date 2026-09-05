-- =============================================================================
-- NON-DESTRUCTIVE LEGACY MEDIA COMPATIBILITY
-- =============================================================================
--
-- Historical note:
-- An earlier draft of this migration removed a legacy URL from posts.media_urls
-- and deleted the matching post_media row after one playback failure. That is
-- unsafe: a 403/404 public URL can also mean the bucket policy changed, a signed
-- URL expired, CDN/DNS is temporarily unavailable, or another historical media
-- source must be tried.
--
-- `posts.media_urls` and `post_media` are user data. They must never be deleted
-- merely because one client-side URL failed to load.
--
-- Recovery is now intentionally runtime/backward-compatible:
--   * structured and legacy media are merged by logical position;
--   * every historical URL is kept as an ordered fallback candidate;
--   * current-project legacy Supabase bucket/key references may be re-signed;
--   * playback tries all candidates before showing a retry state;
--   * no post/media metadata is removed or downgraded.
--
-- This migration is therefore a data-preserving marker only. Keeping the
-- filename lets production migration history advance without executing the old
-- destructive statements.
-- =============================================================================

do $$
begin
  raise notice 'Legacy media repair is runtime-based and non-destructive; no post/media rows were changed.';
end
$$;

notify pgrst, 'reload schema';
