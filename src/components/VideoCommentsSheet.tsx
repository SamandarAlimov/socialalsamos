import { useState, useEffect, useRef } from 'react';
import { X, Heart, Send, MoreHorizontal, Smile, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { HashtagAutocomplete } from '@/components/HashtagAutocomplete';
import { RichTextContent } from '@/components/RichTextContent';
import { EmojiPicker } from '@/components/EmojiPicker';
import { GifPicker } from '@/components/GifPicker';
import { CommentLikesDialog } from '@/components/CommentLikesDialog';
import { useAutocompleteInput } from '@/hooks/useAutocompleteInput';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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

export function VideoCommentsSheet({ isOpen, onClose, postId, commentsCount }: VideoCommentsSheetProps) {
  const { user } = useAuth();
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
    const newValue = insertAutocomplete(newComment, value, commentInputRef);
    setNewComment(newValue);
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewComment(prev => prev + emoji);
    commentInputRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    const gifContent = `[media:gif:${gifUrl}]`;
    setNewComment(prev => prev + gifContent);
  };

  const openLikesDialog = (commentId: string, likesCount: number) => {
    setSelectedCommentId(commentId);
    setSelectedCommentLikesCount(likesCount);
    setLikesDialogOpen(true);
  };

  useEffect(() => {
    if (isOpen && postId) {
      fetchComments();
    }
  }, [isOpen, postId]);

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
        .limit(50);

      if (error) throw error;

      if (user && data) {
        const commentIds = data.map(c => c.id);
        const { data: likesData } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        const likedCommentIds = new Set(likesData?.map(l => l.comment_id) || []);
        
        setComments(data.map(c => ({
          ...c,
          is_liked: likedCommentIds.has(c.id)
        })) as Comment[]);
      } else {
        setComments((data || []) as Comment[]);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    triggerHaptic('medium');

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: newComment.trim()
        })
        .select(`
          id, content, created_at, likes_count, user_id,
          profile:profiles!comments_user_id_fkey (username, display_name, avatar_url)
        `)
        .single();

      if (error) throw error;

      setComments(prev => [data as Comment, ...prev]);
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
    
    triggerHaptic('light');
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    try {
      if (comment.is_liked) {
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);

        setComments(prev => prev.map(c =>
          c.id === commentId
            ? { ...c, is_liked: false, likes_count: (c.likes_count || 0) - 1 }
            : c
        ));
      } else {
        await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });

        setComments(prev => prev.map(c =>
          c.id === commentId
            ? { ...c, is_liked: true, likes_count: (c.likes_count || 0) + 1 }
            : c
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <DrawerTitle>{commentsCount} Comments</DrawerTitle>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[50vh]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))
            ) : comments.length > 0 ? (
              comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={comment.profile?.avatar_url || ''} />
                    <AvatarFallback>
                      {comment.profile?.username?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {comment.profile?.display_name || comment.profile?.username || 'User'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <RichTextContent content={comment.content} className="text-sm mt-1" />
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleLikeComment(comment.id)}
                      >
                        <Heart
                          className={`h-4 w-4 ${comment.is_liked ? 'fill-red-500 text-red-500' : ''}`}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if ((comment.likes_count || 0) > 0) {
                              openLikesDialog(comment.id, comment.likes_count || 0);
                            }
                          }}
                          className="hover:underline"
                        >
                          {comment.likes_count || 0}
                        </button>
                      </button>
                      <button className="text-xs text-muted-foreground hover:text-foreground">
                        Reply
                      </button>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No comments yet. Be the first!
              </div>
            )}
          </div>

          {/* Comment Input with Emoji and GIF */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              
              <div className="flex-1 relative">
                <Input
                  ref={commentInputRef}
                  value={newComment}
                  onChange={(e) => handleInputChange(
                    e.target.value,
                    e.target.selectionStart || 0,
                    setNewComment
                  )}
                  placeholder={user ? "Add a comment..." : "Sign in to comment"}
                  className="w-full bg-muted/50 border-0 pr-20"
                  disabled={!user}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                  }}
                />
                {autocompleteState.isActive && autocompleteState.type === 'mention' && (
                  <MentionAutocomplete
                    query={autocompleteState.query}
                    onSelect={handleAutocompleteSelect}
                    onClose={closeAutocomplete}
                    className="bottom-full left-0 mb-1"
                  />
                )}
                {autocompleteState.isActive && autocompleteState.type === 'hashtag' && (
                  <HashtagAutocomplete
                    query={autocompleteState.query}
                    onSelect={handleAutocompleteSelect}
                    onClose={closeAutocomplete}
                    className="bottom-full left-0 mb-1"
                  />
                )}
                
                {/* Emoji & GIF buttons inside input */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    trigger={
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!user}>
                        <Smile className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    }
                  />
                  <GifPicker
                    onSelect={handleGifSelect}
                    trigger={
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!user}>
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    }
                  />
                </div>
              </div>
              
              <Button
                size="icon"
                disabled={!user || !newComment.trim() || isSubmitting}
                onClick={handleSubmitComment}
                className="flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Comment Likes Dialog */}
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
