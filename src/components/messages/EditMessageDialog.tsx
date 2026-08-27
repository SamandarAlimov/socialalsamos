import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  content: string | null;
}

interface EditMessageDialogProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (messageId: string, newContent: string) => Promise<void>;
}

const MAX_LENGTH = 4096;

export function EditMessageDialog({
  message,
  open,
  onOpenChange,
  onSave,
}: EditMessageDialogProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(message?.content || '');
  }, [message]);

  const trimmed = content.trim();
  const unchanged = trimmed === (message?.content || '').trim();
  const canSave = !saving && trimmed.length > 0 && !unchanged;

  const handleSave = async () => {
    if (!message || !canSave) return;

    setSaving(true);
    try {
      await onSave(message.id, trimmed);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Xabarni tahrirlash
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="Xabar matnini kiriting..."
            className="min-h-[110px] resize-none rounded-xl"
            maxLength={MAX_LENGTH}
            autoFocus
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Saqlash uchun Enter, yangi qator uchun Shift+Enter</span>
            <span className="tabular-nums">
              {content.length}/{MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Bekor qilish
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saqlanmoqda...
              </>
            ) : (
              'Saqlash'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
