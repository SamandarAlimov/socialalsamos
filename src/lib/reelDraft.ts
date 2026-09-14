import type { PostVisibility } from '@/hooks/usePosts';
import type { PostMusicInput } from '@/lib/postMeta';

export interface ReelDraftCollaborator {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface StoredReelDraft {
  version: number;
  savedAt: number;
  caption: string;
  visibility: PostVisibility;
  music: PostMusicInput | null;
  collaborators: ReelDraftCollaborator[];
  coverSecond: number;
  selectedClipId: string | null;
}

export const REEL_DRAFT_VERSION = 1;
export const REEL_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function reelDraftKey(userId: string): string {
  return `alsamos.create.reel.draft.v${REEL_DRAFT_VERSION}:${userId}`;
}

function persistentMusic(input?: PostMusicInput | null): PostMusicInput | null {
  if (!input?.track) return input ?? null;
  // Device audio storage lifecycle alohida cleanup bilan boshqariladi; katalog
  // treklari esa faqat metadata bo‘lgani uchun localStorage da tiklanadi.
  return input.track.source === 'device' ? null : input;
}

export function readStoredReelDraft(userId: string): StoredReelDraft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(reelDraftKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredReelDraft>;
    if (
      parsed.version !== REEL_DRAFT_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > REEL_DRAFT_TTL_MS
    ) {
      localStorage.removeItem(reelDraftKey(userId));
      return null;
    }

    return {
      version: REEL_DRAFT_VERSION,
      savedAt: parsed.savedAt,
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      visibility:
        parsed.visibility === 'friends' || parsed.visibility === 'private'
          ? parsed.visibility
          : 'public',
      music: persistentMusic(parsed.music),
      collaborators: Array.isArray(parsed.collaborators)
        ? parsed.collaborators.filter(
            (item): item is ReelDraftCollaborator =>
              Boolean(item) &&
              typeof item.id === 'string' &&
              typeof item.username === 'string',
          )
        : [],
      coverSecond:
        typeof parsed.coverSecond === 'number' && Number.isFinite(parsed.coverSecond)
          ? Math.max(0, parsed.coverSecond)
          : 0,
      selectedClipId:
        typeof parsed.selectedClipId === 'string' ? parsed.selectedClipId : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredReelDraft(
  userId: string,
  draft: Omit<StoredReelDraft, 'version' | 'savedAt'>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const value: StoredReelDraft = {
      ...draft,
      version: REEL_DRAFT_VERSION,
      savedAt: Date.now(),
      music: persistentMusic(draft.music),
    };
    localStorage.setItem(reelDraftKey(userId), JSON.stringify(value));
  } catch {
    // Quota/private mode must never block Reel creation.
  }
}

export function clearStoredReelDraft(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(reelDraftKey(userId));
  } catch {
    // no-op
  }
}
