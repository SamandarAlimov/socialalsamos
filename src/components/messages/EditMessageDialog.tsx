import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, Loader2 } from 'lucide-react';
import { SelectionFormatMenu } from '@/components/chat/SelectionFormatMenu';
import {
  RichComposer,
  RichComposerHandle,
  FormatToolId,
} from '@/components/chat/RichComposer';

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

/**
 * Xabarni tahrirlash oynasi.
 *
 * Telegramdek: matn WYSIWYG ko'rinishda tahrirlanadi va matn TANLANGANDA
 * tanlov ustida suzuvchi formatlash menyusi chiqadi (kompozitordagi bilan bir xil).
 */
export function EditMessageDialog({
  message,
  open,
  onOpenChange,
  onSave,
}: EditMessageDialogProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const composerRef = useRef<RichComposerHandle>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(message?.content || '');
  }, [message]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => composerRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open, message?.id]);

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

  const applyFormat = (tool: FormatToolId) => {
    composerRef.current?.applyFormat(tool);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();

      if (e.shiftKey) {
        if (key === 'x') {
          e.preventDefault();
          applyFormat('strike');
          return;
        }
        if (key === 'm') {
          e.preventDefault();
          applyFormat('mono');
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          applyFormat('spoiler');
          return;
        }
        if (key === 'n') {
          e.preventDefault();
          applyFormat('clear');
          return;
        }
      }

      if (key === 'b') {
        e.preventDefault();
        applyFormat('bold');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        applyFormat('italic');
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        applyFormat('underline');
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        applyFormat('link');
        return;
      }
    }

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
          <div
            ref={composerBoxRef}
            className="rounded-xl border border-input bg-background px-3 py-2"
          >
            <RichComposer
              ref={composerRef}
              value={content}
              onChange={(value) => setContent(value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder="Xabar matnini kiriting..."
              disabled={saving}
              className="min-h-[96px]"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Matnni tanlab formatlang \u00b7 saqlash uchun Enter</span>
            <span className="tabular-nums">
              {content.length}/{MAX_LENGTH}
            </span>
          </div>
        </div>

        {/* Tanlov ustida chiqadigan suzuvchi formatlash menyusi */}
        <SelectionFormatMenu containerRef={composerBoxRef} onApply={applyFormat} />

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
