import { memo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { isVisibleAt, type StorySticker } from '@/lib/storyStickers';
import { useStoryStickers } from '@/hooks/useStoryStickers';
import { StoryStickerView } from '@/components/stickers/StoryStickerView';

interface StoryStickerOverlayProps {
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

/**
 * Interaktiv story/reel stikerlarini media ustiga joylaydi.
 *
 * Ikki muhim qaror:
 * 1. Joylashuv 0..1 nisbiy koordinatalarda — shuning uchun bir xil stiker
 *    telefon, planshet va to‘liq ekranda bir joyda turadi.
 * 2. O‘lcham `cqw` (container query width) orqali beriladi, ya’ni stiker
 *    konteyner bilan birga kattalashadi; ichkarida hamma o‘lchov `em` da.
 */
export const StoryStickerOverlay = memo(function StoryStickerOverlay({
  postId,
  mediaId,
  currentTime,
  readOnly,
  baseFontRatio = 0.075,
  className,
}: StoryStickerOverlayProps) {
  const { stickers, results, respond, fetchResults } = useStoryStickers(postId);

  const visible = stickers.filter((sticker) => {
    if (mediaId !== undefined && sticker.mediaId !== null && sticker.mediaId !== mediaId) {
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
          console.warn('Javobni yuborib bo\u2018lmadi:', error);
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
