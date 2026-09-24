-- Premium profile cover presets.
-- `cover_url` remains the custom uploaded-image source. `cover_preset` is a
-- public, owner-editable visual choice used when no custom cover is active.
-- NULL means the canonical Alsamos default preset (`graphite-halo`).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_preset text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cover_preset_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cover_preset_check
      CHECK (
        cover_preset IS NULL OR cover_preset IN (
          'graphite-halo',
          'obsidian-wave',
          'silver-arc',
          'carbon-grid',
          'slate-flow',
          'paper-shadow',
          'midnight-mesh',
          'titanium-lines',
          'noir-orbit',
          'studio-fade'
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.profiles.cover_preset IS
  'Optional Alsamos premium cover preset id. NULL resolves to graphite-halo; cover_url takes precedence when set.';

GRANT SELECT (cover_preset) ON public.profiles TO anon, authenticated, service_role;
GRANT UPDATE (cover_preset) ON public.profiles TO authenticated;
