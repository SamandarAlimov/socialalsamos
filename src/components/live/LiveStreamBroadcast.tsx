import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, CameraOff, Mic, MicOff, SwitchCamera, Users, Clock, Radio, MessageCircle, Loader2, Wifi, Monitor, MonitorOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLiveStreamComments, useLiveStreamReactions, useLiveStreamViewer } from '@/hooks/useLiveStream';
import { useLiveStreamBroadcaster } from '@/hooks/useLiveStreamWebRTC';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface LiveStreamBroadcastProps {
  onClose: () => void;
  initialTitle?: string;
}

interface LiveStream {
  id: string;
  user_id: string;
  title: string | null;
  status: 'live' | 'ended';
  viewer_count: number;
  peak_viewers: number;
  started_at: string;
  ended_at: string | null;
}

export function LiveStreamBroadcast({ onClose, initialTitle }: LiveStreamBroadcastProps) {
  const { user, profile } = useAuth();
  
  const [title, setTitle] = useState(initialTitle || '');
  const [isLive, setIsLive] = useState(false);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showComments, setShowComments] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC broadcaster hook
  const { 
    isConnected: isWebRTCConnected, 
    viewerCount: webrtcViewerCount, 
    connect: connectWebRTC, 
    disconnect: disconnectWebRTC,
    error: webrtcError 
  } = useLiveStreamBroadcaster(stream?.id || null);

  const { comments } = useLiveStreamComments(stream?.id || null);
  const { reactions } = useLiveStreamReactions(stream?.id || null);
  const { viewerCount: dbViewerCount } = useLiveStreamViewer(stream?.id || null);
  
  // Use WebRTC viewer count if connected, otherwise DB count
  const viewerCount = isWebRTCConnected ? webrtcViewerCount : dbViewerCount;

  // Initialize camera on mount
  const initializeCamera = useCallback(async () => {
    try {
      setIsInitializing(true);
      
      // Stop any existing stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: true,
      });

      localStreamRef.current = mediaStream;
      
      // Connect to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setIsInitializing(false);
    } catch (error: any) {
      console.error('Error initializing camera:', error);
      toast.error('Failed to access camera: ' + error.message);
      setIsInitializing(false);
    }
  }, [facingMode]);

  // Initialize on mount
  useEffect(() => {
    initializeCamera();
    
    return () => {
      // Cleanup on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Update video element when ref changes
  useEffect(() => {
    if (videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current;
    }
  }, [isLive]);

  // Auto-scroll comments
  useEffect(() => {
    if (commentsRef.current) {
      commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
    }
  }, [comments]);

  // Cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (stream && isLive) {
        // Stop media stream
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Use sendBeacon for reliable cleanup
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${stream.id}`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Prefer': 'return=minimal'
        };
        
        const body = JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() });
        
        // Create a Blob for sendBeacon
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon && navigator.sendBeacon(url, blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stream, isLive]);

  const handleStartLive = async () => {
    if (!user) {
      toast.error('You must be logged in to go live');
      return;
    }

    if (!localStreamRef.current) {
      toast.error('Camera not initialized');
      return;
    }

    setIsStarting(true);

    try {
      // First end any existing live streams
      await supabase
        .from('live_streams')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('status', 'live');

      // Create live stream record
      const { data, error } = await supabase
        .from('live_streams')
        .insert({
          user_id: user.id,
          title: title || 'Live Stream',
          status: 'live',
        })
        .select()
        .single();

      if (error) throw error;

      setStream(data as LiveStream);
      setIsLive(true);

      toast.success('You are now LIVE!');
    } catch (error: any) {
      console.error('Error starting broadcast:', error);
      toast.error(error.message || 'Failed to start broadcast');
    } finally {
      setIsStarting(false);
    }
  };

  // Connect WebRTC when stream is created
  useEffect(() => {
    if (stream && isLive && localStreamRef.current && !isWebRTCConnected) {
      console.log('[Broadcast] Connecting WebRTC for stream:', stream.id);
      connectWebRTC(localStreamRef.current);
    }
  }, [stream, isLive, isWebRTCConnected, connectWebRTC]);

  const handleEndLive = async () => {
    try {
      // Disconnect WebRTC first
      disconnectWebRTC();
      
      // Stop media stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      // Update stream status
      if (stream) {
        await supabase
          .from('live_streams')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('id', stream.id);
      }
      
      // Also ensure all user's streams are ended
      if (user) {
        await supabase
          .from('live_streams')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('status', 'live');
      }

      toast.success('Live ended');
      onClose();
    } catch (error) {
      console.error('Error ending broadcast:', error);
      onClose();
    }
  };

  const handleClose = () => {
    // Stop media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    // If live, end the broadcast
    if (isLive && stream) {
      handleEndLive();
    } else {
      onClose();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Reinitialize with new facing mode
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: newFacingMode, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: true,
      });
      
      localStreamRef.current = newStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      
      // Maintain mute state
      if (isMuted) {
        newStream.getAudioTracks().forEach(track => { track.enabled = false; });
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      toast.error('Failed to switch camera');
    }
  };

  // Toggle screen sharing
  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing, switch back to camera
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }
        
        // Re-enable camera
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode, 
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
          },
          audio: true,
        });
        
        localStreamRef.current = cameraStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
        }
        
        // Re-apply mute state
        if (isMuted) {
          cameraStream.getAudioTracks().forEach(track => { track.enabled = false; });
        }
        
        setIsScreenSharing(false);
        toast.success('Switched back to camera');
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        
        screenStreamRef.current = screenStream;
        
        // Keep audio from camera
        const audioTracks = localStreamRef.current?.getAudioTracks() || [];
        
        // Create combined stream
        const combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...audioTracks,
        ]);
        
        localStreamRef.current = combinedStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = combinedStream;
        }
        
        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
        
        setIsScreenSharing(true);
        toast.success('Screen sharing started');
      }
    } catch (error: any) {
      console.error('Error toggling screen share:', error);
      if (error.name !== 'NotAllowedError') {
        toast.error('Failed to share screen');
      }
    }
  };

  // Pre-live screen
  if (!isLive) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 safe-area-top">
          <button onClick={handleClose} className="text-white">
            <X className="h-6 w-6" />
          </button>
          <span className="text-white font-semibold">New Live Video</span>
          <div className="w-6" />
        </div>

        {/* Preview */}
        <div className="flex-1 relative">
          {isInitializing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
          )}
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
          
          {/* Camera switch button */}
          <button
            onClick={switchCamera}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/20 flex items-center justify-center"
          >
            <SwitchCamera className="h-5 w-5 text-white" />
          </button>
          
          {/* Title input */}
          <div className="absolute bottom-0 left-0 right-0 p-4 safe-area-bottom">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title for your live video..."
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mb-4"
            />
            
            <Button
              onClick={handleStartLive}
              disabled={isStarting || isInitializing}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6"
            >
              {isStarting ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Radio className="h-5 w-5 mr-2" />
              )}
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
      <div className="relative z-10 p-4 safe-area-top">
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
      <div className="absolute bottom-0 left-0 right-0 p-4 safe-area-bottom flex items-center justify-center gap-4">
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
          disabled={isScreenSharing}
        >
          <SwitchCamera className={cn("h-6 w-6 text-white", isScreenSharing && "opacity-50")} />
        </button>
        
        {/* Screen share button */}
        <button
          onClick={toggleScreenShare}
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center",
            isScreenSharing ? "bg-primary" : "bg-white/20"
          )}
        >
          {isScreenSharing ? (
            <MonitorOff className="h-6 w-6 text-white" />
          ) : (
            <Monitor className="h-6 w-6 text-white" />
          )}
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
