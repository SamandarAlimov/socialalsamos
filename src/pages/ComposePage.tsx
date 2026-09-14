import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, FileText, Radio, UserCircle2, Video, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useCameraFilterRail } from '@/hooks/useCameraFilterRail';
import { PostComposer } from '@/components/create/PostComposer';
import { StoryComposer } from '@/components/create/StoryComposer';
import { ReelComposer } from '@/components/create/ReelComposer';
import { CameraVideoRecorder } from '@/components/create/CameraVideoRecorder';
import { LiveStreamBroadcast } from '@/components/live/LiveStreamBroadcast';
import '@/styles/create-instagram.css';
import '@/styles/create-instagram-fixes.css';

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
  const [storyLocalDraftActive, setStoryLocalDraftActive] = useState(false);
  const [reelDraftActive, setReelDraftActive] = useState(false);
  const [postCameraOpen, setPostCameraOpen] = useState(false);
  const composerMainRef = useRef<HTMLElement>(null);
  const autoCameraModeRef = useRef<CreateMode | null>(null);

  useCameraFilterRail(composerMainRef);

  // Story hidden DB draft va Reelning hozirgi device-audio lifecycle holati
  // navigation vaqtida yo‘qolishi mumkin, shuning uchun ular yakunlanguncha lock.
  const currentModeLocked =
    (mode === 'story' && storyDraftActive) ||
    (mode === 'reel' && reelDraftActive);

  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = useSwipeNavigation({
    ignoreInteractiveTargets: true,
    allowRightSwipe: false,
    allowLeftSwipe: true,
    trackSwipeOffset: false,
  });

  useEffect(() => {
    const nextMode = modeFromParams(searchParams.get('mode'));

    if (currentModeLocked && nextMode !== mode) {
      const params = new URLSearchParams(searchParams);
      params.set('mode', mode);
      setSearchParams(params, { replace: true });
      return;
    }

    if (nextMode !== 'post') setPostCameraOpen(false);
    setMode(nextMode);
  }, [currentModeLocked, mode, searchParams, setSearchParams]);

  // Story/Reel camera is part of the Create stage, not a viewport portal.
  // Recoverable draft bo‘lsa kamera qayta avtomatik ochilmaydi: foydalanuvchi
  // oldingi media/editor holatiga to‘g‘ridan-to‘g‘ri qaytadi.
  useEffect(() => {
    if (mode !== 'story' && mode !== 'reel') {
      autoCameraModeRef.current = null;
      return;
    }

    const hasRecoverableDraft =
      (mode === 'story' && storyLocalDraftActive) ||
      (mode === 'reel' && reelDraftActive);

    if (
      currentModeLocked ||
      hasRecoverableDraft ||
      autoCameraModeRef.current === mode
    ) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const openCameraWhenReady = () => {
      if (cancelled) return;
      const cameraButton = composerMainRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-label="Kamera"]',
      );

      if (cameraButton && !cameraButton.disabled) {
        autoCameraModeRef.current = mode;
        cameraButton.click();
        return;
      }

      attempts += 1;
      if (attempts < 20) {
        frame = window.requestAnimationFrame(openCameraWhenReady);
      }
    };

    frame = window.requestAnimationFrame(openCameraWhenReady);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [
    currentModeLocked,
    mode,
    reelDraftActive,
    storyLocalDraftActive,
  ]);

  // Native touch scrolling already works on the filter rail. Desktop users also
  // expect Instagram-like click/drag behavior, so convert mouse/pen dragging to
  // horizontal scrolling without stealing normal filter clicks.
  useEffect(() => {
    const root = composerMainRef.current;
    if (!root) return;

    let activeRail: HTMLElement | null = null;
    let activePointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragged = false;
    let suppressClickUntil = 0;

    const findRail = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>('.alsamos-camera-filter-scroll')
        : null;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      const rail = findRail(event.target);
      if (!rail) return;

      activeRail = rail;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = rail.scrollLeft;
      dragged = false;
      rail.classList.add('is-dragging');
      try {
        rail.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers can reject capture during synthetic/embedded pointer flows.
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!activeRail || activePointerId !== event.pointerId) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) <= 3 && !dragged) return;

      dragged = true;
      event.preventDefault();
      activeRail.scrollLeft = startScrollLeft - delta;
    };

    const finishDrag = (event: PointerEvent) => {
      if (!activeRail || activePointerId !== event.pointerId) return;
      if (dragged) suppressClickUntil = performance.now() + 220;

      try {
        activeRail.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      activeRail.classList.remove('is-dragging');
      activeRail = null;
      activePointerId = null;
      dragged = false;
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil || !findRail(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = 0;
    };

    root.addEventListener('pointerdown', handlePointerDown);
    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerup', finishDrag);
    root.addEventListener('pointercancel', finishDrag);
    root.addEventListener('click', handleClickCapture, true);

    return () => {
      root.removeEventListener('pointerdown', handlePointerDown);
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerup', finishDrag);
      root.removeEventListener('pointercancel', finishDrag);
      root.removeEventListener('click', handleClickCapture, true);
    };
  }, []);

  const selectMode = (next: CreateMode) => {
    if (currentModeLocked && next !== mode) return;

    if (next !== 'post') setPostCameraOpen(false);
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'post') params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  const closeCreate = () => {
    if (postCameraOpen) {
      setPostCameraOpen(false);
      return;
    }
    if (!currentModeLocked) navigate('/home');
  };

  const handlePostCameraCapture = (file: File) => {
    const input = composerMainRef.current?.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    );
    if (!input) {
      setPostCameraOpen(false);
      return;
    }

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      setPostCameraOpen(false);
    }
  };

  const immersiveMode = mode === 'story' || mode === 'reel';

  return (
    <div
      className={cn(
        'create-page relative flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-background',
        immersiveMode && 'create-page--immersive',
      )}
      data-create-mode={mode}
    >
      <button
        type="button"
        onClick={closeCreate}
        disabled={currentModeLocked}
        title={currentModeLocked ? 'Avval qoralamani yakunlang' : 'Yopish'}
        aria-label="Yopish"
        className="create-page-close absolute left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground shadow-sm backdrop-blur-xl transition hover:bg-muted hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
      >
        <X className="h-5 w-5" />
      </button>

      <main
        ref={composerMainRef}
        className="create-page-main relative min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain [-webkit-overflow-scrolling:touch] lg:overflow-hidden"
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
        <div
          className={cn(
            'create-mode-stage relative min-h-0 mx-auto w-full max-w-6xl pb-8 pt-14 md:pt-3 lg:h-full lg:pb-3',
            immersiveMode && 'create-mode-stage--immersive',
          )}
          data-create-mode={mode}
        >
          {mode === 'post' ? (
            <>
              <PostComposer />
              <button
                type="button"
                onClick={() => setPostCameraOpen(true)}
                aria-label="Kamera"
                title="Kamera"
                className="absolute right-4 top-4 z-20 flex h-11 items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 text-sm font-medium text-foreground shadow-sm backdrop-blur-xl transition hover:bg-muted md:right-5 md:top-5"
              >
                <Camera className="h-5 w-5" />
                <span className="hidden sm:inline">Kamera</span>
              </button>

              {postCameraOpen && (
                <div className="absolute inset-0 z-30 overflow-hidden bg-[#080b10] md:rounded-2xl">
                  <CameraVideoRecorder
                    mode="both"
                    aspectRatio="auto"
                    onCapture={(file) => handlePostCameraCapture(file)}
                    onClose={() => setPostCameraOpen(false)}
                  />
                  <button
                    type="button"
                    onClick={() => setPostCameraOpen(false)}
                    aria-label="Post kamerasini yopish"
                    className="absolute right-3 top-3 z-[95] flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl transition hover:bg-black/60"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}
            </>
          ) : mode === 'story' ? (
            <StoryComposer
              onDraftStateChange={setStoryDraftActive}
              onLocalDraftStateChange={setStoryLocalDraftActive}
            />
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

      <footer className="create-mode-footer relative z-40 shrink-0 border-t border-border/60 bg-background/90 shadow-[0_-10px_30px_-24px_hsl(var(--foreground)/0.35)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 sm:px-5 sm:py-3">
          <nav
            role="tablist"
            aria-label="Yaratish turi"
            className="create-mode-tabs grid w-full grid-cols-4 gap-1 rounded-[22px] border border-border/60 bg-muted/35 p-1.5 shadow-sm sm:max-w-xl"
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
                    'create-mode-tab flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-[17px] px-2 text-xs font-semibold tracking-tight transition sm:min-h-12 sm:gap-2 sm:px-4 sm:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    active
                      ? 'is-active bg-background text-foreground shadow-sm ring-1 ring-border/55'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Icon className="create-mode-tab-icon h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
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
