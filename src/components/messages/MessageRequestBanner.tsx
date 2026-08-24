import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, Trash2, Ban } from 'lucide-react';
import { useState } from 'react';
import { useMessageSafety } from '@/hooks/useMessageSafety';
import { BlockConfirmDialog } from './BlockConfirmDialog';

interface MessageRequestBannerProps {
  conversationId: string;
  otherUserId?: string;
  otherUserName?: string;
  onResolved?: () => void;
}

export function MessageRequestBanner({ conversationId, otherUserId, otherUserName, onResolved }: MessageRequestBannerProps) {
  const { respondToRequest } = useMessageSafety();
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const decide = async (accept: boolean) => {
    setBusy(true);
    const ok = await respondToRequest(conversationId, accept);
    setBusy(false);
    if (ok) onResolved?.();
  };

  return (
    <>
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col gap-2">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Bu — xabar so'rovi</p>
            <p className="text-xs text-muted-foreground">
              {otherUserName ?? 'Notanish foydalanuvchi'} sizga birinchi marta yozmoqda. Havolalarni bosishdan avval ehtiyot bo'ling. Karta raqami, parol yoki tasdiqlash kodini hech qachon yubormang.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => decide(true)} disabled={busy} className="h-8">
            <Check className="h-3.5 w-3.5 mr-1" /> Qabul qilish
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide(false)} disabled={busy} className="h-8">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> O'chirish
          </Button>
          {otherUserId && (
            <Button size="sm" variant="ghost" onClick={() => setBlockOpen(true)} disabled={busy} className="h-8 text-destructive hover:text-destructive">
              <Ban className="h-3.5 w-3.5 mr-1" /> Bloklash
            </Button>
          )}
        </div>
      </div>
      {otherUserId && (
        <BlockConfirmDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          targetId={otherUserId}
          targetName={otherUserName}
          onDone={onResolved}
        />
      )}
    </>
  );
}
