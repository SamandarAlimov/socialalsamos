import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatWallpaperEditor } from '@/components/settings/ChatWallpaperEditor';

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
          <h1 className="text-base font-semibold text-foreground">Chat foni</h1>
          <p className="text-xs text-muted-foreground">
            Fonni tanlang yoki o'z rasmingizni yuklang
          </p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <ChatWallpaperEditor />
      </div>
    </div>
  );
}
