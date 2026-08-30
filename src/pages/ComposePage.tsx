import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  FileStack,
  FileText,
  MapPinned,
  Music2,
  ShieldCheck,
  Sparkles,
  Type,
  UserCircle2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostComposer } from '@/components/create/PostComposer';
import { StoryComposer } from '@/components/create/StoryComposer';

type CreateMode = 'post' | 'story';

const POST_CAPABILITIES = [
  {
    icon: FileStack,
    title: 'Universal fayllar',
    description: 'Rasm, video, audio, hujjat va arxiv',
  },
  {
    icon: Type,
    title: 'Rich text',
    description: 'Sarlavha, rang, qalin, qiya va ro‘yxatlar',
  },
  {
    icon: BarChart3,
    title: 'Professional poll',
    description: 'Quiz, ko‘p tanlov va muddatli so‘rovnoma',
  },
  {
    icon: MapPinned,
    title: 'Real joylashuv',
    description: 'POI, aniq pin va jonli joylashuv',
  },
  {
    icon: Music2,
    title: 'Musiqa',
    description: 'Katalog va qurilmadan private audio',
  },
  {
    icon: Users,
    title: '10 hammuallif',
    description: 'Invite, accept, decline va boshqarish',
  },
] as const;

const STORY_CAPABILITIES = [
  {
    icon: FileStack,
    title: '9:16 media',
    description: 'Kamera, qurilma yoki drag-and-drop',
  },
  {
    icon: Sparkles,
    title: 'Interaktiv stikerlar',
    description: 'Poll, quiz, savol, slider va countdown',
  },
  {
    icon: MapPinned,
    title: 'Story location',
    description: 'Joylashuv stikeri va normalized position',
  },
  {
    icon: Music2,
    title: 'Story audio',
    description: 'Musiqa stikeri va media metama’lumoti',
  },
  {
    icon: ShieldCheck,
    title: 'Hidden draft',
    description: 'Story tayyor bo‘lmaguncha live emas',
  },
] as const;

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
    sectionTitle: 'Yangi post yarating',
    sectionDescription:
      'Kontent va barcha qo‘shimchalarni joylashdan oldin shu yerda boshqaring.',
    icon: FileText,
  },
  story: {
    title: 'Story Studio',
    subtitle: '9:16 media, camera va interaktiv stikerlar — xavfsiz draft oqimida',
    sectionTitle: 'Yangi Story yarating',
    sectionDescription:
      'Flutter’dagi media-first sahnaga mos 9:16 preview va real sticker lifecycle.',
    icon: UserCircle2,
  },
};

/**
 * Canonical production Create shell.
 *
 * Web va Flutter bir xil interaction modelni kuzatadi:
 * - yuqorida compact title/action,
 * - asosiy media/composer sahnasi,
 * - pastda floating mode switch,
 * - faqat real ishlaydigan mode'lar ko'rsatiladi.
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
  const capabilities = useMemo(
    () => (mode === 'post' ? POST_CAPABILITIES : STORY_CAPABILITIES),
    [mode],
  );

  const selectMode = (next: CreateMode) => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'post') params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <header className="relative z-30 shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Orqaga"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold sm:text-lg">{meta.title}</h1>
              <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary sm:inline-flex">
                Create
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground md:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Private media himoyalangan
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.055] via-primary/[0.02] to-transparent"
          aria-hidden="true"
        />

        <div className="relative mx-auto grid w-full max-w-7xl gap-6 px-0 pb-28 sm:px-5 lg:grid-cols-[minmax(0,820px)_300px] lg:px-8 lg:py-6 lg:pb-28">
          <section className="min-w-0">
            <div className="border-border/60 bg-background sm:overflow-hidden sm:rounded-3xl sm:border sm:shadow-sm">
              <div className="hidden border-b border-border/60 px-6 py-4 sm:block">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <meta.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">{meta.sectionTitle}</h2>
                    <p className="text-xs text-muted-foreground">
                      {meta.sectionDescription}
                    </p>
                  </div>
                </div>
              </div>

              {mode === 'post' ? <PostComposer /> : <StoryComposer />}
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-6 overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-sm backdrop-blur">
              <div className="border-b border-border/60 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {mode === 'post' ? 'Post imkoniyatlari' : 'Story imkoniyatlari'}
                </p>
                <h2 className="mt-1 text-base font-semibold">Cross-platform Creator</h2>
              </div>

              <div className="space-y-1 p-3">
                {capabilities.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="flex gap-3 rounded-2xl px-3 py-3 transition hover:bg-muted/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/60 bg-muted/20 px-5 py-4">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Web va Flutter bir xil Create v1 contract, visibility va lifecycle
                    RPC’lardan foydalanadi.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/50 bg-background/82 p-1.5 shadow-[0_12px_38px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
          {([
            ['post', FileText, 'Post'],
            ['story', UserCircle2, 'Story'],
          ] as const).map(([id, Icon, label]) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectMode(id)}
                className={cn(
                  'flex h-11 min-w-28 items-center justify-center gap-2 rounded-xl px-4 text-sm transition',
                  active
                    ? 'bg-muted font-semibold text-primary shadow-sm'
                    : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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
