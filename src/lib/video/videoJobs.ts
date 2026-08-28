/**
 * ADR-001 gibrid qarorining amaliy qismi.
 *
 * Qisqa video klientda kuydiriladi (tez, server resursi sarflanmaydi).
 * Uzun yoki og‘ir video `video_jobs` navbatiga qo‘yiladi va serverda
 * qayta ishlanadi. Chegaralar shu yerda — bitta joyda o‘zgartirilsa,
 * butun ilova bir xil qaror qabul qiladi.
 */

import { db } from '@/lib/db';

/** Klientda kuydirish uchun maksimal davomiylik (sekund). */
export const CLIENT_BURN_MAX_SECONDS = 90;

/** Klientda kuydirish uchun maksimal fayl hajmi (bayt). */
export const CLIENT_BURN_MAX_BYTES = 120 * 1024 * 1024;

export type BurnRoute = 'client' | 'server';

export interface VideoJob {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  kind: string;
  progress: number | null;
  outputUrl: string | null;
  error: string | null;
}

/**
 * Qaysi yo‘ldan borishni hal qiladi.
 *
 * Mobil qurilmada klient kuydirishi issiqlik va batareya bo‘yicha qimmat,
 * shuning uchun chegara ikki barobar qat’iyroq.
 */
export function chooseBurnRoute(input: {
  durationSeconds?: number | null;
  fileSize?: number | null;
  isMobile?: boolean;
}): BurnRoute {
  const factor = input.isMobile ? 0.5 : 1;
  const duration = input.durationSeconds ?? 0;
  const size = input.fileSize ?? 0;

  if (duration > CLIENT_BURN_MAX_SECONDS * factor) return 'server';
  if (size > CLIENT_BURN_MAX_BYTES * factor) return 'server';
  return 'client';
}

/** Qurilma mobil ekanini taxminiy aniqlash (faqat yo‘l tanlash uchun). */
export function looksLikeMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function parseJob(row: Record<string, unknown> | null): VideoJob | null {
  if (!row) return null;
  return {
    id: String(row.id),
    status: (row.status as VideoJob['status']) ?? 'queued',
    kind: String(row.kind ?? 'sticker_burn'),
    progress: typeof row.progress === 'number' ? row.progress : null,
    outputUrl: typeof row.output_url === 'string' ? row.output_url : null,
    error: typeof row.error === 'string' ? row.error : null,
  };
}

/** Server navbatiga vazifa qo‘shadi. */
export async function enqueueBurnJob(params: {
  postId?: string | null;
  mediaId?: string | null;
  sourceUrl: string;
  payload: Record<string, unknown>;
}): Promise<VideoJob> {
  const { data, error } = await db
    .from('video_jobs')
    .insert({
      kind: 'sticker_burn',
      status: 'queued',
      post_id: params.postId ?? null,
      media_id: params.mediaId ?? null,
      source_url: params.sourceUrl,
      payload: params.payload,
    })
    .select('*')
    .single();

  if (error) throw error;

  const job = parseJob(data as Record<string, unknown>);
  if (!job) throw new Error('Vazifa yaratilmadi');
  return job;
}

/** Vazifa holatini bir marta o‘qiydi. */
export async function fetchJob(jobId: string): Promise<VideoJob | null> {
  const { data, error } = await db.from('video_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw error;
  return parseJob(data as Record<string, unknown> | null);
}

/**
 * Vazifa tugashini realtime orqali kutadi.
 *
 * Realtime uzilib qolsa jarayon muzlab qolmasligi uchun zaxira sifatida
 * har 5 sekundda so‘rov ham yuboriladi.
 */
export function watchJob(
  jobId: string,
  onUpdate: (job: VideoJob) => void,
): () => void {
  const channel = db
    .channel('video-job-' + jobId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'video_jobs', filter: 'id=eq.' + jobId },
      (payload: { new: Record<string, unknown> }) => {
        const job = parseJob(payload.new);
        if (job) onUpdate(job);
      },
    )
    .subscribe();

  const poll = window.setInterval(() => {
    void fetchJob(jobId)
      .then((job) => {
        if (job) onUpdate(job);
      })
      .catch(() => undefined);
  }, 5000);

  return () => {
    window.clearInterval(poll);
    void db.removeChannel(channel);
  };
}
