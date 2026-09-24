export const PROFILE_COVER_PRESETS = [
  {
    id: 'graphite-halo',
    name: 'Graphite Halo',
    tone: 'light',
    backgroundColor: '#e9e9ea',
    backgroundImage:
      'radial-gradient(circle at 22% 18%, rgba(255,255,255,.98) 0 12%, rgba(255,255,255,.38) 30%, transparent 48%), radial-gradient(circle at 82% 72%, rgba(17,24,39,.20), transparent 34%), linear-gradient(135deg, #f4f4f5 0%, #d8dadd 46%, #a9adb3 100%)',
  },
  {
    id: 'obsidian-wave',
    name: 'Obsidian Wave',
    tone: 'dark',
    backgroundColor: '#0a0a0b',
    backgroundImage:
      'radial-gradient(ellipse at 15% 120%, rgba(255,255,255,.20), transparent 42%), radial-gradient(ellipse at 85% -15%, rgba(255,255,255,.10), transparent 38%), linear-gradient(145deg, #070708 0%, #17181a 48%, #050506 100%)',
  },
  {
    id: 'silver-arc',
    name: 'Silver Arc',
    tone: 'light',
    backgroundColor: '#e7e7e8',
    backgroundImage:
      'radial-gradient(circle at 76% 50%, transparent 0 25%, rgba(255,255,255,.76) 25.4% 26.6%, transparent 27% 36%, rgba(89,94,101,.18) 36.4% 37.2%, transparent 37.6%), linear-gradient(115deg, #fafafa 0%, #e0e1e3 48%, #b9bdc2 100%)',
  },
  {
    id: 'carbon-grid',
    name: 'Carbon Grid',
    tone: 'dark',
    backgroundColor: '#111214',
    backgroundImage:
      'linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px), radial-gradient(circle at 30% 30%, rgba(255,255,255,.13), transparent 40%), linear-gradient(135deg, #18191c, #08090a)',
    backgroundSize: '28px 28px, 28px 28px, auto, auto',
  },
  {
    id: 'slate-flow',
    name: 'Slate Flow',
    tone: 'dark',
    backgroundColor: '#202328',
    backgroundImage:
      'linear-gradient(118deg, transparent 0 20%, rgba(255,255,255,.08) 20.5% 33%, transparent 33.5% 54%, rgba(255,255,255,.045) 54.5% 68%, transparent 68.5%), linear-gradient(135deg, #343941 0%, #191c21 55%, #0e0f12 100%)',
  },
  {
    id: 'paper-shadow',
    name: 'Paper Shadow',
    tone: 'light',
    backgroundColor: '#f1f0ed',
    backgroundImage:
      'linear-gradient(155deg, rgba(255,255,255,.9) 0 38%, transparent 38.4%), linear-gradient(335deg, rgba(0,0,0,.06) 0 29%, transparent 29.5%), radial-gradient(circle at 70% 20%, rgba(255,255,255,.95), transparent 30%), linear-gradient(135deg, #f6f5f2, #d9d8d4)',
  },
  {
    id: 'midnight-mesh',
    name: 'Midnight Mesh',
    tone: 'dark',
    backgroundColor: '#08090b',
    backgroundImage:
      'radial-gradient(circle at 20% 50%, rgba(255,255,255,.15), transparent 24%), radial-gradient(circle at 62% 24%, rgba(255,255,255,.09), transparent 20%), radial-gradient(circle at 86% 82%, rgba(255,255,255,.12), transparent 28%), linear-gradient(135deg, #15171b, #050506)',
  },
  {
    id: 'titanium-lines',
    name: 'Titanium Lines',
    tone: 'light',
    backgroundColor: '#d9dbde',
    backgroundImage:
      'repeating-linear-gradient(122deg, rgba(255,255,255,.42) 0 1px, transparent 1px 18px), linear-gradient(122deg, rgba(255,255,255,.7), transparent 42%), linear-gradient(135deg, #f1f2f3 0%, #c7cacf 52%, #a4a8ae 100%)',
  },
  {
    id: 'noir-orbit',
    name: 'Noir Orbit',
    tone: 'dark',
    backgroundColor: '#09090a',
    backgroundImage:
      'radial-gradient(circle at 74% 50%, transparent 0 22%, rgba(255,255,255,.14) 22.4% 22.9%, transparent 23.3% 32%, rgba(255,255,255,.08) 32.4% 32.9%, transparent 33.3% 45%, rgba(255,255,255,.04) 45.4% 46%, transparent 46.4%), linear-gradient(135deg, #18191b, #060607)',
  },
  {
    id: 'studio-fade',
    name: 'Studio Fade',
    tone: 'light',
    backgroundColor: '#dfe1e4',
    backgroundImage:
      'radial-gradient(ellipse at 50% -10%, rgba(255,255,255,1), rgba(255,255,255,.22) 42%, transparent 68%), linear-gradient(100deg, #b9bdc4 0%, #eef0f2 46%, #b2b6bd 100%)',
  },
] as const;

export type ProfileCoverPresetId = (typeof PROFILE_COVER_PRESETS)[number]['id'];

export const DEFAULT_PROFILE_COVER_PRESET: ProfileCoverPresetId = 'graphite-halo';

const COVER_PRESET_IDS = new Set<string>(PROFILE_COVER_PRESETS.map((preset) => preset.id));

export function isProfileCoverPresetId(value: unknown): value is ProfileCoverPresetId {
  return typeof value === 'string' && COVER_PRESET_IDS.has(value);
}

export function resolveProfileCoverPreset(value?: string | null) {
  const resolvedId = isProfileCoverPresetId(value) ? value : DEFAULT_PROFILE_COVER_PRESET;
  return PROFILE_COVER_PRESETS.find((preset) => preset.id === resolvedId) ?? PROFILE_COVER_PRESETS[0];
}
