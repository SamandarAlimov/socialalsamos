import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Radio, UserCircle2, Video, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { PostComposer } from '@/components/create/PostComposer';
import { StoryComposer } from '@/components/create/StoryComposer';
import { ReelComposer } from '@/components/create/ReelComposer';
import { LiveStreamBroadcast } from '@/components/live/LiveStreamBroadcast';

type CreateMode = 'post' | 'story' | 'reel' | 'live';

const MODES = [
  { id: 'post' as const, label: 'Post', icon: FileText },
  { id: 'story' as const, label: 'Story', icon: UserCircle2 },
  { id: 'reel' as const, label: 'Reel', icon: Video },
  { id: 'live' as const, label: 'Live', icon: Radio },
];

function modeFromParams(value: string | null): CreateMode {
  if (value === 'story' || value === 'reel' || value === 'live') return value;
  return 'post';
}

export default function ComposePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<CreateMode>(() =>
    modeFromParams(searchParams.get('mode')),
  );
  const [storyDraftActive, setStoryDraftActive] = useState(false);
  const [reelDraftActive, setReelDraftActive] = useState(false);

  const currentModeLocked =
    (mode === 'story' && storyDraftActive) ||
    (mode === 'reel' && reelDraftActive);

  const {
    swipeOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = useSwipeNavigation({
    // Create contains editors/sliders/rails. Their gestures must win over page nav.
    ignoreInteractiveTargets: true,
    // The paired product gesture is deliberately one-way here:
    // Home --swipe right--> Create --swipe left--> Home.
    allowRightSwipe: false,
    allowLeftSwipe: true,
  });

  useEffect(() => {
    const nextMode = modeFromParams(searchParams.get('mode'));

    if (currentModeLocked && nextMode !== mode) {
      const params = new URLSearchParams(searchParams);
      params.set('mode', mode);
      setSearchParams(params, { replace: true });
      return;
    }

    setMode(nextMode);
  }, [currentModeLocked, mode, searchParams, setSearchParams]);

  const selectMode = (next: CreateMode) => {
    if (currentModeLocked && next !== mode) return;

    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'post') params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  const closeCreate = () => {
    if (!currentModeLocked) navigate('/home');
  };

  // Only leftward movement is rendered. A disabled right swipe gets no page
  // translation, so it feels like an edge rather than another hidden route.
  const renderedSwipeOffset = Math.min(0, swipeOffset);

  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      {/*
        Mobile keeps a compact close affordance without rebuilding the old
        header. Desktop/tablet intentionally have no back-arrow chrome.
      */}
      <button
        type="button"
        onClick={closeCreate}
        disabled={currentModeLocked}
        title={currentModeLocked ? 'Avval qoralamani yakunlang' : 'Yopish'}
        aria-label="Yopish"
        className="absolute left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground shadow-sm backdrop-blur-xl transition hover:bg-muted hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
      >
        <X className="h-5 w-5" />
      </button>

      <main
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] lg:overflow-hidden"
        style={
          isMobile && renderedSwipeOffset !== 0
            ? { transform: `translateX(${renderedSwipeOffset}px)` }
            : undefined
        }
        onTouchStart={
          isMobile && !currentModeLocked ? handleTouchStart : undefined
        }
        onTouchMove={
          isMobile && !currentModeLocked ? handleTouchMove : undefined
        }
        onTouchEnd={
          isMobile && !currentModeLocked ? handleTouchEnd : undefined
        }
        onTouchCancel={
          isMobile && !currentModeLocked ? handleTouchCancel : undefined
        }
      >
        <div className="mx-auto w-full max-w-6xl pb-8 pt-14 md:pt-3 lg:h-full lg:pb-3">
          {mode === 'post' ? (
            <PostComposer />
          ) : mode === 'story' ? (
            <StoryComposer onDraftStateChange={setStoryDraftActive} />
          ) : mode === 'reel' ? (
            <ReelComposer onDraftStateChange={setReelDraftActive} />
          ) : (
            <LiveStreamBroadcast
              onClose={() => {
                setMode('post');
                const params = new URLSearchParams(searchParams);
                params.delete('mode');
                setSearchParams(params, { replace: true });
              }}
            />
          )}
        </div>
      </main>

      <footer className="relative z-40 shrink-0 border-t border-border/60 bg-background/90 shadow-[0_-10px_30px_-24px_hsl(var(--foreground)/0.35)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-3 pb-safe pt-2 sm:px-5 sm:py-3">
          <nav
            role="tablist"
            aria-label="Yaratish turi"
            className="grid w-full grid-cols-4 gap-1 rounded-[22px] border border-border/60 bg-muted/35 p-1.5 shadow-sm sm:max-w-xl"
          >
            {MODES.map(({ id, label, icon: Icon }) => {
              const disabled = currentModeLocked && id !== mode;
              const active = mode === id;

              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectMode(id)}
                  disabled={disabled}
                  title={disabled ? 'Avval qoralamani yakunlang' : label}
                  className={cn(
                    'flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-[17px] px-2 text-xs font-semibold tracking-tight transition sm:min-h-12 sm:gap-2 sm:px-4 sm:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/55'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </footer>
    </div>
  );
}
