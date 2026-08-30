import { db } from '@/lib/db';
import type { MediaKind } from '@/lib/postComposer';

/**
 * Post meta-ma'lumotlarini strukturali jadvallarga yozish.
 * Ilgari bularning hammasi post matni ichiga tiqilgan edi
 * ([MUSIC:id], "📍 joy", [FILTER:id]) — endi alohida jadvallarda.
 */

export interface PostMediaInput {
  /** Public URL yoki stable storage://bucket/key reference. */
  storageUrl: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  kind: MediaKind;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  thumbnailBucket?: string | null;
  thumbnailKey?: string | null;
  aspectRatio?: string | null;
  altText?: string | null;
  /** Qo'llanilgan filtr/crop/trim/overlay holati. */
  editState?: Record<string, unknown> | null;
}

export type LocationMode = 'place' | 'live';

export interface PostLocationInput {
  mode: LocationMode;
  latitude: number;
  longitude: number;
  label?: string | null;
  accuracyM?: number | null;
  /** Real vaqtli joylashuv qachongacha ulashiladi. */
  liveUntil?: string | null;
  place?: {
    name: string;
    address?: string | null;
    category?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
  } | null;
}

export interface PostMusicInput {
  trackId?: string | null;
  startSeconds?: number;
  endSeconds?: number | null;
  volume?: number;
  mutedOriginal?: boolean;
  /** Trek hali bazada bo'lmasa (device dan yuklangan) — avval yaratiladi. */
  track?: {
    title: string;
    artist?: string | null;
    audioUrl: string;
    coverUrl?: string | null;
    durationSeconds?: number | null;
    source?: 'platform' | 'device' | 'jamendo' | 'audius' | 'fma' | 'ccmixter' | 'pixabay';
    externalId?: string | null;
    license?: string | null;
    attribution?: string | null;
    ownerId?: string | null;
    isPublic?: boolean;
  } | null;
}

export async function savePostMedia(postId: string, items: PostMediaInput[]): Promise<void> {
  if (items.length === 0) return;

  const { error } = await db.from('post_media').insert(
    items.map((item, position) => ({
      post_id: postId,
      position,
      kind: item.kind,
      storage_url: item.storageUrl,
      storage_bucket: item.storageBucket ?? null,
      storage_key: item.storageKey ?? null,
      thumbnail_url: item.thumbnailUrl ?? null,
      thumbnail_bucket: item.thumbnailBucket ?? null,
      thumbnail_key: item.thumbnailKey ?? null,
      mime_type: item.mimeType ?? null,
      file_name: item.fileName ?? null,
      file_size: item.fileSize ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      duration_seconds: item.durationSeconds ?? null,
      aspect_ratio: item.aspectRatio ?? null,
      alt_text: item.altText ?? null,
      edit_state: item.editState ?? null,
    })),
  );

  if (error) throw error;
}

/** Joyni topadi yoki yaratadi (takrorlanmasligi uchun external id bo'yicha). */
async function upsertPlace(
  place: NonNullable<PostLocationInput['place']>,
  latitude: number,
  longitude: number,
  userId?: string | null,
): Promise<string | null> {
  if (place.externalSource && place.externalId) {
    const { data: existing } = await db
      .from('places')
      .select('id')
      .eq('external_source', place.externalSource)
      .eq('external_id', place.externalId)
      .maybeSingle();

    if (existing?.id) return existing.id as string;
  }

  const { data, error } = await db
    .from('places')
    .insert({
      name: place.name,
      address: place.address ?? null,
      category: place.category ?? null,
      latitude,
      longitude,
      external_source: place.externalSource ?? null,
      external_id: place.externalId ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function savePostLocation(
  postId: string,
  input: PostLocationInput,
  userId?: string | null,
): Promise<void> {
  let placeId: string | null = null;

  if (input.place) {
    placeId = await upsertPlace(input.place, input.latitude, input.longitude, userId);
  }

  const { error } = await db.from('post_locations').insert({
    post_id: postId,
    place_id: placeId,
    mode: input.mode,
    label: input.label ?? input.place?.name ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracyM ?? null,
    live_until: input.mode === 'live' ? (input.liveUntil ?? null) : null,
  });

  if (error) throw error;
}

export async function savePostMusic(postId: string, input: PostMusicInput): Promise<void> {
  let trackId = input.trackId ?? null;

  if (!trackId && input.track) {
    const { data, error } = await db
      .from('music_tracks')
      .insert({
        title: input.track.title,
        artist: input.track.artist ?? null,
        audio_url: input.track.audioUrl,
        cover_url: input.track.coverUrl ?? null,
        duration_seconds: input.track.durationSeconds ?? null,
        source: input.track.source ?? 'device',
        external_id: input.track.externalId ?? null,
        license: input.track.license ?? null,
        attribution: input.track.attribution ?? null,
        owner_id: input.track.ownerId ?? null,
        is_public: input.track.isPublic ?? false,
      })
      .select('id')
      .single();

    if (error) throw error;
    trackId = data.id as string;
  }

  if (!trackId) return;

  const { error } = await db.from('post_music').insert({
    post_id: postId,
    track_id: trackId,
    start_seconds: input.startSeconds ?? 0,
    end_seconds: input.endSeconds ?? null,
    volume: input.volume ?? 1,
    muted_original: input.mutedOriginal ?? false,
  });

  if (error) throw error;
}
