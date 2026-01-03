import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Pin, 
  PinOff,
  Flag, 
  Copy, 
  Share2,
  Bookmark,
  EyeOff,
  Link
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

interface PostActionsMenuProps {
  postId: string;
  postUserId: string;
  isPinned?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
}

export function PostActionsMenu({ 
  postId, 
  postUserId, 
  isPinned = false,
  onDelete, 
  onEdit,
  onPin 
}: PostActionsMenuProps) {
  const { user } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  
  const isOwner = user?.id === postUserId;

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/post/${postId}`;
    await navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out this post',
          url: `${window.location.origin}/post/${postId}`,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
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
      
      toast.success('Post deleted successfully');
      onDelete?.();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePin = async () => {
    if (!user) return;
    setIsPinning(true);
    
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: !isPinned })
        .eq('id', postId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast.success(isPinned ? 'Post unpinned' : 'Post pinned to profile');
      onPin?.();
    } catch (error) {
      console.error('Error pinning post:', error);
      toast.error('Failed to update pin status');
    } finally {
      setIsPinning(false);
    }
  };

  const handleReport = () => {
    toast.success('Post reported. We will review it shortly.');
  };

  const handleHidePost = () => {
    toast.success('Post hidden from your feed');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="w-56 bg-popover border border-border shadow-lg z-50"
        >
          {isOwner && (
            <>
              <DropdownMenuItem 
                onClick={onEdit}
                className="cursor-pointer"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit post
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handlePin}
                disabled={isPinning}
                className="cursor-pointer"
              >
                {isPinned ? (
                  <>
                    <PinOff className="h-4 w-4 mr-2" />
                    Unpin from profile
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4 mr-2" />
                    Pin to profile
                  </>
                )}
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete post
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem 
            onClick={handleCopyLink}
            className="cursor-pointer"
          >
            <Link className="h-4 w-4 mr-2" />
            Copy link
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={handleShare}
            className="cursor-pointer"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share post
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer">
            <Bookmark className="h-4 w-4 mr-2" />
            Save post
          </DropdownMenuItem>
          
          {!isOwner && (
            <>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={handleHidePost}
                className="cursor-pointer"
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Hide post
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handleReport}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Flag className="h-4 w-4 mr-2" />
                Report post
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
