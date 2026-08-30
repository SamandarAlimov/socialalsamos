import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Music2,
  Pencil,
  Plus,
  Send,
  Trash2,
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
import { Slider } from '@/components/ui/slider';
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
import { MAX_REEL_CLIPS } from '@/lib/reelTimeline';
import {
  canRenderReelSequence,
  renderReelSequence,
} from '@/lib/reelRender';
import { captureVideoPoster } from '@/lib/mediaMetadata';

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

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

const REEL_SPEEDS = [0.5, 1, 1.5, 2] as const;

function clipPlaybackRate(
  item: { editState?: Record<string, unknown> } | null | undefined,
): number {
  const reelClip = (item?.editState?.reelClip ?? {}) as Record<string, unknown>;
  const speed = Number(reelClip.speed);
  return REEL_SPEEDS.includes(speed as (typeof REEL_SPEEDS)[number])
    ? speed
    : 1;
}

function clipTransition(
  item: { editState?: Record<string, unknown> } | null | undefined,
): 'none' | 'fade' {
  const reelClip = (item?.editState?.reelClip ?? {}) as Record<string, unknown>;
  return reelClip.transition === 'fade' ? 'fade' : 'none';
}

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
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [combineProgress, setCombineProgress] = useState(0);
  const [coverSecond, setCoverSecond] = useState(0);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    attachments,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
    reorderAttachments,
    replaceAttachmentFile,
    replaceAllWithRenderedFile,
    setEditState,
    markAttachmentsPublished,
    uploadAll,
  } = usePostAttachments({
    maxFiles: MAX_REEL_CLIPS,
    uploadKind: 'reel',
    visibility,
  });

  const activeClip = useMemo(
    () =>
      attachments.find((item) => item.id === selectedClipId) ??
      attachments[0] ??
      null,
    [attachments, selectedClipId],
  );
  const activeClipIndex = useMemo(
    () => attachments.findIndex((item) => item.id === activeClip?.id),
    [activeClip?.id, attachments],
  );
  const videoTarget = useMemo(
    () => attachments.find((item) => item.id === videoTargetId) ?? null,
    [attachments, videoTargetId],
  );

  const totalDuration = useMemo(
    () =>
      attachments.reduce((sum, item) => {
        const sourceDuration = Math.max(0, item.durationSeconds ?? 0);
        return sum + sourceDuration / clipPlaybackRate(item);
      }, 0),
    [attachments],
  );

  const activeSpeed = clipPlaybackRate(activeClip);

  useEffect(() => {
    if (totalDuration <= 0) {
      setCoverSecond(0);
      return;
    }
    setCoverSecond((current) =>
      Math.max(0, Math.min(current, Math.max(0, totalDuration - 0.05))),
    );
  }, [totalDuration]);

  useEffect(() => {
    if (attachments.length === 0 || totalDuration <= 0) {
      setCoverPreviewUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const timer = window.setTimeout(() => {
      void (async () => {
        let remaining = coverSecond;
        let target = attachments[attachments.length - 1];
        let localSecond = Math.max(0, target.durationSeconds ?? 0) * 0.5;

        for (const clip of attachments) {
          const sourceDuration = Math.max(0, clip.durationSeconds ?? 0);
          const speed = clipPlaybackRate(clip);
          const outputDuration = sourceDuration / speed;

          if (
            remaining <= outputDuration ||
            clip === attachments[attachments.length - 1]
          ) {
            target = clip;
            localSecond = Math.max(
              0,
              Math.min(
                Math.max(0, sourceDuration - 0.05),
                remaining * speed,
              ),
            );
            break;
          }
          remaining -= outputDuration;
        }

        if (!target.previewUrl) return;
        const blob = await captureVideoPoster(target.previewUrl, localSecond);
        if (!blob || cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setCoverPreviewUrl(objectUrl);
      })();
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachments, coverSecond, totalDuration]);

  useEffect(() => {
    if (attachments.length === 0) {
      setSelectedClipId(null);
      return;
    }
    if (!attachments.some((item) => item.id === selectedClipId)) {
      setSelectedClipId(attachments[0].id);
    }
  }, [attachments, selectedClipId]);

  const hasDraft =
    attachments.length > 0 ||
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

  const addVideoFiles = useCallback(
    async (files: File[]) => {
      const videos = files.filter((file) => file.type.startsWith('video/'));
      if (videos.length === 0) {
        toast.error('Video fayl tanlang');
        return;
      }

      const created = await addFiles(videos);
      const last = created[created.length - 1];
      if (last) setSelectedClipId(last.id);
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length > 0) await addVideoFiles(files);
    },
    [addVideoFiles],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) await addVideoFiles(files);
    },
    [addVideoFiles],
  );

  const removeClip = useCallback(
    (id: string) => {
      const index = attachments.findIndex((item) => item.id === id);
      const fallback =
        attachments[index + 1]?.id ??
        attachments[index - 1]?.id ??
        null;
      removeAttachment(id);
      setSelectedClipId((current) => (current === id ? fallback : current));
    },
    [attachments, removeAttachment],
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
      attachments.length === 0 ||
      isPosting ||
      isUploading ||
      isCombining
    ) {
      return;
    }

    setIsPosting(true);
    try {
      const needsSequenceRender =
        attachments.length > 1 ||
        attachments.some(
          (item) =>
            clipPlaybackRate(item) !== 1 ||
            clipTransition(item) !== 'none',
        );

      if (needsSequenceRender) {
        if (!canRenderReelSequence()) {
          toast.error('Bu brauzerda multi-clip render mavjud emas');
          return;
        }

        setIsCombining(true);
        setCombineProgress(0);

        const sourceClipCount = attachments.length;
        const rendered = await renderReelSequence(
          attachments.map((item) => ({
            file: item.file,
            durationSeconds: item.durationSeconds,
            playbackRate: clipPlaybackRate(item),
            transition: clipTransition(item),
          })),
          {
            width: 720,
            height: 1280,
            frameRate: 30,
            onProgress: setCombineProgress,
          },
        );

        const collapsed = await replaceAllWithRenderedFile(rendered, {
          reelTimeline: {
            rendered: true,
            clipCount: sourceClipCount,
            renderedAt: new Date().toISOString(),
          },
          reelCover: {
            second: coverSecond,
          },
          reelSpeed: {
            rendered: true,
          },
        });

        if (!collapsed) {
          toast.error('Reel videosini tayyorlab bo‘lmadi');
          return;
        }
        setSelectedClipId(collapsed.id);
        setIsCombining(false);
      }

      if (attachments.length === 1) {
        const only = attachments[0];
        setEditState(only.id, {
          ...(only.editState ?? {}),
          reelCover: {
            second: coverSecond,
          },
        });
      }

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
      setIsCombining(false);
      setIsPosting(false);
    }
  }, [
    attachments,
    caption,
    clearAttachments,
    collaborators,
    coverSecond,
    createPost,
    isCombining,
    isPosting,
    isUploading,
    markAttachmentsPublished,
    music,
    navigate,
    onDraftStateChange,
    replaceAllWithRenderedFile,
    setEditState,
    uploadAll,
    visibility,
  ]);

  const canPublish =
    attachments.length > 0 && !isPosting && !isUploading && !isCombining;

  return (
    <div className="mx-auto w-full max-w-3xl px-0 pb-8 sm:px-4 sm:pt-4 lg:max-w-6xl">
      <section className="overflow-hidden border-y border-border/60 bg-background sm:rounded-2xl sm:border lg:grid lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[minmax(320px,460px)_minmax(340px,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 lg:col-start-2 lg:row-start-1">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? ''} />
            <AvatarFallback className="font-semibold">
              {(profile?.display_name || profile?.username || 'U')
                .charAt(0)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {profile?.display_name || profile?.username || 'Foydalanuvchi'}
          </p>

          <Select
            value={visibility}
            onValueChange={(value) => setVisibility(value as PostVisibility)}
          >
            <SelectTrigger className="h-8 w-auto min-w-0 gap-1 rounded-full border-0 bg-muted/55 px-2.5 text-[11px] font-medium shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border/50 p-3 sm:p-4 lg:col-start-1 lg:row-start-1 lg:row-span-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <div
            className={cn(
              'relative mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-xl bg-black lg:max-h-[55vh] lg:w-auto',
              isDragging && 'ring-2 ring-primary',
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
            {activeClip?.previewUrl ? (
              <video
                src={activeClip.previewUrl}
                muted
                loop
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/80 transition hover:text-white"
              >
                <Video className="h-8 w-8" />
                <span className="text-sm font-medium">Video qo‘shish</span>
              </button>
            )}

            {music && (
              <span className="pointer-events-none absolute right-3 top-3 flex max-w-[65%] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
                <Music2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{music.track?.title ?? 'Musiqa'}</span>
              </span>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="mx-auto mt-3 max-w-[520px]">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {attachments.map((clip, index) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => setSelectedClipId(clip.id)}
                    className={cn(
                      'relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border-2 bg-black transition',
                      clip.id === activeClip?.id
                        ? 'border-primary'
                        : 'border-transparent opacity-65 hover:opacity-100',
                    )}
                  >
                    {clip.previewUrl ? (
                      <video
                        src={clip.previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Video className="absolute inset-0 m-auto h-4 w-4 text-white/60" />
                    )}
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[8px] text-white">
                      {index + 1}
                    </span>
                  </button>
                ))}

                {attachments.length < MAX_REEL_CLIPS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                    aria-label="Klip qo‘shish"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {activeClip && (
                <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-2">
                  <button
                    type="button"
                    onClick={() => setVideoTargetId(activeClip.id)}
                    title="Tahrirlash"
                    className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Tahrirlash
                  </button>

                  <button
                    type="button"
                    disabled={activeClipIndex <= 0}
                    onClick={() =>
                      reorderAttachments(activeClipIndex, activeClipIndex - 1)
                    }
                    title="Oldinga"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-25"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={
                      activeClipIndex < 0 ||
                      activeClipIndex >= attachments.length - 1
                    }
                    onClick={() =>
                      reorderAttachments(activeClipIndex, activeClipIndex + 1)
                    }
                    title="Keyinga"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-25"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeClip(activeClip.id)}
                    title="O‘chirish"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <div className="mx-1 h-5 w-px bg-border" />

                  {REEL_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() =>
                        setEditState(activeClip.id, {
                          ...(activeClip.editState ?? {}),
                          reelClip: {
                            ...((activeClip.editState?.reelClip ?? {}) as Record<string, unknown>),
                            speed,
                          },
                        })
                      }
                      className={cn(
                        'h-8 rounded-full px-2.5 text-[10px] font-semibold transition',
                        activeSpeed === speed
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {speed}×
                    </button>
                  ))}

                  {activeClipIndex < attachments.length - 1 && (
                    <>
                      <div className="mx-1 h-5 w-px bg-border" />
                      {[
                        ['none', 'Oddiy'],
                        ['fade', 'Fade'],
                      ].map(([transition, label]) => (
                        <button
                          key={transition}
                          type="button"
                          onClick={() =>
                            setEditState(activeClip.id, {
                              ...(activeClip.editState ?? {}),
                              reelClip: {
                                ...((activeClip.editState?.reelClip ?? {}) as Record<string, unknown>),
                                transition,
                              },
                            })
                          }
                          className={cn(
                            'h-8 rounded-full px-2.5 text-[10px] font-semibold transition',
                            clipTransition(activeClip) === transition
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-4 py-3 sm:px-5 lg:col-start-2 lg:row-start-2">
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value.slice(0, 2200))}
            placeholder="Izoh qo‘shish..."
            rows={4}
            className="min-h-24 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="border-t border-border/50 lg:col-start-2 lg:row-start-3 lg:min-h-0 lg:overflow-y-auto">
          {attachments.length > 0 && totalDuration > 0 && (
            <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {coverPreviewUrl ? (
                  <img src={coverPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className="w-14 shrink-0 text-xs font-medium">Muqova</span>
              <Slider
                value={[coverSecond]}
                min={0}
                max={Math.max(0.1, totalDuration - 0.05)}
                step={0.1}
                onValueChange={([value]) => setCoverSecond(value ?? 0)}
                className="min-w-0 flex-1"
              />
              <span className="w-9 text-right text-[10px] text-muted-foreground">
                {formatSeconds(coverSecond)}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMusic(true)}
            className="flex min-h-14 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left first:border-t-0 sm:px-5"
          >
            <Music2 className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm">Musiqa</span>
            <span className="max-w-[45%] truncate text-xs text-muted-foreground">
              {music?.track?.title ?? 'Qo‘shish'}
            </span>
            <ChevronDown className="-rotate-90 h-4 w-4 text-muted-foreground" />
          </button>

          {music && (
            <div className="space-y-3 border-t border-border/40 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">Ovoz</span>
                <Slider
                  value={[Math.round((music.volume ?? 1) * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([value]) =>
                    handleMusicChange({
                      ...music,
                      volume: (value ?? 100) / 100,
                    })
                  }
                  className="flex-1"
                />
                <span className="w-9 text-right text-[10px] text-muted-foreground">
                  {Math.round((music.volume ?? 1) * 100)}%
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleMusicChange({
                    ...music,
                    mutedOriginal: !music.mutedOriginal,
                  })
                }
                className="flex w-full items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">Asl audio</span>
                <span className="font-medium">
                  {music.mutedOriginal ? 'O‘chiq' : 'Yoniq'}
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCollaborators(true)}
            className="flex min-h-14 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left sm:px-5"
          >
            <Users className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm">Hammualliflar</span>
            <span className="max-w-[45%] truncate text-xs text-muted-foreground">
              {collaborators.length > 0
                ? collaborators.map((item) => '@' + item.username).join(', ')
                : 'Qo‘shish'}
            </span>
            <ChevronDown className="-rotate-90 h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-t border-border/60 px-3 py-2 sm:px-4 lg:col-start-2 lg:row-start-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Klip qo‘shish"
            aria-label="Klip qo‘shish"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={() => setShowCamera(true)}
            title="Kamera"
            aria-label="Kamera"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Camera className="h-[18px] w-[18px]" />
          </button>

          <div className="flex-1" />

          <button
            type="button"
            disabled={!canPublish}
            onClick={() => void publishReel()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPosting || isUploading || isCombining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isCombining
              ? `${Math.round(combineProgress * 100)}%`
              : 'Joylash'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </section>

      {showCamera && (
        <CameraVideoRecorder
          mode="video"
          aspectRatio="9:16"
          onClose={() => setShowCamera(false)}
          onCapture={(file, type, sourceUrl) => {
            if (type === 'video') {
              void addVideoFiles([file]);
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
