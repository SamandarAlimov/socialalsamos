import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  FileStack,
  MapPinned,
  Music2,
  ShieldCheck,
  Sparkles,
  Type,
  Users,
} from 'lucide-react';
import { PostComposer } from '@/components/create/PostComposer';

const CAPABILITIES = [
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

/**
 * Canonical production Create shell.
 *
 * Bu sahifada legacy fallback yo‘q. PostComposer markaziy ish maydoni,
 * o‘ng panel esa faqat real ishlayotgan imkoniyatlarni tushuntiradi.
 */
export default function ComposePage() {
  const navigate = useNavigate();

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
              <h1 className="truncate text-base font-semibold sm:text-lg">Post Studio</h1>
              <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary sm:inline-flex">
                Create
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Matn, media, poll, joylashuv, musiqa va hammuallif — bitta oqimda
            </p>
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

        <div className="relative mx-auto grid w-full max-w-7xl gap-6 px-0 pb-10 sm:px-5 lg:grid-cols-[minmax(0,760px)_300px] lg:px-8 lg:py-6">
          <section className="min-w-0">
            <div className="border-border/60 bg-background sm:overflow-hidden sm:rounded-3xl sm:border sm:shadow-sm">
              <div className="hidden border-b border-border/60 px-6 py-4 sm:block">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">Yangi post yarating</h2>
                    <p className="text-xs text-muted-foreground">
                      Kontent va barcha qo‘shimchalarni joylashdan oldin shu yerda boshqaring.
                    </p>
                  </div>
                </div>
              </div>

              <PostComposer />
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-6 overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-sm backdrop-blur">
              <div className="border-b border-border/60 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Post imkoniyatlari
                </p>
                <h2 className="mt-1 text-base font-semibold">Production Creator</h2>
              </div>

              <div className="space-y-1 p-3">
                {CAPABILITIES.map(({ icon: Icon, title, description }) => (
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
                    Friends va private media public URL sifatida saqlanmaydi; access post
                    visibility orqali tekshiriladi.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
