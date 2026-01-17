import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dialog, 
  DialogContent 
} from '@/components/ui/dialog';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CommentsSection } from '@/components/CommentsSection';
import { useRealtimeCounts } from '@/hooks/useRealtimeCounts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { RichTextContent } from '@/components/RichTextContent';

interface PostViewModalProps {
  post: {
    id: string;
    content: string | null;
    media_urls: string[] | null;
    media_type: string | null;
    likes_count: number;
    comments_count: number;
    is_pinned?: boolean;
    is_liked?: boolean;
    created_at: string;
  };
  profile: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLike: () => void;
  isOwnProfile?: boolean;
}

export function PostViewModal({
  post,
  profile,
  open,
  onOpenChange,
  onLike,
  isOwnProfile = false,
}: PostViewModalProps) {
  const navigate = useNavigate();
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  
  // Real-time counts
  const counts = useRealtimeCounts(post.id);

  const mediaUrls = post.media_urls || [];
  const hasMedia = mediaUrls.length > 0;
  const hasMultipleMedia = mediaUrls.length > 1;

  const nextMedia = () => {
    setCurrentMediaIndex(prev => (prev + 1) % mediaUrls.length);
  };

  const prevMedia = () => {
    setCurrentMediaIndex(prev => (prev - 1 + mediaUrls.length) % mediaUrls.length);
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-background max-h-[90vh]">
        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
          {/* Media Section */}
          {hasMedia && (
            <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] md:min-h-[500px]">
              {post.media_type === 'video' ? (
                <video
                  src={mediaUrls[currentMediaIndex]}
                  controls
                  className="max-w-full max-h-full object-contain"
                  playsInline
                />
              ) : (
                <img
                  src={mediaUrls[currentMediaIndex]}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              )}

              {/* Navigation arrows */}
              {hasMultipleMedia && (
                <>
                  <button
                    onClick={prevMedia}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextMedia}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  {/* Media indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                    {mediaUrls.map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          idx === currentMediaIndex ? "bg-white" : "bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Close button */}
              <button
                onClick={() => onOpenChange(false)}
                className="absolute top-2 right-2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 md:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Details Section */}
          <div className={cn(
            "flex flex-col",
            hasMedia ? "md:w-[350px] border-l border-border" : "w-full"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback>
                    {profile.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{profile.display_name || profile.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(post.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="hidden md:flex">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>

            {/* Content with Poll Support */}
            {post.content && (() => {
              const { pollData, cleanContent } = parsePollFromContent(post.content);
              return (
                <>
                  {cleanContent && (
                    <div className="p-4 border-b border-border">
                      <RichTextContent content={cleanContent} className="text-sm" />
                    </div>
                  )}
                  {pollData && (
                    <div className="p-4 border-b border-border">
                      <PollDisplay postId={post.id} pollData={pollData} />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Comments */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[300px] md:max-h-none">
              <CommentsSection postId={post.id} />
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={onLike}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    post.is_liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                  )}
                >
                  <Heart className={cn("h-6 w-6", post.is_liked && 'fill-current')} />
                </button>
                <button 
                  onClick={() => setShowComments(!showComments)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-6 w-6" />
                </button>
                <button className="text-muted-foreground hover:text-foreground">
                  <Share2 className="h-6 w-6" />
                </button>
                <button 
                  onClick={() => setIsBookmarked(!isBookmarked)}
                  className={cn(
                    "ml-auto",
                    isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Bookmark className={cn("h-6 w-6", isBookmarked && 'fill-current')} />
                </button>
              </div>
              <p className="font-semibold text-sm">
                {formatCount(counts.likes_count || post.likes_count)} likes
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
