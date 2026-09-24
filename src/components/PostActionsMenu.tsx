import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Pin,
  PinOff,
  Flag,
  Share2,
  Bookmark,
  Eye,
  EyeOff,
  Link,
  Sparkles,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { EditPostDialog } from '@/components/EditPostDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { cn } from '@/lib/utils';
import {
  announceContentHideChange,
  hideContentPost,
} from '@/lib/contentHides';

interface PostActionsMenuProps {
  postId: string;
  postUserId: string;
  postContent?: string;
  isPinned?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void | Promise<void>;
  onHide?: () => void | Promise<void>;
  isProfileHidden?: boolean;
  onToggleProfileVisibility?: () => void | Promise<void>;
  triggerClassName?: string;
  triggerIconClassName?: string;
  triggerLabel?: string;
}

interface SheetActionRowProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  iconClassName?: string;
}

function SheetActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  disabled = false,
  destructive = false,
  iconClassName,
}: SheetActionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        'border-b border-neutral-200 last:border-b-0 hover:bg-neutral-50 active:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900 dark:active:bg-neutral-800',
        'disabled:pointer-events-none disabled:opacity-50',
        destructive && 'text-destructive',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-800',
          destructive && 'bg-red-50 ring-red-100 dark:bg-red-950/40 dark:ring-red-900/60',
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] text-neutral-950 dark:text-white',
            destructive && 'text-destructive',
            iconClassName,
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  iconClassName?: string;
}

function QuickAction({ icon: Icon, label, onClick, active = false, iconClassName }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-neutral-50 active:bg-neutral-100 dark:hover:bg-neutral-900 dark:active:bg-neutral-800"
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 ring-1 ring-neutral-200 transition-transform group-active:scale-95 dark:bg-neutral-900 dark:ring-neutral-800',
          active && 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950',
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5 text-neutral-950 dark:text-white',
            active && 'fill-current text-current',
            iconClassName,
          )}
        />
      </span>
      <span className="max-w-full truncate text-[11px] font-medium text-neutral-950 dark:text-white">{label}</span>
    </button>
  );
}

export function PostActionsMenu({
  postId,
  postUserId,
  postContent,
  isPinned = false,
  onDelete,
  onEdit,
  onPin,
  isBookmarked = false,
  onToggleBookmark,
  onHide,
  isProfileHidden = false,
  onToggleProfileVisibility,
  triggerClassName,
  triggerIconClassName,
  triggerLabel = 'Post amallari',
}: PostActionsMenuProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const [isUpdatingProfileVisibility, setIsUpdatingProfileVisibility] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked);
  const [localPinned, setLocalPinned] = useState(isPinned);

  useEffect(() => setLocalBookmarked(isBookmarked), [isBookmarked]);
  useEffect(() => setLocalPinned(isPinned), [isPinned]);

  const isOwner = user?.id === postUserId;

  const closeSheetThen = (action: () => void | Promise<void>) => {
    setSheetOpen(false);
    window.setTimeout(() => {
      void action();
    }, 0);
  };

  const handleForwardToAI = () => {
    navigate('/ai', { state: { forwardedPost: { id: postId, content: postContent } } });
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Havola nusxalandi');
    } catch (error) {
      console.error('Copy post link failed:', error);
      toast.error('Havolani nusxalab bo‘lmadi');
    }
  };

  const handleShare = () => {
    setShowShareDialog(true);
  };

  const handleDelete = async () => {
    if (!user) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Post o‘chirildi');
      onDelete?.();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Postni o‘chirib bo‘lmadi');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePin = async () => {
    if (!user) return;
    setIsPinning(true);
    const previous = localPinned;
    const next = !previous;
    setLocalPinned(next);

    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: next })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success(next ? 'Post profilga mahkamlandi' : 'Post profildan bo‘shatildi');
      onPin?.();
    } catch (error) {
      setLocalPinned(previous);
      console.error('Error pinning post:', error);
      toast.error('Mahkamlash holatini o‘zgartirib bo‘lmadi');
    } finally {
      setIsPinning(false);
    }
  };

  const handleToggleProfileVisibility = async () => {
    if (!isOwner || !onToggleProfileVisibility || isUpdatingProfileVisibility) return;
    setIsUpdatingProfileVisibility(true);
    try {
      await onToggleProfileVisibility();
    } catch (error) {
      console.error('Profile post visibility update failed:', error);
    } finally {
      setIsUpdatingProfileVisibility(false);
    }
  };

  const handleReport = () => {
    toast.success('Shikoyat yuborildi', {
      description: 'Post moderatsiya tekshiruviga yuborildi.',
    });
  };

  const handleSavePost = async () => {
    if (!user) {
      toast.error('Postni saqlash uchun tizimga kiring');
      return;
    }

    const previous = localBookmarked;
    const next = !previous;
    setLocalBookmarked(next);

    try {
      if (onToggleBookmark) {
        await onToggleBookmark();
      } else {
        const result = previous
          ? await db
              .from('bookmarks')
              .delete()
              .eq('post_id', postId)
              .eq('user_id', user.id)
          : await db
              .from('bookmarks')
              .insert({ post_id: postId, user_id: user.id });

        if (result.error) throw result.error;
      }

      toast.success(next ? 'Post saqlandi' : 'Saqlanganlardan olib tashlandi');
    } catch (error) {
      setLocalBookmarked(previous);
      console.error('Post save error:', error);
      toast.error('Postni saqlash holatini o‘zgartirib bo‘lmadi');
    }
  };

  const handleHidePost = async () => {
    if (!user) {
      toast.error('Postni yashirish uchun tizimga kiring');
      return;
    }
    if (isOwner || isHiding) return;

    setIsHiding(true);
    try {
      if (onHide) {
        await onHide();
        announceContentHideChange({
          postId,
          userId: user.id,
          hidden: true,
          reason: 'not_interested',
        });
      } else {
        await hideContentPost(postId, user.id, 'not_interested');
      }

      toast.success('Post yashirildi', {
        description: 'Bu post Home va tavsiyalarda qayta ko‘rsatilmaydi.',
      });
    } catch (error) {
      console.error('Hide post error:', error);
      toast.error('Postni yashirib bo‘lmadi');
    } finally {
      setIsHiding(false);
    }
  };

  const baseTriggerClassName =
    'h-8 w-8 text-muted-foreground hover:text-foreground md:h-9 md:w-9';

  return (
    <>
      <div className="lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={triggerLabel}
              className={cn(baseTriggerClassName, triggerClassName)}
            >
              <MoreHorizontal className={cn('h-4 w-4 md:h-5 md:w-5', triggerIconClassName)} />
            </Button>
          </SheetTrigger>

          <SheetContent
            side="bottom"
            hideDefaultClose
            data-post-actions-sheet="true"
            overlayClassName="bg-black/60"
            className={cn(
              'max-h-[86dvh] w-full overflow-hidden rounded-t-[30px] border-x border-t border-neutral-200 bg-white p-0 text-neutral-950 shadow-[0_-18px_56px_rgba(0,0,0,0.24)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-white',
              'sm:left-1/2 sm:right-auto sm:w-[min(560px,calc(100vw-24px))] sm:-translate-x-1/2',
            )}
          >
            <div className="flex justify-center pb-1 pt-2.5">
              <div className="h-1 w-11 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            </div>

            <SheetHeader className="px-5 pb-3 pt-1 text-left">
              <SheetTitle className="text-base font-semibold tracking-tight text-neutral-950 dark:text-white">Post amallari</SheetTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Saqlash, ulashish va post boshqaruvlari</p>
            </SheetHeader>

            <div className="max-h-[calc(86dvh-86px)] overflow-y-auto overscroll-contain px-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
              <div className="grid grid-cols-4 gap-1 pb-3">
                <QuickAction
                  icon={Link}
                  label="Havola"
                  onClick={() => closeSheetThen(handleCopyLink)}
                />
                <QuickAction
                  icon={Share2}
                  label="Ulashish"
                  onClick={() => closeSheetThen(handleShare)}
                />
                <QuickAction
                  icon={Bookmark}
                  label={localBookmarked ? 'Saqlandi' : 'Saqlash'}
                  active={localBookmarked}
                  onClick={() => closeSheetThen(handleSavePost)}
                />
                <QuickAction
                  icon={Sparkles}
                  label="AI ga"
                  iconClassName="text-alsamos-orange"
                  onClick={() => closeSheetThen(handleForwardToAI)}
                />
              </div>

              {isOwner ? (
                <>
                  <div className="overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
                    <SheetActionRow
                      icon={BarChart3}
                      label="Analitika"
                      description="Qamrov, faollik va retention"
                      onClick={() => closeSheetThen(() => navigate(`/post/${postId}/insights`))}
                    />
                    <SheetActionRow
                      icon={Edit}
                      label="Postni tahrirlash"
                      onClick={() => closeSheetThen(() => setShowEditDialog(true))}
                    />
                    <SheetActionRow
                      icon={localPinned ? PinOff : Pin}
                      label={localPinned ? 'Mahkamlashni bekor qilish' : 'Profilga mahkamlash'}
                      disabled={isPinning}
                      onClick={() => closeSheetThen(handlePin)}
                    />
                    {onToggleProfileVisibility ? (
                      <SheetActionRow
                        icon={isProfileHidden ? Eye : EyeOff}
                        label={isProfileHidden ? 'Profilga qaytarish' : 'Profildan yashirish'}
                        description={isProfileHidden ? 'Post profil gridiga qaytadi' : 'Post o‘chirilmaydi, faqat profilingizdan yashiriladi'}
                        disabled={isUpdatingProfileVisibility}
                        onClick={() => closeSheetThen(handleToggleProfileVisibility)}
                      />
                    ) : null}
                  </div>

                  <div className="mt-3 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
                    <SheetActionRow
                      icon={Trash2}
                      label="Postni o‘chirish"
                      description="Bu amalni ortga qaytarib bo‘lmaydi"
                      destructive
                      onClick={() => closeSheetThen(() => setShowDeleteDialog(true))}
                    />
                  </div>
                </>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
                  <SheetActionRow
                    icon={EyeOff}
                    label={isHiding ? 'Yashirilmoqda…' : 'Postni yashirish'}
                    description="Home va tavsiyalarda qayta ko‘rsatilmaydi"
                    disabled={isHiding}
                    onClick={() => closeSheetThen(handleHidePost)}
                  />
                  <SheetActionRow
                    icon={Flag}
                    label="Shikoyat qilish"
                    description="Moderatsiya jamoasiga yuborish"
                    destructive
                    onClick={() => closeSheetThen(handleReport)}
                  />
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden lg:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={triggerLabel}
              className={cn(baseTriggerClassName, triggerClassName)}
            >
              <MoreHorizontal className={cn('h-4 w-4 md:h-5 md:w-5', triggerIconClassName)} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-2xl border border-neutral-200 bg-white p-1.5 text-neutral-950 shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
          >
            {isOwner ? (
              <>
                <DropdownMenuItem onClick={() => navigate(`/post/${postId}/insights`)} className="cursor-pointer rounded-xl py-2.5">
                  <BarChart3 className="mr-2.5 h-4 w-4" />
                  Analitika
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="cursor-pointer rounded-xl py-2.5">
                  <Edit className="mr-2.5 h-4 w-4" />
                  Postni tahrirlash
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePin} disabled={isPinning} className="cursor-pointer rounded-xl py-2.5">
                  {localPinned ? <PinOff className="mr-2.5 h-4 w-4" /> : <Pin className="mr-2.5 h-4 w-4" />}
                  {localPinned ? 'Mahkamlashni bekor qilish' : 'Profilga mahkamlash'}
                </DropdownMenuItem>
                {onToggleProfileVisibility ? (
                  <DropdownMenuItem
                    onClick={() => void handleToggleProfileVisibility()}
                    disabled={isUpdatingProfileVisibility}
                    className="cursor-pointer rounded-xl py-2.5"
                  >
                    {isProfileHidden ? <Eye className="mr-2.5 h-4 w-4" /> : <EyeOff className="mr-2.5 h-4 w-4" />}
                    {isProfileHidden ? 'Profilga qaytarish' : 'Profildan yashirish'}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer rounded-xl py-2.5">
              <Link className="mr-2.5 h-4 w-4" />
              Havolani nusxalash
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare} className="cursor-pointer rounded-xl py-2.5">
              <Share2 className="mr-2.5 h-4 w-4" />
              Postni ulashish
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSavePost} className="cursor-pointer rounded-xl py-2.5">
              <Bookmark className={cn('mr-2.5 h-4 w-4', localBookmarked && 'fill-current')} />
              {localBookmarked ? 'Saqlanganlardan olib tashlash' : 'Saqlash'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleForwardToAI} className="cursor-pointer rounded-xl py-2.5">
              <Sparkles className="mr-2.5 h-4 w-4 text-alsamos-orange" />
              AI ga yuborish
            </DropdownMenuItem>

            {isOwner ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="cursor-pointer rounded-xl py-2.5 text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2.5 h-4 w-4" />
                  Postni o‘chirish
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleHidePost} disabled={isHiding} className="cursor-pointer rounded-xl py-2.5">
                  <EyeOff className="mr-2.5 h-4 w-4" />
                  {isHiding ? 'Yashirilmoqda…' : 'Postni yashirish'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleReport}
                  className="cursor-pointer rounded-xl py-2.5 text-destructive focus:text-destructive"
                >
                  <Flag className="mr-2.5 h-4 w-4" />
                  Shikoyat qilish
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SharePostDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        postId={postId}
        postContent={postContent}
      />

      <EditPostDialog
        postId={postId}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        initialContent={postContent}
        onUpdated={() => onEdit?.()}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Postni o‘chirish</AlertDialogTitle>
            <AlertDialogDescription>
              Post butunlay o‘chiriladi. Bu amalni ortga qaytarib bo‘lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'O‘chirilmoqda…' : 'O‘chirish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
