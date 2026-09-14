import type { PostVisibility } from '@/hooks/usePosts';

export interface StoredStoryDraft {
  version: number;
  savedAt: number;
  caption: string;
  visibility: PostVisibility;
}

export const STORY_DRAFT_VERSION = 1;
export const STORY_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function storyDraftKey(userId: string): string {
  return `alsamos.create.story.draft.v${STORY_DRAFT_VERSION}:${userId}`;
}

export function readStoredStoryDraft(userId: string): StoredStoryDraft | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(storyDraftKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredStoryDraft>;
    if (
      parsed.version !== STORY_DRAFT_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > STORY_DRAFT_TTL_MS
    ) {
      localStorage.removeItem(storyDraftKey(userId));
      return null;
    }

    return {
      version: STORY_DRAFT_VERSION,
      savedAt: parsed.savedAt,
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      visibility:
        parsed.visibility === 'friends' || parsed.visibility === 'private'
          ? parsed.visibility
          : 'public',
    };
  } catch {
    return null;
  }
}

export function writeStoredStoryDraft(
  userId: string,
  draft: Omit<StoredStoryDraft, 'version' | 'savedAt'>,
): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const value: StoredStoryDraft = {
      ...draft,
      version: STORY_DRAFT_VERSION,
      savedAt: Date.now(),
    };
    localStorage.setItem(storyDraftKey(userId), JSON.stringify(value));
  } catch {
    // Storage quota/private mode must never block Story creation.
  }
}

export function clearStoredStoryDraft(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storyDraftKey(userId));
  } catch {
    // no-op
  }
}
