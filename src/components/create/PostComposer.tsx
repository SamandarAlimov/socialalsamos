import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Music2,
  Paperclip,
  Send,
  Sticker as StickerIcon,
  Trash2,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const { createPost } = usePosts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<PostMusicInput | null>(null);

  const [content, setContent] = useState('');
  const [formattedContent, setFormattedContent] = useState<AlsamosRichTextDocument | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [poll, setPoll] = useState<PollInput | null>(null);
  const [location, setLocation] = useState<PostLocationInput | null>(null);
  const [music, setMusic] = useState<PostMusicInput | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);

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
    formattedContent,
    clearAttachments,
    markAttachmentsPublished,
    navigate,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-32 pt-4">
      {/* Maxfiylik */}
      <div className="flex gap-2">
        {VISIBILITIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setVisibility(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition',
              visibility === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Structured WYSIWYG matn editori */}
      <RichTextComposer
        value={formattedContent}
        onChange={({ plainText, formattedContent: nextDocument }) => {
          setContent(plainText);
          setFormattedContent(nextDocument);
        }}
        placeholder="Nima yangilik? #hashtag ishlatib ko‘ring..."
      />

      {/* Fayllar — rasm/videoni bosib stiker qo‘yish mumkin */}
      <AttachmentGrid
        attachments={attachments}
        onRemove={removeAttachment}
        onRetry={retryAttachment}
        onReorder={reorderAttachments}
        onEditImage={openImageEditor}
        onEditVideo={openVideoEditor}
      />

      {/* Stiker xulosasi */}
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

      {/* So‘rovnoma xulosasi */}
      {poll && (
        <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{poll.question}</p>
            <p className="text-xs text-muted-foreground">
              {poll.options.length} variant
              {poll.quizMode ? ' · viktorina' : ''}
              {poll.allowMultiple ? ' · ko‘p tanlov' : ''}
              {poll.isAnonymous ? ' · anonim' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPoll(true)}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Tahrirlash
          </button>
          <button
            type="button"
            onClick={() => setPoll(null)}
            aria-label="So‘rovnomani o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Joylashuv xulosasi */}
      {location && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {location.place?.name ?? location.label ?? 'Joylashuv'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {location.mode === 'live'
                ? 'Real vaqtli ulashish'
                : (location.place?.address ??
                  location.latitude.toFixed(4) + ', ' + location.longitude.toFixed(4))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocation(null)}
            aria-label="Joylashuvni o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Musiqa xulosasi */}
      {music && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <Music2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {music.track?.title ?? 'Tanlangan musiqa'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {music.track?.artist ?? 'Katalog treki'}
              {' · '}
              {Math.round((music.volume ?? 1) * 100)}%
              {music.startSeconds ? ' · ' + Math.round(music.startSeconds) + 's dan' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMusic(true)}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Tahrirlash
          </button>
          <button
            type="button"
            onClick={() => handleMusicChange(null)}
            aria-label="Musiqani o‘chirish"
            className="shrink-0 text-muted-foreground transition hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hammualliflar */}
      {collaborators.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          {collaborators.map((collaborator) => (
            <span
              key={collaborator.id}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs"
            >
              @{collaborator.username}
              <button
                type="button"
                onClick={() =>
                  setCollaborators((current) =>
                    current.filter((item) => item.id !== collaborator.id),
                  )
                }
                aria-label="Olib tashlash"
                className="text-muted-foreground transition hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="text-xs text-muted-foreground">
            {collaborators.length}/{MAX_COLLABORATORS}
          </span>
        </div>
      )}

      {/* Asboblar paneli */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAddMore}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" /> Fayl
          <span className="text-muted-foreground">
            ({attachments.length}/{MAX_FILES_PER_POST})
          </span>
        </button>

        <button
          type="button"
          onClick={() => openStickerEditor()}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <StickerIcon className="h-4 w-4" /> Stiker
        </button>

        <button
          type="button"
          onClick={() => setShowPoll(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <BarChart3 className="h-4 w-4" /> So‘rovnoma
        </button>

        <button
          type="button"
          onClick={() => setShowLocation(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <MapPin className="h-4 w-4" /> Joylashuv
        </button>

        <button
          type="button"
          onClick={() => setShowMusic(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <Music2 className="h-4 w-4" /> Musiqa
        </button>

        <button
          type="button"
          onClick={() => setShowCollaborators(true)}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium transition hover:bg-muted"
        >
          <Users className="h-4 w-4" /> Hammuallif
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ANY_FILE}
          onChange={handleFilesSelected}
          className="hidden"
        />
      </div>

      {!canAddMore && (
        <p className="text-xs text-muted-foreground">
          Bitta postga {MAX_FILES_PER_POST} tagacha fayl qo‘shish mumkin.
        </p>
      )}
      {canAddMore && attachments.length > 0 && (
        <p className="text-xs text-muted-foreground">Yana {remainingSlots} fayl qo‘shsa bo‘ladi.</p>
      )}

      {/* Joylash tugmasi */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition disabled:opacity-50"
      >
        {isPosting || isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {isUploading ? 'Fayllar yuklanmoqda...' : isPosting ? 'Joylanmoqda...' : 'Joylash'}
      </button>

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
        onSelect={setLocation}
      />

      <MusicPicker
        open={showMusic}
        onOpenChange={setShowMusic}
        currentMusic={music}
        onSelectMusic={handleMusicChange}
        visibility={visibility}
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
