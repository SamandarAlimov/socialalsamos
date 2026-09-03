import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';

export type DeleteScope = 'for_me' | 'for_everyone';

interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: DeleteScope) => void;
  messagePreview?: string;
  isMine?: boolean;
}

export function DeleteMessageDialog({
  open,
  onOpenChange,
  onConfirm,
  messagePreview,
  isMine = false,
}: DeleteMessageDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeScope, setActiveScope] = useState<DeleteScope | null>(null);

  const handleDelete = async (scope: DeleteScope) => {
    if (isDeleting) return;
    setActiveScope(scope);
    setIsDeleting(true);
    try {
      await onConfirm(scope);
    } finally {
      setIsDeleting(false);
      setActiveScope(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isDeleting && onOpenChange(next)}>
      <AlertDialogContent className="w-[calc(100vw-28px)] max-w-[420px] gap-0 overflow-hidden rounded-[24px] border-border/70 bg-card p-0 shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:rounded-[26px]">
        <AlertDialogHeader className="space-y-0 px-5 pb-4 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[19px] font-semibold tracking-[-0.01em]">
                Xabarni o'chirish
              </AlertDialogTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Amalni kim uchun qo'llashni tanlang
              </p>
            </div>
          </div>

          {messagePreview && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-muted/45 px-3.5 py-3">
              <p className="line-clamp-3 break-words text-[13px] leading-relaxed text-foreground/80">
                {messagePreview}
              </p>
            </div>
          )}

          <AlertDialogDescription className="sr-only">
            Xabarni faqat o'zingiz uchun yoki barcha suhbat qatnashchilari uchun o'chirishni tanlang.
          </AlertDialogDescription>

          <div className="flex items-center gap-2 rounded-xl bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Bu amal tanlangan doiraga qarab darhol qo'llanadi.</span>
          </div>
        </AlertDialogHeader>

        <div className="space-y-2 px-3 pb-3 sm:px-4">
          <button
            type="button"
            onClick={() => void handleDelete('for_me')}
            disabled={isDeleting}
            className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-3.5 py-3 text-left transition-[background-color,border-color,transform] hover:border-border hover:bg-muted/45 active:scale-[0.995] disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70">
              {isDeleting && activeScope === 'for_me' ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <UserRound className="h-[18px] w-[18px]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-foreground">
                Faqat o'zimda o'chirish
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                Xabar faqat sizning chat tarixingizdan olib tashlanadi
              </span>
            </span>
          </button>

          {isMine && (
            <button
              type="button"
              onClick={() => void handleDelete('for_everyone')}
              disabled={isDeleting}
              className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/[0.055] px-3.5 py-3 text-left transition-[background-color,border-color,transform] hover:border-destructive/30 hover:bg-destructive/[0.085] active:scale-[0.995] disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                {isDeleting && activeScope === 'for_everyone' ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <UsersRound className="h-[18px] w-[18px]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-destructive">
                  Hamma uchun o'chirish
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  Xabar barcha suhbat qatnashchilarining chatidan o'chiriladi
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="border-t border-border/60 bg-muted/20 p-3 sm:px-4">
          <AlertDialogCancel
            disabled={isDeleting}
            className="m-0 h-10 w-full rounded-xl border-border/70 bg-background text-[13px] font-medium hover:bg-muted/60"
          >
            Bekor qilish
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
