import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useMessageSafety } from '@/hooks/useMessageSafety';

interface BlockConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: string;
  targetName?: string;
  blocked?: boolean;
  onDone?: () => void;
}

export function BlockConfirmDialog({ open, onOpenChange, targetId, targetName, blocked, onDone }: BlockConfirmDialogProps) {
  const { block, unblock } = useMessageSafety();

  const handle = async () => {
    const ok = blocked ? await unblock(targetId) : await block(targetId);
    if (ok) {
      onOpenChange(false);
      onDone?.();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? 'Blokdan chiqarish' : 'Foydalanuvchini bloklash'}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? `${targetName ?? 'Ushbu foydalanuvchi'} yana sizga xabar yubora oladi.`
              : `${targetName ?? 'Ushbu foydalanuvchi'} sizga xabar yubora olmaydi va sizni topa olmaydi. Har ikki tarafdagi obuna ham bekor qilinadi.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction onClick={handle} className={blocked ? '' : 'bg-destructive hover:bg-destructive/90'}>
            {blocked ? 'Blokdan chiqarish' : 'Bloklash'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
