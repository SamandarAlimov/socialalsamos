import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Radio, UserCircle2, Video } from 'lucide-react';

import { cn } from '@/lib/utils';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<CreateMode>(() =>
    modeFromParams(searchParams.get('mode')),
  );
  const [storyDraftActive, setStoryDraftActive] = useState(false);
  const [reelDraftActive, setReelDraftActive] = useState(false);

  const currentModeLocked =
    (mode === 'story' && storyDraftActive) ||
    (mode === 'reel' && reelDraftActive);

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

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <header className="relative z-40 shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button
            type="button"
            onClick={() => {
              if (!currentModeLocked) navigate(-1);
            }}
            disabled={currentModeLocked}
            title={currentModeLocked ? 'Avval qoralamani yakunlang' : 'Orqaga'}
            aria-label="Orqaga"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
            Create
          </h1>

          <div className="flex h-full items-stretch">
            {MODES.map(({ id, label, icon: Icon }) => {
              const disabled = currentModeLocked && id !== mode;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectMode(id)}
                  disabled={disabled}
                  title={disabled ? 'Avval qoralamani yakunlang' : undefined}
                  className={cn(
                    'relative flex min-w-[58px] items-center justify-center gap-1 px-1.5 text-[11px] font-medium transition sm:min-w-[82px] sm:gap-1.5 sm:px-3 sm:text-xs',
                    mode === id
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Icon className="hidden h-4 w-4 sm:block" />
                  {label}
                  {mode === id && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary sm:inset-x-3" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] lg:overflow-hidden">
        <div className="mx-auto w-full max-w-6xl pb-12 lg:h-full lg:pb-0 lg:py-3">
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
    </div>
  );
}
