import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Eye,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Music2,
  Paperclip,
  Save,
  Send,
  Sticker as StickerIcon,
  Trash2,
  UploadCloud,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePosts, type PostVisibility } from '@/hooks/usePosts';
import { usePostAttachments } from '@/hooks/usePostAttachments';
import { ACCEPT_ANY_FILE, MAX_COLLABORATORS, MAX_FILES_PER_POST } from '@/lib/postComposer';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import type { StickerPlacement } from '@/lib/stickers';
import { PostMediaComposer } from '@/components/create/PostMediaComposer';
import { PollComposer } from '@/components/create/PollComposer';
import { LocationPicker } from '@/components/create/LocationPicker';
import { MusicPicker } from '@/components/create/MusicPicker';
import { MentionCollaborator } from '@/components/create/MentionCollaborator';
import { SchedulePostDialog } from '@/components/create/SchedulePostDialog';
import { StickerMediaEditor } from '@/components/create/StickerMediaEditor';
import { ImageEditor } from '@/components/create/ImageEditor';
import { VideoEditor, type VideoEditData } from '@/components/VideoEditor';
import { startLiveLocationSharing } from '@/lib/liveLocationSharing';
import { parseStorageReference } from '@/lib/mediaUpload';
import { supabase } from '@/integrations/supabase/client';
import { RichTextComposer } from '@/components/create/RichTextComposer';
import { PostDraftPreview } from '@/components/create/PostDraftPreview';
import {
  normalizeAlsamosRichTextDocument,
  type AlsamosRichTextDocument,
} from '@/lib/richTextDocument';

/** MentionCollaborator ichidagi Profile bilan bir xil shakl. */
interface CollaboratorProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

const VISIBILITIES: Array<{
  id: PostVisibility;
  label: string;
  icon: typeof Globe2;
}> = [
  { id: 'public', label: 'Hamma', icon: Globe2 },
  { id: 'friends', label: 'Do‘stlar', icon: UsersRound },
  { id: 'private', label: 'Faqat men', icon: Lock },
];

function formatScheduledDate(date: Date): string {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}


const POST_DRAFT_VERSION = 1;
const POST_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredPostDraft {
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

function postDraftKey(userId: string): string {
  return `alsamos.create.post.draft.v${POST_DRAFT_VERSION}:${userId}`;
}

function readStoredPostDraft(userId: string): StoredPostDraft | null {
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

function writeStoredPostDraft(userId: string, draft: StoredPostDraft): void {
  try {
    localStorage.setItem(postDraftKey(userId), JSON.stringify(draft));
  } catch {
    // Storage quota yoki private mode draftni bloklasa Create ishlashda davom etadi.
  }
}

function clearStoredPostDraft(userId: string): void {
  try {
    localStorage.removeItem(postDraftKey(userId));
  } catch {
    // no-op
  }
}

function draftMusicObject(input?: PostMusicInput | null): { bucket: string; key: string } | null {
  if (!input?.track || input.trackId || input.track.source !== 'device') return null;
  if (input.track.storageBucket && input.track.storageKey) {
    return { bucket: input.track.storageBucket, key: input.track.storageKey };
  }
  return parseStorageReference(input.track.audioUrl);
}

function sameDraftMusicObject(a?: PostMusicInput | null, b?: PostMusicInput | null): boolean {
  const left = draftMusicObject(a);
  const right = draftMusicObject(b);
  return Boolean(left && right && left.bucket === right.bucket && left.key === right.key);
}

async function cleanupDraftMusic(input?: PostMusicInput | null): Promise<void> {
  const object = draftMusicObject(input);
  if (!object) return;

  const { error } = await supabase.storage.from(object.bucket).remove([object.key]);
  if (error) console.warn('Draft music obyektini tozalab bo‘lmadi:', error);
}

/**
 * Yangi post yaratish oynasi.
 *
 * Eski `CreatePage` ning asosiy muammolari shu yerda hal qilingan:
 *  - faqat rasm/video qabul qilinardi → endi har qanday fayl
 *  - so‘rovnoma, joylashuv, musiqa post matniga marker sifatida yozilardi
 *    → endi alohida jadvallarga yoziladi
 *  - maxfiylik tanlovi saqlanmasdi → endi saqlanadi
 *  - hammuallif 5 ta bilan cheklangandi → endi 10 ta
 *  - stikerlar matnga emoji sifatida qo‘shilardi → endi media ustiga
 *    haqiqiy qatlam sifatida qo‘yiladi
 */
export function PostComposer() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const { createPost } = usePosts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<PostMusicInput | null>(null);
  const dragDepthRef = useRef(0);
  const hydratedDraftOwnerRef = useRef<string | null>(null);

  const [content, setContent] = useState('');
  const [formattedContent, setFormattedContent] = useState<AlsamosRichTextDocument | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [poll, setPoll] = useState<PollInput | null>(null);
  const [location, setLocation] = useState<PostLocationInput | null>(null);
  const [music, setMusic] = useState<PostMusicInput | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([]);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [richEditorVersion, setRichEditorVersion] = useState(0);

  /** Media editor targetlari sticker qatlamidan alohida boshqariladi. */
  const [imageTargetId, setImageTargetId] = useState<string | null>(null);
  const [videoTargetId, setVideoTargetId] = useState<string | null>(null);

  /** Stiker tahriri: qaysi fayl ustida ishlanmoqda. */
  const [stickerTargetId, setStickerTargetId] = useState<string | null>(null);
  /** Fayl id -> stiker joylashuvlari. */
  const [stickerDrafts, setStickerDrafts] = useState<Record<string, StickerPlacement[]>>({});

  const {
    attachments,
    isUploading,
    canAddMore,
    remainingSlots,
    addFiles,
    removeAttachment,
    clearAttachments,
    reorderAttachments,
    retryAttachment,
    setEditState,
    replaceAttachmentFile,
    markAttachmentsPublished,
    uploadAll,
  } = usePostAttachments({ visibility });

  const draftOwnerId = user?.id ?? profile?.id ?? null;

  useEffect(() => {
    if (!draftOwnerId || hydratedDraftOwnerRef.current === draftOwnerId) return;

    hydratedDraftOwnerRef.current = draftOwnerId;
    const draft = readStoredPostDraft(draftOwnerId);

    if (draft) {
      setContent(draft.content);
      setFormattedContent(draft.formattedContent);
      setVisibility(draft.visibility);
      setPoll(draft.poll);
      setLocation(draft.location);
      setMusic(draft.music);
      musicRef.current = draft.music;
      setCollaborators(draft.collaborators.slice(0, MAX_COLLABORATORS));

      if (draft.scheduledAt) {
        const scheduled = new Date(draft.scheduledAt);
        setScheduledAt(Number.isNaN(scheduled.getTime()) ? null : scheduled);
      } else {
        setScheduledAt(null);
      }

      setRichEditorVersion((current) => current + 1);

      if (draft.hadMedia) {
        toast({
          title: 'Qoralama tiklandi',
          description:
            'Matn va sozlamalar tiklandi. Xavfsizlik sabab media fayllarni qayta tanlang.',
        });
      }
    }

    setDraftHydrated(true);
  }, [draftOwnerId, toast]);

  useEffect(() => {
    if (!draftHydrated || !draftOwnerId) return;

    const hasDraftContent =
      content.trim().length > 0 ||
      Boolean(formattedContent) ||
      Boolean(poll) ||
      Boolean(location) ||
      Boolean(music) ||
      collaborators.length > 0 ||
      Boolean(scheduledAt) ||
      attachments.length > 0 ||
      visibility !== 'public';

    const timer = window.setTimeout(() => {
      if (!hasDraftContent) {
        clearStoredPostDraft(draftOwnerId);
        return;
      }

      const savedAt = Date.now();
      writeStoredPostDraft(draftOwnerId, {
        version: POST_DRAFT_VERSION,
        savedAt,
        content,
        formattedContent,
        visibility,
        poll,
        location,
        // Device audio refresh lifecycle binary obyektga bog'liq; katalog musiqa persist bo'ladi.
        music: music?.track?.source === 'device' ? null : music,
        collaborators,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        hadMedia: attachments.length > 0,
      });
      setDraftSavedAt(new Date(savedAt));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    attachments.length,
    collaborators,
    content,
    draftHydrated,
    draftOwnerId,
    formattedContent,
    location,
    music,
    poll,
    scheduledAt,
    visibility,
  ]);

  useEffect(() => {
    musicRef.current = music;
  }, [music]);

  useEffect(() => {
    return () => {
      void cleanupDraftMusic(musicRef.current);
    };
  }, []);

  const handleMusicChange = useCallback((next: PostMusicInput | null) => {
    const current = musicRef.current;
    if (current && !sameDraftMusicObject(current, next)) {
      void cleanupDraftMusic(current);
    }
    musicRef.current = next;
    setMusic(next);
  }, []);

  const saveDraftNow = useCallback(() => {
    if (!draftOwnerId) return;

    const savedAt = Date.now();
    writeStoredPostDraft(draftOwnerId, {
      version: POST_DRAFT_VERSION,
      savedAt,
      content,
      formattedContent,
      visibility,
      poll,
      location,
      music: music?.track?.source === 'device' ? null : music,
      collaborators,
      scheduledAt: scheduledAt?.toISOString() ?? null,
      hadMedia: attachments.length > 0,
    });
    setDraftSavedAt(new Date(savedAt));
    toast({ title: 'Qoralama saqlandi' });
  }, [
    attachments.length,
    collaborators,
    content,
    draftOwnerId,
    formattedContent,
    location,
    music,
    poll,
    scheduledAt,
    toast,
    visibility,
  ]);

  const canSubmit = useMemo(
    () =>
      !isPosting &&
      !isUploading &&
      (
        content.trim().length > 0 ||
        attachments.length > 0 ||
        Boolean(poll) ||
        Boolean(location) ||
        Boolean(music)
      ),
    [isPosting, isUploading, content, attachments.length, poll, location, music],
  );

  /** Stiker qo‘yish mumkin bo‘lgan fayllar (faqat rasm va video). */
  const stickerableAttachments = useMemo(
    () => attachments.filter((item) => item.kind === 'image' || item.kind === 'video'),
    [attachments],
  );

  const stickerTarget = useMemo(
    () => attachments.find((item) => item.id === stickerTargetId) ?? null,
    [attachments, stickerTargetId],
  );

  const imageTarget = useMemo(
    () => attachments.find((item) => item.id === imageTargetId) ?? null,
    [attachments, imageTargetId],
  );

  const videoTarget = useMemo(
    () => attachments.find((item) => item.id === videoTargetId) ?? null,
    [attachments, videoTargetId],
  );

  const totalStickers = useMemo(
    () =>
      Object.entries(stickerDrafts).reduce(
        (sum, [id, list]) => (attachments.some((item) => item.id === id) ? sum + list.length : sum),
        0,
      ),
    [stickerDrafts, attachments],
  );

  const handleFilesSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length > 0) await addFiles(files);
    },
    [addFiles],
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);

      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) await addFiles(files);
    },
    [addFiles],
  );

  const openImageEditor = useCallback((attachment: { id: string }) => {
    setImageTargetId(attachment.id);
  }, []);

  const openVideoEditor = useCallback((attachment: { id: string }) => {
    setVideoTargetId(attachment.id);
  }, []);

  const handleImageSaved = useCallback(
    async (file: File, editState: Record<string, unknown>) => {
      if (!imageTargetId) return;
      await replaceAttachmentFile(imageTargetId, file, editState);
      setImageTargetId(null);
    },
    [imageTargetId, replaceAttachmentFile],
  );

  const handleVideoSaved = useCallback(
    async (editData: VideoEditData, renderedFile?: File | null) => {
      if (!videoTargetId) return;

      const target = attachments.find((item) => item.id === videoTargetId);
      const nextEditState = {
        ...(target?.editState ?? {}),
        video: {
          ...editData,
          rendered: Boolean(renderedFile),
          ...(renderedFile
            ? { renderedAt: new Date().toISOString() }
            : { savedAt: new Date().toISOString() }),
        },
      };

      if (renderedFile) {
        await replaceAttachmentFile(videoTargetId, renderedFile, nextEditState);
      } else {
        setEditState(videoTargetId, nextEditState);
      }

      setVideoTargetId(null);
    },
    [
      attachments,
      replaceAttachmentFile,
      setEditState,
      videoTargetId,
    ],
  );

  /** Stiker tahririni ochish. Media bo‘lmasa tushunarli ogohlantirish. */
  const openStickerEditor = useCallback(
    (attachment?: { id: string } | string) => {
      const attachmentId = typeof attachment === 'string' ? attachment : attachment?.id;
      const target = attachmentId
        ? attachments.find((item) => item.id === attachmentId)
        : stickerableAttachments[0];

      if (!target) {
        toast({
          title: 'Avval rasm yoki video qo‘shing',
          description: 'Stikerlar media ustiga qo‘yiladi.',
        });
        return;
      }

      if (target.kind !== 'image' && target.kind !== 'video') {
        toast({
          title: 'Bu faylga stiker qo‘yilmaydi',
          description: 'Stiker faqat rasm va videoga qo‘yiladi.',
        });
        return;
      }

      setStickerTargetId(target.id);
    },
    [attachments, stickerableAttachments, toast],
  );

  /** Stikerlarni faylning tahrir holatiga yozamiz — keyin post_media ga tushadi. */
  const handleStickersSaved = useCallback(
    (placements: StickerPlacement[]) => {
      const targetId = stickerTargetId;
      if (!targetId) return;

      setStickerDrafts((current) => ({ ...current, [targetId]: placements }));

      const target = attachments.find((item) => item.id === targetId);
      const nextEditState = { ...(target?.editState ?? {}) } as Record<string, unknown>;

      if (placements.length > 0) {
        nextEditState.stickers = placements;
      } else {
        delete nextEditState.stickers;
      }

      setEditState(
        targetId,
        Object.keys(nextEditState).length > 0 ? nextEditState : undefined,
      );
    },
    [attachments, setEditState, stickerTargetId],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      toast({
        title: 'Rejalashtirilgan vaqt o‘tib ketdi',
        description: 'Kelajakdagi sana va vaqtni qayta tanlang.',
        variant: 'destructive',
      });
      setShowSchedule(true);
      return;
    }

    if (scheduledAt && location?.mode === 'live') {
      toast({
        title: 'Jonli joylashuvni rejalashtirib bo‘lmaydi',
        description: 'Live location hozirgi qurilma pozitsiyasini kuzatadi. Uni darhol joylang.',
        variant: 'destructive',
      });
      return;
    }

    setIsPosting(true);
    try {
      // 1. Fayllarni yuklaymiz (har birida alohida progress ko‘rinadi)
      const { media, failed } = await uploadAll();

      if (failed.length > 0) {
        toast({
          title: 'Ba‘zi fayllar yuklanmadi',
          description:
            failed.length + ' fayl yuklanmadi. Qayta urinib ko‘ring yoki ularni o‘chirib yuboring.',
          variant: 'destructive',
        });
        return;
      }

      // 2. Postni yaratamiz — barcha meta jadvallarga ham yoziladi
      // Legacy media_urls faqat public postlarda qoladi.
      // Friends/private postlarda URL/reference sizib chiqmasligi uchun bo‘sh massiv yoziladi.
      const mediaUrls = visibility === 'public' ? media.map((item) => item.storageUrl) : [];
      const primaryKind = media[0]?.kind ?? 'text';

      const created = await createPost(content.trim(), mediaUrls, primaryKind, collaborators.map((item) => item.id), {
        visibility,
        postKind: poll ? 'poll' : 'post',
        media,
        poll,
        location,
        music,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        formattedContent,
      });

      if (!created) return;

      markAttachmentsPublished();
      musicRef.current = null;

      if (location?.mode === 'live' && location.liveUntil) {
        startLiveLocationSharing(created.id, location.liveUntil);
      }

      // 3. Tozalaymiz va lentaga qaytamiz
      clearAttachments();
      setContent('');
      setFormattedContent(null);
      setPoll(null);
      setLocation(null);
      setMusic(null);
      setCollaborators([]);
      setScheduledAt(null);
      setStickerDrafts({});
      if (draftOwnerId) clearStoredPostDraft(draftOwnerId);
      navigate('/home');
    } finally {
      setIsPosting(false);
    }
  }, [
    canSubmit,
    uploadAll,
    toast,
    createPost,
    content,
    collaborators,
    visibility,
    poll,
    location,
    music,
    scheduledAt,
    formattedContent,
    clearAttachments,
    markAttachmentsPublished,
    navigate,
    draftOwnerId,
  ]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;

      const overlayOpen =
        showPoll ||
        showLocation ||
        showMusic ||
        showCollaborators ||
        showSchedule ||
        showPreview ||
        Boolean(imageTarget) ||
        Boolean(videoTarget) ||
        Boolean(stickerTarget);

      if (overlayOpen || !canSubmit) return;

      event.preventDefault();
      void handleSubmit();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    canSubmit,
    handleSubmit,
    imageTarget,
    showCollaborators,
    showLocation,
    showMusic,
    showPoll,
    showPreview,
    showSchedule,
    stickerTarget,
    videoTarget,
  ]);

  return (
    <div
      className="relative mx-auto w-full max-w-3xl px-0 pb-8 sm:px-4 sm:pt-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background px-8 py-12 text-center shadow-2xl">
            <UploadCloud className="h-8 w-8 text-primary" />
            <p className="font-semibold">Fayllarni shu yerga tashlang</p>
          </div>
        </div>
      )}

      <section className="overflow-hidden border-y border-border/60 bg-background sm:rounded-2xl sm:border">
        <div className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? ''} />
            <AvatarFallback className="font-semibold">
              {(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="max-w-[220px] truncate text-sm font-semibold sm:text-base">
                {profile?.display_name || profile?.username || 'Foydalanuvchi'}
              </p>

              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value as PostVisibility)}
              >
                <SelectTrigger className="h-7 w-auto min-w-0 gap-1 rounded-full border-0 bg-muted/55 px-2.5 text-[11px] font-medium shadow-none focus:ring-0">
                  <SelectValue />
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map(({ id, label, icon: Icon }) => (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {collaborators.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCollaborators(true)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  +{collaborators.length} hammuallif
                </button>
              )}
            </div>

            <RichTextComposer
              key={richEditorVersion}
              value={formattedContent}
              onChange={({ plainText, formattedContent: nextDocument }) => {
                setContent(plainText);
                setFormattedContent(nextDocument);
              }}
              placeholder="Nima yangilik?"
              className="mt-2 min-h-32 border-0 bg-transparent p-0 shadow-none sm:min-h-40"
            />
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="border-t border-border/50">
            <PostMediaComposer
              attachments={attachments}
              onRemove={removeAttachment}
              onRetry={retryAttachment}
              onReorder={reorderAttachments}
              onEditImage={openImageEditor}
              onEditVideo={openVideoEditor}
              onSticker={(item) => openStickerEditor(item)}
            />
          </div>
        )}

        {(poll || location || music || collaborators.length > 0 || scheduledAt || totalStickers > 0) && (
          <div className="border-t border-border/50">
            {poll && (
              <div className="flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5">
                <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
                <button
                  type="button"
                  onClick={() => setShowPoll(true)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium">{poll.question}</p>
                  <p className="text-[10px] text-muted-foreground">{poll.options.length} variant</p>
                </button>
                <button type="button" onClick={() => setPoll(null)} aria-label="So‘rovnomani olib tashlash" className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {location && (
              <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <button
                  type="button"
                  onClick={() => setShowLocation(true)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium">
                    {location.place?.name ?? location.label ?? 'Joylashuv'}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {location.mode === 'live' ? 'Jonli joylashuv' : location.place?.address ?? 'Aniq nuqta'}
                  </p>
                </button>
                <button type="button" onClick={() => setLocation(null)} aria-label="Joylashuvni olib tashlash" className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {music && (
              <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
                <Music2 className="h-4 w-4 shrink-0 text-primary" />
                <button
                  type="button"
                  onClick={() => setShowMusic(true)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium">{music.track?.title ?? 'Musiqa'}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{music.track?.artist ?? 'Katalog'}</p>
                </button>
                <button type="button" onClick={() => handleMusicChange(null)} aria-label="Musiqani olib tashlash" className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {collaborators.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCollaborators(true)}
                className="flex min-h-12 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left first:border-t-0 sm:px-5"
              >
                <Users className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {collaborators.map((item) => '@' + item.username).join(', ')}
                </span>
                <span className="text-[10px] text-muted-foreground">{collaborators.length}/{MAX_COLLABORATORS}</span>
              </button>
            )}

            {scheduledAt && (
              <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                <button
                  type="button"
                  onClick={() => setShowSchedule(true)}
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                >
                  {formatScheduledDate(scheduledAt)}
                </button>
                <button type="button" onClick={() => setScheduledAt(null)} aria-label="Rejani olib tashlash" className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {totalStickers > 0 && (
              <button
                type="button"
                onClick={() => openStickerEditor()}
                className="flex min-h-12 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left first:border-t-0 sm:px-5"
              >
                <StickerIcon className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 text-xs font-medium">{totalStickers} stiker</span>
                <span className="text-[10px] text-primary">Tahrirlash</span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 border-t border-border/60 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {[
              {
                label: 'Fayl',
                icon: Paperclip,
                action: () => fileInputRef.current?.click(),
                disabled: !canAddMore,
                active: attachments.length > 0,
              },
              {
                label: 'Stiker',
                icon: StickerIcon,
                action: () => openStickerEditor(),
                disabled: stickerableAttachments.length === 0,
                active: totalStickers > 0,
              },
              {
                label: 'So‘rovnoma',
                icon: BarChart3,
                action: () => setShowPoll(true),
                disabled: false,
                active: Boolean(poll),
              },
              {
                label: 'Joylashuv',
                icon: MapPin,
                action: () => setShowLocation(true),
                disabled: false,
                active: Boolean(location),
              },
              {
                label: 'Musiqa',
                icon: Music2,
                action: () => setShowMusic(true),
                disabled: false,
                active: Boolean(music),
              },
              {
                label: 'Hammuallif',
                icon: Users,
                action: () => setShowCollaborators(true),
                disabled: false,
                active: collaborators.length > 0,
              },
              {
                label: 'Rejalashtirish',
                icon: CalendarClock,
                action: () => setShowSchedule(true),
                disabled: location?.mode === 'live',
                active: Boolean(scheduledAt),
              },
              {
                label: 'Qoralama',
                icon: Save,
                action: saveDraftNow,
                disabled:
                  content.trim().length === 0 &&
                  attachments.length === 0 &&
                  !poll &&
                  !location &&
                  !music,
                active: Boolean(draftSavedAt),
              },
              {
                label: 'Ko‘rish',
                icon: Eye,
                action: () => setShowPreview(true),
                disabled: !canSubmit,
                active: false,
              },
            ].map(({ label, icon: Icon, action, disabled, active }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                onClick={action}
                disabled={disabled}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30',
                  active && 'bg-primary/10 text-primary',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="ml-1 flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPosting || isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : scheduledAt ? (
              <CalendarClock className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {scheduledAt ? 'Rejalashtirish' : 'Joylash'}
            </span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ANY_FILE}
          onChange={handleFilesSelected}
          className="hidden"
        />
      </section>

      {/* Oynalar */}
      <PostDraftPreview
        open={showPreview}
        onOpenChange={setShowPreview}
        author={{
          displayName: profile?.display_name || profile?.username || 'Foydalanuvchi',
          username: profile?.username || 'user',
          avatarUrl: profile?.avatar_url ?? null,
        }}
        content={content}
        formattedContent={formattedContent}
        attachments={attachments}
        visibility={visibility}
        poll={poll}
        location={location}
        music={music}
        collaborators={collaborators}
        scheduledAt={scheduledAt}
      />

      <PollComposer
        open={showPoll}
        onClose={() => setShowPoll(false)}
        onSave={setPoll}
        initialPoll={poll}
      />

      <LocationPicker
        open={showLocation}
        onClose={() => setShowLocation(false)}
        onSelect={(nextLocation) => {
          setLocation(nextLocation);
          if (nextLocation.mode === 'live' && scheduledAt) {
            setScheduledAt(null);
            toast({
              title: 'Rejalashtirish bekor qilindi',
              description: 'Jonli joylashuvli post qurilma pozitsiyasini hozir kuzatishi kerak.',
            });
          }
        }}
      />

      <MusicPicker
        open={showMusic}
        onOpenChange={setShowMusic}
        currentMusic={music}
        onSelectMusic={handleMusicChange}
        visibility={visibility}
      />

      <SchedulePostDialog
        open={showSchedule}
        onOpenChange={setShowSchedule}
        currentDate={scheduledAt}
        onSchedule={(date) => {
          if (location?.mode === 'live') {
            toast({
              title: 'Jonli joylashuvni rejalashtirib bo‘lmaydi',
              description: 'Live location bilan postni darhol joylang.',
              variant: 'destructive',
            });
            return;
          }
          setScheduledAt(date);
        }}
      />

      <ImageEditor
        open={Boolean(imageTarget)}
        onOpenChange={(next) => {
          if (!next) setImageTargetId(null);
        }}
        attachment={imageTarget}
        onSave={handleImageSaved}
      />

      <VideoEditor
        open={Boolean(videoTarget)}
        videoUrl={videoTarget?.previewUrl ?? ''}
        sourceFile={videoTarget?.file ?? null}
        initialEditData={(videoTarget?.editState?.video ?? null) as VideoEditData | null}
        onSave={handleVideoSaved}
        onCancel={() => setVideoTargetId(null)}
      />

      <StickerMediaEditor
        open={Boolean(stickerTarget)}
        onOpenChange={(next) => {
          if (!next) setStickerTargetId(null);
        }}
        attachment={stickerTarget}
        initialPlacements={stickerTargetId ? (stickerDrafts[stickerTargetId] ?? []) : []}
        onSave={handleStickersSaved}
      />

      <MentionCollaborator
        open={showCollaborators}
        onOpenChange={setShowCollaborators}
        mode="collaborate"
        maxUsers={MAX_COLLABORATORS}
        selectedUsers={collaborators}
        onSelectUser={(user) =>
          setCollaborators((current) =>
            current.length >= MAX_COLLABORATORS || current.some((item) => item.id === user.id)
              ? current
              : [...current, user],
          )
        }
        onRemoveUser={(userId) =>
          setCollaborators((current) => current.filter((item) => item.id !== userId))
        }
      />
    </div>
  );
}
