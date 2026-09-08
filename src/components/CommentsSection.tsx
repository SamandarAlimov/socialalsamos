import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  layout?: 'default' | 'panel';
  appearance?: 'default' | 'immersive';
  quickReactions?: boolean;
  /**
   * Qiymat o'zgarganda asosiy comment composer ko'rinadigan joyga keladi
   * va input fokuslanadi. Post action panelidagi comment tugmasi uchun.
   */
  focusComposerRequest?: number;
}

type SelectedMedia = {
  url: string;
  type: 'image' | 'video' | 'gif';
} | null;

type SavedComposerDraft = {
  text: string;
  media: SelectedMedia;
} | null;

const QUICK_REACTIONS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'] as const;

const IMMERSIVE_COMMENT_VARS = {
  '--background': '0 0% 4%',
  '--foreground': '0 0% 98%',
  '--card': '0 0% 4%',
  '--card-foreground': '0 0% 98%',
  '--popover': '0 0% 7%',
  '--popover-foreground': '0 0% 98%',
  '--muted': '0 0% 12%',
  '--muted-foreground': '0 0% 64%',
  '--border': '0 0% 17%',
  '--input': '0 0% 17%',
} as React.CSSProperties;

function serializeCommentContent(text: string, media: SelectedMedia): string {
  const cleanText = text.trim();
  if (!media) return cleanText;
  const marker = '[media:' + media.type + ':' + media.url + ']';
  return cleanText ? cleanText + '\n' + marker : marker;
}

function commentDisplayName(comment: Comment): string {
  return comment.profile?.display_name || comment.profile?.username || 'User';
}

function commentProfilePath(comment: Comment, currentUserId?: string): string {
  if (currentUserId && comment.user_id === currentUserId) return '/profile';
  const identity = comment.profile?.username || comment.user_id;
  return '/user/' + encodeURIComponent(identity);
}

function CommentAttachmentPreview({
  media,
  onClear,
  immersive = false,
}: {
  media: NonNullable<SelectedMedia>;
  onClear: () => void;
  immersive?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative mt-2 inline-block overflow-hidden rounded-xl border p-1.5',
        immersive
          ? 'border-white/10 bg-white/[0.04]'
          : 'border-border/60 bg-muted/20',
      )}
    >
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-sm backdrop-blur transition hover:bg-black/85"
        aria-label="Biriktirilgan mediani olib tashlash"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {media.type === 'video' ? (
        <video
          src={media.url}
          className="max-h-32 max-w-[220px] rounded-lg object-contain"
          muted
          playsInline
        />
      ) : (
        <img
          src={media.url}
          alt={media.type === 'gif' ? 'GIF' : 'Rasm'}
          className="max-h-32 max-w-[220px] rounded-lg object-contain"
        />
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: Comment;
  depth?: number;
  currentUserId?: string;
  canReply: boolean;
  replyingToId: string | null;
  highlightedCommentId: string | null;
  immersive: boolean;
  onLike: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (comment: Comment) => void;
}

function CommentItem({
  comment,
  depth = 0,
  currentUserId,
  canReply,
  replyingToId,
  highlightedCommentId,
  immersive,
  onLike,
  onDelete,
  onReply,
}: CommentItemProps) {
  const indentation = immersive
    ? depth > 0
      ? 'ml-10'
      : ''
    : depth === 1
      ? 'ml-7 border-l border-border/70 pl-3'
      : depth === 2
        ? 'ml-4 border-l border-border/50 pl-3'
        : '';

  return (
    <div
      data-comment-id={comment.id}
      className={cn(
        'group transition-[background-color,box-shadow] duration-300',
        immersive ? 'rounded-none' : 'rounded-xl',
        indentation,
        highlightedCommentId === comment.id &&
          (immersive
            ? 'bg-white/[0.055]'
            : 'bg-muted/80 shadow-[0_0_0_1px_hsl(var(--border))]'),
      )}
    >
      <div className={cn('flex gap-3', immersive ? 'py-2.5' : 'py-3')}>
        <Link
          to={commentProfilePath(comment, currentUserId)}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={commentDisplayName(comment) + ' profilini ochish'}
        >
          <Avatar className={cn('ring-1 transition-opacity hover:opacity-90', immersive ? 'h-9 w-9 ring-white/10' : 'h-8 w-8 ring-border/80')}>
            <AvatarImage src={comment.profile?.avatar_url || ''} />
            <AvatarFallback className={cn('text-xs', immersive ? 'bg-white/10 text-white/80' : 'bg-muted')}>
              {commentDisplayName(comment).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              to={commentProfilePath(comment, currentUserId)}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'inline-flex min-w-0 items-center gap-1 text-sm font-semibold transition hover:underline',
                immersive ? 'text-white' : 'text-foreground',
              )}
            >
              <span className="truncate">{commentDisplayName(comment)}</span>
              {comment.profile?.is_verified && <VerifiedBadge size="xs" />}
            </Link>

            {comment.profile?.username && (
              <Link
                to={commentProfilePath(comment, currentUserId)}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'max-w-[180px] truncate text-xs transition hover:underline',
                  immersive ? 'text-white/55 hover:text-white/80' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                @{comment.profile.username}
              </Link>
            )}

            <span className={cn('text-xs', immersive ? 'text-white/45' : 'text-muted-foreground')}>
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>

            {currentUserId === comment.user_id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100',
                      immersive && 'text-white/55 hover:bg-white/10 hover:text-white',
                    )}
                    aria-label="Izoh amallari"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onDelete(comment.id)} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    O‘chirish
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <RichTextContent
            content={comment.content}
            className={cn('mt-1 text-sm leading-relaxed', immersive && 'text-white/95')}
          />

          <div className={cn('mt-2 flex items-center', immersive ? 'gap-5' : 'gap-4')}>
            <button
              type="button"
              onClick={() => onLike(comment.id)}
              className={cn(
                'flex items-center gap-1 text-xs transition-colors',
                comment.is_liked
                  ? 'text-red-500'
                  : immersive
                    ? 'text-white/50 hover:text-white'
                    : 'text-muted-foreground hover:text-red-500',
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', comment.is_liked && 'fill-current')} />
              {comment.likes_count > 0 && comment.likes_count}
            </button>

            {canReply && (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className={cn(
                  'flex items-center gap-1 text-xs font-medium transition-colors',
                  replyingToId === comment.id
                    ? immersive
                      ? 'text-white'
                      : 'text-foreground'
                    : immersive
                      ? 'text-white/50 hover:text-white/85'
                      : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Javob
              </button>
            )}
          </div>
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className={cn(immersive ? 'space-y-0' : 'space-y-0')}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              currentUserId={currentUserId}
              canReply={canReply}
              replyingToId={replyingToId}
              highlightedCommentId={highlightedCommentId}
              immersive={immersive}
              onLike={onLike}
              onDelete={onDelete}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentsSection({
  postId,
  focusCommentId = null,
  layout = 'default',
  appearance = 'default',
  quickReactions = false,
  focusComposerRequest = 0,
}: CommentsSectionProps) {
  const { user } = useAuth();
  const { comments, isLoading, addComment, likeComment, deleteComment } = useComments(postId);

  const [newComment, setNewComment] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia>(null);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const savedBaseDraftRef = useRef<SavedComposerDraft>(null);

  const {
    autocompleteState,
    handleInputChange,
    insertAutocomplete,
    closeAutocomplete,
  } = useAutocompleteInput();

  const isPanel = layout === 'panel';
  const immersive = appearance === 'immersive';

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const input = commentInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      if (isPanel) {
        input.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
  }, [isPanel]);

  useEffect(() => {
    if (!focusCommentId || isLoading || comments.length === 0) return;

    const timer = window.setTimeout(() => {
      const selector = '[data-comment-id="' + CSS.escape(focusCommentId) + '"]';
      const element = rootRef.current?.querySelector<HTMLElement>(selector);
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCommentId(focusCommentId);
      window.setTimeout(() => setHighlightedCommentId(null), 2600);
    }, 160);

    return () => window.clearTimeout(timer);
  }, [comments, focusCommentId, isLoading]);

  useEffect(() => {
    if (!focusComposerRequest || !user) return;
    const frame = requestAnimationFrame(() => {
      const input = commentInputRef.current;
      if (!input) return;
      input.scrollIntoView({ behavior: 'smooth', block: isPanel ? 'nearest' : 'center', inline: 'nearest' });
      window.setTimeout(() => input.focus({ preventScroll: true }), 120);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusComposerRequest, isPanel, user]);

  useEffect(() => {
    setReplyingTo(null);
    savedBaseDraftRef.current = null;
    setNewComment('');
    setSelectedMedia(null);
    closeAutocomplete();
  }, [closeAutocomplete, postId]);

  const handleAutocompleteSelect = (value: string) => {
    const next = insertAutocomplete(newComment, value, commentInputRef);
    setNewComment(next);
  };

  const startReply = useCallback((comment: Comment) => {
    if (replyingTo?.id === comment.id) {
      const saved = savedBaseDraftRef.current;
      setReplyingTo(null);
      setNewComment(saved?.text ?? '');
      setSelectedMedia(saved?.media ?? null);
      savedBaseDraftRef.current = null;
      closeAutocomplete();
      focusComposer();
      return;
    }

    if (!replyingTo) {
      savedBaseDraftRef.current = { text: newComment, media: selectedMedia };
    }

    setReplyingTo(comment);
    setNewComment('');
    setSelectedMedia(null);
    closeAutocomplete();
    focusComposer();
  }, [closeAutocomplete, focusComposer, newComment, replyingTo, selectedMedia]);

  const cancelReply = useCallback(() => {
    const saved = savedBaseDraftRef.current;
    setReplyingTo(null);
    setNewComment(saved?.text ?? '');
    setSelectedMedia(saved?.media ?? null);
    savedBaseDraftRef.current = null;
    closeAutocomplete();
    focusComposer();
  }, [closeAutocomplete, focusComposer]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!newComment.trim() && !selectedMedia) || submittingComment) return;

    setSubmittingComment(true);
    const targetReply = replyingTo;
    const content = serializeCommentContent(newComment, selectedMedia);
    const created = await addComment(content, targetReply?.id);

    if (created) {
      closeAutocomplete();
      if (targetReply) {
        const saved = savedBaseDraftRef.current;
        setReplyingTo(null);
        setNewComment(saved?.text ?? '');
        setSelectedMedia(saved?.media ?? null);
        savedBaseDraftRef.current = null;
      } else {
        setNewComment('');
        setSelectedMedia(null);
      }
    }

    setSubmittingComment(false);
  };

  const appendQuickReaction = (reaction: string) => {
    setNewComment((previous) => previous + reaction);
    focusComposer();
  };

  const replyUsername = replyingTo?.profile?.username || (replyingTo ? commentDisplayName(replyingTo) : '');

  return (
    <div
      ref={rootRef}
      data-comments-section="true"
      data-comments-appearance={appearance}
      style={immersive ? IMMERSIVE_COMMENT_VARS : undefined}
      className={cn(
        'border-t border-border',
        isPanel && 'flex h-full min-h-0 flex-col border-t-0',
        isPanel && !immersive && 'bg-background text-foreground',
        isPanel && immersive && 'bg-[#0a0a0b] text-white',
      )}
    >
      {user && (
        <form
          data-comment-composer="true"
          onSubmit={handleSubmit}
          className={cn(
            'border-b border-border bg-muted/20 p-3 md:p-4',
            isPanel && 'order-2 z-30 shrink-0 border-b-0 border-t backdrop-blur-2xl',
            isPanel && !immersive && 'border-border/60 bg-background/95',
            isPanel && immersive && 'sticky bottom-0 border-white/10 bg-[#0a0a0b]/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2',
          )}
        >
          {quickReactions && immersive && (
            <div
              data-comment-quick-reactions="true"
              className="mb-2 flex items-center justify-between gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Tezkor reaksiyalar"
            >
              {QUICK_REACTIONS.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  onClick={() => appendQuickReaction(reaction)}
                  className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-[22px] leading-none transition active:scale-90"
                  aria-label={reaction + ' reaksiyasini qo‘shish'}
                >
                  {reaction}
                </button>
              ))}
            </div>
          )}

          {replyingTo && (
            <div
              className={cn(
                'mb-2 flex items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-xs',
                immersive ? 'bg-white/[0.055] text-white/65' : 'bg-muted/60 text-muted-foreground',
              )}
            >
              <span className="min-w-0 truncate">
                <span className={cn('font-medium', immersive ? 'text-white/80' : 'text-foreground')}>@{replyUsername}</span> ga javob
              </span>
              <button
                type="button"
                onClick={cancelReply}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition',
                  immersive ? 'text-white/55 hover:bg-white/10 hover:text-white' : 'hover:bg-muted hover:text-foreground',
                )}
                aria-label="Javobni bekor qilish"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Avatar className={cn('shrink-0', immersive ? 'h-9 w-9 ring-1 ring-white/10' : 'h-8 w-8')}>
              <AvatarImage src={(user.user_metadata?.avatar_url as string | undefined) || ''} />
              <AvatarFallback className={cn('text-xs', immersive ? 'bg-white/10 text-white/75' : 'bg-muted text-muted-foreground')}>
                {user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="relative min-w-0 flex-1">
              <div
                className={cn(
                  'flex items-center gap-1 rounded-full border px-3 py-1',
                  immersive
                    ? 'min-h-11 border-white/10 bg-white/[0.035] shadow-inner shadow-black/20 focus-within:border-white/25'
                    : 'border-border bg-background',
                )}
              >
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
                  placeholder={replyingTo ? `@${replyUsername} ga javob yozing…` : 'Izoh qoldiring…'}
                  className={cn(
                    'h-8 min-w-0 border-0 bg-transparent px-0 text-sm focus-visible:ring-0',
                    immersive && 'text-white placeholder:text-white/40',
                  )}
                  autoComplete="off"
                  enterKeyHint="send"
                />

                <div className={cn('flex shrink-0 items-center gap-0.5', immersive && '[&_button]:text-white/60 [&_button:hover]:text-white')}>
                  <EmojiPicker onSelect={(emoji) => setNewComment((previous) => previous + emoji)} />
                  <CommentMediaUpload
                    onMediaSelect={(url, type) => setSelectedMedia({ url, type })}
                    onMediaClear={() => setSelectedMedia(null)}
                    selectedMedia={selectedMedia}
                    showSelectedPreview={false}
                  />
                  <GifPicker
                    onSelect={(url) => setSelectedMedia({ url, type: 'gif' })}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7',
                          immersive ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-muted-foreground hover:text-foreground',
                        )}
                        disabled={Boolean(selectedMedia)}
                        title="GIF/sticker"
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
              size="icon"
              disabled={(!newComment.trim() && !selectedMedia) || submittingComment}
              className={cn(
                'h-10 w-10 shrink-0 rounded-full p-0 transition active:scale-95',
                immersive && 'bg-white text-black shadow-sm hover:bg-white/90 disabled:bg-white/10 disabled:text-white/25 disabled:opacity-100',
              )}
              aria-label={replyingTo ? 'Javobni yuborish' : 'Izohni yuborish'}
            >
              {submittingComment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5" />
              )}
            </Button>
          </div>

          {selectedMedia && (
            <div className="ml-11">
              <CommentAttachmentPreview
                media={selectedMedia}
                onClear={() => setSelectedMedia(null)}
                immersive={immersive}
              />
            </div>
          )}
        </form>
      )}

      <div
        data-comment-list="true"
        className={cn(
          'overflow-y-auto px-3 md:px-4',
          isPanel ? 'order-1 min-h-0 flex-1 overscroll-contain' : 'max-h-[min(48vh,560px)]',
          isPanel && !immersive && 'bg-background text-foreground',
          isPanel && immersive && 'bg-[#0a0a0b] px-4 text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className={cn('h-6 w-6 animate-spin', immersive ? 'text-white/40' : 'text-muted-foreground')} />
          </div>
        ) : comments.length === 0 ? (
          <div className={cn('py-10 text-center', immersive ? 'text-white/50' : 'text-muted-foreground')}>
            <MessageCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Hali izoh yo‘q</p>
            <p className="mt-1 text-xs">Birinchi bo‘lib fikr bildiring.</p>
          </div>
        ) : (
          <div className={cn(immersive ? 'divide-y divide-white/[0.04]' : 'divide-y divide-border/40')}>
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={user?.id}
                canReply={Boolean(user)}
                replyingToId={replyingTo?.id || null}
                highlightedCommentId={highlightedCommentId}
                immersive={immersive}
                onLike={likeComment}
                onDelete={deleteComment}
                onReply={startReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
