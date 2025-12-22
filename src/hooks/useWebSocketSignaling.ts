import { useRef, useCallback, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type SignalType = 'join' | 'offer' | 'answer' | 'ice-candidate' | 'media-state' | 'leave' | 'call-ended';

interface SignalMessage {
  type: SignalType;
  roomId?: string;
  userId?: string;
  targetUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  isMuted?: boolean;
  isVideoOn?: boolean;
  isScreenSharing?: boolean;
  isHandRaised?: boolean;
}

interface WebSocketSignalingOptions {
  onUserJoined?: (userId: string, participantCount: number) => void;
  onUserLeft?: (userId: string, participantCount: number) => void;
  onOffer?: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  onAnswer?: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (fromUserId: string, candidate: RTCIceCandidateInit) => void;
  onMediaStateChanged?: (userId: string, state: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => void;
  onCallEnded?: (userId: string) => void;
  onRoomJoined?: (roomId: string, participants: string[]) => void;
  onError?: (message: string) => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
}

export function useWebSocketSignaling(options: WebSocketSignalingOptions = {}) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const currentRoomRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const getWebSocketUrl = useCallback(() => {
    // Use the edge function URL directly
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('SUPABASE_URL not found');
      return null;
    }
    // Convert https:// to wss://
    const wsUrl = supabaseUrl.replace('https://', 'wss://').replace('/rest/v1', '');
    return `${wsUrl}/functions/v1/webrtc-signaling`;
  }, []);

  const connect = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected, joining room');
      sendMessage({ type: 'join', roomId, userId: user?.id });
      return;
    }

    const wsUrl = getWebSocketUrl();
    if (!wsUrl) return;

    console.log('[WS] Connecting to:', wsUrl);
    currentRoomRef.current = roomId;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectAttemptsRef.current = 0;
        
        // Join the room
        ws.send(JSON.stringify({
          type: 'join',
          roomId,
          userId: user?.id,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Received:', data.type);

          switch (data.type) {
            case 'room-joined':
              options.onRoomJoined?.(data.roomId, data.participants);
              break;
            case 'user-joined':
              options.onUserJoined?.(data.userId, data.participantCount);
              break;
            case 'user-left':
              options.onUserLeft?.(data.userId, data.participantCount);
              break;
            case 'offer':
              options.onOffer?.(data.fromUserId, data.sdp);
              break;
            case 'answer':
              options.onAnswer?.(data.fromUserId, data.sdp);
              break;
            case 'ice-candidate':
              options.onIceCandidate?.(data.fromUserId, data.candidate);
              break;
            case 'media-state-changed':
              options.onMediaStateChanged?.(data.userId, {
                isMuted: data.isMuted,
                isVideoOn: data.isVideoOn,
                isScreenSharing: data.isScreenSharing,
                isHandRaised: data.isHandRaised,
              });
              break;
            case 'call-ended':
              options.onCallEnded?.(data.userId);
              break;
            case 'error':
              options.onError?.(data.message);
              break;
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection if we were in a room
        if (currentRoomRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          setIsReconnecting(true);
          options.onReconnecting?.();
          
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (currentRoomRef.current) {
              connect(currentRoomRef.current);
            }
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
    }
  }, [user?.id, getWebSocketUrl, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'leave', userId: user?.id }));
      wsRef.current.close();
      wsRef.current = null;
    }

    currentRoomRef.current = null;
    setIsConnected(false);
    setIsReconnecting(false);
    reconnectAttemptsRef.current = 0;
  }, [user?.id]);

  const sendMessage = useCallback((message: SignalMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }, []);

  const sendOffer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    sendMessage({
      type: 'offer',
      targetUserId,
      sdp,
      userId: user?.id,
    });
  }, [sendMessage, user?.id]);

  const sendAnswer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    sendMessage({
      type: 'answer',
      targetUserId,
      sdp,
      userId: user?.id,
    });
  }, [sendMessage, user?.id]);

  const sendIceCandidate = useCallback((targetUserId: string, candidate: RTCIceCandidateInit) => {
    sendMessage({
      type: 'ice-candidate',
      targetUserId,
      candidate,
      userId: user?.id,
    });
  }, [sendMessage, user?.id]);

  const sendMediaState = useCallback((state: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => {
    sendMessage({
      type: 'media-state',
      userId: user?.id,
      ...state,
    });
  }, [sendMessage, user?.id]);

  const sendCallEnded = useCallback(() => {
    sendMessage({
      type: 'call-ended' as SignalType,
      userId: user?.id,
    });
  }, [sendMessage, user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isReconnecting,
    connect,
    disconnect,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendMediaState,
    sendCallEnded,
  };
}
