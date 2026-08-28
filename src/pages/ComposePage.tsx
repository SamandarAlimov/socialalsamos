import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PostComposer } from '@/components/create/PostComposer';

/**
 * Yangi post yaratish sahifasi.
 *
 * Eski `/create` sahifasi hozircha o‘z joyida qoldirildi — yangi oqim
 * sinovdan o‘tgach, u to‘liq almashtiriladi.
 */
export default function ComposePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
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

      <PostComposer />
    </div>
  );
}
