import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import {
  isMissingStructuredPostSchemaError,
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

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Post musiqasini o'qish.
 *
 * Ilgari bu hook `readStructuredPostSchemaCapability() === 'missing'` bo'lsa
 * so'rovni umuman yubormasdi. Sessiya davomida bitta boshqa so'rov shu bayroqni
 * 'missing' ga o'rnatsa, musiqasi bor postlarda ham karta hech qachon
 * chiqmasdi. Endi so'rov har doim bajariladi va faqat haqiqiy "jadval yo'q"
 * xatosida jimgina to'xtaydi.
 */
export function usePostMusic(postId: string | null, enabled = true) {
  const [music, setMusic] = useState<PostMusicItem | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(postId) && enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!postId || !enabled) {
      setMusic(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // maybeSingle() bitta postda bir nechta yozuv bo'lsa xato qaytaradi va
      // musiqa yo'qoladi. limit(1) bilan birinchi yozuv olinadi.
      const { data: links, error: linkError } = await db
        .from('post_music')
        .select('*')
        .eq('post_id', postId)
        .limit(1);

      if (linkError) throw linkError;
      writeStructuredPostSchemaCapability('available');

      const link = (links ?? [])[0];
      if (!link?.track_id) {
        setMusic(null);
        return;
      }

      const { data: tracks, error: trackError } = await db
        .from('music_tracks')
        .select('id,title,artist,audio_url,cover_url,duration_seconds,source,license,attribution,storage_bucket,storage_key')
        .eq('id', link.track_id)
        .limit(1);

      if (trackError) throw trackError;

      const track = (tracks ?? [])[0];
      if (!track) {
        setMusic(null);
        return;
      }

      const rawUrl = String(track.audio_url ?? '');
      const bucket = track.storage_bucket ? String(track.storage_bucket) : null;
      const key = track.storage_key ? String(track.storage_key) : null;

      let playbackUrl: string | null = null;
      try {
        playbackUrl = await resolveStorageUrl(rawUrl, bucket, key);
      } catch (resolveError) {
        console.warn('Musiqa manzilini hal qilib bo\u2018lmadi:', resolveError);
      }

      // Signed URL olinmasa ham to'g'ridan-to'g'ri public havola ishlatiladi.
      if (!playbackUrl && isHttpUrl(rawUrl)) playbackUrl = rawUrl;

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
          audio_url: rawUrl,
          cover_url: track.cover_url ? String(track.cover_url) : null,
          duration_seconds: track.duration_seconds == null ? null : Number(track.duration_seconds),
          source: String(track.source ?? 'platform'),
          license: track.license ? String(track.license) : null,
          attribution: track.attribution ? String(track.attribution) : null,
          storage_bucket: bucket,
          storage_key: key,
        },
        playback_url: playbackUrl,
      });
    } catch (loadError) {
      if (isMissingStructuredPostSchemaError(loadError)) {
        writeStructuredPostSchemaCapability('missing');
      } else {
        console.error('Post musiqasini yuklashda xatolik:', loadError);
        setError('Musiqani yuklab bo\u2018lmadi');
      }
      setMusic(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { music, isLoading, error, refresh: load };
}
