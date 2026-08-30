import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  MAX_FILES_PER_POST,
  isPreviewable,
  partitionSelectedFiles,
  revokePreviewUrls,
  type MediaKind,
} from '@/lib/postComposer';
import { captureVideoPoster, readMediaMetadata } from '@/lib/mediaMetadata';
import { uploadFileWithProgress } from '@/lib/uploadWithProgress';
import type { MediaVisibility } from '@/lib/mediaUpload';
import type { PostMediaInput } from '@/lib/postMeta';

export type AttachmentStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface Attachment {
  id: string;
  file: File;
  kind: MediaKind;
  /** Blob URL — faqat preview qilinadigan turlar uchun. */
  previewUrl?: string;
  status: AttachmentStatus;
  progress: number;
  error?: string;
  /** Preview URL (private bo‘lsa vaqtinchalik signed URL). */
  uploadedUrl?: string;
  /** DBga yoziladigan stable URL/reference. */
  storageUrl?: string;
  storageBucket?: string;
  storageKey?: string;
  thumbnailUrl?: string;
  thumbnailStorageUrl?: string;
  thumbnailBucket?: string;
  thumbnailKey?: string;
  uploadedVisibility?: MediaVisibility;
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
  altText?: string;
  /** Filtr / crop / trim / overlay holati. */
  editState?: Record<string, unknown>;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


async function cleanupUploadedObjects(attachment?: Attachment | null): Promise<void> {
  if (!attachment) return;

  const groups = new Map<string, string[]>();
  const add = (bucket?: string, key?: string) => {
    if (!bucket || !key) return;
    const keys = groups.get(bucket) ?? [];
    keys.push(key);
    groups.set(bucket, keys);
  };

  add(attachment.storageBucket, attachment.storageKey);
  add(attachment.thumbnailBucket, attachment.thumbnailKey);

  await Promise.all(
    Array.from(groups.entries()).map(async ([bucket, keys]) => {
      const { error } = await supabase.storage.from(bucket).remove(keys);
      if (error) console.warn('Eski attachment obyektini tozalab bo‘lmadi:', error);
    }),
  );
}

/**
 * Post ilovalarini (har qanday turdagi fayl) boshqarish.
 *
 * Eski kodning muammolari va yechimlari:
 *  - faqat image/* va video/* qabul qilinardi → endi barcha turlar
 *  - bitta umumiy progress bar bor edi → endi har faylda alohida foiz
 *  - xato bo'lsa fayl jimgina tushib qolardi → endi xato ko'rinadi va qayta urinish bor
 *  - blob URL lar revoke qilinmasdi (memory leak) → endi to'g'ri tozalanadi
 */
export function usePostAttachments(options?: {
  maxFiles?: number;
  uploadKind?: string;
  visibility?: MediaVisibility;
}) {
  const maxFiles = options?.maxFiles ?? MAX_FILES_PER_POST;
  const uploadKind = options?.uploadKind ?? 'post';
  const visibility = options?.visibility ?? 'public';
  const { toast } = useToast();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Cleanup uchun eng oxirgi holatga ishonchli havola (stale closure muammosi yo'q)
  const attachmentsRef = useRef<Attachment[]>([]);
  const abortControllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Unmount: barcha blob URL lar bo'shatiladi, yuklashlar bekor qilinadi
  useEffect(() => {
    return () => {
      revokePreviewUrls(attachmentsRef.current.map((item) => item.previewUrl));
      abortControllers.current.forEach((controller) => controller.abort());
      abortControllers.current.clear();
    };
  }, []);

  const patch = useCallback((id: string, changes: Partial<Attachment>) => {
    setAttachments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  /** Fayllarni qo'shish. Validatsiya + metama'lumot o'qish. */
  const addFiles = useCallback(
    async (files: File[]) => {
      const { accepted, errors } = partitionSelectedFiles(
        files,
        attachmentsRef.current.length,
        maxFiles,
      );

      for (const message of errors) {
        toast({ title: 'Fayl qo\u2018shilmadi', description: message, variant: 'destructive' });
      }

      if (accepted.length === 0) return [];

      const created: Attachment[] = accepted.map(({ file, kind }) => ({
        id: createId(),
        file,
        kind,
        previewUrl: isPreviewable(kind) ? URL.createObjectURL(file) : undefined,
        status: 'pending',
        progress: 0,
      }));

      setAttachments((current) => [...current, ...created]);

      // Metama'lumotlarni fonda o'qiymiz
      await Promise.all(
        created.map(async (item) => {
          if (!item.previewUrl) return;
          const meta = await readMediaMetadata(item.kind, item.previewUrl);
          if (Object.keys(meta).length > 0) patch(item.id, meta);
        }),
      );

      return created;
    },
    [maxFiles, toast, patch],
  );

  const removeAttachment = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);

    const target = attachmentsRef.current.find((item) => item.id === id);
    revokePreviewUrls([target?.previewUrl]);
    void cleanupUploadedObjects(target);

    setAttachments((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Real editor yangi fayl chiqarganda attachmentni atomik almashtiradi. */
  const replaceAttachmentFile = useCallback(
    async (
      id: string,
      file: File,
      editState?: Record<string, unknown>,
    ) => {
      const target = attachmentsRef.current.find((item) => item.id === id);
      if (!target) return;

      abortControllers.current.get(id)?.abort();
      abortControllers.current.delete(id);

      const previewUrl = isPreviewable(target.kind) ? URL.createObjectURL(file) : undefined;
      const meta = previewUrl ? await readMediaMetadata(target.kind, previewUrl) : {};

      revokePreviewUrls([target.previewUrl]);
      void cleanupUploadedObjects(target);

      patch(id, {
        file,
        previewUrl,
        status: 'pending',
        progress: 0,
        error: undefined,
        uploadedUrl: undefined,
        storageUrl: undefined,
        storageBucket: undefined,
        storageKey: undefined,
        thumbnailUrl: undefined,
        thumbnailStorageUrl: undefined,
        thumbnailBucket: undefined,
        thumbnailKey: undefined,
        uploadedVisibility: undefined,
        editState,
        ...meta,
      });
    },
    [patch],
  );

  const clearAttachments = useCallback(() => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    revokePreviewUrls(attachmentsRef.current.map((item) => item.previewUrl));
    setAttachments([]);
  }, []);

  const reorderAttachments = useCallback((fromIndex: number, toIndex: number) => {
    setAttachments((current) => {
      if (
        fromIndex < 0 || toIndex < 0 ||
        fromIndex >= current.length || toIndex >= current.length ||
        fromIndex === toIndex
      ) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const setEditState = useCallback(
    (id: string, editState: Record<string, unknown> | undefined) => {
      patch(id, { editState });
    },
    [patch],
  );

  const setAltText = useCallback(
    (id: string, altText: string) => {
      patch(id, { altText });
    },
    [patch],
  );

  /** Bitta faylni yuklash (qayta urinish uchun ham ishlatiladi). */
  const uploadOne = useCallback(
    async (attachment: Attachment): Promise<Attachment | null> => {
      const controller = new AbortController();
      abortControllers.current.set(attachment.id, controller);

      patch(attachment.id, { status: 'uploading', progress: 0, error: undefined });

      try {
        const uploaded = await uploadFileWithProgress(attachment.file, {
          kind: uploadKind,
          visibility,
          signal: controller.signal,
          onProgress: (percent) => patch(attachment.id, { progress: percent }),
        });

        // Video uchun poster kadrni ham yuklaymiz
        let thumbnailUrl: string | undefined;
        let thumbnailStorageUrl: string | undefined;
        let thumbnailBucket: string | undefined;
        let thumbnailKey: string | undefined;
        if (attachment.kind === 'video' && attachment.previewUrl) {
          try {
            const poster = await captureVideoPoster(attachment.previewUrl);
            if (poster) {
              const posterFile = new File([poster], `poster-${attachment.id}.jpg`, {
                type: 'image/jpeg',
              });
              const uploadedPoster = await uploadFileWithProgress(posterFile, {
                kind: uploadKind,
                visibility,
              });
              thumbnailUrl = uploadedPoster.url;
              thumbnailStorageUrl = uploadedPoster.storageUrl;
              thumbnailBucket = uploadedPoster.bucket;
              thumbnailKey = uploadedPoster.key;
            }
          } catch (posterError) {
            console.warn('Poster yuklanmadi:', posterError);
          }
        }

        const result: Attachment = {
          ...attachment,
          status: 'done',
          progress: 100,
          uploadedUrl: uploaded.url,
          storageUrl: uploaded.storageUrl,
          storageBucket: uploaded.bucket,
          storageKey: uploaded.key,
          thumbnailUrl,
          thumbnailStorageUrl,
          thumbnailBucket,
          thumbnailKey,
          uploadedVisibility: visibility,
          error: undefined,
        };

        patch(attachment.id, {
          status: 'done',
          progress: 100,
          uploadedUrl: uploaded.url,
          storageUrl: uploaded.storageUrl,
          storageBucket: uploaded.bucket,
          storageKey: uploaded.key,
          thumbnailUrl,
          thumbnailStorageUrl,
          thumbnailBucket,
          thumbnailKey,
          uploadedVisibility: visibility,
          error: undefined,
        });

        // Visibility public -> private/friends (yoki aksincha) o'zgargan bo'lsa,
        // avvalgi obyekt endi postga bog'lanmaydi. Uni best-effort o'chiramiz.
        if (
          attachment.uploadedVisibility &&
          attachment.uploadedVisibility !== visibility &&
          attachment.storageBucket &&
          attachment.storageKey
        ) {
          void supabase.storage
            .from(attachment.storageBucket)
            .remove([attachment.storageKey])
            .then(({ error: cleanupError }) => {
              if (cleanupError) console.warn('Eski media obyektini tozalab bo‘lmadi:', cleanupError);
            });

          if (attachment.thumbnailBucket && attachment.thumbnailKey) {
            void supabase.storage
              .from(attachment.thumbnailBucket)
              .remove([attachment.thumbnailKey])
              .then(({ error: cleanupError }) => {
                if (cleanupError) console.warn('Eski preview obyektini tozalab bo‘lmadi:', cleanupError);
              });
          }
        }

        return result;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;

        const message = error instanceof Error ? error.message : 'Yuklashda xatolik';
        patch(attachment.id, { status: 'error', error: message });
        return null;
      } finally {
        abortControllers.current.delete(attachment.id);
      }
    },
    [patch, uploadKind, visibility],
  );

  const retryAttachment = useCallback(
    async (id: string) => {
      const target = attachmentsRef.current.find((item) => item.id === id);
      if (!target) return;
      setIsUploading(true);
      await uploadOne(target);
      setIsUploading(false);
    },
    [uploadOne],
  );

  /**
   * Barcha fayllarni yuklaydi va `post_media` uchun tayyor massiv qaytaradi.
   * Xato bo'lgan fayllar `failed` ro'yxatida qaytadi — chaqiruvchi kod
   * postni to'xtatishi yoki davom etishi mumkin.
   */
  const uploadAll = useCallback(async (): Promise<{
    media: PostMediaInput[];
    failed: Attachment[];
  }> => {
    const pending = attachmentsRef.current;
    if (pending.length === 0) return { media: [], failed: [] };

    setIsUploading(true);

    const media: PostMediaInput[] = [];
    const failed: Attachment[] = [];

    try {
      for (const attachment of pending) {
        const uploaded =
          attachment.status === 'done' &&
          attachment.storageUrl &&
          attachment.uploadedVisibility === visibility
            ? attachment
            : await uploadOne(attachment);

        if (!uploaded?.storageUrl) {
          failed.push(attachment);
          continue;
        }

        media.push({
          storageUrl: uploaded.storageUrl,
          storageBucket: uploaded.storageBucket ?? null,
          storageKey: uploaded.storageKey ?? null,
          kind: uploaded.kind,
          mimeType: uploaded.file.type || null,
          fileName: uploaded.file.name,
          fileSize: uploaded.file.size,
          width: uploaded.width ?? null,
          height: uploaded.height ?? null,
          durationSeconds: uploaded.durationSeconds ?? null,
          thumbnailUrl: uploaded.thumbnailStorageUrl ?? uploaded.thumbnailUrl ?? null,
          thumbnailBucket: uploaded.thumbnailBucket ?? null,
          thumbnailKey: uploaded.thumbnailKey ?? null,
          aspectRatio: uploaded.aspectRatio ?? null,
          altText: uploaded.altText ?? null,
          editState: uploaded.editState ?? null,
        });
      }
    } finally {
      setIsUploading(false);
    }

    return { media, failed };
  }, [uploadOne, visibility]);

  const totalProgress = attachments.length
    ? Math.round(attachments.reduce((sum, item) => sum + item.progress, 0) / attachments.length)
    : 0;

  return {
    attachments,
    isUploading,
    totalProgress,
    canAddMore: attachments.length < maxFiles,
    remainingSlots: Math.max(0, maxFiles - attachments.length),
    addFiles,
    removeAttachment,
    clearAttachments,
    reorderAttachments,
    retryAttachment,
    setEditState,
    setAltText,
    replaceAttachmentFile,
    uploadAll,
  };
}
