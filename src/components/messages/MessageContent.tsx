import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TelegramLinkPreview } from './TelegramLinkPreview';
import { MediaAlbum } from './MediaAlbum';
import { FormattedBlocks } from '@/components/chat/FormattedBlocks';
import { ArticleMessage } from '@/components/chat/ArticleMessage';
import { parseArticlePayload } from '@/lib/messageFormat';
import { parseAlbumPayload } from '@/lib/mediaAlbum';

interface MessageContentProps {
  content: string;
  isMine: boolean;
  className?: string;
}

const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/g;

/**
 * Xabar matni: Telegram uslubidagi formatlash (qalin, kursiv, spoiler, kod,
 * iqtibos, ro'yxat, kod bloki), mention/hashtag/havolalar, animatsion emojilar,
 * albom (bir nechta rasm/video) va "maqola" (article) xabarlari.
 *
 * Havolalar Telegramdek to'liq ko'rinadi (qisqartirilmaydi) va birinchi havola
 * uchun preview kartasi chiziladi.
 */
export function MessageContent({ content, isMine, className }: MessageContentProps) {
  const article = useMemo(() => parseArticlePayload(content), [content]);
  const album = useMemo(() => (article ? null : parseAlbumPayload(content)), [content, article]);

  const links = useMemo(() => {
    if (article || album) return [];
    const found = content.match(URL_REGEX) || [];
    return Array.from(new Set(found));
  }, [content, article, album]);

  const singleLinkOnly =
    links.length === 1 && content.trim().replace(/[\u200B-\u200D\uFEFF]/g, '') === links[0];

  // Maqola xabari - alohida karta va to'liq o'qish oynasi
  if (article) {
    return (
      <div className={cn('min-w-0 max-w-full', className)}>
        <ArticleMessage article={article} isMine={isMine} />
      </div>
    );
  }

  // Albom - bir nechta rasm/video bitta xabarda (Telegramdek mozaik to'r)
  if (album) {
    return (
      <div className={cn('min-w-0 max-w-full', className)}>
        <MediaAlbum album={album} isMine={isMine} />
      </div>
    );
  }

  return (
    <div className={cn('min-w-0 max-w-full space-y-1.5', className)}>
      {!singleLinkOnly && (
        <div
          className={cn(
            'min-w-0 max-w-full space-y-2 text-[15px] leading-[1.35]',
            isMine ? '[&_blockquote]:border-bubble-own-accent/60' : ''
          )}
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          <FormattedBlocks text={content} emojiSize={20} className="space-y-2" />
        </div>
      )}

      {/* Single-link messages keep the URL inside the preview so the bubble width
          follows the media instead of stretching across the chat. */}
      {links.slice(0, 1).map((url, index) => (
        <TelegramLinkPreview
          key={index}
          url={url}
          isMine={isMine}
          showUrl={singleLinkOnly}
          className={singleLinkOnly ? undefined : 'mt-1'}
        />
      ))}
    </div>
  );
}
