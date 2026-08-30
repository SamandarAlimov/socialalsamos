import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileAudio,
  Loader2,
  Music2,
  Pause,
  Play,
  Search,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useMusicCatalog, type MusicCatalogTrack } from '@/hooks/useMusicCatalog';
import { MAX_FILE_SIZE, formatBytes } from '@/lib/postComposer';
import {
  parseStorageReference,
  resolveStorageUrl,
  uploadMedia,
} from '@/lib/mediaUpload';
import type { PostMusicInput } from '@/lib/postMeta';
import type { PostVisibility } from '@/hooks/usePosts';

interface MusicPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMusic?: PostMusicInput | null;
  onSelectMusic: (music: PostMusicInput | null) => void;
  visibility: PostVisibility;
}

interface SelectedTrack {
  key: string;
  trackId?: string;
  title: string;
  artist: string | null;
  duration: number | null;
  audioUrl: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  source: NonNullable<NonNullable<PostMusicInput['track']>['source']>;
  externalId?: string | null;
  license?: string | null;
  attribution?: string | null;
  coverUrl?: string | null;
  ownerId?: string | null;
  isPublic?: boolean;
  previewUrl?: string | null;
}

function formatTime(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds ?? NaN)) return '—';
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);

    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    audio.addEventListener(
      'loadedmetadata',
      () => done(Number.isFinite(audio.duration) ? audio.duration : null),
      { once: true },
    );
    audio.addEventListener('error', () => done(null), { once: true });
  });
}

function fromCatalog(track: MusicCatalogTrack): SelectedTrack {
  return {
    key: track.id,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    duration: track.duration_seconds,
    audioUrl: track.audio_url,
    storageBucket: track.storage_bucket,
    storageKey: track.storage_key,
    source: track.source,
    externalId: track.external_id,
    license: track.license,
    attribution: track.attribution,
    coverUrl: track.cover_url,
    ownerId: track.owner_id,
    isPublic: track.is_public,
  };
}

function fromCurrent(input?: PostMusicInput | null): SelectedTrack | null {
  if (!input) return null;
  const track = input.track;
  if (!track && !input.trackId) return null;
  const parsed = parseStorageReference(track?.audioUrl);

  return {
    key: input.trackId ?? `draft:${track?.audioUrl ?? 'music'}`,
    trackId: input.trackId ?? undefined,
    title: track?.title ?? 'Tanlangan musiqa',
    artist: track?.artist ?? null,
    duration: track?.durationSeconds ?? null,
    audioUrl: track?.audioUrl ?? '',
    storageBucket: track?.storageBucket ?? parsed?.bucket ?? null,
    storageKey: track?.storageKey ?? parsed?.key ?? null,
    source: track?.source ?? 'platform',
    externalId: track?.externalId ?? null,
    license: track?.license ?? null,
    attribution: track?.attribution ?? null,
    coverUrl: track?.coverUrl ?? null,
    ownerId: track?.ownerId ?? null,
    isPublic: track?.isPublic ?? true,
  };
}

export function MusicPicker({
  open,
  onOpenChange,
  currentMusic,
  onSelectMusic,
  visibility,
}: MusicPickerProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog');
  const [selected, setSelected] = useState<SelectedTrack | null>(() => fromCurrent(currentMusic));
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [startSeconds, setStartSeconds] = useState(currentMusic?.startSeconds ?? 0);
  const [clipSeconds, setClipSeconds] = useState(() => {
    const start = currentMusic?.startSeconds ?? 0;
    const end = currentMusic?.endSeconds ?? null;
    return end != null ? Math.max(1, end - start) : 30;
  });
  const [volume, setVolume] = useState(Math.round((currentMusic?.volume ?? 1) * 100));
  const [mutedOriginal, setMutedOriginal] = useState(Boolean(currentMusic?.mutedOriginal));

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transientUploadRef = useRef<{ bucket: string; key: string } | null>(null);
  const { tracks, isLoading, error, refresh } = useMusicCatalog(query, open);

  useEffect(() => {
    if (!open) return;
    setSelected(fromCurrent(currentMusic));
    setStartSeconds(currentMusic?.startSeconds ?? 0);
    const start = currentMusic?.startSeconds ?? 0;
    const end = currentMusic?.endSeconds ?? null;
    setClipSeconds(end != null ? Math.max(1, end - start) : 30);
    setVolume(Math.round((currentMusic?.volume ?? 1) * 100));
    setMutedOriginal(Boolean(currentMusic?.mutedOriginal));
  }, [open, currentMusic]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
  }, [volume]);

  const visibleTracks = useMemo(() => {
    if (tab === 'mine') return tracks.filter((track) => track.owner_id === user?.id);
    return tracks.filter((track) => track.is_public);
  }, [tab, tracks, user?.id]);

  const maxStart = Math.max(0, (selected?.duration ?? 30) - 1);
  const maxClip = Math.max(1, (selected?.duration ?? 30) - startSeconds);
  const effectiveClip = Math.min(clipSeconds, maxClip);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  const togglePlay = useCallback(
    async (track: SelectedTrack) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (playingKey === track.key) {
        stopPreview();
        return;
      }

      try {
        const url =
          track.previewUrl ||
          (track.audioUrl
            ? await resolveStorageUrl(
                track.audioUrl,
                track.storageBucket ?? null,
                track.storageKey ?? null,
              )
            : '');

        if (!url) throw new Error('Audio manzili topilmadi');

        audio.src = url;
        audio.currentTime = Math.min(startSeconds, Math.max(0, (track.duration ?? startSeconds) - 0.1));
        audio.volume = volume / 100;
        await audio.play();
        setPlayingKey(track.key);
      } catch (playError) {
        console.error('Musiqa preview xatosi:', playError);
        toast.error('Musiqani ijro qilib bo‘lmadi');
      }
    },
    [playingKey, startSeconds, stopPreview, volume],
  );

  const cleanupTransientUpload = useCallback(async () => {
    const transient = transientUploadRef.current;
    if (!transient) return;
    transientUploadRef.current = null;

    const { error } = await import('@/integrations/supabase/client').then(({ supabase }) =>
      supabase.storage.from(transient.bucket).remove([transient.key]),
    );
    if (error) console.warn('Bekor qilingan device music faylini tozalab bo‘lmadi:', error);
  }, []);

  const handleDeviceFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      if (!file.type.startsWith('audio/')) {
        toast.error('Faqat audio fayl tanlang');
        return;
      }

      if (file.size > MAX_FILE_SIZE.audio) {
        toast.error(`Audio hajmi ${formatBytes(MAX_FILE_SIZE.audio)} dan oshmasligi kerak`);
        return;
      }

      if (!user) {
        toast.error('Avval tizimga kiring');
        return;
      }

      setUploading(true);
      try {
        const duration = await getAudioDuration(file);
        await cleanupTransientUpload();

        // Device trek har doim private saqlanadi. Post public bo'lsa ham
        // playback faqat post_music -> can_view_post orqali signed URL oladi.
        const uploaded = await uploadMedia(file, {
          type: 'music',
          visibility: 'private',
        });
        transientUploadRef.current = { bucket: uploaded.bucket, key: uploaded.key };

        const track: SelectedTrack = {
          key: `device:${uploaded.bucket}:${uploaded.key}`,
          title: file.name.replace(/\.[^/.]+$/, '') || 'Mening musiqam',
          artist: 'Mening musiqam',
          duration,
          audioUrl: uploaded.storageUrl,
          storageBucket: uploaded.bucket,
          storageKey: uploaded.key,
          source: 'device',
          ownerId: user.id,
          isPublic: false,
          previewUrl: uploaded.url,
        };

        setSelected(track);
        setStartSeconds(0);
        setClipSeconds(Math.min(30, duration ?? 30));
        setTab('mine');
        toast.success('Musiqa tayyor');
      } catch (uploadError) {
        console.error('Device music upload xatosi:', uploadError);
        toast.error('Musiqani yuklab bo‘lmadi');
      } finally {
        setUploading(false);
      }
    },
    [cleanupTransientUpload, user],
  );

  const apply = useCallback(() => {
    if (!selected) {
      onSelectMusic(null);
      onOpenChange(false);
      return;
    }

    const trackSnapshot: NonNullable<PostMusicInput['track']> = {
      title: selected.title,
      artist: selected.artist,
      audioUrl: selected.audioUrl,
      storageBucket: selected.storageBucket ?? null,
      storageKey: selected.storageKey ?? null,
      coverUrl: selected.coverUrl ?? null,
      durationSeconds: selected.duration,
      source: selected.source,
      externalId: selected.externalId ?? null,
      license: selected.license ?? null,
      attribution: selected.attribution ?? null,
      ownerId: selected.ownerId ?? null,
      isPublic: selected.isPublic ?? false,
    };

    onSelectMusic({
      trackId: selected.trackId ?? null,
      track: trackSnapshot,
      startSeconds,
      endSeconds: startSeconds + effectiveClip,
      volume: volume / 100,
      mutedOriginal,
    });

    transientUploadRef.current = null;
    stopPreview();
    onOpenChange(false);
  }, [
    effectiveClip,
    mutedOriginal,
    onOpenChange,
    onSelectMusic,
    selected,
    startSeconds,
    stopPreview,
    volume,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          stopPreview();
          void cleanupTransientUpload();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-xl flex-col overflow-hidden p-0">
        <audio ref={audioRef} onEnded={() => setPlayingKey(null)} />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.opus"
          className="hidden"
          onChange={handleDeviceFile}
        />

        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            Musiqa
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Yuklanmoqda...' : 'Qurilmadan audio tanlash'}
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Trek yoki ijrochini qidiring..."
              className="pl-9"
            />
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as 'catalog' | 'mine')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="catalog">Katalog</TabsTrigger>
              <TabsTrigger value="mine">Mening musiqam</TabsTrigger>
            </TabsList>
          </Tabs>

          {selected && (
            <div className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void togglePlay(selected)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  {playingKey === selected.key ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.artist || 'Noma’lum ijrochi'} · {formatTime(selected.duration)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Musiqani olib tashlash"
                  onClick={() => {
                    stopPreview();
                    void cleanupTransientUpload();
                    setSelected(null);
                  }}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Boshlanish: {formatTime(startSeconds)}</span>
                  <span>Klip: {formatTime(effectiveClip)}</span>
                </div>
                <Slider
                  value={[Math.min(startSeconds, maxStart)]}
                  min={0}
                  max={Math.max(1, maxStart)}
                  step={0.5}
                  onValueChange={([value]) => {
                    setStartSeconds(value);
                    if (audioRef.current && playingKey === selected.key) {
                      audioRef.current.currentTime = value;
                    }
                  }}
                />
                <Slider
                  value={[Math.min(effectiveClip, maxClip)]}
                  min={1}
                  max={Math.max(1, maxClip)}
                  step={1}
                  onValueChange={([value]) => setClipSeconds(value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Slider
                  value={[volume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([value]) => setVolume(value)}
                  className="flex-1"
                />
                <span className="w-10 text-right text-xs text-muted-foreground">{volume}%</span>
              </div>

              <button
                type="button"
                onClick={() => setMutedOriginal((value) => !value)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2 text-xs font-medium transition',
                  mutedOriginal
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground',
                )}
              >
                {mutedOriginal ? 'Asl audio o‘chiriladi' : 'Asl audio saqlanadi'}
              </button>
            </div>
          )}

          <ScrollArea className="h-[280px] rounded-xl border border-border/50">
            <div className="space-y-1 p-2">
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                  <span>{error}</span>
                  <Button size="sm" variant="outline" onClick={() => void refresh()}>
                    Qayta urinish
                  </Button>
                </div>
              ) : visibleTracks.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
                  <FileAudio className="h-6 w-6" />
                  <p className="text-sm">
                    {tab === 'mine'
                      ? 'Shaxsiy trek topilmadi. Qurilmadan audio qo‘shishingiz mumkin.'
                      : 'Katalogda mos trek topilmadi.'}
                  </p>
                </div>
              ) : (
                visibleTracks.map((track) => {
                  const item = fromCatalog(track);
                  const active = selected?.trackId === track.id;
                  return (
                    <div
                      key={track.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl p-2.5 transition',
                        active ? 'bg-primary/10' : 'hover:bg-muted/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void togglePlay(item)}
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                          playingKey === item.key
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground',
                        )}
                      >
                        {playingKey === item.key ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="ml-0.5 h-4 w-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          stopPreview();
                          void cleanupTransientUpload();
                          setSelected(item);
                          setStartSeconds(0);
                          setClipSeconds(Math.min(30, item.duration ?? 30));
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium">{track.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {track.artist || 'Noma’lum'} · {formatTime(track.duration_seconds)}
                          {track.license ? ` · ${track.license}` : ''}
                        </p>
                      </button>

                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={() => {
              onSelectMusic(null);
              stopPreview();
              void cleanupTransientUpload();
              onOpenChange(false);
            }}
          >
            Musiqasiz
          </Button>
          <Button type="button" className="flex-1" disabled={!selected} onClick={apply}>
            <Check className="mr-2 h-4 w-4" />
            Qo‘llash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
