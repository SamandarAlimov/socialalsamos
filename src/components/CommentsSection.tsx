import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments, Comment } from '@/hooks/useComments';
import { useAutocompleteInput } from '@/hooks/useAutocompleteInput';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { HashtagAutocomplete } from '@/components/HashtagAutocomplete';
import { RichTextContent } from '@/components/RichTextContent';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, MessageCircle, MoreHorizontal, Send, Trash2, Loader2, Sticker } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmojiPicker } from '@/components/EmojiPicker';
import { GifPicker } from '@/components/GifPicker';
import { CommentMediaUpload } from '@/components/CommentMediaUpload';

interface CommentsSectionProps {
  postId: string;
}

export function CommentsSection({ postId }: CommentsSectionProps) {
  const { user } = useAuth();
  const { comments, isLoading, addComment, likeComment, deleteComment } = useComments(postId);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'image' | 'video' | 'gif' } | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const { autocompleteState, handleInputChange, insertAutocomplete, closeAutocomplete } = useAutocompleteInput();
  const { 
    autocompleteState: replyAutocompleteState, 
    handleInputChange: handleReplyInputChange, 
    insertAutocomplete: insertReplyAutocomplete, 
    closeAutocomplete: closeReplyAutocomplete 
  } = useAutocompleteInput();

  const handleMediaSelect = (url: string, type: 'image' | 'video' | 'gif') => {
    setSelectedMedia({ url, type });
  };

  const handleMediaClear = () => {
    setSelectedMedia(null);
  };

  const handleGifSelect = (gifUrl: string) => {
    setSelectedMedia({ url: gifUrl, type: 'gif' });
  };

  const handleAutocompleteSelect = (value: string) => {
    const newValue = insertAutocomplete(newComment, value, commentInputRef);
    setNewComment(newValue);
  };

  const handleReplyAutocompleteSelect = (value: string) => {
    const newValue = insertReplyAutocomplete(replyContent, value, replyInputRef);
    setReplyContent(newValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !selectedMedia) return;
    
    setSubmitting(true);
    // Include media in comment if selected
    const commentContent = selectedMedia 
      ? `${newComment}\n[media:${selectedMedia.type}:${selectedMedia.url}]`
      : newComment;
    await addComment(commentContent);
    setNewComment('');
    setSelectedMedia(null);
    setSubmitting(false);
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    
    setSubmitting(true);
    await addComment(replyContent, parentId);
    setReplyContent('');
    setReplyingTo(null);
    setSubmitting(false);
  };

  const CommentItem = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => (
    <div className={cn("group", depth > 0 && "ml-10 border-l-2 border-border pl-4")}>
      <div className="flex gap-3 py-3">
        <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-border">
          <AvatarImage src={comment.profile?.avatar_url || ''} />
          <AvatarFallback className="text-xs bg-muted">
            {(comment.profile?.display_name || comment.profile?.username || 'U')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">
              {comment.profile?.display_name || comment.profile?.username || 'User'}
            </span>
            {comment.profile?.is_verified && (
              <VerifiedBadge size="xs" />
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            
            {user?.id === comment.user_id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => deleteComment(comment.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          <RichTextContent content={comment.content} className="text-sm mt-1 leading-relaxed" />
          
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => likeComment(comment.id)}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                comment.is_liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", comment.is_liked && "fill-current")} />
              {comment.likes_count > 0 && comment.likes_count}
            </button>
            
            {depth === 0 && (
              <button
                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Reply
              </button>
            )}
          </div>
          
          {/* Reply input */}
          {replyingTo === comment.id && (
            <div className="flex gap-2 mt-3 relative">
              <div className="flex-1 relative">
                <Input
                  ref={replyInputRef}
                  value={replyContent}
                  onChange={(e) => handleReplyInputChange(
                    e.target.value,
                    e.target.selectionStart || 0,
                    setReplyContent
                  )}
                  placeholder="Write a reply... Use @ or #"
                  className="h-9 text-sm w-full"
                  onKeyPress={(e) => e.key === 'Enter' && handleReply(comment.id)}
                />
                {replyAutocompleteState.isActive && replyAutocompleteState.type === 'mention' && (
                  <MentionAutocomplete
                    query={replyAutocompleteState.query}
                    onSelect={handleReplyAutocompleteSelect}
                    onClose={closeReplyAutocomplete}
                    className="bottom-full left-0 mb-1"
                  />
                )}
                {replyAutocompleteState.isActive && replyAutocompleteState.type === 'hashtag' && (
                  <HashtagAutocomplete
                    query={replyAutocompleteState.query}
                    onSelect={handleReplyAutocompleteSelect}
                    onClose={closeReplyAutocomplete}
                    className="bottom-full left-0 mb-1"
                  />
                )}
              </div>
              <Button 
                size="sm" 
                onClick={() => handleReply(comment.id)}
                disabled={!replyContent.trim() || submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-0">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="border-t border-border">
      {/* Add comment form */}
      {user && (
        <form onSubmit={handleSubmit} className="p-3 md:p-4 border-b border-border bg-muted/30">
          <div className="flex gap-2 items-end">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src="" />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 relative">
              <div className="flex items-center gap-1 bg-background rounded-full border border-border px-3 py-1">
                <Input
                  ref={commentInputRef}
                  value={newComment}
                  onChange={(e) => handleInputChange(
                    e.target.value,
                    e.target.selectionStart || 0,
                    setNewComment
                  )}
                  placeholder="Add a comment..."
                  className="border-0 bg-transparent focus-visible:ring-0 px-0 h-8 text-sm"
                />
                
                {/* Media Attachment Buttons */}
                <div className="flex items-center gap-0.5">
                  <EmojiPicker 
                    onSelect={(emoji) => setNewComment(prev => prev + emoji)}
                  />
                  
                  <CommentMediaUpload
                    onMediaSelect={handleMediaSelect}
                    onMediaClear={handleMediaClear}
                    selectedMedia={selectedMedia}
                  />
                  
                  <GifPicker
                    onSelect={handleGifSelect}
                    trigger={
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={!!selectedMedia}
                        title="Add GIF/sticker"
                      >
                        <Sticker className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </div>
              
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
            </div>
            <Button 
              type="submit" 
              size="sm"
              disabled={(!newComment.trim() && !selectedMedia) || submitting}
              className="rounded-full h-8 px-4"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </Button>
          </div>
          
          {/* Selected Media Preview for comments */}
          {selectedMedia && (
            <div className="mt-2 ml-10">
              <div className="relative inline-block">
                {selectedMedia.type === 'video' ? (
                  <video 
                    src={selectedMedia.url} 
                    className="w-24 h-24 rounded-lg object-cover border border-border"
                    controls={false}
                  />
                ) : (
                  <img 
                    src={selectedMedia.url} 
                    alt="Selected media" 
                    className="w-24 h-24 rounded-lg object-cover border border-border"
                  />
                )}
              </div>
            </div>
          )}
        </form>
      )}

      {/* Comments list */}
      <div className="px-3 md:px-4 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No comments yet</p>
            <p className="text-xs mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
