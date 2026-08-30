import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';

export interface MusicCatalogTrack {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number | null;
  source: 'platform' | 'device' | 'jamendo' | 'audius' | 'fma' | 'ccmixter' | 'pixabay';
  external_id: string | null;
  license: string | null;
  attribution: string | null;
  genre: string | null;
  language: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  owner_id: string | null;
  is_public: boolean;
  is_commercial_ok: boolean | null;
  popularity: number;
}

function normalizeTrack(row: any): MusicCatalogTrack {
  const duration = row?.duration_seconds == null ? null : Number(row.duration_seconds);
  return {
    id: String(row.id),
    title: String(row.title ?? 'Nomsiz trek'),
    artist: row.artist ? String(row.artist) : null,
    album: row.album ? String(row.album) : null,
    audio_url: String(row.audio_url ?? ''),
    cover_url: row.cover_url ? String(row.cover_url) : null,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    source: (row.source ?? 'platform') as MusicCatalogTrack['source'],
    external_id: row.external_id ? String(row.external_id) : null,
    license: row.license ? String(row.license) : null,
    attribution: row.attribution ? String(row.attribution) : null,
    genre: row.genre ? String(row.genre) : null,
    language: row.language ? String(row.language) : null,
    storage_bucket: row.storage_bucket ? String(row.storage_bucket) : null,
    storage_key: row.storage_key ? String(row.storage_key) : null,
    owner_id: row.owner_id ? String(row.owner_id) : null,
    is_public: Boolean(row.is_public),
    is_commercial_ok: row.is_commercial_ok == null ? null : Boolean(row.is_commercial_ok),
    popularity: Number(row.popularity ?? row.uses_count ?? 0),
  };
}

export function useMusicCatalog(query: string, enabled = true) {
  const [tracks, setTracks] = useState<MusicCatalogTrack[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setTracks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await db.rpc('search_music_tracks', {
        p_query: query.trim() || null,
        p_limit: 40,
      });

      if (rpcError) throw rpcError;
      setTracks(Array.isArray(data) ? data.map(normalizeTrack) : []);
    } catch (loadError) {
      console.error('Musiqa katalogini yuklashda xatolik:', loadError);
      setError('Musiqa katalogini yuklab bo‘lmadi');
      setTracks([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, query.trim() ? 220 : 0);

    return () => window.clearTimeout(timer);
  }, [load, query]);

  return { tracks, isLoading, error, refresh: load };
}
