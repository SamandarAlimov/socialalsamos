import { useEffect, useState, useRef } from 'react';
import { X, Heart, Send, Users, Radio, Loader2, WifiOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLiveStreamViewer as useLiveStreamViewerDB, useLiveStreamComments, useLiveStreamReactions } from '@/hooks/useLiveStream';
import { useLiveStreamViewer as useLiveStreamViewerWebRTC } from '@/hooks/useLiveStreamWebRTC';
import { useAuth } from '@/contexts/AuthContext';

interface LiveStreamViewerProps {
  streamId: string;
  onClose: () => void;
}

const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '😂', '😮'];

export function LiveStreamViewer({ streamId, onClose }: LiveStreamViewerProps) {
  const { user } = useAuth();
  const { stream, viewerCount: dbViewerCount, joinStream, leaveStream } = useLiveStreamViewerDB(streamId);
  const { comments, sendComment } = useLiveStreamComments(streamId);
  const { reactions, sendReaction } = useLiveStreamReactions(streamId);
  
  // WebRTC connection
  const { 
    remoteStream, 
    isConnected, 
    isConnecting, 
    error: webrtcError,
    connect: connectWebRTC, 
    disconnect: disconnectWebRTC 
  } = useLiveStreamViewerWebRTC(streamId);
  
  const [commentText, setCommentText] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [realtimeViewerCount, setRealtimeViewerCount] = useState(dbViewerCount);
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  // Subscribe to realtime viewer count updates
  useEffect(() => {
    if (!streamId) return;

    const channel = supabase
      .channel(`live-stream-viewers-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_stream_viewers',
          filter: `stream_id=eq.${streamId}`,
        },
        async () => {
          // Fetch current viewer count
          const { count } = await supabase
            .from('live_stream_viewers')
            .select('*', { count: 'exact', head: true })
            .eq('stream_id', streamId)
            .is('left_at', null);
          
          if (count !== null) {
            setRealtimeViewerCount(count);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  // Update realtime viewer count when db count changes
  useEffect(() => {
    setRealtimeViewerCount(dbViewerCount);
  }, [dbViewerCount]);

  // Join stream on mount
  useEffect(() => {
    joinStream();
    return () => {
      leaveStream();
      disconnectWebRTC();
    };
  }, []);

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    sendComment(commentText);
    setCommentText('');
  };

  const handleReaction = (emoji: string) => {
    sendReaction(emoji);
    setShowReactions(false);
  };

  if (!stream) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-white mx-auto mb-4" />
          <p className="text-white">Loading stream...</p>
        </div>
      </div>
    );
  }

  if (stream.status === 'ended') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <Radio className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-2">Live has ended</h2>
          <p className="text-muted-foreground mb-4">This broadcast has ended</p>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-red-500">
              <AvatarImage src={stream.profile?.avatar_url || ''} />
              <AvatarFallback>
                {stream.profile?.display_name?.[0] || stream.profile?.username?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">
                  {stream.profile?.display_name || stream.profile?.username}
                </span>
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                  LIVE
                </span>
                {isConnected && (
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-medium px-1.5 py-0.5 rounded">
                    HD
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-white/70 text-xs">
                <Users className="h-3 w-3" />
              <span>{realtimeViewerCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-black/40 flex items-center justify-center text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {stream.title && (
          <p className="text-white text-sm mt-2">{stream.title}</p>
        )}
      </div>

      {/* Video Stream */}
      <div className="flex-1 relative bg-black">
        {isConnected && remoteStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : isConnecting ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-pink-900/50">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white/80 text-sm">Connecting to stream...</p>
            </div>
          </div>
        ) : webrtcError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-900/30 to-orange-900/30">
            <div className="text-center">
              <WifiOff className="h-12 w-12 text-white/50 mx-auto mb-4" />
              <p className="text-white/80 text-sm mb-2">Connection issue</p>
              <p className="text-white/50 text-xs">{webrtcError}</p>
              <Button 
                variant="secondary" 
                size="sm" 
                className="mt-4"
                onClick={() => connectWebRTC()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900 to-pink-900">
            <div className="text-center">
              <Radio className="h-20 w-20 text-white/50 mx-auto mb-4 animate-pulse" />
              <p className="text-white/50">Waiting for video...</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating reactions */}
      <div className="absolute right-4 bottom-40 pointer-events-none">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute bottom-0 right-0 text-3xl animate-float-up"
            style={{
              right: `${Math.random() * 40}px`,
              animationDuration: `${2 + Math.random()}s`,
            }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Comments overlay */}
      <div className="absolute left-0 right-0 bottom-20 h-60 pointer-events-none">
        <div className="h-full bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div
          ref={commentsRef}
          className="absolute inset-0 overflow-y-auto px-4 pb-4 pointer-events-auto scrollbar-hide"
        >
          <div className="flex flex-col justify-end min-h-full">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2 mb-2 animate-fade-in">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarImage src={comment.profile?.avatar_url || ''} />
                  <AvatarFallback className="text-[10px]">
                    {comment.profile?.display_name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="bg-black/40 rounded-lg px-2 py-1 max-w-[80%]">
                  <span className="text-white/70 text-xs font-medium">
                    {comment.profile?.display_name || comment.profile?.username}
                  </span>
                  <p className="text-white text-sm">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent safe-area-bottom">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
            />
            <button
              onClick={handleSendComment}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          
          {/* Reaction button */}
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setShowReactions(!showReactions)}
            >
              <Heart className="h-5 w-5" />
            </Button>
            
            {/* Reaction picker */}
            {showReactions && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/80 rounded-full px-2 py-1 flex gap-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="text-2xl hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add animation styles */}
      <style>{`
        @keyframes float-up {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-200px) scale(1.5);
          }
        }
        .animate-float-up {
          animation: float-up 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
