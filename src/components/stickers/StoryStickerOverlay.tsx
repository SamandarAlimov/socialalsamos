import { memo, useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import { isVisibleAt, type StorySticker } from '@/lib/storyStickers';
import { useStoryStickers } from '@/hooks/useStoryStickers';
import { StoryStickerView } from '@/components/stickers/StoryStickerView';

interface StoryStickerOverlayProps {
  /**
   * Canonical post id. Legacy StoryViewer versions historically passed the
   * `stories.id` here; the overlay resolves that id to stories.post_id so old
   * callers cannot silently lose stickers after the unified Story migration.
   */
  postId?: string;
  /** Faqat shu media uchun qo‘yilgan stikerlar (null — postga umumiy). */
  mediaId?: string | null;
  /**
   * Reel/video uchun joriy vaqt (sekund). Berilsa, stikerlar o‘z vaqt
   * oynasida ko‘rinadi; berilmasa hammasi ko‘rinadi (rasm/story).
   */
  currentTime?: number;
  readOnly?: boolean;
  /** Stiker asosiy o‘lchami: konteyner kengligining ulushi. */
  baseFontRatio?: number;
  className?: string;
}

interface ResolvedStoryLink {
  postId?: string;
  mediaId?: string | null;
}

/**
 * Interaktiv story/reel stikerlarini media ustiga joylaydi.
 *
 * Ikki muhim qaror:
 * 1. Joylashuv 0..1 nisbiy koordinatalarda — shuning uchun bir xil stiker
 *    telefon, planshet va to‘liq ekranda bir joyda turadi.
 * 2. O‘lcham `cqw` (container query width) orqali beriladi, ya’ni stiker
 *    konteyner bilan birga kattalashadi; ichkarida hamma o‘lchov `em` da.
 *
 * Unified Story compatibility: viewerning eski versiyasi `stories.id` ni
 * yuborgan bo‘lsa, bu komponent uni `stories.post_id/media_id` ga aylantiradi.
 * Reel va oddiy postlarda mos story row topilmaydi va berilgan postId o‘zicha
 * ishlatiladi.
 */
export const StoryStickerOverlay = memo(function StoryStickerOverlay({
  postId,
  mediaId,
  currentTime,
  readOnly,
  baseFontRatio = 0.075,
  className,
}: StoryStickerOverlayProps) {
  const [resolvedLink, setResolvedLink] = useState<ResolvedStoryLink>({
    postId,
    mediaId,
  });

  useEffect(() => {
    let cancelled = false;

    setResolvedLink({ postId, mediaId });
    if (!postId) return () => undefined;

    void (async () => {
      const { data, error } = await db
        .from('stories')
        .select('post_id, media_id')
        .eq('id', postId)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data?.post_id) {
        setResolvedLink({
          postId: String(data.post_id),
          mediaId:
            mediaId !== undefined
              ? mediaId
              : data.media_id
                ? String(data.media_id)
                : null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mediaId, postId]);

  const { stickers, results, respond, fetchResults } = useStoryStickers(
    resolvedLink.postId,
  );

  const effectiveMediaId =
    mediaId !== undefined ? mediaId : resolvedLink.mediaId;

  const visible = stickers.filter((sticker) => {
    if (
      effectiveMediaId !== undefined &&
      sticker.mediaId !== null &&
      sticker.mediaId !== effectiveMediaId
    ) {
      return false;
    }
    if (typeof currentTime === 'number' && !isVisibleAt(sticker, currentTime)) {
      return false;
    }
    return true;
  });

  // Ovoz berilgan so‘rovnomalar natijasi darhol ko‘rinishi uchun bir marta
  // yuklab olamiz. Javob bermagan foydalanuvchi natijani ko‘rmasligi kerak,
  // shu sababli `myChoice` bo‘lmasa UI o‘zi yashiradi.
  useEffect(() => {
    stickers
      .filter((sticker) => ['poll', 'quiz', 'slider'].includes(sticker.type))
      .forEach((sticker) => {
        if (!results[sticker.id]) {
          void fetchResults(sticker.id).catch(() => undefined);
        }
      });
  }, [stickers, results, fetchResults]);

  const handleRespond = useCallback(
    (sticker: StorySticker) =>
      async (answer: { optionIndex?: number; value?: number; text?: string }) => {
        try {
          await respond(sticker.id, answer);
        } catch (error) {
          console.warn('Javobni yuborib bo‘lmadi:', error);
        }
      },
    [respond],
  );

  if (visible.length === 0) return null;

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ containerType: 'inline-size' }}
    >
      {visible.map((sticker) => (
        <div
          key={sticker.id}
          className="pointer-events-auto absolute"
          style={{
            left: sticker.x * 100 + '%',
            top: sticker.y * 100 + '%',
            transform:
              'translate(-50%, -50%) rotate(' + sticker.rotation + 'deg)',
            fontSize: baseFontRatio * sticker.scale * 100 + 'cqw',
            zIndex: 10 + sticker.z,
          }}
        >
          <StoryStickerView
            sticker={sticker}
            results={results[sticker.id]}
            readOnly={readOnly}
            onRespond={handleRespond(sticker)}
          />
        </div>
      ))}
    </div>
  );
});
