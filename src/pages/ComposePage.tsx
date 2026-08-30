import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  ShieldCheck,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostComposer } from '@/components/create/PostComposer';
import { StoryComposer } from '@/components/create/StoryComposer';

type CreateMode = 'post' | 'story';

const MODE_META: Record<
  CreateMode,
  {
    title: string;
    subtitle: string;
    sectionTitle: string;
    sectionDescription: string;
    icon: typeof FileText;
  }
> = {
  post: {
    title: 'Post Studio',
    subtitle: 'Matn, media, poll, joylashuv, musiqa va hammuallif — bitta oqimda',
    sectionTitle: 'Yangi post',
    sectionDescription: 'Desktopda keng workbench, mobileda ixcham composer.',
    icon: FileText,
  },
  story: {
    title: 'Story Studio',
    subtitle: '9:16 media, camera va interaktiv stikerlar — xavfsiz draft oqimida',
    sectionTitle: 'Yangi Story',
    sectionDescription: '9:16 canvas, media editor va interaktiv sticker workflow.',
    icon: UserCircle2,
  },
};

const MODES = [
  { id: 'post' as const, label: 'Post', icon: FileText },
  { id: 'story' as const, label: 'Story', icon: UserCircle2 },
];

/**
 * Canonical web Create workbench.
 *
 * Product contract Flutter bilan bir xil, lekin web UI desktop imkoniyatlaridan
 * to'liq foydalanadi. Fake mode yoki action ko'rsatilmaydi.
 */
export default function ComposePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const [mode, setMode] = useState<CreateMode>(
    requestedMode === 'story' ? 'story' : 'post',
  );

  useEffect(() => {
    const next = searchParams.get('mode');
    setMode(next === 'story' ? 'story' : 'post');
  }, [searchParams]);

  const meta = MODE_META[mode];

  const selectMode = (next: CreateMode) => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'post') params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <header className="relative z-40 shrink-0 border-b border-border/60 bg-background/88 backdrop-blur-2xl">
        <div className="mx-auto flex h-[68px] w-full max-w-[1500px] items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Orqaga"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {meta.title}
              </h1>
              <span className="hidden items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary sm:inline-flex">
                <Sparkles className="h-3 w-3" />
                Create
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>

          <div className="hidden items-center rounded-2xl border border-border/60 bg-muted/30 p-1 md:flex">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectMode(id)}
                className={cn(
                  'flex h-9 min-w-24 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition',
                  mode === id
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-[11px] text-muted-foreground lg:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Himoyalangan media
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_68%)]"
          aria-hidden="true"
        />

        <div className="relative mx-auto w-full max-w-[1500px] px-0 pb-28 sm:px-5 lg:px-8 lg:py-6">
          <section className="min-w-0 overflow-hidden border-border/60 bg-background sm:rounded-[30px] sm:border sm:shadow-[0_18px_70px_rgba(0,0,0,0.07)]">
            <div className="hidden items-center gap-3 border-b border-border/60 bg-card/60 px-6 py-4 sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <meta.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{meta.sectionTitle}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {meta.sectionDescription}
                </p>
              </div>
            </div>

            {mode === 'post' ? <PostComposer /> : <StoryComposer />}
          </section>
        </div>
      </main>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/50 bg-background/88 p-1.5 shadow-[0_14px_44px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
          {MODES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectMode(id)}
              className={cn(
                'flex h-11 min-w-28 items-center justify-center gap-2 rounded-xl px-4 text-sm transition',
                mode === id
                  ? 'bg-muted font-semibold text-primary shadow-sm'
                  : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
