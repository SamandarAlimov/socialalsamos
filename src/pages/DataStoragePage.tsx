import { Link } from 'react-router-dom';
import { ArrowLeft, HardDrive } from 'lucide-react';
import { MediaAutoDownloadEditor } from '@/components/settings/MediaAutoDownloadEditor';
import { Button } from '@/components/ui/button';

/**
 * "Ma'lumotlar va xotira" sahifasi (Telegramdagi Data and Storage).
 * Media avtomatik yuklab olish, hajm chegaralari va avtomatik o'ynatish.
 */
export default function DataStoragePage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-safe">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          aria-label="Orqaga"
        >
          <Link to="/settings">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-base font-semibold">Ma'lumotlar va xotira</h1>
        </div>
      </header>

      <main className="p-4">
        <MediaAutoDownloadEditor />
      </main>
    </div>
  );
}
