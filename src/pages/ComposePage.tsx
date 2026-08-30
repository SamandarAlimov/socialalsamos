import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PostComposer } from '@/components/create/PostComposer';

/**
 * Create uchun production modular shell.
 *
 * Eski monolit CreatePage route'dan uzildi. Story/Reel keyingi bosqichlarda
 * shu shell ustiga alohida composer sifatida qo‘shiladi.
 */
export default function ComposePage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background">
      <header className="z-30 flex shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Orqaga"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Yangi post</h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <PostComposer />
      </main>
    </div>
  );
}
