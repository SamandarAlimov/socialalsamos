import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatWallpaperEditor } from '@/components/settings/ChatWallpaperEditor';
import { ChatAccentEditor } from '@/components/settings/ChatAccentEditor';

/** Sozlamalar > Chat foni sahifasi */
export default function ChatWallpaperPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-2xl pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-base font-semibold text-foreground">Chat ko'rinishi</h1>
          <p className="text-xs text-muted-foreground">
            Xabar rangini va chat fonini moslang
          </p>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <ChatAccentEditor />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Chat foni</h2>
          <ChatWallpaperEditor />
        </div>
      </div>
    </div>
  );
}
