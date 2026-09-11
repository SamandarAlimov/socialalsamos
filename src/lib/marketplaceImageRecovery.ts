import { resolveStorageUrlCandidates, parseSupabaseStorageUrl } from '@/lib/mediaUpload';
import { uniqueMediaCandidates } from '@/lib/mediaRecovery';

function isBrowserMediaUrl(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

function currentSupabaseOrigin() {
  try {
    const raw = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

const CURRENT_SUPABASE_ORIGIN = currentSupabaseOrigin();

function isLegacySupabaseStorageUrl(value: string) {
  try {
    const url = new URL(value);
    const isSupabaseHost =
      url.hostname === 'supabase.co' ||
      url.hostname.endsWith('.supabase.co') ||
      url.hostname.endsWith('.supabase.in');
    return Boolean(isSupabaseHost && CURRENT_SUPABASE_ORIGIN && url.origin !== CURRENT_SUPABASE_ORIGIN);
  } catch {
    return false;
  }
}

/**
 * Marketplace images have existed across more than one Supabase storage origin.
 * The generic media resolver intentionally does not rewrite a foreign project URL,
 * but marketplace rows may point at an old Alsamos project after a storage migration.
 * For a recognisable Supabase object URL we therefore also try the same bucket/key
 * against the current project, then fall back to the historical URL.
 */
export async function resolveMarketplaceImageCandidates(value?: string | null): Promise<string[]> {
  const raw = value?.trim() || '';
  if (!raw) return [];

  let regular: string[] = [];
  try {
    regular = await resolveStorageUrlCandidates(raw);
  } catch {
    regular = isBrowserMediaUrl(raw) ? [raw] : [];
  }

  const parsed = parseSupabaseStorageUrl(raw);
  if (!parsed || !isLegacySupabaseStorageUrl(raw)) {
    return uniqueMediaCandidates([...regular, isBrowserMediaUrl(raw) ? raw : null]);
  }

  try {
    const recovered = await resolveStorageUrlCandidates(
      raw,
      parsed.bucket,
      parsed.key,
    );
    return uniqueMediaCandidates([
      ...recovered,
      ...regular,
      isBrowserMediaUrl(raw) ? raw : null,
    ]);
  } catch {
    return uniqueMediaCandidates([...regular, isBrowserMediaUrl(raw) ? raw : null]);
  }
}

export async function resolveMarketplaceImageUrl(value?: string | null): Promise<string> {
  const raw = value?.trim() || '';
  if (!raw) return '';
  const candidates = await resolveMarketplaceImageCandidates(raw);
  return candidates[0] || raw;
}
