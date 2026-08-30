import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Music2,
  Paperclip,
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
import { AttachmentGrid } from '@/components/create/AttachmentGrid';
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
import type { AlsamosRichTextDocument } from '@/lib/richTextDocument';

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
  const { profile } = useAuth();
  const { createPost } = usePosts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<PostMusicInput | null>(null);
  const dragDepthRef = useRef(0);

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
    (editData: VideoEditData) => {
      if (!videoTargetId) return;

      const target = attachments.find((item) => item.id === videoTargetId);
      setEditState(videoTargetId, {
        ...(target?.editState ?? {}),
        video: {
          ...editData,
          rendered: false,
          savedAt: new Date().toISOString(),
        },
      });
      setVideoTargetId(null);
    },
    [attachments, setEditState, videoTargetId],
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
  ]);

  return (
    <div
      className="relative mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-5 lg:px-6"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-primary/[0.06] px-8 py-12 text-center shadow-2xl">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <UploadCloud className="h-7 w-7" />
            </span>
            <div>
              <p className="font-semibold">Fayllarni shu yerga tashlang</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Rasm, video, audio, hujjat, arxiv va boshqa fayllar qo‘llanadi
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-start">
        <section className="min-w-0 space-y-4">
          {/* Identity */}
          <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.045] p-3.5 shadow-sm sm:p-4">
            <Avatar className="h-12 w-12 shrink-0 border-2 border-background shadow-sm ring-1 ring-border/60 sm:h-14 sm:w-14">
              <AvatarImage src={profile?.avatar_url ?? ''} />
              <AvatarFallback className="font-semibold">
                {(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold sm:text-base">
                {profile?.display_name || profile?.username || 'Foydalanuvchi'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as PostVisibility)}
                >
                  <SelectTrigger className="h-8 w-auto min-w-28 gap-1 rounded-full border-border/60 bg-background px-3 text-xs shadow-none">
                    <SelectValue />
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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

                <button
                  type="button"
                  onClick={() => setShowCollaborators(true)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium transition hover:bg-muted',
                    collaborators.length > 0 && 'border-primary/30 bg-primary/[0.06] text-primary',
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {collaborators.length > 0
                    ? `${collaborators.length} hammuallif`
                    : 'Hammuallif qo‘shish'}
                </button>
              </div>
            </div>
          </div>

          {/* Asosiy matn editori */}
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="border-b border-border/50 px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Matn
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <RichTextComposer
                value={formattedContent}
                onChange={({ plainText, formattedContent: nextDocument }) => {
                  setContent(plainText);
                  setFormattedContent(nextDocument);
                }}
                placeholder="Nima yangilik? #hashtag ishlatib ko‘ring..."
                className="border-0 bg-transparent p-0"
              />
            </div>
          </div>

          {/* Media stage */}
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Media va fayllar
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Universal upload · drag/drop · tahrirlash
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                {attachments.length}/{MAX_FILES_PER_POST}
              </span>
            </div>

            {attachments.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group flex min-h-52 w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-muted/20 to-transparent px-6 py-10 text-center transition hover:from-primary/[0.05]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm transition group-hover:scale-105">
                  <UploadCloud className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Fayl yoki media qo‘shing</p>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                    Rasm, video, audio, hujjat, arxiv va boshqa fayllarni tanlang yoki shu maydonga tashlang.
                  </p>
                </div>
              </button>
            ) : (
              <div className="p-3 sm:p-4">
                <AttachmentGrid
                  attachments={attachments}
                  onRemove={removeAttachment}
                  onRetry={retryAttachment}
                  onReorder={reorderAttachments}
                  onEditImage={openImageEditor}
                  onEditVideo={openVideoEditor}
                />
              </div>
            )}
          </div>

          {totalStickers > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
              <StickerIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{totalStickers} stiker qo‘yildi</p>
                <p className="text-xs text-muted-foreground">
                  Media ustidagi joylashuv postda ham aynan shunday ko‘rinadi
                </p>
              </div>
              <button
                type="button"
                onClick={() => openStickerEditor()}
                className="shrink-0 text-xs font-medium text-primary"
              >
                Tahrirlash
              </button>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-4">
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="border-b border-border/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Post sozlamalari
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 xl:grid-cols-1">
              {[
                {
                  label: 'Fayl qo‘shish',
                  description: `${attachments.length}/${MAX_FILES_PER_POST} fayl`,
                  icon: Paperclip,
                  action: () => fileInputRef.current?.click(),
                  disabled: !canAddMore,
                },
                {
                  label: 'Stikerlar',
                  description: totalStickers > 0 ? `${totalStickers} ta qo‘yilgan` : 'Media ustiga',
                  icon: StickerIcon,
                  action: () => openStickerEditor(),
                  disabled: false,
                },
                {
                  label: 'So‘rovnoma',
                  description: poll ? 'Sozlangan' : 'Poll yoki quiz',
                  icon: BarChart3,
                  action: () => setShowPoll(true),
                  disabled: false,
                },
                {
                  label: 'Joylashuv',
                  description: location
                    ? location.mode === 'live'
                      ? 'Jonli'
                      : 'Tanlangan'
                    : 'POI, pin yoki live',
                  icon: MapPin,
                  action: () => setShowLocation(true),
                  disabled: false,
                },
                {
                  label: 'Musiqa',
                  description: music?.track?.title ?? 'Katalog yoki device',
                  icon: Music2,
                  action: () => setShowMusic(true),
                  disabled: false,
                },
                {
                  label: 'Hammualliflar',
                  description: `${collaborators.length}/${MAX_COLLABORATORS}`,
                  icon: Users,
                  action: () => setShowCollaborators(true),
                  disabled: false,
                },
                {
                  label: 'Rejalashtirish',
                  description: scheduledAt ? formatScheduledDate(scheduledAt) : 'Keyinroq joylash',
                  icon: CalendarClock,
                  action: () => setShowSchedule(true),
                  disabled: location?.mode === 'live',
                },
              ].map(({ label, description, icon: Icon, action, disabled }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  disabled={disabled}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/50 bg-background px-3 py-2.5 text-left transition hover:border-primary/25 hover:bg-primary/[0.035] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{label}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              ))}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ANY_FILE}
                onChange={handleFilesSelected}
                className="hidden"
              />
            </div>
          </div>

          {(poll || location || music || collaborators.length > 0 || scheduledAt) && (
            <div className="space-y-2 rounded-3xl border border-border/60 bg-card p-3 shadow-sm">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Qo‘shilganlar
              </p>

              {poll && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/35 p-3">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{poll.question}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {poll.options.length} variant{poll.quizMode ? ' · quiz' : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setPoll(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {location && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/35 p-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {location.place?.name ?? location.label ?? 'Joylashuv'}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {location.mode === 'live' ? 'Real vaqtli ulashish' : location.place?.address ?? 'Aniq nuqta'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setLocation(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {music && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/35 p-3">
                  <Music2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{music.track?.title ?? 'Musiqa'}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {music.track?.artist ?? 'Katalog'}
                    </p>
                  </div>
                  <button type="button" onClick={() => handleMusicChange(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {collaborators.length > 0 && (
                <div className="rounded-2xl bg-muted/35 p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs font-semibold">{collaborators.length} hammuallif</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {collaborators.slice(0, 5).map((collaborator) => (
                      <span key={collaborator.id} className="rounded-full bg-background px-2 py-1 text-[10px]">
                        @{collaborator.username}
                      </span>
                    ))}
                    {collaborators.length > 5 && (
                      <span className="rounded-full bg-background px-2 py-1 text-[10px] text-muted-foreground">
                        +{collaborators.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {scheduledAt && (
                <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">Rejalashtirilgan</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {formatScheduledDate(scheduledAt)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setScheduledAt(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="sticky bottom-2 z-20 rounded-3xl border border-border/70 bg-background/94 p-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="mb-2 hidden px-1 xl:block">
              <p className="truncate text-xs font-semibold">
                {scheduledAt ? 'Rejalashtirilgan nashr' : 'Post joylashga tayyor'}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {scheduledAt
                  ? formatScheduledDate(scheduledAt)
                  : `${attachments.length} fayl · ${collaborators.length} hammuallif · ${VISIBILITIES.find((item) => item.id === visibility)?.label}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPosting || isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : scheduledAt ? (
                <CalendarClock className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isUploading
                ? 'Fayllar yuklanmoqda...'
                : isPosting
                  ? scheduledAt
                    ? 'Rejalashtirilmoqda...'
                    : 'Joylanmoqda...'
                  : scheduledAt
                    ? 'Rejalashtirish'
                    : 'Joylash'}
            </button>
          </div>

          {!canAddMore && (
            <p className="px-1 text-[10px] text-muted-foreground">
              Bitta postga {MAX_FILES_PER_POST} tagacha fayl qo‘shish mumkin.
            </p>
          )}
          {canAddMore && attachments.length > 0 && (
            <p className="px-1 text-[10px] text-muted-foreground">
              Yana {remainingSlots} fayl qo‘shsa bo‘ladi.
            </p>
          )}
        </aside>
      </div>

      {/* Oynalar */}
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
