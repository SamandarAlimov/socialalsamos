import { useState, useEffect, useRef } from 'react';
import { X, Camera, CameraOff, Mic, MicOff, SwitchCamera, Users, Clock, Radio, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLiveStreamBroadcast, useLiveStreamComments, useLiveStreamReactions, useLiveStreamViewer } from '@/hooks/useLiveStream';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface LiveStreamBroadcastProps {
  onClose: () => void;
  initialTitle?: string;
}

export function LiveStreamBroadcast({ onClose, initialTitle }: LiveStreamBroadcastProps) {
  const { profile } = useAuth();
  const { stream, isLive, localStream, startBroadcast, endBroadcast } = useLiveStreamBroadcast();
  const { comments } = useLiveStreamComments(stream?.id || null);
  const { reactions } = useLiveStreamReactions(stream?.id || null);
  const { viewerCount } = useLiveStreamViewer(stream?.id || null);
  
  const [title, setTitle] = useState(initialTitle || '');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showComments, setShowComments] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  // Connect video to stream
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Auto-scroll comments
  useEffect(() => {
    if (commentsRef.current) {
      commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
    }
  }, [comments]);

  const handleStartLive = async () => {
    await startBroadcast(title || 'Live Stream');
  };

  const handleEndLive = () => {
    endBroadcast();
    onClose();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const switchCamera = async () => {
    if (!localStream) return;
    
    // Stop current video tracks
    localStream.getVideoTracks().forEach(track => track.stop());
    
    // Get new stream with opposite facing mode
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode, width: 1280, height: 720 },
        audio: false,
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = localStream.getVideoTracks()[0];
      
      // Replace the video track
      localStream.removeTrack(sender);
      localStream.addTrack(newVideoTrack);
      
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error('Error switching camera:', error);
    }
  };

  // Pre-live screen
  if (!isLive) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <button onClick={onClose} className="text-white">
            <X className="h-6 w-6" />
          </button>
          <span className="text-white font-semibold">New Live Video</span>
          <div className="w-6" />
        </div>

        {/* Preview */}
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
          
          {/* Title input */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title for your live video..."
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mb-4"
            />
            
            <Button
              onClick={handleStartLive}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6"
            >
              <Radio className="h-5 w-5 mr-2" />
              Go Live
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Live broadcast screen
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-red-500">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback>
                {profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">
                  {profile?.display_name || profile?.username}
                </span>
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-3 text-white/70 text-xs">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{viewerCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {stream?.started_at && formatDistanceToNow(new Date(stream.started_at))}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <Button
            onClick={handleEndLive}
            variant="destructive"
            size="sm"
            className="bg-red-500 hover:bg-red-600"
          >
            End
          </Button>
        </div>
        
        {title && (
          <p className="text-white text-sm mt-2 truncate">{title}</p>
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
            }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Comments */}
      {showComments && (
        <div className="absolute left-0 right-20 bottom-24 h-60 pointer-events-none">
          <div
            ref={commentsRef}
            className="h-full overflow-y-auto px-4 scrollbar-hide"
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
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center",
            isMuted ? "bg-red-500" : "bg-white/20"
          )}
        >
          {isMuted ? (
            <MicOff className="h-6 w-6 text-white" />
          ) : (
            <Mic className="h-6 w-6 text-white" />
          )}
        </button>
        
        <button
          onClick={toggleCamera}
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center",
            !isCameraOn ? "bg-red-500" : "bg-white/20"
          )}
        >
          {isCameraOn ? (
            <Camera className="h-6 w-6 text-white" />
          ) : (
            <CameraOff className="h-6 w-6 text-white" />
          )}
        </button>
        
        <button
          onClick={switchCamera}
          className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center"
        >
          <SwitchCamera className="h-6 w-6 text-white" />
        </button>
        
        <button
          onClick={() => setShowComments(!showComments)}
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center",
            showComments ? "bg-white/20" : "bg-white/10"
          )}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </button>
      </div>

      {/* Animation styles */}
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
