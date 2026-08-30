import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Check,
  ChevronDown,
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
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface StoryComposerProps {
  onDraftStateChange?: (hasDraft: boolean) => void;
}

export function StoryComposer({ onDraftStateChange }: StoryComposerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
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

  useEffect(() => {
    onDraftStateChange?.(Boolean(storyDraft));
  }, [onDraftStateChange, storyDraft]);

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
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-5 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <section className="lg:sticky lg:top-4">
          <div className="rounded-[32px] border border-border/60 bg-card p-3 shadow-[0_18px_60px_rgba(0,0,0,0.12)] sm:p-4">
            <div
              className={cn(
                'relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-[26px] border bg-black',
                isDragging ? 'border-primary ring-4 ring-primary/15' : 'border-white/10',
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
                  className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_42%),linear-gradient(to_bottom,#171717,#050505)] px-6 text-center text-white"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/10 shadow-xl backdrop-blur">
                    <ImagePlus className="h-7 w-7" />
                  </span>
                  <p className="text-sm font-semibold">Rasm yoki video</p>
                </button>
              )}

              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                  9:16
                </span>
                {storyDraft && (
                  <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur">
                    Qoralama
                  </span>
                )}
              </div>

              {caption.trim() && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-5 pb-6 pt-14">
                  <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-white drop-shadow">
                    {caption}
                  </p>
                </div>
              )}

              {isDragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/25 backdrop-blur-sm">
                  <div className="rounded-2xl border border-white/15 bg-black/65 px-5 py-3 text-center text-sm font-semibold text-white">
                    Story faylini tashlang
                  </div>
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

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={Boolean(storyDraft)}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background text-xs font-medium transition hover:border-primary/25 hover:bg-primary/[0.035] disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4 text-primary" />
                {attachment ? 'Almashtirish' : 'Qurilmadan'}
              </button>
              <button
                type="button"
                disabled={Boolean(storyDraft)}
                onClick={() => setShowCamera(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background text-xs font-medium transition hover:border-primary/25 hover:bg-primary/[0.035] disabled:opacity-50"
              >
                <Camera className="h-4 w-4 text-primary" />
                Kamera
              </button>
            </div>

            {attachment && !storyDraft && (
              <button
                type="button"
                onClick={() =>
                  attachment.kind === 'image'
                    ? setImageTargetId(attachment.id)
                    : setVideoTargetId(attachment.id)
                }
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-muted/60 text-xs font-medium transition hover:bg-muted"
              >
                <Pencil className="h-4 w-4" />
                Tahrirlash
              </button>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.045] p-4 shadow-sm">
            <Avatar className="h-12 w-12 shrink-0 border-2 border-background shadow-sm ring-1 ring-border/60">
              <AvatarImage src={profile?.avatar_url ?? ''} />
              <AvatarFallback className="font-semibold">
                {(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {profile?.display_name || profile?.username || 'Foydalanuvchi'}
              </p>
              <div className="mt-1.5">
                <Select
                  value={visibility}
                  disabled={Boolean(storyDraft)}
                  onValueChange={(value) => setVisibility(value as PostVisibility)}
                >
                  <SelectTrigger className="h-8 w-auto min-w-32 gap-1 rounded-full border-border/60 bg-background px-3 text-xs shadow-none">
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
              </div>
            </div>

            <span className="hidden rounded-full border border-border/60 bg-background px-3 py-1.5 text-[10px] text-muted-foreground sm:block">
              24 soat
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Matn
              </p>
              <span className="text-[10px] text-muted-foreground">{caption.length}/1000</span>
            </div>
            <textarea
              value={caption}
              disabled={Boolean(storyDraft)}
              onChange={(event) => setCaption(event.target.value.slice(0, 1000))}
              placeholder="Story haqida qisqa yozuv..."
              rows={6}
              className="min-h-36 w-full resize-none bg-transparent px-4 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-70"
            />
          </div>

          {!storyDraft ? (
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Davom etish
                  </p>
                </div>
              </div>
              <div className="space-y-3 p-4">
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
                      : 'Davom etish'}
                  {!isCreatingDraft && !isUploading && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-3xl border border-primary/25 bg-primary/[0.045] p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Tayyor</p>

                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStickers(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                Stikerlar
              </button>

              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => void activateStory()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background text-sm font-medium transition hover:bg-muted disabled:opacity-50"
              >
                {isFinalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Joylash
              </button>

              <button
                type="button"
                disabled={isDiscarding || isFinalizing}
                onClick={() => void discardDraft()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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


        </aside>
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
          className="mt-5 lg:hidden"
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
        sourceFile={videoTarget?.file ?? null}
        initialEditData={(videoTarget?.editState?.video ?? null) as VideoEditData | null}
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
