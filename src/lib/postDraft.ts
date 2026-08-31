import { supabase } from '@/integrations/supabase/client';
import { parseStorageReference } from '@/lib/mediaUpload';
import type { PostVisibility } from '@/hooks/usePosts';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import {
  normalizeAlsamosRichTextDocument,
  type AlsamosRichTextDocument,
} from '@/lib/richTextDocument';

/**
 * Post qoralamasini localStorage da saqlash va tiklash.
 *
 * Bu mantiq PostComposer ichida turgan edi; create UI ni map dizayn tiliga
 * (SnapSheet) o'tkazish uchun komponent faqat holat va yuklashni boshqarishi,
 * saqlash esa alohida qatlamda bo'lishi kerak.
 */

/** MentionCollaborator ichidagi Profile bilan bir xil shakl. */
export interface CollaboratorProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

export const POST_DRAFT_VERSION = 1;
export const POST_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredPostDraft {
  version: number;
  savedAt: number;
  content: string;
  formattedContent: AlsamosRichTextDocument | null;
  visibility: PostVisibility;
  poll: PollInput | null;
  location: PostLocationInput | null;
  music: PostMusicInput | null;
  collaborators: CollaboratorProfile[];
  scheduledAt: string | null;
  hadMedia: boolean;
}

export function postDraftKey(userId: string): string {
  return `alsamos.create.post.draft.v${POST_DRAFT_VERSION}:${userId}`;
}

export function readStoredPostDraft(userId: string): StoredPostDraft | null {
  try {
    const raw = localStorage.getItem(postDraftKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredPostDraft>;
    if (
      parsed.version !== POST_DRAFT_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > POST_DRAFT_TTL_MS
    ) {
      localStorage.removeItem(postDraftKey(userId));
      return null;
    }

    return {
      version: POST_DRAFT_VERSION,
      savedAt: parsed.savedAt,
      content: typeof parsed.content === 'string' ? parsed.content : '',
      formattedContent: normalizeAlsamosRichTextDocument(parsed.formattedContent),
      visibility:
        parsed.visibility === 'friends' || parsed.visibility === 'private'
          ? parsed.visibility
          : 'public',
      poll: parsed.poll ?? null,
      location: parsed.location ?? null,
      // Device audio binary lifecycle localStorage bilan ishonchli tiklanmaydi.
      music:
        parsed.music?.track?.source === 'device'
          ? null
          : (parsed.music ?? null),
      collaborators: Array.isArray(parsed.collaborators)
        ? parsed.collaborators.filter(
            (item): item is CollaboratorProfile =>
              Boolean(item) &&
              typeof item.id === 'string' &&
              typeof item.username === 'string',
          )
        : [],
      scheduledAt:
        typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : null,
      hadMedia: Boolean(parsed.hadMedia),
    };
  } catch {
    return null;
  }
}

export function writeStoredPostDraft(userId: string, draft: StoredPostDraft): void {
  try {
    localStorage.setItem(postDraftKey(userId), JSON.stringify(draft));
  } catch {
    // Storage quota yoki private mode draftni bloklasa Create ishlashda davom etadi.
  }
}

export function clearStoredPostDraft(userId: string): void {
  try {
    localStorage.removeItem(postDraftKey(userId));
  } catch {
    // no-op
  }
}

/** Qurilmadan tanlangan, hali postga bog'lanmagan audio obyekti. */
export function draftMusicObject(
  input?: PostMusicInput | null,
): { bucket: string; key: string } | null {
  if (!input?.track || input.trackId || input.track.source !== 'device') return null;
  if (input.track.storageBucket && input.track.storageKey) {
    return { bucket: input.track.storageBucket, key: input.track.storageKey };
  }
  return parseStorageReference(input.track.audioUrl);
}

export function sameDraftMusicObject(
  a?: PostMusicInput | null,
  b?: PostMusicInput | null,
): boolean {
  const left = draftMusicObject(a);
  const right = draftMusicObject(b);
  return Boolean(left && right && left.bucket === right.bucket && left.key === right.key);
}

/** Foydalanilmagan draft audio storage da yetim qolib ketmasligi uchun. */
export async function cleanupDraftMusic(input?: PostMusicInput | null): Promise<void> {
  const object = draftMusicObject(input);
  if (!object) return;

  const { error } = await supabase.storage.from(object.bucket).remove([object.key]);
  if (error) console.warn('Draft music obyektini tozalab bo‘lmadi:', error);
}
