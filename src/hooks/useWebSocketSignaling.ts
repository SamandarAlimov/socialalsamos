import { useRef, useCallback, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
  accessToken?: string;
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

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY_MS = 15000;

export function useWebSocketSignaling(options: WebSocketSignalingOptions = {}) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const currentRoomRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  const manuallyDisconnectedRef = useRef(false);
  const connectionGenerationRef = useRef(0);
  const connectedOnceRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Callers may pass inline callback objects. Keep the latest callbacks without
  // making the WebSocket lifecycle depend on object identity.
  optionsRef.current = options;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const getAuthenticatedWebSocketUrl = useCallback(async (roomId: string) => {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
    if (!supabaseUrl) {
      optionsRef.current.onError?.('Supabase URL sozlanmagan');
      return null;
    }

    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) {
      optionsRef.current.onError?.('Qo‘ng‘iroq signalingi uchun autentifikatsiya sessiyasi topilmadi');
      return null;
    }

    const origin = supabaseUrl
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:')
      .replace(/\/$/, '');

    const url = new URL(`${origin}/functions/v1/webrtc-signaling`);
    url.searchParams.set('roomId', roomId);
    url.searchParams.set('userId', user?.id ?? '');
    // Browser WebSocket does not let us set an arbitrary Authorization header.
    // The Edge Function explicitly supports access_token query authentication.
    url.searchParams.set('access_token', accessToken);
    return url.toString();
  }, [user?.id]);

  const sendMessage = useCallback((message: SignalMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    currentRoomRef.current = null;
    connectionGenerationRef.current += 1;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'leave', userId: user?.id }));
        }
      } catch {
        // best effort
      }
      try {
        ws.close(1000, 'client_disconnect');
      } catch {
        // best effort
      }
    }

    setIsConnected(false);
    setIsReconnecting(false);
  }, [clearReconnectTimer, user?.id]);

  const connect = useCallback(async (roomId: string) => {
    if (!roomId || !user?.id) return;

    manuallyDisconnectedRef.current = false;
    currentRoomRef.current = roomId;

    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      // Never create a second signaling socket for the same call.
      return;
    }

    clearReconnectTimer();
    const generation = ++connectionGenerationRef.current;
    const wsUrl = await getAuthenticatedWebSocketUrl(roomId);
    if (!wsUrl || generation !== connectionGenerationRef.current || manuallyDisconnectedRef.current) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('[WS] Failed to create signaling socket', error);
      optionsRef.current.onError?.('Signaling kanalini yaratib bo‘lmadi');
      return;
    }

    wsRef.current = ws;
    console.log('[WS] Connecting to authenticated signaling server');

    ws.onopen = () => {
      if (wsRef.current !== ws || generation !== connectionGenerationRef.current) {
        try { ws.close(1000, 'stale_socket'); } catch {}
        return;
      }

      console.log('[WS] Signaling connected');
      const wasReconnect = connectedOnceRef.current && reconnectAttemptsRef.current > 0;
      connectedOnceRef.current = true;
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      setIsReconnecting(false);

      // The current Edge Function auto-registers the socket from roomId,
      // userId and access_token in the URL. Do NOT send join here: doing so
      // would register the same socket twice and emit duplicate user-joined
      // events. The 'ready' fallback below supports an older server version.
      if (wasReconnect) optionsRef.current.onReconnected?.();
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;

      try {
        const data = JSON.parse(event.data) as Record<string, any>;
        switch (data.type) {
          case 'ready': {
            // Compatibility with an older signaling function that waits for
            // a join message instead of auto-registering from URL parameters.
            void supabase.auth.getSession().then(({ data: sessionData }) => {
              if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
                sendMessage({
                  type: 'join',
                  roomId,
                  userId: user.id,
                  accessToken: sessionData.session?.access_token,
                });
              }
            });
            break;
          }
          case 'joined':
          case 'room-joined': {
            const participants = Array.isArray(data.participants)
              ? data.participants
              : Array.isArray(data.peers)
                ? data.peers
                : [];
            optionsRef.current.onRoomJoined?.(data.roomId ?? roomId, participants);
            break;
          }
          case 'user-joined':
            if (data.userId && data.userId !== user.id) {
              optionsRef.current.onUserJoined?.(data.userId, Number(data.participantCount ?? 0));
            }
            break;
          case 'user-left':
            if (data.userId) optionsRef.current.onUserLeft?.(data.userId, Number(data.participantCount ?? 0));
            break;
          case 'offer':
            if (data.fromUserId && data.sdp) optionsRef.current.onOffer?.(data.fromUserId, data.sdp);
            break;
          case 'answer':
            if (data.fromUserId && data.sdp) optionsRef.current.onAnswer?.(data.fromUserId, data.sdp);
            break;
          case 'ice-candidate':
          case 'ice':
            if (data.fromUserId && data.candidate) optionsRef.current.onIceCandidate?.(data.fromUserId, data.candidate);
            break;
          case 'media-state-changed':
          case 'media-state':
            if (data.userId && data.userId !== user.id) {
              optionsRef.current.onMediaStateChanged?.(data.userId, {
                isMuted: Boolean(data.isMuted),
                isVideoOn: Boolean(data.isVideoOn),
                isScreenSharing: Boolean(data.isScreenSharing),
                isHandRaised: Boolean(data.isHandRaised),
              });
            }
            break;
          case 'call-ended':
            if (data.userId && data.userId !== user.id) optionsRef.current.onCallEnded?.(data.userId);
            break;
          case 'ping':
            // The server uses heartbeat messages to keep this participant
            // alive. Respond with heartbeat, not join, so we don't emit a
            // duplicate user-joined event every 15 seconds.
            sendMessage({ type: 'join', roomId, userId: user.id });
            break;
          case 'heartbeat-ack':
            break;
          case 'error':
            console.error('[WS] Signaling server error:', data.message);
            optionsRef.current.onError?.(String(data.message || 'Signaling server xatosi'));
            break;
        }
      } catch (error) {
        console.error('[WS] Signaling message parse error', error);
      }
    };

    ws.onerror = () => {
      if (!manuallyDisconnectedRef.current) {
        console.warn('[WS] Signaling transport error');
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) wsRef.current = null;
      setIsConnected(false);

      if (manuallyDisconnectedRef.current || currentRoomRef.current !== roomId) {
        setIsReconnecting(false);
        return;
      }

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setIsReconnecting(false);
        optionsRef.current.onError?.(`Signaling kanal uzildi (${event.code})`);
        return;
      }

      reconnectAttemptsRef.current += 1;
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
      setIsReconnecting(true);
      optionsRef.current.onReconnecting?.();
      clearReconnectTimer();
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (!manuallyDisconnectedRef.current && currentRoomRef.current === roomId) {
          void connect(roomId);
        }
      }, delay);
    };
  }, [clearReconnectTimer, getAuthenticatedWebSocketUrl, sendMessage, user?.id]);

  const sendOffer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    sendMessage({ type: 'offer', targetUserId, sdp, userId: user?.id });
  }, [sendMessage, user?.id]);

  const sendAnswer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    sendMessage({ type: 'answer', targetUserId, sdp, userId: user?.id });
  }, [sendMessage, user?.id]);

  const sendIceCandidate = useCallback((targetUserId: string, candidate: RTCIceCandidateInit) => {
    sendMessage({ type: 'ice-candidate', targetUserId, candidate, userId: user?.id });
  }, [sendMessage, user?.id]);

  const sendMediaState = useCallback((state: { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised: boolean }) => {
    sendMessage({ type: 'media-state', userId: user?.id, ...state });
  }, [sendMessage, user?.id]);

  const sendCallEnded = useCallback(() => {
    sendMessage({ type: 'call-ended', userId: user?.id });
  }, [sendMessage, user?.id]);

  useEffect(() => {
    return () => {
      manuallyDisconnectedRef.current = true;
      currentRoomRef.current = null;
      connectionGenerationRef.current += 1;
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try { ws.close(1000, 'unmount'); } catch {}
      }
    };
  }, [clearReconnectTimer]);

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
