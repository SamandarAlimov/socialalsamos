import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface LiveStream {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  status: 'live' | 'ended';
  viewer_count: number;
  peak_viewers: number;
  started_at: string;
  ended_at: string | null;
  thumbnail_url: string | null;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface LiveComment {
  id: string;
  stream_id: string;
  user_id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useLiveStreams() {
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLiveStreams = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select(`
          *,
          profile:profiles!live_streams_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('status', 'live')
        .order('viewer_count', { ascending: false });

      if (error) throw error;
      setLiveStreams((data || []) as LiveStream[]);
    } catch (error) {
      console.error('Error fetching live streams:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStreams();

    // Subscribe to live stream changes
    const channel = supabase
      .channel('live-streams')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_streams',
        },
        () => {
          fetchLiveStreams();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLiveStreams]);

  return { liveStreams, isLoading, refresh: fetchLiveStreams };
}

export function useLiveStreamBroadcast() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check for existing live stream on mount and end any abandoned ones
  useEffect(() => {
    if (!user) return;

    const checkAndCleanupExistingStream = async () => {
      const { data: existingStreams } = await supabase
        .from('live_streams')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'live');

      if (existingStreams && existingStreams.length > 0) {
        // End all existing live streams for this user
        await supabase
          .from('live_streams')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('status', 'live');
      }
    };

    checkAndCleanupExistingStream();
  }, [user]);

  // Cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (stream && isLive) {
        // Stop media stream
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        
        // Update stream status synchronously
        navigator.sendBeacon && navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${stream.id}`,
          JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stream, isLive, localStream]);

  const startBroadcast = useCallback(async (title?: string) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to go live',
        variant: 'destructive',
      });
      return null;
    }

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

      // Get camera and microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
        audio: true,
      });

      setLocalStream(mediaStream);

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

      toast({
        title: 'You are now LIVE!',
        description: 'Share your stream with your followers',
      });

      return data;
    } catch (error: any) {
      console.error('Error starting broadcast:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start broadcast',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast]);

  const endBroadcast = useCallback(async () => {
    try {
      // Stop media stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      // Update stream status - either specific stream or all user's live streams
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

      setStream(null);
      setIsLive(false);

      toast({
        title: 'Live ended',
        description: 'Your broadcast has ended',
      });
    } catch (error) {
      console.error('Error ending broadcast:', error);
    }
  }, [stream, localStream, user, toast]);

  // Connect video element to stream
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return {
    stream,
    isLive,
    localStream,
    videoRef,
    startBroadcast,
    endBroadcast,
  };
}

export function useLiveStreamViewer(streamId: string | null) {
  const { user } = useAuth();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [isJoined, setIsJoined] = useState(false);

  // Fetch stream details
  useEffect(() => {
    if (!streamId) return;

    const fetchStream = async () => {
      const { data, error } = await supabase
        .from('live_streams')
        .select(`
          *,
          profile:profiles!live_streams_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('id', streamId)
        .single();

      if (!error && data) {
        setStream(data as LiveStream);
        setViewerCount(data.viewer_count || 0);
      }
    };

    fetchStream();

    // Subscribe to stream updates
    const channel = supabase
      .channel(`stream-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${streamId}`,
        },
        (payload) => {
          const updated = payload.new as LiveStream;
          setStream(prev => prev ? { ...prev, ...updated } : null);
          setViewerCount(updated.viewer_count || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  // Join/leave stream
  const joinStream = useCallback(async () => {
    if (!streamId || !user || isJoined) return;

    try {
      await supabase
        .from('live_stream_viewers')
        .upsert({
          stream_id: streamId,
          user_id: user.id,
          joined_at: new Date().toISOString(),
        });

      // Increment viewer count
      await supabase
        .from('live_streams')
        .update({
          viewer_count: viewerCount + 1,
          peak_viewers: Math.max(viewerCount + 1, stream?.peak_viewers || 0),
        })
        .eq('id', streamId);

      setIsJoined(true);
    } catch (error) {
      console.error('Error joining stream:', error);
    }
  }, [streamId, user, isJoined, viewerCount, stream]);

  const leaveStream = useCallback(async () => {
    if (!streamId || !user || !isJoined) return;

    try {
      await supabase
        .from('live_stream_viewers')
        .update({ left_at: new Date().toISOString() })
        .eq('stream_id', streamId)
        .eq('user_id', user.id);

      // Decrement viewer count
      await supabase
        .from('live_streams')
        .update({
          viewer_count: Math.max(0, viewerCount - 1),
        })
        .eq('id', streamId);

      setIsJoined(false);
    } catch (error) {
      console.error('Error leaving stream:', error);
    }
  }, [streamId, user, isJoined, viewerCount]);

  return {
    stream,
    viewerCount,
    isJoined,
    joinStream,
    leaveStream,
  };
}

export function useLiveStreamComments(streamId: string | null) {
  const { user } = useAuth();
  const [comments, setComments] = useState<LiveComment[]>([]);

  // Fetch initial comments
  useEffect(() => {
    if (!streamId) return;

    const fetchComments = async () => {
      const { data, error } = await supabase
        .from('live_stream_comments')
        .select(`
          *,
          profile:profiles!live_stream_comments_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setComments(data as LiveComment[]);
      }
    };

    fetchComments();

    // Subscribe to new comments
    const channel = supabase
      .channel(`stream-comments-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        async (payload) => {
          // Fetch comment with profile
          const { data } = await supabase
            .from('live_stream_comments')
            .select(`
              *,
              profile:profiles!live_stream_comments_user_id_fkey (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .eq('id', (payload.new as any).id)
            .single();

          if (data) {
            setComments(prev => [...prev.slice(-49), data as LiveComment]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  const sendComment = useCallback(async (content: string) => {
    if (!streamId || !user || !content.trim()) return;

    try {
      await supabase
        .from('live_stream_comments')
        .insert({
          stream_id: streamId,
          user_id: user.id,
          content: content.trim(),
        });
    } catch (error) {
      console.error('Error sending comment:', error);
    }
  }, [streamId, user]);

  return { comments, sendComment };
}

export function useLiveStreamReactions(streamId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<{ emoji: string; id: string }[]>([]);

  // Subscribe to reactions
  useEffect(() => {
    if (!streamId) return;

    const channel = supabase
      .channel(`stream-reactions-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_reactions',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          const newReaction = payload.new as any;
          setReactions(prev => [...prev, { emoji: newReaction.emoji, id: newReaction.id }]);
          
          // Remove reaction after animation
          setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== newReaction.id));
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  const sendReaction = useCallback(async (emoji: string) => {
    if (!streamId || !user) return;

    try {
      await supabase
        .from('live_stream_reactions')
        .insert({
          stream_id: streamId,
          user_id: user.id,
          emoji,
        });
    } catch (error) {
      console.error('Error sending reaction:', error);
    }
  }, [streamId, user]);

  return { reactions, sendReaction };
}
