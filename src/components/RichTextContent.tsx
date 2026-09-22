import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Music2 } from 'lucide-react';
import { EmojiText } from '@/components/emoji/EmojiText';
import { getEmojiOnlyInfo } from '@/lib/emojiOnly';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { tokenizeRichTextLinks } from '@/lib/richTextLinks';

interface RichTextContentProps {
  content: string;
  className?: string;
  /** Matn ichidagi emoji o'lchami (px). */
  emojiSize?: number;
}

// Media formati: [media:type:url]
const MEDIA_REGEX = /\[media:(image|video|gif):([^\]]+)\]/g;
// Musiqa teglari: [MUSIC]{json}  yoki  [MUSIC:trackId]
const MUSIC_JSON_REGEX = /\[MUSIC\]\s*(\{[\s\S]*?\})/g;
const MUSIC_ID_REGEX = /\[MUSIC:([^\]]+)\]/g;
// Joylashuv qatori: "\ud83d\udccd Joy nomi"
const LOCATION_REGEX = new RegExp('^[ \\t]*\\ud83d\\udccd[ \\t]*(.+)$', 'gm');

/**
 * Telegramdagi standart o'lchamlar: bitta emoji eng katta, ikkitasi o'rtacha,
 * uchta va undan ko'pi kichikroq bo'ladi (aks holda pufakcha juda kattalashadi).
 */
const EMOJI_ONLY_SIZES = { one: 64, two: 52, many: 40 };

// Havolani chiroyli ko'rsatish - asosan domen
function formatLinkDisplay(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname;

    if (path.length <= 20 && path !== '/') {
      return domain + path;
    }
    return domain + (path !== '/' ? '/...' : '');
  } catch {
    if (url.length > 35) {
      return url.substring(0, 32) + '...';
    }
    return url;
  }
}

export function RichTextContent({ content, className, emojiSize = 19 }: RichTextContentProps) {
  const { textContent, mediaItems, musicItems, locations } = useMemo(() => {
    if (!content) return { textContent: '', mediaItems: [], musicItems: [], locations: [] };

    const media: { type: 'image' | 'video' | 'gif'; url: string }[] = [];
    const music: { title: string; artist: string | null; audioUrl: string | null }[] = [];
    const places: string[] = [];

    let cleanedText = content.replace(MEDIA_REGEX, (_, type, url) => {
      media.push({ type: type as 'image' | 'video' | 'gif', url });
      return '';
    });

    cleanedText = cleanedText.replace(MUSIC_JSON_REGEX, (_, json) => {
      try {
        const parsed = JSON.parse(json);
        music.push({
          title: parsed.title || 'Audio',
          artist: parsed.artist || null,
          audioUrl: parsed.audioUrl || parsed.url || null,
        });
      } catch {
        music.push({ title: 'Audio', artist: null, audioUrl: null });
      }
      return '';
    });

    cleanedText = cleanedText.replace(MUSIC_ID_REGEX, (_, id) => {
      music.push({ title: String(id), artist: null, audioUrl: null });
      return '';
    });

    cleanedText = cleanedText.replace(LOCATION_REGEX, (_, place) => {
      places.push(String(place).trim());
      return '';
    });

    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();

    return { textContent: cleanedText, mediaItems: media, musicItems: music, locations: places };
  }, [content]);

  // Faqat emojidan iborat post/izoh - Telegramdek kattalashtiriladi
  const emojiOnly = useMemo(() => getEmojiOnlyInfo(textContent), [textContent]);

  const parsedContent = useMemo(
    () => tokenizeRichTextLinks(textContent),
    [textContent],
  );

  return (
    <div className={className}>
      {/* Faqat emoji bo'lsa - katta animatsion emojilar */}
      {emojiOnly ? (
        <span className="inline-flex items-end gap-1">
          {emojiOnly.emojis.map((emoji, index) => (
            <AnimatedEmoji
              key={`big-${index}`}
              emoji={emoji}
              size={
                emojiOnly.emojis.length === 1
                  ? EMOJI_ONLY_SIZES.one
                  : emojiOnly.emojis.length === 2
                    ? EMOJI_ONLY_SIZES.two
                    : EMOJI_ONLY_SIZES.many
              }
              hq
              title={emoji}
            />
          ))}
        </span>
      ) : (
        parsedContent.length > 0 && (
          <span className="whitespace-pre-wrap">
            {parsedContent.map((part, index) => {
              switch (part.type) {
                case 'mention':
                  return (
                    <Link
                      key={index}
                      to={`/user/${part.value}`}
                      className="cursor-pointer font-semibold text-link transition-colors hover:text-link-hover hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{part.value}
                    </Link>
                  );
                case 'hashtag':
                  return (
                    <Link
                      key={index}
                      to={`/search?q=%23${part.value}`}
                      className="font-medium text-link transition-colors hover:text-link-hover hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{part.value}
                    </Link>
                  );
                case 'link': {
                  const label = part.label || formatLinkDisplay(part.href);
                  const linkClassName =
                    'break-words text-link underline decoration-current/45 underline-offset-2 transition-colors hover:text-link-hover';

                  if (part.internalPath) {
                    return (
                      <Link
                        key={index}
                        to={part.internalPath}
                        className={linkClassName}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {label}
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={index}
                      href={part.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClassName}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {label}
                    </a>
                  );
                }
                default:
                  // Matn ichidagi emojilar Telegram uslubida rasmga aylantiriladi
                  return <EmojiText key={index} text={part.value} size={emojiSize} />;
              }
            })}
          </span>
        )
      )}

      {/* Musiqa chiplari */}
      {musicItems.map((track, index) => (
        <div
          key={`music-${index}`}
          className="mt-2 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 px-3 py-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Music2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
            {track.artist && (
              <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
            )}
          </div>
          {track.audioUrl && (
            <audio
              src={track.audioUrl}
              controls
              preload="none"
              className="h-8 max-w-[180px]"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ))}

      {/* Joylashuv chiplari */}
      {locations.map((place, index) => (
        <div
          key={`loc-${index}`}
          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{place}</span>
        </div>
      ))}

      {/* Media */}
      {mediaItems.map((media, index) => (
        <div key={`media-${index}`} className="mt-2">
          {media.type === 'video' ? (
            <video src={media.url} controls className="max-h-48 max-w-full rounded-lg" />
          ) : (
            <img
              src={media.url}
              alt={media.type === 'gif' ? 'GIF' : 'Rasm'}
              className="max-h-48 max-w-full rounded-lg object-contain"
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}
