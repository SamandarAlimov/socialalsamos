import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, User, Users } from 'lucide-react';

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

  const handleDelete = async (scope: DeleteScope) => {
    setIsDeleting(true);
    try {
      await onConfirm(scope);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Xabarni o'chirish
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {messagePreview && (
              <span className="mb-3 mt-2 block break-words rounded-xl bg-muted p-3 text-sm text-foreground line-clamp-3">
                “{messagePreview}”
              </span>
            )}
            Xabarni qanday o'chirishni tanlang:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          {/* Faqat o'zim uchun - har doim mavjud */}
          <Button
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-xl py-3"
            onClick={() => handleDelete('for_me')}
            disabled={isDeleting}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-left">
              <span className="block font-medium">Faqat o'zimda o'chirish</span>
              <span className="block text-xs text-muted-foreground">
                Xabar faqat sizning chatingizdan olib tashlanadi
              </span>
            </span>
          </Button>

          {/* Hamma uchun - faqat o'z xabarlari */}
          {isMine && (
            <Button
              variant="destructive"
              className="h-auto w-full justify-start gap-3 rounded-xl py-3"
              onClick={() => handleDelete('for_everyone')}
              disabled={isDeleting}
            >
              <Users className="h-4 w-4" />
              <span className="text-left">
                <span className="block font-medium">Hamma uchun o'chirish</span>
                <span className="block text-xs opacity-90">
                  Xabar barcha suhbat qatnashchilaridan olib tashlanadi
                </span>
              </span>
            </Button>
          )}
        </div>

        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={isDeleting}>Bekor qilish</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
