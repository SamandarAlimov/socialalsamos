-- Keep profile cover validation compatible with an expanding visual preset library.
-- The client owns the supported preset catalog and safely falls back to the
-- canonical default when it receives an unknown id. The database only needs
-- to enforce a bounded slug shape instead of duplicating every visual id.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cover_preset_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cover_preset_check
  CHECK (
    cover_preset IS NULL
    OR (
      char_length(cover_preset) BETWEEN 1 AND 64
      AND cover_preset ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  );

COMMENT ON CONSTRAINT profiles_cover_preset_check ON public.profiles IS
  'Allows safe profile-cover preset slugs while the app resolves supported presets. This avoids schema churn when Alsamos adds new visual cover presets.';
