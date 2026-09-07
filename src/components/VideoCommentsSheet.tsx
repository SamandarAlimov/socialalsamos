import { useEffect, useRef, useState } from 'react';
import { Heart, Image as ImageIcon, MoreHorizontal, Send, Smile, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { HashtagAutocomplete } from '@/components/HashtagAutocomplete';
import { RichTextContent } from '@/components/RichTextContent';
import { EmojiPicker } from '@/components/EmojiPicker';
import { GifPicker } from '@/components/GifPicker';
import { CommentLikesDialog } from '@/components/CommentLikesDialog';
import { useAutocompleteInput } from '@/hooks/useAutocompleteInput';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  likes_count: number;
  user_id: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  is_liked?: boolean;
}

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

const QUICK_REACTIONS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

export function VideoCommentsSheet({ isOpen, onClose, postId, commentsCount }: VideoCommentsSheetProps) {
  const { user, profile } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likesDialogOpen, setLikesDialogOpen] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedCommentLikesCount, setSelectedCommentLikesCount] = useState(0);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { autocompleteState, handleInputChange, insertAutocomplete, closeAutocomplete } = useAutocompleteInput();

  const handleAutocompleteSelect = (value: string) => {
    const valueWithAutocomplete = insertAutocomplete(newComment, value, commentInputRef);
    setNewComment(valueWithAutocomplete);
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewComment((previous) => previous + emoji);
    commentInputRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    setNewComment((previous) => `${previous}[media:gif:${gifUrl}]`);
    commentInputRef.current?.focus();
  };

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id, content, created_at, likes_count, user_id,
          profile:profiles!comments_user_id_fkey (username, display_name, avatar_url)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (user && data?.length) {
        const commentIds = data.map((comment) => comment.id);
        const { data: likesData } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);
        const likedIds = new Set(likesData?.map((like) => like.comment_id) || []);
        setComments(data.map((comment) => ({ ...comment, is_liked: likedIds.has(comment.id) })) as Comment[]);
      } else {
        setComments((data || []) as Comment[]);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && postId) void fetchComments();
  }, [isOpen, postId]);

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    triggerHaptic('medium');

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: user.id, content: newComment.trim() })
        .select(`
          id, content, created_at, likes_count, user_id,
          profile:profiles!comments_user_id_fkey (username, display_name, avatar_url)
        `)
        .single();
      if (error) throw error;
      setComments((previous) => [data as Comment, ...previous]);
      setNewComment('');
      toast.success('Comment added');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) return;
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;
    triggerHaptic('light');

    try {
      if (comment.is_liked) {
        await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id);
        setComments((previous) => previous.map((item) => item.id === commentId
          ? { ...item, is_liked: false, likes_count: Math.max(0, (item.likes_count || 0) - 1) }
          : item));
      } else {
        await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
        setComments((previous) => previous.map((item) => item.id === commentId
          ? { ...item, is_liked: true, likes_count: (item.likes_count || 0) + 1 }
          : item));
      }
    } catch (error) {
      console.error('Error toggling comment like:', error);
    }
  };

  const openLikes = (commentId: string, count: number) => {
    if (!count) return;
    setSelectedCommentId(commentId);
    setSelectedCommentLikesCount(count);
    setLikesDialogOpen(true);
  };

  const displayedCount = Math.max(commentsCount || 0, comments.length);

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} shouldScaleBackground={false}>
        <DrawerContent className="h-[72dvh] max-h-[78dvh] rounded-t-[28px] border-x-0 border-b-0 p-0 shadow-2xl">
          <DrawerHeader className="relative flex-none border-b border-border/70 px-4 pb-3 pt-2 text-center">
            <DrawerTitle className="text-[15px] font-semibold">
              Comments{displayedCount > 0 ? ` · ${displayedCount}` : ''}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-2 top-0 h-9 w-9 rounded-full"
              aria-label="Close comments"
            >
              <X className="h-4 w-4" />
            </Button>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {isLoading ? (
              <div className="space-y-5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3.5 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length ? (
              <div className="space-y-5">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="h-10 w-10 flex-none">
                      <AvatarImage src={comment.profile?.avatar_url || ''} />
                      <AvatarFallback>{comment.profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-semibold">
                          {comment.profile?.username || comment.profile?.display_name || 'user'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <RichTextContent content={comment.content} className="mt-1 text-[14px] leading-snug" />
                      <div className="mt-2 flex items-center gap-4 text-[12px] font-medium text-muted-foreground">
                        <button type="button" className="hover:text-foreground">Reply</button>
                        {(comment.likes_count || 0) > 0 && (
                          <button type="button" onClick={() => openLikes(comment.id, comment.likes_count || 0)} className="hover:text-foreground">
                            {comment.likes_count} {comment.likes_count === 1 ? 'like' : 'likes'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-none items-start gap-1">
                      <button
                        type="button"
                        onClick={() => void handleLikeComment(comment.id)}
                        className="flex min-w-8 flex-col items-center gap-0.5 p-1 text-muted-foreground active:scale-90"
                        aria-label="Like comment"
                      >
                        <Heart className={`h-5 w-5 ${comment.is_liked ? 'fill-red-500 text-red-500' : ''}`} />
                        {(comment.likes_count || 0) > 0 && <span className="text-[10px]">{comment.likes_count}</span>}
                      </button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Comment options">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                <p className="font-semibold">No comments yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Be the first to comment.</p>
              </div>
            )}
          </div>

          <div className="flex-none border-t border-border/70 bg-background/95 pb-[max(env(safe-area-inset-bottom),0.65rem)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-1 overflow-x-auto px-4 py-2 scrollbar-hide" aria-label="Quick reactions">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiSelect(emoji)}
                  disabled={!user}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[22px] transition-transform active:scale-90 disabled:opacity-40"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="relative flex items-center gap-2 px-3 pb-1">
              <Avatar className="h-10 w-10 flex-none">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback>{profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>

              <div className="relative min-w-0 flex-1">
                <Input
                  ref={commentInputRef}
                  value={newComment}
                  onChange={(event) => handleInputChange(
                    event.target.value,
                    event.target.selectionStart || 0,
                    setNewComment,
                  )}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmitComment();
                    }
                  }}
                  placeholder={user ? `Add a comment${profile?.username ? ` for @${profile.username}` : ''}...` : 'Sign in to comment'}
                  disabled={!user}
                  className="h-11 rounded-full border-border/80 bg-muted/30 pl-4 pr-[6.8rem] text-sm"
                />

                {autocompleteState.isActive && autocompleteState.type === 'mention' && (
                  <MentionAutocomplete
                    query={autocompleteState.query}
                    onSelect={handleAutocompleteSelect}
                    onClose={closeAutocomplete}
                    className="bottom-full left-0 mb-2"
                  />
                )}
                {autocompleteState.isActive && autocompleteState.type === 'hashtag' && (
                  <HashtagAutocomplete
                    query={autocompleteState.query}
                    onSelect={handleAutocompleteSelect}
                    onClose={closeAutocomplete}
                    className="bottom-full left-0 mb-2"
                  />
                )}

                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" disabled={!user} aria-label="Emoji">
                        <Smile className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <GifPicker
                    onSelect={handleGifSelect}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-7 rounded-md border px-1.5 text-[10px] font-bold" disabled={!user} aria-label="GIF">
                        GIF
                      </Button>
                    }
                  />
                </div>
              </div>

              <Button
                size="icon"
                onClick={() => void handleSubmitComment()}
                disabled={!user || !newComment.trim() || isSubmitting}
                className="h-10 w-10 flex-none rounded-full"
                aria-label="Send comment"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <div className="sr-only" aria-hidden="true">
              <ImageIcon />
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {selectedCommentId && (
        <CommentLikesDialog
          commentId={selectedCommentId}
          open={likesDialogOpen}
          onOpenChange={setLikesDialogOpen}
          likesCount={selectedCommentLikesCount}
        />
      )}
    </>
  );
}
