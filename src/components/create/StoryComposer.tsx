import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Check,
  ChevronDown,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  Pencil,
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
    <div className="mx-auto w-full max-w-3xl px-0 pb-8 sm:px-4 sm:pt-4 lg:max-w-6xl">
      <section className="overflow-hidden border-y border-border/60 bg-background sm:rounded-2xl sm:border lg:grid lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[minmax(320px,440px)_minmax(320px,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 lg:col-start-2 lg:row-start-1">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? ''} />
            <AvatarFallback className="font-semibold">
              {(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {profile?.display_name || profile?.username || 'Foydalanuvchi'}
          </p>

          <Select
            value={visibility}
            disabled={Boolean(storyDraft)}
            onValueChange={(value) => setVisibility(value as PostVisibility)}
          >
            <SelectTrigger className="h-8 w-auto min-w-0 gap-1 rounded-full border-0 bg-muted/55 px-2.5 text-[11px] font-medium shadow-none focus:ring-0">
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
        </div>

        <div className="border-t border-border/50 p-3 sm:p-4 lg:col-start-1 lg:row-start-1 lg:row-span-3 lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:border-r lg:border-t-0">
          <div
            className={cn(
              'relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-xl bg-black lg:h-full lg:max-h-[calc(100dvh-9rem)] lg:w-auto lg:max-w-full',
              isDragging && 'ring-2 ring-primary',
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
                  alt=""
                  className="h-full w-full object-contain"
                />
              )
            ) : (
              <button
                type="button"
                disabled={Boolean(storyDraft)}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/80 transition hover:text-white"
              >
                <ImagePlus className="h-8 w-8" />
                <span className="text-sm font-medium">Rasm yoki video</span>
              </button>
            )}

            {caption.trim() && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pb-6 pt-16">
                <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-white">
                  {caption}
                </p>
              </div>
            )}

            {storyDraft && (
              <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
                Qoralama
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-border/50 px-4 py-3 sm:px-5 lg:col-start-2 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
          <textarea
            value={caption}
            disabled={Boolean(storyDraft)}
            onChange={(event) => setCaption(event.target.value.slice(0, 1000))}
            placeholder="Izoh qo‘shish..."
            rows={3}
            className="min-h-20 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-1 border-t border-border/50 px-3 py-2 sm:px-4 lg:col-start-2 lg:row-start-3">
          {!storyDraft ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  title="Qurilmadan"
                  aria-label="Qurilmadan"
                  disabled={Boolean(storyDraft)}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ImagePlus className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  title="Kamera"
                  aria-label="Kamera"
                  disabled={Boolean(storyDraft)}
                  onClick={() => setShowCamera(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <Camera className="h-[18px] w-[18px]" />
                </button>
                {attachment && (
                  <button
                    type="button"
                    title="Tahrirlash"
                    aria-label="Tahrirlash"
                    onClick={() =>
                      attachment.kind === 'image'
                        ? setImageTargetId(attachment.id)
                        : setVideoTargetId(attachment.id)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={!canContinue}
                onClick={() => void createHiddenDraft()}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isCreatingDraft || isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Davom etish
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowStickers(true)}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-primary transition hover:bg-primary/10"
              >
                <Sparkles className="h-4 w-4" />
                Stikerlar
              </button>

              <button
                type="button"
                disabled={isDiscarding || isFinalizing}
                onClick={() => void discardDraft()}
                title="Bekor qilish"
                aria-label="Bekor qilish"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-35"
              >
                {isDiscarding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>

              <div className="flex-1" />

              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => void activateStory()}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-45"
              >
                {isFinalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Joylash
              </button>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </section>

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
