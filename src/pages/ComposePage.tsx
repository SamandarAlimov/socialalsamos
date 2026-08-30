import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, UserCircle2, Video } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PostComposer } from '@/components/create/PostComposer';
import { StoryComposer } from '@/components/create/StoryComposer';
import { ReelComposer } from '@/components/create/ReelComposer';

type CreateMode = 'post' | 'story' | 'reel';

const MODES = [
  { id: 'post' as const, label: 'Post', icon: FileText },
  { id: 'story' as const, label: 'Story', icon: UserCircle2 },
  { id: 'reel' as const, label: 'Reel', icon: Video },
];

function modeFromParams(value: string | null): CreateMode {
  if (value === 'story' || value === 'reel') return value;
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
      if (mode === 'post') params.delete('mode');
      else params.set('mode', mode);
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
            Create
          </h1>

          <div className="hidden items-center rounded-2xl border border-border/60 bg-muted/30 p-1 md:flex">
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
                    'flex h-9 min-w-24 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition',
                    mode === id
                      ? 'bg-background text-primary shadow-sm ring-1 ring-border/50'
                      : 'text-muted-foreground hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto w-full max-w-[1500px] pb-28 sm:px-5 lg:px-8 lg:py-5">
          <section className="min-w-0 bg-background sm:overflow-hidden sm:rounded-[30px] sm:border sm:border-border/60 sm:shadow-[0_18px_70px_rgba(0,0,0,0.06)]">
            {mode === 'post' ? (
              <PostComposer />
            ) : mode === 'story' ? (
              <StoryComposer onDraftStateChange={setStoryDraftActive} />
            ) : (
              <ReelComposer onDraftStateChange={setReelDraftActive} />
            )}
          </section>
        </div>
      </main>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/50 bg-background/90 p-1.5 shadow-[0_14px_44px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
          {MODES.map(({ id, icon: Icon, label }) => {
            const disabled = currentModeLocked && id !== mode;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectMode(id)}
                disabled={disabled}
                title={disabled ? 'Avval qoralamani yakunlang' : undefined}
                className={cn(
                  'flex h-11 min-w-[88px] items-center justify-center gap-1.5 rounded-xl px-3 text-sm transition',
                  mode === id
                    ? 'bg-muted font-semibold text-primary shadow-sm'
                    : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
