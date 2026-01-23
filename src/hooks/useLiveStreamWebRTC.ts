import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Free TURN servers for better NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // OpenRelay TURN servers (free)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

interface ViewerConnection {
  pc: RTCPeerConnection;
  viewerId: string;
}

// Hook for broadcaster - uses Supabase Realtime for signaling
export function useLiveStreamBroadcaster(streamId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const viewerConnectionsRef = useRef<Map<string, ViewerConnection>>(new Map());
  const userIdRef = useRef<string | null>(null);

  const createOfferForViewer = useCallback(async (viewerId: string) => {
    if (!localStreamRef.current || !channelRef.current || !streamId) {
      console.log('[Broadcaster] Cannot create offer - missing stream or channel');
      return;
    }

    try {
      console.log(`[Broadcaster] Creating offer for viewer ${viewerId}`);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      
      viewerConnectionsRef.current.set(viewerId, { pc, viewerId });

      // Add local tracks
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[Broadcaster] Adding track: ${track.kind}`);
        pc.addTrack(track, localStreamRef.current!);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          console.log('[Broadcaster] Sending ICE candidate to viewer');
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              candidate: event.candidate.toJSON(),
              targetUserId: viewerId,
              fromUserId: userIdRef.current,
            },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[Broadcaster] ICE state for ${viewerId}:`, pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log(`[Broadcaster] Connection state for ${viewerId}:`, pc.connectionState);
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log(`[Broadcaster] Sending offer to viewer ${viewerId}`);
      channelRef.current.send({
        type: 'broadcast',
        event: 'offer',
        payload: {
          sdp: { type: offer.type, sdp: offer.sdp },
          targetViewerId: viewerId,
          broadcasterId: userIdRef.current,
        },
      });

    } catch (err) {
      console.error('[Broadcaster] Error creating offer:', err);
    }
  }, [streamId]);

  const handleAnswer = useCallback(async (viewerId: string, sdp: RTCSessionDescriptionInit) => {
    const conn = viewerConnectionsRef.current.get(viewerId);
    if (!conn) {
      console.log(`[Broadcaster] No connection found for viewer ${viewerId}`);
      return;
    }

    try {
      console.log(`[Broadcaster] Setting remote description for viewer ${viewerId}`);
      await conn.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error('[Broadcaster] Error handling answer:', err);
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const conn = viewerConnectionsRef.current.get(fromUserId);
    if (!conn) {
      console.log(`[Broadcaster] No connection for ICE from ${fromUserId}`);
      return;
    }

    try {
      await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[Broadcaster] Added ICE candidate from ${fromUserId}`);
    } catch (err) {
      console.error('[Broadcaster] Error adding ICE candidate:', err);
    }
  }, []);

  const connect = useCallback(async (localStream: MediaStream) => {
    if (!streamId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Not authenticated');
        return;
      }

      userIdRef.current = session.user.id;
      localStreamRef.current = localStream;

      console.log('[Broadcaster] Setting up Realtime channel for stream:', streamId);

      // Create Supabase Realtime channel for signaling
      const channel = supabase.channel(`live-stream-${streamId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: session.user.id },
        },
      });

      channelRef.current = channel;

      // Handle presence for viewer count
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const viewers = Object.keys(state).filter(key => key !== session.user.id);
        setViewerCount(viewers.length);
        console.log('[Broadcaster] Presence sync, viewers:', viewers.length);
      });

      channel.on('presence', { event: 'join' }, async ({ key, newPresences }) => {
        if (key !== session.user.id) {
          console.log('[Broadcaster] Viewer joined:', key);
          // Create offer for new viewer
          await createOfferForViewer(key);
        }
      });

      channel.on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== session.user.id) {
          console.log('[Broadcaster] Viewer left:', key);
          // Clean up connection
          const conn = viewerConnectionsRef.current.get(key);
          if (conn) {
            conn.pc.close();
            viewerConnectionsRef.current.delete(key);
          }
        }
      });

      // Handle signaling messages
      channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.targetBroadcasterId === session.user.id) {
          console.log('[Broadcaster] Received answer from viewer:', payload.viewerId);
          await handleAnswer(payload.viewerId, payload.sdp);
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.targetUserId === session.user.id) {
          console.log('[Broadcaster] Received ICE from:', payload.fromUserId);
          await handleIceCandidate(payload.fromUserId, payload.candidate);
        }
      });

      // Subscribe to channel
      channel.subscribe(async (status) => {
        console.log('[Broadcaster] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          // Track presence as broadcaster
          await channel.track({ role: 'broadcaster', joined_at: new Date().toISOString() });
          setIsConnected(true);
          console.log('[Broadcaster] Ready and tracking presence');
        }
      });

    } catch (err: any) {
      console.error('[Broadcaster] Connection error:', err);
      setError(err.message);
    }
  }, [streamId, createOfferForViewer, handleAnswer, handleIceCandidate]);

  const disconnect = useCallback(() => {
    console.log('[Broadcaster] Disconnecting');
    
    // Close all viewer connections
    viewerConnectionsRef.current.forEach(({ pc }) => {
      pc.close();
    });
    viewerConnectionsRef.current.clear();

    // Notify viewers and unsubscribe
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'stream-ended',
        payload: { broadcasterId: userIdRef.current },
      });
      supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;

    setIsConnected(false);
    setViewerCount(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    viewerCount,
    error,
    connect,
    disconnect,
  };
}

// Hook for viewer - uses Supabase Realtime for signaling
export function useLiveStreamViewer(streamId: string | null) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const userIdRef = useRef<string | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const handleOffer = useCallback(async (sdp: RTCSessionDescriptionInit, broadcasterId: string) => {
    console.log('[Viewer] Handling offer from broadcaster:', broadcasterId);
    
    try {
      // Clean up any existing connection
      if (pcRef.current) {
        pcRef.current.close();
      }
      
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Create a new MediaStream for receiving tracks
      remoteStreamRef.current = new MediaStream();

      // IMPORTANT: Add transceivers as receive-only
      // This ensures viewers DON'T send any audio/video - only receive from broadcaster
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Handle incoming tracks - ONLY receive broadcaster's audio/video
      pc.ontrack = (event) => {
        console.log('[Viewer] Received track:', event.track.kind, event.track.id, event.track.readyState);
        
        if (event.track.readyState === 'live') {
          remoteStreamRef.current?.addTrack(event.track);
          
          // Update state with a new MediaStream reference to trigger re-render
          setRemoteStream(new MediaStream(remoteStreamRef.current!.getTracks()));
          setIsConnected(true);
          setIsConnecting(false);
          
          console.log('[Viewer] Stream updated, tracks:', remoteStreamRef.current?.getTracks().length);
        }
        
        event.track.onunmute = () => {
          console.log('[Viewer] Track unmuted:', event.track.kind);
          if (!remoteStreamRef.current?.getTracks().includes(event.track)) {
            remoteStreamRef.current?.addTrack(event.track);
            setRemoteStream(new MediaStream(remoteStreamRef.current!.getTracks()));
          }
        };
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          console.log('[Viewer] Sending ICE candidate');
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              candidate: event.candidate.toJSON(),
              targetUserId: broadcasterId,
              fromUserId: userIdRef.current,
            },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[Viewer] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setIsConnected(true);
          setIsConnecting(false);
        } else if (pc.iceConnectionState === 'failed') {
          setIsConnected(false);
          setError('Connection failed');
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[Viewer] Connection state:', pc.connectionState);
      };

      // Set remote description (offer) and create answer
      console.log('[Viewer] Setting remote description');
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      console.log('[Viewer] Creating answer');
      const answer = await pc.createAnswer();
      
      console.log('[Viewer] Setting local description');
      await pc.setLocalDescription(answer);

      // Send answer back to broadcaster
      if (channelRef.current) {
        console.log('[Viewer] Sending answer to broadcaster');
        channelRef.current.send({
          type: 'broadcast',
          event: 'answer',
          payload: {
            sdp: { type: answer.type, sdp: answer.sdp },
            viewerId: userIdRef.current,
            targetBroadcasterId: broadcasterId,
          },
        });
      }

    } catch (err) {
      console.error('[Viewer] Error handling offer:', err);
      setError('Failed to connect to stream');
      setIsConnecting(false);
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!pcRef.current) {
      console.log('[Viewer] No peer connection for ICE candidate');
      return;
    }

    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[Viewer] Added ICE candidate');
    } catch (err) {
      console.error('[Viewer] Error adding ICE candidate:', err);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!streamId) {
      console.log('[Viewer] No streamId provided');
      return;
    }

    // Prevent multiple connections
    if (channelRef.current) {
      console.log('[Viewer] Already connected');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError('Not authenticated');
        setIsConnecting(false);
        return;
      }

      userIdRef.current = session.user.id;

      console.log('[Viewer] Setting up Realtime channel for stream:', streamId);

      // Create Supabase Realtime channel for signaling
      const channel = supabase.channel(`live-stream-${streamId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: session.user.id },
        },
      });

      channelRef.current = channel;

      // Handle signaling messages
      channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.targetViewerId === session.user.id) {
          console.log('[Viewer] Received offer from broadcaster:', payload.broadcasterId);
          await handleOffer(payload.sdp, payload.broadcasterId);
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.targetUserId === session.user.id) {
          console.log('[Viewer] Received ICE candidate');
          await handleIceCandidate(payload.candidate);
        }
      });

      channel.on('broadcast', { event: 'stream-ended' }, () => {
        console.log('[Viewer] Stream ended');
        setRemoteStream(null);
        setIsConnected(false);
        setError('Stream ended');
      });

      // Subscribe and track presence
      channel.subscribe(async (status) => {
        console.log('[Viewer] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          // Track presence as viewer - this will trigger broadcaster to send offer
          await channel.track({ role: 'viewer', joined_at: new Date().toISOString() });
          console.log('[Viewer] Tracking presence, waiting for offer...');
        }
      });

    } catch (err: any) {
      console.error('[Viewer] Connection error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [streamId, handleOffer, handleIceCandidate]);

  const disconnect = useCallback(() => {
    console.log('[Viewer] Disconnecting');
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;

    setRemoteStream(null);
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    remoteStream,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}