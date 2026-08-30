import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Check,
  ChevronRight,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  Wand2,
} from 'lucide-react';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePosts, type PostVisibility } from '@/hooks/usePosts';
import { usePostAttachments } from '@/hooks/usePostAttachments';
import type { PostMediaInput } from '@/lib/postMeta';
import { AttachmentGrid } from '@/components/create/AttachmentGrid';
import { ImageEditor } from '@/components/create/ImageEditor';
import { CameraVideoRecorder } from '@/components/create/CameraVideoRecorder';
import { StoryStickerComposer } from '@/components/create/StoryStickerComposer';
import { VideoEditor, type VideoEditData } from '@/components/VideoEditor';

interface StoryDraftIdentity {
  storyId: string;
  postId: string;
  mediaId: string | null;
}

const VISIBILITIES: Array<{
  id: PostVisibility;
  label: string;
  description: string;
  icon: typeof Globe2;
}> = [
  { id: 'public', label: 'Hamma', description: 'Barcha foydalanuvchilar', icon: Globe2 },
  { id: 'friends', label: 'Do‘stlar', description: 'Mutual follow', icon: UsersRound },
  { id: 'private', label: 'Faqat men', description: 'Shaxsiy Story', icon: Lock },
];

function storyPayload(
  content: string,
  visibility: PostVisibility,
  media: PostMediaInput[],
) {
  return {
    content: content.trim(),
    mediaUrls: visibility === 'public' ? media.map((item) => item.storageUrl) : [],
    mediaType: media[0]?.kind ?? 'image',
    collaboratorIds: [],
    visibility,
    postKind: 'story',
    scheduledAt: null,
    media,
    poll: null,
    location: null,
    music: null,
    formattedContent: null,
    editState: null,
  };
}

export function StoryComposer() {
  const navigate = useNavigate();
  const { toast } = useToast();
  // usePosts hook feed state is not used, but keeps shared post types/context loaded.
  usePosts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<StoryDraftIdentity | null>(null);

  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [caption, setCaption] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [imageTargetId, setImageTargetId] = useState<string | null>(null);
  const [videoTargetId, setVideoTargetId] = useState<string | null>(null);
  const [storyDraft, setStoryDraft] = useState<StoryDraftIdentity | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    attachments,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    setEditState,
    replaceAttachmentFile,
    markAttachmentsPublished,
    uploadAll,
  } = usePostAttachments({
    maxFiles: 1,
    uploadKind: 'story',
    visibility,
  });

  const attachment = attachments[0] ?? null;
  const imageTarget = useMemo(
    () => attachments.find((item) => item.id === imageTargetId) ?? null,
    [attachments, imageTargetId],
  );
  const videoTarget = useMemo(
    () => attachments.find((item) => item.id === videoTargetId) ?? null,
    [attachments, videoTargetId],
  );

  useEffect(() => {
    draftRef.current = storyDraft;
  }, [storyDraft]);

  // Hidden Story draft abandoned bo'lsa DB graph ham best-effort tozalanadi.
  useEffect(() => {
    return () => {
      const current = draftRef.current;
      if (current) {
        void db.rpc('discard_story_draft', { p_story_id: current.storyId });
      }
    };
  }, []);

  const replaceMedia = useCallback(
    async (file: File) => {
      if (storyDraft) return;
      if (attachment) removeAttachment(attachment.id);
      await addFiles([file]);
    },
    [addFiles, attachment, removeAttachment, storyDraft],
  );

  const handleFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await replaceMedia(file);
    },
    [replaceMedia],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (storyDraft) return;
      const file = event.dataTransfer.files?.[0];
      if (file) await replaceMedia(file);
    },
    [replaceMedia, storyDraft],
  );

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

  const createHiddenDraft = useCallback(async () => {
    if (!attachment || storyDraft || isCreatingDraft) return;

    if (attachment.kind !== 'image' && attachment.kind !== 'video') {
      toast({
        title: 'Story media turi noto‘g‘ri',
        description: 'Story uchun rasm yoki video tanlang.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingDraft(true);
    try {
      const { media, failed } = await uploadAll();
      if (failed.length > 0 || media.length !== 1) {
        toast({
          title: 'Media yuklanmadi',
          description: 'Story faylini qayta yuklab ko‘ring.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await db.rpc('create_story_draft', {
        p_payload: storyPayload(caption, visibility, media),
      });

      if (error) throw error;

      const result = data as Record<string, unknown> | null;
      const next: StoryDraftIdentity = {
        storyId: String(result?.storyId ?? ''),
        postId: String(result?.postId ?? ''),
        mediaId: result?.mediaId ? String(result.mediaId) : null,
      };

      if (!next.storyId || !next.postId) {
        throw new Error('Story qoralama identifikatori qaytmadi');
      }

      setStoryDraft(next);
      draftRef.current = next;
      setShowStickers(true);
    } catch (error) {
      console.error('Story qoralama yaratish xatosi:', error);
      toast({
        title: 'Story qoralamasi yaratilmadi',
        description: error instanceof Error ? error.message : 'Qayta urinib ko‘ring.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingDraft(false);
    }
  }, [
    attachment,
    caption,
    isCreatingDraft,
    storyDraft,
    toast,
    uploadAll,
    visibility,
  ]);

  const activateStory = useCallback(async () => {
    const current = draftRef.current;
    if (!current || isFinalizing) return;

    setIsFinalizing(true);
    try {
      const { error } = await db.rpc('activate_story_draft', {
        p_story_id: current.storyId,
      });
      if (error) throw error;

      // Endi Storage obyektlari live story graphiga tegishli.
      markAttachmentsPublished();
      draftRef.current = null;
      setStoryDraft(null);
      setShowStickers(false);
      clearAttachments();

      toast({
        title: 'Story joylandi',
        description: 'Story 24 soat davomida ko‘rinadi.',
      });
      navigate('/home');
    } catch (error) {
      console.error('Story activate xatosi:', error);
      toast({
        title: 'Story joylanmadi',
        description: error instanceof Error ? error.message : 'Qayta urinib ko‘ring.',
        variant: 'destructive',
      });
    } finally {
      setIsFinalizing(false);
    }
  }, [
    clearAttachments,
    isFinalizing,
    markAttachmentsPublished,
    navigate,
    toast,
  ]);

  const discardDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!current || isDiscarding) return;

    setIsDiscarding(true);
    try {
      const { error } = await db.rpc('discard_story_draft', {
        p_story_id: current.storyId,
      });
      if (error) throw error;

      draftRef.current = null;
      setStoryDraft(null);
      setShowStickers(false);

      // DB graph o'chgach Storage obyektini ham hook orqali tozalaymiz.
      if (attachment) removeAttachment(attachment.id);

      toast({
        title: 'Story qoralamasi bekor qilindi',
      });
    } catch (error) {
      console.error('Story draft discard xatosi:', error);
      toast({
        title: 'Qoralamani bekor qilib bo‘lmadi',
        description: error instanceof Error ? error.message : 'Qayta urinib ko‘ring.',
        variant: 'destructive',
      });
    } finally {
      setIsDiscarding(false);
    }
  }, [attachment, isDiscarding, removeAttachment, toast]);

  const canContinue =
    Boolean(attachment) &&
    (attachment?.kind === 'image' || attachment?.kind === 'video') &&
    !isUploading &&
    !isCreatingDraft;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">
      <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
        <section>
          <div
            className={cn(
              'relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[28px] border bg-black shadow-xl',
              isDragging ? 'border-primary ring-4 ring-primary/15' : 'border-border/70',
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!storyDraft) setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => void handleDrop(event)}
          >
            {attachment?.previewUrl ? (
              attachment.kind === 'video' ? (
                <video
                  src={attachment.previewUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={attachment.previewUrl}
                  alt="Story preview"
                  className="h-full w-full object-contain"
                />
              )
            ) : (
              <button
                type="button"
                disabled={Boolean(storyDraft)}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-neutral-900 to-black px-6 text-center text-white"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                  <ImagePlus className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold">9:16 Story media</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">
                    Rasm yoki videoni tanlang, yoxud desktopda shu yerga tashlang
                  </p>
                </div>
              </button>
            )}

            {isDragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/25 backdrop-blur-sm">
                <div className="rounded-2xl bg-black/70 px-4 py-3 text-center text-sm font-semibold text-white">
                  Story faylini tashlang
                </div>
              </div>
            )}

            {storyDraft && (
              <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                Qoralama · hali live emas
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileInput}
          />

          {attachment && !storyDraft && (
            <div className="mx-auto mt-3 flex max-w-[340px] gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 text-xs font-medium transition hover:bg-muted"
              >
                <ImagePlus className="h-4 w-4" />
                Almashtirish
              </button>
              <button
                type="button"
                onClick={() =>
                  attachment.kind === 'image'
                    ? setImageTargetId(attachment.id)
                    : setVideoTargetId(attachment.id)
                }
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 text-xs font-medium transition hover:bg-muted"
              >
                <Pencil className="h-4 w-4" />
                Tahrirlash
              </button>
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Story Studio</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Media avval qoralama sifatida tayyorlanadi. Interaktiv stikerlar saqlangachgina Story live bo‘ladi.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {VISIBILITIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                disabled={Boolean(storyDraft)}
                onClick={() => setVisibility(id)}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-center transition disabled:cursor-not-allowed disabled:opacity-60',
                  visibility === id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
            <label className="text-xs font-medium text-muted-foreground">
              Caption
            </label>
            <textarea
              value={caption}
              disabled={Boolean(storyDraft)}
              onChange={(event) => setCaption(event.target.value.slice(0, 1000))}
              placeholder="Story haqida qisqa yozuv..."
              rows={4}
              className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-70"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {caption.length}/1000
            </p>
          </div>

          {!storyDraft ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/60 transition hover:border-primary/25 hover:bg-primary/[0.035]"
                >
                  <ImagePlus className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Qurilmadan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/60 transition hover:border-primary/25 hover:bg-primary/[0.035]"
                >
                  <Camera className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Kamera</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!canContinue}
                onClick={() => void createHiddenDraft()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingDraft || isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {isUploading
                  ? 'Media yuklanmoqda...'
                  : isCreatingDraft
                    ? 'Qoralama tayyorlanmoqda...'
                    : 'Davom etish · stikerlar'}
                {!isCreatingDraft && !isUploading && <ChevronRight className="h-4 w-4" />}
              </button>
            </>
          ) : (
            <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.045] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Story qoralamasi xavfsiz tayyor</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Hali hech kimga ko‘rinmaydi. Stikerlarni sozlang yoki stikersiz joylang.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStickers(true)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
              >
                <Sparkles className="h-4 w-4" />
                Interaktiv stikerlar
              </button>

              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => void activateStory()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background text-sm font-medium transition hover:bg-muted disabled:opacity-50"
              >
                {isFinalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Stikersiz joylash
              </button>

              <button
                type="button"
                disabled={isDiscarding || isFinalizing}
                onClick={() => void discardDraft()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {isDiscarding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Qoralamani bekor qilish
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">Hozir real ishlaydi:</strong>{' '}
            camera/device media, private/friends visibility, image render, video edit graph va interaktiv poll/quiz/question/slider/location/mention/hashtag/link/countdown stikerlari.
          </div>
        </section>
      </div>

      {attachment && (
        <AttachmentGrid
          attachments={attachments}
          onRemove={(id) => {
            if (!storyDraft) removeAttachment(id);
          }}
          onRetry={() => undefined}
          onEditImage={(item) => !storyDraft && setImageTargetId(item.id)}
          onEditVideo={(item) => !storyDraft && setVideoTargetId(item.id)}
          className="mt-5 md:hidden"
        />
      )}

      {showCamera && (
        <CameraVideoRecorder
          mode="both"
          aspectRatio="9:16"
          onClose={() => setShowCamera(false)}
          onCapture={(file, _type, sourceUrl) => {
            void replaceMedia(file);
            if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
            setShowCamera(false);
          }}
        />
      )}

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

      {storyDraft && attachment && (
        <StoryStickerComposer
          open={showStickers}
          onOpenChange={setShowStickers}
          postId={storyDraft.postId}
          mediaId={storyDraft.mediaId}
          mediaUrl={attachment.previewUrl}
          mediaKind={attachment.kind === 'video' ? 'video' : 'image'}
          durationSeconds={attachment.durationSeconds}
          onSaved={() => {
            void activateStory();
          }}
        />
      )}
    </div>
  );
}
