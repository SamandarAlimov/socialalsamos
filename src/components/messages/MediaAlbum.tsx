import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  X,
} from 'lucide-react';
import {
  AlbumData,
  AlbumItem,
  albumLayout,
  formatAlbumDuration,
} from '@/lib/mediaAlbum';
import { snapAspectRatio } from '@/lib/linkEmbed';
import { FormattedText } from '@/components/chat/FormattedText';
import { useMediaAutoDownload } from '@/hooks/useMediaAutoDownload';
import { cn } from '@/lib/utils';

interface MediaAlbumProps {
  album: AlbumData;
  isMine?: boolean;
  className?: string;
}

/** Vertikal (portret) media uchun maksimal balandlik */
const MAX_PORTRAIT_HEIGHT = 420;
/** Gorizontal (landshaft) media uchun maksimal balandlik */
const MAX_LANDSCAPE_HEIGHT = 320;

/**
 * Telegramdagi albom ko'rinishi: mozaik to'r, "+N" belgisi,
 * to'liq ekranli ko'rish oynasi (chap/o'ng strelkalar bilan) va yuklab olish.
 *
 * Media avtomatik yuklab olish sozlamasi o'chirilgan bo'lsa,
 * rasm faqat bosilgandan keyin yuklanadi.
 *
 * Albomda BITTA media bo'lsa, mozaik katak ishlatilmaydi: ramka mediasining
 * haqiqiy nisbatiga moslashadi (9:16, 3:4, 4:5, 1:1, 16:9 ...), shuning uchun
 * vertikal video/rasm kesilmaydi va ichida scroll paydo bo'lmaydi.
 */
export function MediaAlbum({ album, isMine, className }: MediaAlbumProps) {
  const { shouldAutoDownload } = useMediaAutoDownload();
  const layout = useMemo(() => albumLayout(album.items.length), [album.items.length]);
  const visibleItems = album.items.slice(0, layout.cells.length);
  const single = album.items.length === 1 ? album.items[0] : null;

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [manuallyLoaded, setManuallyLoaded] = useState<Record<number, boolean>>({});
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const isLoadable = useCallback(
    (item: AlbumItem, index: number) => {
      if (manuallyLoaded[index]) return true;
      const category = item.type === 'video' ? 'video' : 'photo';
      return shouldAutoDownload(category, item.size);
    },
    [manuallyLoaded, shouldAutoDownload]
  );

  const close = useCallback(() => setViewerIndex(null), []);

  const step = useCallback(
    (delta: number) => {
      setViewerIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0) return album.items.length - 1;
        if (next >= album.items.length) return 0;
        return next;
      });
    },
    [album.items.length]
  );

  useEffect(() => {
    if (viewerIndex === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [viewerIndex, close, step]);

  /** Media yuklanganda haqiqiy nisbat aniqlanadi va standart nisbatga tekislanadi */
  const handleNatural = (width: number, height: number) => {
    if (!width || !height) return;
    const raw = width / height;
    setNaturalRatio(snapAspectRatio(raw) || raw);
  };

  const singleRatio = naturalRatio ?? 1;
  const singleMaxHeight = singleRatio < 1 ? MAX_PORTRAIT_HEIGHT : MAX_LANDSCAPE_HEIGHT;
  const singleFrameStyle: React.CSSProperties = {
    aspectRatio: String(singleRatio),
    maxHeight: singleMaxHeight,
    maxWidth: Math.round(singleMaxHeight * singleRatio),
    width: '100%',
  };

  const activeItem = viewerIndex === null ? null : album.items[viewerIndex];

  return (
    <div className={cn('w-full', className)}>
      {single ? (
        /* Yolg'iz media - haqiqiy nisbatdagi ramka, kesilmaydi */
        <button
          type="button"
          onClick={() => {
            if (!isLoadable(single, 0)) {
              setManuallyLoaded((prev) => ({ ...prev, 0: true }));
              return;
            }
            setViewerIndex(0);
          }}
          className="relative block overflow-hidden rounded-2xl bg-muted no-drag"
          style={singleFrameStyle}
          title={single.name || (single.type === 'video' ? 'Video' : 'Rasm')}
        >
          {isLoadable(single, 0) ? (
            single.type === 'video' ? (
              <>
                {single.thumb ? (
                  <img
                    src={single.thumb}
                    alt={single.name || 'Video'}
                    loading="lazy"
                    onLoad={(event) =>
                      handleNatural(
                        event.currentTarget.naturalWidth,
                        event.currentTarget.naturalHeight
                      )
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={single.url}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) =>
                      handleNatural(
                        event.currentTarget.videoWidth,
                        event.currentTarget.videoHeight
                      )
                    }
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                    <Play className="h-6 w-6 translate-x-[1px] text-white" fill="white" />
                  </span>
                </span>
                {single.duration ? (
                  <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {formatAlbumDuration(single.duration)}
                  </span>
                ) : null}
              </>
            ) : (
              <img
                src={single.url}
                alt={single.name || 'Rasm'}
                loading="lazy"
                onLoad={(event) =>
                  handleNatural(
                    event.currentTarget.naturalWidth,
                    event.currentTarget.naturalHeight
                  )
                }
                className="h-full w-full object-cover"
              />
            )
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
              <Download className="h-5 w-5" />
              <span className="text-[11px]">Yuklash</span>
            </span>
          )}
        </button>
      ) : (
        <div
          className="grid gap-[2px] overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            gridAutoRows: layout.columns > 2 ? '80px' : '108px',
            maxWidth: 360,
          }}
        >
          {visibleItems.map((item, index) => {
            const cell = layout.cells[index];
            const loadable = isLoadable(item, index);
            const isLast = index === visibleItems.length - 1;
            const showHidden = isLast && layout.hiddenCount > 0;

            return (
              <button
                key={`${item.url}-${index}`}
                type="button"
                onClick={() => {
                  if (!loadable) {
                    setManuallyLoaded((prev) => ({ ...prev, [index]: true }));
                    return;
                  }
                  setViewerIndex(index);
                }}
                className="relative overflow-hidden bg-muted no-drag"
                style={{
                  gridColumn: `span ${cell.colSpan} / span ${cell.colSpan}`,
                  gridRow: `span ${cell.rowSpan} / span ${cell.rowSpan}`,
                }}
                title={item.name || (item.type === 'video' ? 'Video' : 'Rasm')}
              >
                {loadable ? (
                  item.type === 'video' ? (
                    <>
                      {item.thumb ? (
                        <img
                          src={item.thumb}
                          alt={item.name || 'Video'}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55">
                          <Play className="h-4 w-4 translate-x-[1px] text-white" fill="white" />
                        </span>
                      </span>
                      {item.duration ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {formatAlbumDuration(item.duration)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.name || 'Rasm'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                    <Download className="h-4 w-4" />
                    <span className="text-[10px]">Yuklash</span>
                  </span>
                )}

                {showHidden && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                    +{layout.hiddenCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {album.caption && (
        <div
          className={cn(
            'mt-1.5 text-[15px] leading-snug',
            isMine ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          <FormattedText text={album.caption} emojiSize={20} />
        </div>
      )}

      {/* To'liq ekranli ko'rish */}
      {activeItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </button>

          <a
            href={activeItem.url}
            download
            onClick={(event) => event.stopPropagation()}
            className="absolute right-16 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Yuklab olish"
          >
            <Download className="h-5 w-5" />
          </a>

          <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
            {(viewerIndex ?? 0) + 1} / {album.items.length}
          </span>

          {album.items.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Oldingi"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Keyingi"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div
            className="max-h-[88vh] max-w-[94vw]"
            onClick={(event) => event.stopPropagation()}
          >
            {activeItem.type === 'video' ? (
              <video
                src={activeItem.url}
                controls
                autoPlay
                playsInline
                className="max-h-[88vh] max-w-[94vw] rounded-lg"
              />
            ) : (
              <img
                src={activeItem.url}
                alt={activeItem.name || 'Rasm'}
                className="max-h-[88vh] max-w-[94vw] rounded-lg object-contain"
              />
            )}
          </div>

          {album.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-10 text-center text-sm text-white">
              <FormattedText text={album.caption} emojiSize={18} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MediaAlbum;
