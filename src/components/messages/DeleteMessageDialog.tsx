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
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete Message
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {messagePreview && (
              <div className="mt-2 mb-4 p-3 bg-muted rounded-lg text-sm text-foreground line-clamp-3">
                "{messagePreview}"
              </div>
            )}
            Choose how you want to delete this message:
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex flex-col gap-2">
          {/* Delete for me - always available */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => handleDelete('for_me')}
            disabled={isDeleting}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="text-left">
              <div className="font-medium">Delete for me</div>
              <div className="text-xs text-muted-foreground">
                This message will be removed from your chat only
              </div>
            </div>
          </Button>
          
          {/* Delete for everyone - only for own messages */}
          {isMine && (
            <Button
              variant="destructive"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={() => handleDelete('for_everyone')}
              disabled={isDeleting}
            >
              <Users className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium">Delete for everyone</div>
                <div className="text-xs opacity-90">
                  This message will be removed for all participants
                </div>
              </div>
            </Button>
          )}
        </div>
        
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}