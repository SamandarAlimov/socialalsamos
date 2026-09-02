import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments, type Comment } from '@/hooks/useComments';
import { useAutocompleteInput } from '@/hooks/useAutocompleteInput';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { HashtagAutocomplete } from '@/components/HashtagAutocomplete';
import { RichTextContent } from '@/components/RichTextContent';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Sticker,
  Trash2,
  X,
} from 'lucide-react';
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
  focusCommentId?: string | null;
}

type SelectedMedia = {
  url: string;
  type: 'image' | 'video' | 'gif';
} | null;

function serializeCommentContent(text: string, media: SelectedMedia): string {
  const cleanText = text.trim();
  if (!media) return cleanText;
  const marker = '[media:' + media.type + ':' + media.url + ']';
  return cleanText ? cleanText + '\n' + marker : marker;
}

function commentDisplayName(comment: Comment): string {
  return comment.profile?.display_name || comment.profile?.username || 'User';
}

function CommentAttachmentPreview({
  media,
  onClear,
}: {
  media: NonNullable<SelectedMedia>;
  onClear: () => void;
}) {
  return (
    <div className="relative mt-2 inline-block overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-1.5">
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white shadow-sm backdrop-blur transition hover:bg-black/80"
        aria-label="Biriktirilgan mediani olib tashlash"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {media.type === 'video' ? (
        <video
          src={media.url}
          className="max-h-36 max-w-[220px] rounded-lg object-contain"
          muted
          playsInline
        />
      ) : (
        <img
          src={media.url}
          alt={media.type === 'gif' ? 'GIF' : 'Rasm'}
          className="max-h-36 max-w-[220px] rounded-lg object-contain"
        />
      )}
    </div>
  );
}

export function CommentsSection({
  postId,
  focusCommentId = null,
}: CommentsSectionProps) {
  const { user } = useAuth();
  const { comments, isLoading, addComment, likeComment, deleteComment } =
    useComments(postId);

  const [newComment, setNewComment] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia>(null);

  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyMedia, setReplyMedia] = useState<SelectedMedia>(null);

  const [submittingMode, setSubmittingMode] = useState<
    'comment' | 'reply' | null
  >(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    string | null
  >(null);

  const commentInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const {
    autocompleteState,
    handleInputChange,
    insertAutocomplete,
    closeAutocomplete,
  } = useAutocompleteInput();

  const {
    autocompleteState: replyAutocompleteState,
    handleInputChange: handleReplyInputChange,
    insertAutocomplete: insertReplyAutocomplete,
    closeAutocomplete: closeReplyAutocomplete,
  } = useAutocompleteInput();

  useEffect(() => {
    if (!focusCommentId || isLoading || comments.length === 0) return;

    const timer = window.setTimeout(() => {
      const selector =
        '[data-comment-id="' + CSS.escape(focusCommentId) + '"]';
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCommentId(focusCommentId);
      window.setTimeout(() => setHighlightedCommentId(null), 2600);
    }, 160);

    return () => window.clearTimeout(timer);
  }, [comments, focusCommentId, isLoading]);

  useEffect(() => {
    if (!replyingTo) return;
    requestAnimationFrame(() => replyInputRef.current?.focus());
  }, [replyingTo]);

  const handleAutocompleteSelect = (value: string) => {
    const next = insertAutocomplete(newComment, value, commentInputRef);
    setNewComment(next);
  };

  const handleReplyAutocompleteSelect = (value: string) => {
    const next = insertReplyAutocomplete(
      replyContent,
      value,
      replyInputRef,
    );
    setReplyContent(next);
  };

  const resetReplyComposer = () => {
    setReplyingTo(null);
    setReplyContent('');
    setReplyMedia(null);
    closeReplyAutocomplete();
  };

  const startReply = (comment: Comment) => {
    if (replyingTo?.id === comment.id) {
      resetReplyComposer();
      return;
    }

    setReplyingTo(comment);
    setReplyContent('');
    setReplyMedia(null);
    closeReplyAutocomplete();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!newComment.trim() && !selectedMedia) || submittingMode) return;

    setSubmittingMode('comment');
    const content = serializeCommentContent(newComment, selectedMedia);
    const created = await addComment(content);
    if (created) {
      setNewComment('');
      setSelectedMedia(null);
      closeAutocomplete();
    }
    setSubmittingMode(null);
  };

  const handleReply = async () => {
    if (!replyingTo || (!replyContent.trim() && !replyMedia) || submittingMode) {
      return;
    }

    setSubmittingMode('reply');
    const content = serializeCommentContent(replyContent, replyMedia);
    const created = await addComment(content, replyingTo.id);
    if (created) resetReplyComposer();
    setSubmittingMode(null);
  };

  const ReplyComposer = ({ target }: { target: Comment }) => (
    <div className="mt-3 rounded-2xl border border-border/60 bg-muted/20 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Javob: <span className="font-semibold text-foreground">@{target.profile?.username || commentDisplayName(target)}</span>
        </span>
        <button
          type="button"
          onClick={resetReplyComposer}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Javobni bekor qilish"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1">
            <Input
              ref={replyInputRef}
              value={replyContent}
              onChange={(event) =>
                handleReplyInputChange(
                  event.target.value,
                  event.target.selectionStart || 0,
                  setReplyContent,
                )
              }
              placeholder="Javob yozing… @ yoki # ishlatishingiz mumkin"
              className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleReply();
                }
              }}
            />

            <div className="flex shrink-0 items-center gap-0.5">
              <EmojiPicker
                onSelect={(emoji) =>
                  setReplyContent((previous) => previous + emoji)
                }
              />
              <CommentMediaUpload
                onMediaSelect={(url, type) => setReplyMedia({ url, type })}
                onMediaClear={() => setReplyMedia(null)}
                selectedMedia={replyMedia}
                showSelectedPreview={false}
              />
              <GifPicker
                onSelect={(url) => setReplyMedia({ url, type: 'gif' })}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    disabled={Boolean(replyMedia)}
                    title="GIF/sticker"
                  >
                    <Sticker className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>

          {replyAutocompleteState.isActive &&
            replyAutocompleteState.type === 'mention' && (
              <MentionAutocomplete
                query={replyAutocompleteState.query}
                onSelect={handleReplyAutocompleteSelect}
                onClose={closeReplyAutocomplete}
                className="bottom-full left-0 mb-1"
              />
            )}

          {replyAutocompleteState.isActive &&
            replyAutocompleteState.type === 'hashtag' && (
              <HashtagAutocomplete
                query={replyAutocompleteState.query}
                onSelect={handleReplyAutocompleteSelect}
                onClose={closeReplyAutocomplete}
                className="bottom-full left-0 mb-1"
              />
            )}
        </div>

        <Button
          type="button"
          size="icon"
          onClick={() => void handleReply()}
          disabled={
            (!replyContent.trim() && !replyMedia) ||
            submittingMode === 'reply'
          }
          className="h-9 w-9 shrink-0 rounded-full"
          aria-label="Javob yuborish"
        >
          {submittingMode === 'reply' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {replyMedia && (
        <CommentAttachmentPreview
          media={replyMedia}
          onClear={() => setReplyMedia(null)}
        />
      )}
    </div>
  );

  const CommentItem = ({
    comment,
    depth = 0,
  }: {
    comment: Comment;
    depth?: number;
  }) => {
    // Birinchi ikki daraja vizual ichkariga suriladi. Keyingi reply'lar
    // backendda nested qoladi, lekin UI torayib ketmaydi.
    const indentation =
      depth === 1 ? 'ml-7 pl-3 border-l border-border/70' :
      depth === 2 ? 'ml-4 pl-3 border-l border-border/50' :
      '';

    return (
      <div
        data-comment-id={comment.id}
        className={cn(
          'group rounded-xl transition-[background-color,box-shadow] duration-500',
          indentation,
          highlightedCommentId === comment.id &&
            'bg-muted/80 shadow-[0_0_0_1px_hsl(var(--border))]',
        )}
      >
        <div className="flex gap-3 py-3">
          <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border/80">
            <AvatarImage src={comment.profile?.avatar_url || ''} />
            <AvatarFallback className="bg-muted text-xs">
              {commentDisplayName(comment).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">
                {commentDisplayName(comment)}
              </span>
              {comment.profile?.is_verified && <VerifiedBadge size="xs" />}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                })}
              </span>

              {user?.id === comment.user_id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => deleteComment(comment.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      O‘chirish
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <RichTextContent
              content={comment.content}
              className="mt-1 text-sm leading-relaxed"
            />

            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() => likeComment(comment.id)}
                className={cn(
                  'flex items-center gap-1 text-xs transition-colors',
                  comment.is_liked
                    ? 'text-red-500'
                    : 'text-muted-foreground hover:text-red-500',
                )}
              >
                <Heart
                  className={cn(
                    'h-3.5 w-3.5',
                    comment.is_liked && 'fill-current',
                  )}
                />
                {comment.likes_count > 0 && comment.likes_count}
              </button>

              {user && (
                <button
                  type="button"
                  onClick={() => startReply(comment)}
                  className={cn(
                    'flex items-center gap-1 text-xs transition-colors',
                    replyingTo?.id === comment.id
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Javob
                </button>
              )}
            </div>

            {replyingTo?.id === comment.id && (
              <ReplyComposer target={comment} />
            )}
          </div>
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-0">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border-t border-border">
      {user && (
        <form
          onSubmit={handleSubmit}
          className="border-b border-border bg-muted/20 p-3 md:p-4"
        >
          <div className="flex items-end gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src="" />
              <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1">
                <Input
                  ref={commentInputRef}
                  value={newComment}
                  onChange={(event) =>
                    handleInputChange(
                      event.target.value,
                      event.target.selectionStart || 0,
                      setNewComment,
                    )
                  }
                  placeholder="Izoh qoldiring…"
                  className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
                />

                <div className="flex shrink-0 items-center gap-0.5">
                  <EmojiPicker
                    onSelect={(emoji) =>
                      setNewComment((previous) => previous + emoji)
                    }
                  />
                  <CommentMediaUpload
                    onMediaSelect={(url, type) =>
                      setSelectedMedia({ url, type })
                    }
                    onMediaClear={() => setSelectedMedia(null)}
                    selectedMedia={selectedMedia}
                    showSelectedPreview={false}
                  />
                  <GifPicker
                    onSelect={(url) =>
                      setSelectedMedia({ url, type: 'gif' })
                    }
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={Boolean(selectedMedia)}
                        title="GIF/sticker"
                      >
                        <Sticker className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </div>

              {autocompleteState.isActive &&
                autocompleteState.type === 'mention' && (
                  <MentionAutocomplete
                    query={autocompleteState.query}
                    onSelect={handleAutocompleteSelect}
                    onClose={closeAutocomplete}
                    className="bottom-full left-0 mb-1"
                  />
                )}

              {autocompleteState.isActive &&
                autocompleteState.type === 'hashtag' && (
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
              disabled={
                (!newComment.trim() && !selectedMedia) ||
                submittingMode === 'comment'
              }
              className="h-9 rounded-full px-4"
            >
              {submittingMode === 'comment' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Yuborish'
              )}
            </Button>
          </div>

          {selectedMedia && (
            <div className="ml-10">
              <CommentAttachmentPreview
                media={selectedMedia}
                onClear={() => setSelectedMedia(null)}
              />
            </div>
          )}
        </form>
      )}

      <div className="max-h-[min(48vh,560px)] overflow-y-auto px-3 md:px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Hali izoh yo‘q</p>
            <p className="mt-1 text-xs">Birinchi bo‘lib fikr bildiring.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
