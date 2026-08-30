import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ChevronDown,
  ImagePlus,
  Loader2,
  Music2,
  Pencil,
  Send,
  Users,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { usePosts, type PostVisibility } from '@/hooks/usePosts';
import { usePostAttachments } from '@/hooks/usePostAttachments';
import { cn } from '@/lib/utils';
import { parseStorageReference } from '@/lib/mediaUpload';
import type { PostMusicInput } from '@/lib/postMeta';
import { supabase } from '@/integrations/supabase/client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CameraVideoRecorder } from '@/components/create/CameraVideoRecorder';
import { MusicPicker } from '@/components/create/MusicPicker';
import { MentionCollaborator } from '@/components/create/MentionCollaborator';
import { VideoEditor, type VideoEditData } from '@/components/VideoEditor';

interface CollaboratorProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

interface ReelComposerProps {
  onDraftStateChange?: (hasDraft: boolean) => void;
}

const MAX_COLLABORATORS = 10;

const VISIBILITIES: Array<{
  id: PostVisibility;
  label: string;
}> = [
  { id: 'public', label: 'Hamma' },
  { id: 'friends', label: 'Do‘stlar' },
  { id: 'private', label: 'Faqat men' },
];

function draftMusicObject(
  input?: PostMusicInput | null,
): { bucket: string; key: string } | null {
  if (!input?.track || input.trackId || input.track.source !== 'device') return null;

  if (input.track.storageBucket && input.track.storageKey) {
    return {
      bucket: input.track.storageBucket,
      key: input.track.storageKey,
    };
  }

  return parseStorageReference(input.track.audioUrl);
}

async function cleanupDraftMusic(input?: PostMusicInput | null) {
  const object = draftMusicObject(input);
  if (!object) return;

  const { error } = await supabase.storage.from(object.bucket).remove([object.key]);
  if (error) {
    console.warn('Reel draft musiqasini tozalab bo‘lmadi:', error);
  }
}

export function ReelComposer({ onDraftStateChange }: ReelComposerProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { createPost } = usePosts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<PostMusicInput | null>(null);

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [music, setMusic] = useState<PostMusicInput | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [videoTargetId, setVideoTargetId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    attachments,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    replaceAttachmentFile,
    markAttachmentsPublished,
    uploadAll,
  } = usePostAttachments({
    maxFiles: 1,
    uploadKind: 'reel',
    visibility,
  });

  const videoAttachment = attachments[0] ?? null;
  const videoTarget = useMemo(
    () => attachments.find((item) => item.id === videoTargetId) ?? null,
    [attachments, videoTargetId],
  );

  const hasDraft =
    Boolean(videoAttachment) ||
    caption.trim().length > 0 ||
    Boolean(music) ||
    collaborators.length > 0;

  useEffect(() => {
    onDraftStateChange?.(hasDraft);
  }, [hasDraft, onDraftStateChange]);

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
    const currentObject = draftMusicObject(current);
    const nextObject = draftMusicObject(next);
    const sameObject =
      currentObject &&
      nextObject &&
      currentObject.bucket === nextObject.bucket &&
      currentObject.key === nextObject.key;

    if (current && !sameObject) {
      void cleanupDraftMusic(current);
    }

    musicRef.current = next;
    setMusic(next);
  }, []);

  const replaceVideo = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        toast.error('Reel uchun video fayl tanlang');
        return;
      }

      if (videoAttachment) {
        removeAttachment(videoAttachment.id);
      }

      await addFiles([file]);
    },
    [addFiles, removeAttachment, videoAttachment],
  );

  const handleFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await replaceVideo(file);
    },
    [replaceVideo],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) await replaceVideo(file);
    },
    [replaceVideo],
  );

  const handleRenderedVideo = useCallback(
    async (editData: VideoEditData, renderedFile?: File | null) => {
      if (!videoTargetId) return;

      if (!renderedFile) {
        toast.error('Reel tahriri faqat real render bilan qo‘llanadi');
        return;
      }

      const target = attachments.find((item) => item.id === videoTargetId);

      await replaceAttachmentFile(videoTargetId, renderedFile, {
        ...(target?.editState ?? {}),
        video: {
          ...editData,
          rendered: true,
          renderedAt: new Date().toISOString(),
        },
      });

      setVideoTargetId(null);
    },
    [attachments, replaceAttachmentFile, videoTargetId],
  );

  const publishReel = useCallback(async () => {
    if (
      !videoAttachment ||
      videoAttachment.kind !== 'video' ||
      isPosting ||
      isUploading
    ) {
      return;
    }

    setIsPosting(true);
    try {
      const { media, failed } = await uploadAll();

      if (failed.length > 0 || media.length !== 1 || media[0]?.kind !== 'video') {
        toast.error('Reel videosini yuklab bo‘lmadi');
        return;
      }

      const mediaUrls =
        visibility === 'public' ? media.map((item) => item.storageUrl) : [];

      const created = await createPost(
        caption.trim(),
        mediaUrls,
        'video',
        collaborators.map((item) => item.id),
        {
          visibility,
          postKind: 'reel',
          media,
          music,
        },
      );

      if (!created) return;

      markAttachmentsPublished();
      musicRef.current = null;
      clearAttachments();
      setCaption('');
      setMusic(null);
      setCollaborators([]);
      onDraftStateChange?.(false);

      toast.success('Reel joylandi');
      navigate('/home');
    } finally {
      setIsPosting(false);
    }
  }, [
    caption,
    clearAttachments,
    collaborators,
    createPost,
    isPosting,
    isUploading,
    markAttachmentsPublished,
    music,
    navigate,
    onDraftStateChange,
    uploadAll,
    videoAttachment,
    visibility,
  ]);

  const canPublish =
    Boolean(videoAttachment?.kind === 'video') && !isPosting && !isUploading;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-5 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:items-start">
        <section className="lg:sticky lg:top-4">
          <div className="rounded-[32px] border border-border/60 bg-card p-3 shadow-[0_18px_60px_rgba(0,0,0,0.12)] sm:p-4">
            <div
              className={cn(
                'relative mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-[27px] border bg-black',
                isDragging
                  ? 'border-primary ring-4 ring-primary/15'
                  : 'border-white/10',
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => void handleDrop(event)}
            >
              {videoAttachment?.previewUrl ? (
                <video
                  src={videoAttachment.previewUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.2),transparent_40%),linear-gradient(to_bottom,#171717,#030303)] px-8 text-center text-white"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/10 shadow-xl backdrop-blur">
                    <Video className="h-7 w-7" />
                  </span>
                  <p className="text-sm font-semibold">Video qo‘shish</p>
                </button>
              )}

              <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                9:16
              </span>

              {music && (
                <span className="pointer-events-none absolute right-3 top-3 flex max-w-[55%] items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
                  <Music2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {music.track?.title ?? 'Musiqa'}
                  </span>
                </span>
              )}

              {caption.trim() && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-5 pb-6 pt-16">
                  <p className="line-clamp-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-white drop-shadow">
                    {caption}
                  </p>
                </div>
              )}

              {isDragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/25 backdrop-blur-sm">
                  <div className="rounded-2xl border border-white/15 bg-black/65 px-5 py-3 text-sm font-semibold text-white">
                    Reel videosini tashlang
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileInput}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background text-xs font-medium transition hover:border-primary/25 hover:bg-primary/[0.035]"
              >
                <ImagePlus className="h-4 w-4 text-primary" />
                {videoAttachment ? 'Almashtirish' : 'Qurilmadan'}
              </button>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background text-xs font-medium transition hover:border-primary/25 hover:bg-primary/[0.035]"
              >
                <Camera className="h-4 w-4 text-primary" />
                Kamera
              </button>
            </div>

            {videoAttachment && (
              <button
                type="button"
                onClick={() => setVideoTargetId(videoAttachment.id)}
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
                {(profile?.display_name || profile?.username || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {profile?.display_name || profile?.username || 'Foydalanuvchi'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Select
                  value={visibility}
                  onValueChange={(value) =>
                    setVisibility(value as PostVisibility)
                  }
                >
                  <SelectTrigger className="h-8 w-auto min-w-28 gap-1 rounded-full border-border/60 bg-background px-3 text-xs shadow-none">
                    <SelectValue />
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => setShowCollaborators(true)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium transition hover:bg-muted',
                    collaborators.length > 0 &&
                      'border-primary/30 bg-primary/[0.06] text-primary',
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {collaborators.length > 0
                    ? `${collaborators.length} hammuallif`
                    : 'Hammuallif'}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Caption
              </p>
              <span className="text-[10px] text-muted-foreground">
                {caption.length}/2200
              </span>
            </div>
            <textarea
              value={caption}
              onChange={(event) =>
                setCaption(event.target.value.slice(0, 2200))
              }
              placeholder="Reel haqida yozing... #hashtag"
              rows={7}
              className="min-h-44 w-full resize-none bg-transparent px-4 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowMusic(true)}
              className={cn(
                'flex min-h-20 items-center gap-3 rounded-3xl border p-4 text-left transition',
                music
                  ? 'border-primary/25 bg-primary/[0.055]'
                  : 'border-border/60 bg-card hover:border-primary/20',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Music2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">Musiqa</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {music?.track?.title ?? 'Tanlanmagan'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCollaborators(true)}
              className="flex min-h-20 items-center gap-3 rounded-3xl border border-border/60 bg-card p-4 text-left transition hover:border-primary/20"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs font-semibold">
                  Hammualliflar
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {collaborators.length}/{MAX_COLLABORATORS}
                </span>
              </span>
            </button>
          </div>

          {(music || collaborators.length > 0) && (
            <div className="space-y-2 rounded-3xl border border-border/60 bg-card p-3 shadow-sm">
              {music && (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
                  <Music2 className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {music.track?.title ?? 'Musiqa'}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {music.track?.artist ?? 'Katalog'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMusicChange(null)}
                    className="rounded-lg p-1 text-muted-foreground transition hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {collaborators.length > 0 && (
                <div className="flex flex-wrap gap-1.5 rounded-2xl bg-muted/40 p-3">
                  {collaborators.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full bg-background px-2 py-1 text-[10px]"
                    >
                      @{item.username}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!canPublish}
            onClick={() => void publishReel()}
            className="flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPosting || isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isUploading
              ? 'Video yuklanmoqda...'
              : isPosting
                ? 'Reel joylanmoqda...'
                : 'Reel joylash'}
          </button>
        </aside>
      </div>

      {showCamera && (
        <CameraVideoRecorder
          mode="video"
          aspectRatio="9:16"
          onClose={() => setShowCamera(false)}
          onCapture={(file, type, sourceUrl) => {
            if (type === 'video') {
              void replaceVideo(file);
            }
            if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
            setShowCamera(false);
          }}
        />
      )}

      <VideoEditor
        open={Boolean(videoTarget)}
        videoUrl={videoTarget?.previewUrl ?? ''}
        sourceFile={videoTarget?.file ?? null}
        initialEditData={
          (videoTarget?.editState?.video ?? null) as VideoEditData | null
        }
        allowGraphOnly={false}
        onSave={handleRenderedVideo}
        onCancel={() => setVideoTargetId(null)}
      />

      <MusicPicker
        open={showMusic}
        onOpenChange={setShowMusic}
        currentMusic={music}
        onSelectMusic={handleMusicChange}
        visibility={visibility}
      />

      <MentionCollaborator
        open={showCollaborators}
        onOpenChange={setShowCollaborators}
        mode="collaborate"
        maxUsers={MAX_COLLABORATORS}
        selectedUsers={collaborators}
        onSelectUser={(person) =>
          setCollaborators((current) =>
            current.length >= MAX_COLLABORATORS ||
            current.some((item) => item.id === person.id)
              ? current
              : [...current, person],
          )
        }
        onRemoveUser={(userId) =>
          setCollaborators((current) =>
            current.filter((item) => item.id !== userId),
          )
        }
      />
    </div>
  );
}
