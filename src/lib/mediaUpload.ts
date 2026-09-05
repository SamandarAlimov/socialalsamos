import { supabase } from '@/integrations/supabase/client';
import {
  EXTERNAL_MEDIA_BUCKET,
  encodeMediaPath,
  isAlsamosPublicMediaUrl,
  makeAlsamosMediaReference,
  parseAlsamosMediaReference,
} from '@/lib/mediaRefs';
import { uniqueMediaCandidates } from '@/lib/mediaRecovery';

/**
 * Alsamos media arxitekturasi.
 *
 * Yangi binary fayllar faqat api.alsamos.com orqali alohida MinIO/S3 media
 * serveriga yoziladi. Supabase Storage bu modulda faqat tarixiy obyektlarni
 * o'qish/sign qilish uchun qoladi; yangi upload uchun yashirin fallback yo'q.
 */

/** Eski Supabase Storage bucketlari — faqat legacy compatibility uchun. */
export const MEDIA_BUCKET = 'media';
export const PRIVATE_MEDIA_BUCKET = 'media-private';
const PUBLIC_BUCKETS = new Set([MEDIA_BUCKET]);

const EXTERNAL_API = String(
  import.meta.env.VITE_MEDIA_API_URL || 'https://api.alsamos.com',
).replace(/\/+$/, '');
const EXTERNAL_MEDIA_PUBLIC_BASE = String(
  import.meta.env.VITE_MEDIA_PUBLIC_BASE_URL || 'https://media.alsamos.com/media',
).replace(/\/+$/, '');

function canUseSameOriginApiProxy(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'alsamos.com' ||
    host.endsWith('.alsamos.com') ||
    host.endsWith('.vercel.app')
  );
}

function mediaApiEndpoint(proxyPath: string, upstreamPath: string): string {
  if (typeof window === 'undefined' || !canUseSameOriginApiProxy()) {
    return `${EXTERNAL_API}${upstreamPath}`;
  }
  return proxyPath;
}

export type MediaVisibility = 'public' | 'friends' | 'private';

export function bucketForMediaVisibility(visibility: MediaVisibility = 'public'): string {
  return visibility === 'public' ? MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET;
}

export function makeStorageReference(bucket: string, key: string): string {
  return `storage://${bucket}/${key}`;
}

export function parseStorageReference(value?: string | null): { bucket: string; key: string } | null {
  if (!value?.startsWith('storage://')) return null;
  const raw = value.slice('storage://'.length);
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) return null;
  return { bucket: raw.slice(0, slash), key: raw.slice(slash + 1) };
}

export interface ParsedSupabaseStorageUrl {
  bucket: string;
  key: string;
  access: 'public' | 'signed' | 'authenticated';
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Eski Supabase URL'dan bucket/key ni ajratadi. */
export function parseSupabaseStorageUrl(value?: string | null): ParsedSupabaseStorageUrl | null {
  if (!value || value.startsWith('storage://')) return null;

  const markers: Array<{ marker: string; access: ParsedSupabaseStorageUrl['access'] }> = [
    { marker: '/storage/v1/object/public/', access: 'public' },
    { marker: '/storage/v1/object/sign/', access: 'signed' },
    { marker: '/storage/v1/object/authenticated/', access: 'authenticated' },
    { marker: '/storage/v1/render/image/public/', access: 'public' },
    { marker: '/storage/v1/render/image/sign/', access: 'signed' },
    { marker: '/storage/v1/render/image/authenticated/', access: 'authenticated' },
    { marker: '/storage/v1/object/', access: 'authenticated' },
  ];

  try {
    const parsedUrl = new URL(value, 'https://alsamos.invalid');
    const pathname = parsedUrl.pathname;
    const matched = markers.find(({ marker }) => pathname.includes(marker));
    if (!matched) return null;

    const index = pathname.indexOf(matched.marker);
    const raw = pathname.slice(index + matched.marker.length);
    const slash = raw.indexOf('/');
    if (slash <= 0 || slash === raw.length - 1) return null;

    const bucket = safeDecodeUriComponent(raw.slice(0, slash));
    const key = safeDecodeUriComponent(raw.slice(slash + 1));
    if (!bucket || !key) return null;

    return { bucket, key, access: matched.access };
  } catch {
    return null;
  }
}

function currentSupabaseOrigin(): string | null {
  try {
    const raw = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

const CURRENT_SUPABASE_ORIGIN = currentSupabaseOrigin();

function isCurrentSupabaseAbsoluteUrl(value: string): boolean {
  if (!CURRENT_SUPABASE_ORIGIN) return false;
  try {
    return new URL(value).origin === CURRENT_SUPABASE_ORIGIN;
  } catch {
    return false;
  }
}

function isBrowserMediaUrl(value: string): boolean {
  return /^(https?:|blob:|data:)/i.test(value);
}

function bucketForChatMediaType(mediaType?: string | null): string {
  if (mediaType === 'voice' || mediaType === 'audio') return 'chat-audio';
  if (mediaType === 'video' || mediaType === 'video_note') return 'chat-video';
  return 'message-attachments';
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessiya topilmadi - qaytadan tizimga kiring');
  return token;
}

async function signExternalMediaKey(key: string): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(
    mediaApiEndpoint(
      `/api/media-sign?key=${encodeURIComponent(key)}`,
      `/api/media/sign?key=${encodeURIComponent(key)}`,
    ),
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, 'Maxfiy media havolasi olinmadi'));
  }
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error('Media server vaqtinchalik havola qaytarmadi');
  return body.url;
}

async function tryCreateSignedSupabaseUrl(
  bucket: string,
  key: string,
  expiresIn: number,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * DB'dagi barqaror media reference'ni brauzer ochadigan URL'ga aylantiradi.
 * Yangi Alsamos media server reference'lari birinchi o'rinda; eski Supabase
 * reference'lari esa regressiyasiz o'qilishi uchun saqlangan.
 */
export async function resolveStorageUrl(
  value: string,
  bucket?: string | null,
  key?: string | null,
  expiresIn = 3600,
): Promise<string> {
  if (isAlsamosPublicMediaUrl(value)) return value;

  const externalReference = parseAlsamosMediaReference(value);
  const externalKey =
    bucket === EXTERNAL_MEDIA_BUCKET && key
      ? key
      : externalReference?.key ?? null;

  if (externalKey) {
    if (externalKey.startsWith('private/')) {
      return signExternalMediaKey(externalKey);
    }
    return `${EXTERNAL_MEDIA_PUBLIC_BASE}/${encodeMediaPath(externalKey)}`;
  }

  const stableReference = parseStorageReference(value);
  const absoluteReference = parseSupabaseStorageUrl(value);
  const hasExplicitObject = Boolean(bucket && key);

  if (!hasExplicitObject && !stableReference && absoluteReference) {
    if (absoluteReference.access === 'public') return value;
    if (!isCurrentSupabaseAbsoluteUrl(value)) return value;
  }

  const parsed =
    bucket && key
      ? { bucket, key }
      : stableReference ?? absoluteReference;

  if (!parsed) return value;

  const wasPublicAbsoluteUrl =
    absoluteReference?.access === 'public' &&
    absoluteReference.bucket === parsed.bucket &&
    absoluteReference.key === parsed.key;

  if (PUBLIC_BUCKETS.has(parsed.bucket) || wasPublicAbsoluteUrl) {
    return supabase.storage.from(parsed.bucket).getPublicUrl(parsed.key).data.publicUrl;
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.key, expiresIn);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Private fayl uchun vaqtinchalik havola olinmadi');
  }

  return data.signedUrl;
}

/**
 * Bitta tarixiy media yozuvi uchun o'qish kandidatlarini qaytaradi. Muhim
 * farq: public URL 404/403 bo'lishi obyekt o'chganini anglatmaydi — bucket
 * keyinchalik private bo'lgan bo'lishi mumkin. Current Supabase projectdagi
 * eski bucketlar uchun shu object key'ga yangi signed URL ham tayyorlanadi.
 * Foreign project URL'lari esa o'zgartirilmaydi, chunki ularni sign qilish
 * vakolati bu clientda yo'q.
 */
export async function resolveStorageUrlCandidates(
  value: string,
  bucket?: string | null,
  key?: string | null,
  expiresIn = 3600,
): Promise<string[]> {
  if (!value) return [];

  if (isAlsamosPublicMediaUrl(value) || parseAlsamosMediaReference(value)) {
    try {
      return uniqueMediaCandidates([await resolveStorageUrl(value, bucket, key, expiresIn), value]);
    } catch {
      return isBrowserMediaUrl(value) ? [value] : [];
    }
  }

  const stableReference = parseStorageReference(value);
  const absoluteReference = parseSupabaseStorageUrl(value);
  const hasExplicitObject = Boolean(bucket && key);
  const parsed =
    bucket && key
      ? { bucket, key }
      : stableReference ?? absoluteReference;

  if (!parsed) return isBrowserMediaUrl(value) ? [value] : [];

  const isForeignAbsolute =
    Boolean(absoluteReference) &&
    !hasExplicitObject &&
    !stableReference &&
    !isCurrentSupabaseAbsoluteUrl(value);
  if (isForeignAbsolute) {
    return isBrowserMediaUrl(value) ? [value] : [];
  }

  const raw = isBrowserMediaUrl(value) ? value : null;
  const publicUrl = supabase.storage.from(parsed.bucket).getPublicUrl(parsed.key).data.publicUrl;

  // Canonical public `media` bucket does not need a signing round-trip.
  if (PUBLIC_BUCKETS.has(parsed.bucket) && !absoluteReference) {
    return uniqueMediaCandidates([publicUrl, raw]);
  }
  if (PUBLIC_BUCKETS.has(parsed.bucket) && absoluteReference?.access === 'public') {
    return uniqueMediaCandidates([raw, publicUrl]);
  }

  const signedUrl = await tryCreateSignedSupabaseUrl(parsed.bucket, parsed.key, expiresIn);

  if (absoluteReference?.access === 'public') {
    // Eski public bucket private'ga aylantirilgan bo'lsa fresh signed URL
    // obyektni saqlab qoladi. Sign muvaffaqiyatsiz bo'lsa raw URL qoladi.
    return uniqueMediaCandidates([signedUrl, raw, publicUrl]);
  }

  return uniqueMediaCandidates([signedUrl, raw, publicUrl]);
}

export interface ChatMediaSource {
  media_url?: string | null;
  media_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

function stringMeta(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Flutter/web xabarlardagi stable path/reference'larni real URL'ga resolve qiladi. */
export async function resolveChatMessageMediaUrl<T extends ChatMediaSource>(message: T): Promise<T> {
  if (!message.media_url && !message.metadata) return message;

  const mediaPath =
    stringMeta(message.metadata, 'media_path') ?? stringMeta(message.metadata, 'storage_path');
  const mediaBucket = stringMeta(message.metadata, 'media_bucket');
  const mediaUrl = message.media_url ?? '';

  try {
    if (mediaPath) {
      const bucket = mediaBucket || bucketForChatMediaType(message.media_type);
      const stable =
        bucket === EXTERNAL_MEDIA_BUCKET
          ? makeAlsamosMediaReference(mediaPath)
          : makeStorageReference(bucket, mediaPath);
      const candidates = await resolveStorageUrlCandidates(stable, bucket, mediaPath);
      return {
        ...message,
        media_url: candidates[0] ?? mediaUrl,
      };
    }

    if (
      parseAlsamosMediaReference(mediaUrl) ||
      parseStorageReference(mediaUrl) ||
      parseSupabaseStorageUrl(mediaUrl) ||
      isAlsamosPublicMediaUrl(mediaUrl)
    ) {
      const candidates = await resolveStorageUrlCandidates(mediaUrl);
      return { ...message, media_url: candidates[0] ?? mediaUrl };
    }
  } catch (error) {
    console.warn('Chat media URL resolve failed:', error);
  }

  return message;
}

export async function resolveChatMessageMediaUrls<T extends ChatMediaSource>(
  messages: T[]
): Promise<T[]> {
  return Promise.all(messages.map((message) => resolveChatMessageMediaUrl(message)));
}

export interface MediaUploadResult {
  /** Joriy sessiyada preview uchun ochiladigan URL. */
  url: string;
  /** DBga yoziladigan barqaror URL/reference. */
  storageUrl: string;
  key: string;
  bucket: string;
  type: string;
  name: string;
  size: number;
}

export interface MediaUploadOptions {
  filename?: string;
  /** Mantiqiy tur: avatar | cover | post | story | chat | file */
  type?: string;
  visibility?: MediaVisibility;
}

/** Xatolik matnini foydalanuvchi tushunadigan holatga keltirish. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `${fallback} (${response.status})`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string; detail?: string };
      return json.error || json.message || json.detail || `${fallback} (${response.status})`;
    } catch {
      return `${fallback} (${response.status}): ${text.slice(0, 180)}`;
    }
  } catch {
    return `${fallback} (${response.status})`;
  }
}

type ExternalPresignResponse = {
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  public_url?: string;
  key?: string;
  bucket?: string;
  visibility?: 'public' | 'private';
};

/** Asosiy va yagona yangi-upload yo'li: api.alsamos.com -> MinIO/S3. */
async function uploadViaExternalApi(
  file: File | Blob,
  token: string,
  filename: string,
  contentType: string,
  options: MediaUploadOptions,
): Promise<MediaUploadResult> {
  const apiVisibility = options.visibility === 'public' || !options.visibility ? 'public' : 'private';
  const presign = await fetch(mediaApiEndpoint('/api/media-presign', '/api/media/presign'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      size: file.size,
      type: options.type || 'file',
      visibility: apiVisibility,
    }),
  });

  if (!presign.ok) {
    throw new Error(await readError(presign, 'Media server yuklash ruxsatini bermadi'));
  }

  const signed = (await presign.json()) as ExternalPresignResponse;
  if (!signed.upload_url || !signed.key) {
    throw new Error('Media server noto\'liq presign javobi qaytardi');
  }

  const uploadHeaders: Record<string, string> = {
    ...(signed.headers ?? { 'Content-Type': contentType }),
  };
  if (!uploadHeaders['Content-Type']) uploadHeaders['Content-Type'] = contentType;
  if (apiVisibility === 'private') {
    uploadHeaders['Cache-Control'] = 'private, no-store, max-age=0';
  }

  const upload = await fetch(signed.upload_url, {
    method: signed.method || 'PUT',
    headers: uploadHeaders,
    body: file,
  });

  if (!upload.ok) {
    throw new Error(await readError(upload, 'Media serverga fayl yozilmadi'));
  }

  const storageUrl =
    apiVisibility === 'public'
      ? signed.public_url || `${EXTERNAL_MEDIA_PUBLIC_BASE}/${encodeMediaPath(signed.key)}`
      : makeAlsamosMediaReference(signed.key);
  const url =
    apiVisibility === 'public'
      ? storageUrl
      : await signExternalMediaKey(signed.key);

  return {
    url,
    storageUrl,
    key: signed.key,
    bucket: EXTERNAL_MEDIA_BUCKET,
    type: contentType,
    name: filename,
    size: file.size,
  };
}

export async function uploadMedia(
  file: File | Blob,
  options: MediaUploadOptions = {},
): Promise<MediaUploadResult> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.access_token) {
    throw new Error('Sessiya topilmadi - qaytadan tizimga kiring');
  }

  const filename = options.filename || (file instanceof File ? file.name : 'upload.bin');
  const contentType = file.type || 'application/octet-stream';
  const visibility: MediaVisibility = options.visibility ?? 'public';

  try {
    return await uploadViaExternalApi(
      file,
      session.access_token,
      filename,
      contentType,
      { ...options, visibility },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Alsamos media serverga yuklab bo'lmadi. Fayl Supabase Storage'ga ko'chirilmadi: ${message}`,
    );
  }
}
