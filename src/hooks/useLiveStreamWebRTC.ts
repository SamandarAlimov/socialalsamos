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

// Hook for broadcaster
export function useLiveStreamBroadcaster(streamId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const viewerConnectionsRef = useRef<Map<string, ViewerConnection>>(new Map());
  const userIdRef = useRef<string | null>(null);

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

      // Connect to signaling server
      const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/live-stream-signaling`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Broadcaster] WebSocket connected');
        ws.send(JSON.stringify({
          type: 'broadcaster-join',
          streamId,
          userId: session.user.id,
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('[Broadcaster] Received:', data.type);

        switch (data.type) {
          case 'broadcaster-ready':
            setIsConnected(true);
            setViewerCount(data.viewerCount);
            break;

          case 'viewer-joined':
            setViewerCount(data.viewerCount);
            // Create offer for this viewer
            await createOfferForViewer(data.viewerId);
            break;

          case 'viewer-left':
            setViewerCount(data.viewerCount);
            // Clean up connection
            const conn = viewerConnectionsRef.current.get(data.viewerId);
            if (conn) {
              conn.pc.close();
              viewerConnectionsRef.current.delete(data.viewerId);
            }
            break;

          case 'answer':
            await handleAnswer(data.viewerId, data.sdp);
            break;

          case 'ice-candidate':
            await handleIceCandidate(data.fromUserId, data.candidate);
            break;

          case 'error':
            setError(data.message);
            break;
        }
      };

      ws.onclose = () => {
        console.log('[Broadcaster] WebSocket closed');
        setIsConnected(false);
      };

      ws.onerror = (e) => {
        console.error('[Broadcaster] WebSocket error:', e);
        setError('Connection error');
      };

    } catch (err: any) {
      console.error('[Broadcaster] Connection error:', err);
      setError(err.message);
    }
  }, [streamId]);

  const createOfferForViewer = async (viewerId: string) => {
    if (!localStreamRef.current || !wsRef.current) return;

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      
      viewerConnectionsRef.current.set(viewerId, { pc, viewerId });

      // Add local tracks
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            targetUserId: viewerId,
          }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[Broadcaster] ICE state for ${viewerId}:`, pc.iceConnectionState);
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsRef.current.send(JSON.stringify({
        type: 'offer',
        targetViewerId: viewerId,
        sdp: offer,
      }));

      console.log(`[Broadcaster] Sent offer to viewer ${viewerId}`);
    } catch (err) {
      console.error('[Broadcaster] Error creating offer:', err);
    }
  };

  const handleAnswer = async (viewerId: string, sdp: RTCSessionDescriptionInit) => {
    const conn = viewerConnectionsRef.current.get(viewerId);
    if (!conn) return;

    try {
      await conn.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`[Broadcaster] Set remote description for viewer ${viewerId}`);
    } catch (err) {
      console.error('[Broadcaster] Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const conn = viewerConnectionsRef.current.get(fromUserId);
    if (!conn) return;

    try {
      await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[Broadcaster] Error adding ICE candidate:', err);
    }
  };

  const disconnect = useCallback(() => {
    // Close all viewer connections
    viewerConnectionsRef.current.forEach(({ pc }) => {
      pc.close();
    });
    viewerConnectionsRef.current.clear();

    // Notify server and close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stream-ended' }));
      wsRef.current.close();
    }
    wsRef.current = null;

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

// Hook for viewer
export function useLiveStreamViewer(streamId: string | null) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const userIdRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    if (!streamId) return;

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

      // Connect to signaling server
      const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/live-stream-signaling`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Viewer] WebSocket connected');
        ws.send(JSON.stringify({
          type: 'viewer-join',
          streamId,
          userId: session.user.id,
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('[Viewer] Received:', data.type);

        switch (data.type) {
          case 'request-offer':
            // Broadcaster will send us an offer soon
            console.log('[Viewer] Waiting for offer from broadcaster');
            break;

          case 'waiting-for-broadcaster':
            console.log('[Viewer] Broadcaster not connected yet');
            break;

          case 'offer':
            await handleOffer(data.sdp, data.broadcasterId);
            break;

          case 'ice-candidate':
            await handleIceCandidate(data.candidate);
            break;

          case 'stream-ended':
            setRemoteStream(null);
            setIsConnected(false);
            setError('Stream ended');
            break;

          case 'error':
            setError(data.message);
            setIsConnecting(false);
            break;
        }
      };

      ws.onclose = () => {
        console.log('[Viewer] WebSocket closed');
        setIsConnected(false);
        setIsConnecting(false);
      };

      ws.onerror = (e) => {
        console.error('[Viewer] WebSocket error:', e);
        setError('Connection error');
        setIsConnecting(false);
      };

    } catch (err: any) {
      console.error('[Viewer] Connection error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [streamId]);

  const handleOffer = async (sdp: RTCSessionDescriptionInit, broadcasterId: string) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('[Viewer] Received track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setIsConnected(true);
          setIsConnecting(false);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
          }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[Viewer] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setIsConnected(false);
        }
      };

      // Set remote description and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer to broadcaster
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          sdp: answer,
        }));
      }

      console.log('[Viewer] Sent answer to broadcaster');
    } catch (err) {
      console.error('[Viewer] Error handling offer:', err);
      setError('Failed to connect to stream');
      setIsConnecting(false);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!pcRef.current) return;

    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[Viewer] Error adding ICE candidate:', err);
    }
  };

  const disconnect = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' }));
      wsRef.current.close();
    }
    wsRef.current = null;

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
