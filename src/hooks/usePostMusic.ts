import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import {
  isMissingStructuredPostSchemaError,
  readStructuredPostSchemaCapability,
  writeStructuredPostSchemaCapability,
} from '@/lib/structuredPostSchema';

export interface PostMusicTrack {
  id: string;
  title: string;
  artist: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number | null;
  source: string;
  license: string | null;
  attribution: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
}

export interface PostMusicItem {
  id: string;
  post_id: string;
  track_id: string | null;
  start_seconds: number;
  end_seconds: number | null;
  volume: number;
  muted_original: boolean;
  track: PostMusicTrack | null;
  playback_url: string | null;
}

export function usePostMusic(postId: string | null, enabled = true) {
  const schemaEnabled = enabled && readStructuredPostSchemaCapability() !== 'missing';
  const [music, setMusic] = useState<PostMusicItem | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(postId) && schemaEnabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!postId || !schemaEnabled) {
      setMusic(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: link, error: linkError } = await db
        .from('post_music')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle();

      if (linkError) throw linkError;
      writeStructuredPostSchemaCapability('available');
      if (!link?.track_id) {
        setMusic(null);
        return;
      }

      const { data: track, error: trackError } = await db
        .from('music_tracks')
        .select('id,title,artist,audio_url,cover_url,duration_seconds,source,license,attribution,storage_bucket,storage_key')
        .eq('id', link.track_id)
        .maybeSingle();

      if (trackError) throw trackError;
      if (!track) {
        setMusic(null);
        return;
      }

      const playbackUrl = await resolveStorageUrl(
        String(track.audio_url),
        track.storage_bucket ? String(track.storage_bucket) : null,
        track.storage_key ? String(track.storage_key) : null,
      );

      setMusic({
        id: String(link.id),
        post_id: String(link.post_id),
        track_id: link.track_id ? String(link.track_id) : null,
        start_seconds: Number(link.start_seconds ?? 0),
        end_seconds: link.end_seconds == null ? null : Number(link.end_seconds),
        volume: Number(link.volume ?? 1),
        muted_original: Boolean(link.muted_original),
        track: {
          id: String(track.id),
          title: String(track.title ?? 'Musiqa'),
          artist: track.artist ? String(track.artist) : null,
          audio_url: String(track.audio_url),
          cover_url: track.cover_url ? String(track.cover_url) : null,
          duration_seconds: track.duration_seconds == null ? null : Number(track.duration_seconds),
          source: String(track.source ?? 'platform'),
          license: track.license ? String(track.license) : null,
          attribution: track.attribution ? String(track.attribution) : null,
          storage_bucket: track.storage_bucket ? String(track.storage_bucket) : null,
          storage_key: track.storage_key ? String(track.storage_key) : null,
        },
        playback_url: playbackUrl,
      });
    } catch (loadError) {
      if (isMissingStructuredPostSchemaError(loadError)) {
        writeStructuredPostSchemaCapability('missing');
      } else {
        console.error('Post musiqasini yuklashda xatolik:', loadError);
        setError('Musiqani yuklab bo‘lmadi');
      }
      setMusic(null);
    } finally {
      setIsLoading(false);
    }
  }, [schemaEnabled, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { music, isLoading, error, refresh: load };
}
