import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Participant {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
}

interface ConnectionQuality {
  bitrate: number;
  packetLoss: number;
  latency: number;
  quality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

const DEFAULT_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Add TURN servers for NAT traversal
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
  ],
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
const QUALITY_CHECK_INTERVAL = 5000;

export function useWebRTC(roomId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    bitrate: 0,
    packetLoss: 0,
    latency: 0,
    quality: 'disconnected',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Calculate connection quality from stats
  const calculateQuality = useCallback((bitrate: number, packetLoss: number, latency: number): ConnectionQuality['quality'] => {
    if (bitrate === 0) return 'disconnected';
    if (packetLoss < 1 && latency < 100 && bitrate > 500000) return 'excellent';
    if (packetLoss < 5 && latency < 200 && bitrate > 200000) return 'good';
    return 'poor';
  }, []);

  // Monitor connection quality
  const startQualityMonitoring = useCallback(() => {
    qualityIntervalRef.current = setInterval(async () => {
      const pcs = Array.from(peerConnectionsRef.current.values());
      if (pcs.length === 0) return;

      let totalBitrate = 0;
      let totalPacketLoss = 0;
      let totalLatency = 0;
      let count = 0;

      for (const pc of pcs) {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime) {
                totalLatency += report.currentRoundTripTime * 1000;
                count++;
              }
            }
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              if (report.bytesSent) {
                totalBitrate += (report.bytesSent * 8) / (report.timestamp / 1000);
              }
              if (report.packetsLost && report.packetsSent) {
                totalPacketLoss += (report.packetsLost / report.packetsSent) * 100;
              }
            }
          });
        } catch (err) {
          console.error('Error getting stats:', err);
        }
      }

      if (count > 0) {
        const avgLatency = totalLatency / count;
        const avgBitrate = totalBitrate / pcs.length;
        const avgPacketLoss = totalPacketLoss / pcs.length;

        setConnectionQuality({
          bitrate: avgBitrate,
          packetLoss: avgPacketLoss,
          latency: avgLatency,
          quality: calculateQuality(avgBitrate, avgPacketLoss, avgLatency),
        });
      }
    }, QUALITY_CHECK_INTERVAL);
  }, [calculateQuality]);

  const stopQualityMonitoring = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
  }, []);

  const createPeerConnection = useCallback((participantId: string) => {
    console.log('Creating peer connection for:', participantId);
    const pc = new RTCPeerConnection(DEFAULT_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('Sending ICE candidate to:', participantId);
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetUserId: participantId,
          userId: user?.id,
          candidate: event.candidate,
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('Received track from:', participantId);
      setParticipants(prev => {
        const updated = new Map(prev);
        const existing = updated.get(participantId) || {
          id: participantId,
          stream: null,
          isMuted: false,
          isVideoOn: true,
          isScreenSharing: false,
          isHandRaised: false,
        };
        updated.set(participantId, {
          ...existing,
          stream: event.streams[0],
        });
        return updated;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${participantId}:`, pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        console.log('Connection failed, attempting to restart ICE');
        pc.restartIce();
      } else if (pc.connectionState === 'disconnected') {
        // Wait a bit and check if it reconnects
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            console.log('Still disconnected, restarting ICE');
            pc.restartIce();
          }
        }, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${participantId}:`, pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'failed') {
        console.log('ICE failed, restarting');
        pc.restartIce();
      }
    };

    // Add local stream tracks
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        pc.addTrack(track, stream);
      });
    }

    peerConnectionsRef.current.set(participantId, pc);
    return pc;
  }, [user?.id]);

  const handleOffer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    console.log('Handling offer from:', fromUserId);
    let pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc) {
      pc = createPeerConnection(fromUserId);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Add any pending ICE candidates
      const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current.delete(fromUserId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          targetUserId: fromUserId,
          userId: user?.id,
          sdp: answer,
        }));
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }, [createPeerConnection, user?.id]);

  const handleAnswer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    console.log('Handling answer from:', fromUserId);
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Add any pending ICE candidates
        const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
        for (const candidate of pendingCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current.delete(fromUserId);
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    } else {
      // Queue candidate if remote description not set yet
      const pending = pendingCandidatesRef.current.get(fromUserId) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(fromUserId, pending);
    }
  }, []);

  const startLocalStream = useCallback(async (video = true, audio = true) => {
    try {
      console.log('Starting local stream with video:', video, 'audio:', audio);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } : false,
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoOn(video);
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
      toast({
        title: 'Camera/Microphone Error',
        description: 'Please allow access to your camera and microphone.',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const connectWebSocket = useCallback(() => {
    if (!roomId || !user?.id) return;

    console.log('Connecting to WebSocket...');
    const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/webrtc-signaling`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);
      
      wsRef.current?.send(JSON.stringify({
        type: 'join',
        roomId,
        userId: user.id,
      }));
    };

    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('Received:', data.type, data);

      switch (data.type) {
        case 'room-joined':
          setIsConnected(true);
          // Create offers for existing participants
          for (const participantId of data.participants || []) {
            if (participantId !== user.id) {
              const pc = createPeerConnection(participantId);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsRef.current?.send(JSON.stringify({
                  type: 'offer',
                  targetUserId: participantId,
                  userId: user.id,
                  sdp: offer,
                }));
              } catch (err) {
                console.error('Error creating offer:', err);
              }
            }
          }
          break;

        case 'user-joined':
          if (data.userId !== user.id) {
            console.log('New user joined:', data.userId);
            setParticipants(prev => {
              const updated = new Map(prev);
              updated.set(data.userId, {
                id: data.userId,
                stream: null,
                isMuted: false,
                isVideoOn: true,
                isScreenSharing: false,
                isHandRaised: false,
              });
              return updated;
            });
          }
          break;

        case 'offer':
          if (data.fromUserId !== user.id) {
            await handleOffer(data.fromUserId, data.sdp);
          }
          break;

        case 'answer':
          if (data.fromUserId !== user.id) {
            await handleAnswer(data.fromUserId, data.sdp);
          }
          break;

        case 'ice-candidate':
          if (data.fromUserId !== user.id) {
            await handleIceCandidate(data.fromUserId, data.candidate);
          }
          break;

        case 'media-state-changed':
          if (data.userId !== user.id) {
            setParticipants(prev => {
              const updated = new Map(prev);
              const existing = updated.get(data.userId);
              if (existing) {
                updated.set(data.userId, {
                  ...existing,
                  isMuted: data.isMuted,
                  isVideoOn: data.isVideoOn,
                  isScreenSharing: data.isScreenSharing,
                  isHandRaised: data.isHandRaised,
                });
              }
              return updated;
            });
          }
          break;

        case 'user-left':
          console.log('User left:', data.userId);
          const pc = peerConnectionsRef.current.get(data.userId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(data.userId);
          }
          setParticipants(prev => {
            const updated = new Map(prev);
            updated.delete(data.userId);
            return updated;
          });
          break;

        case 'error':
          console.error('Server error:', data.message);
          setError(data.message);
          break;
      }
    };

    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      
      // Attempt reconnection if we're still supposed to be in the room
      if (currentRoomRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        console.log(`Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, RECONNECT_DELAY * reconnectAttemptsRef.current);
      }
    };
  }, [roomId, user?.id, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate]);

  const joinRoom = useCallback(async () => {
    if (!roomId || !user?.id) return;

    setIsConnecting(true);
    setError(null);
    currentRoomRef.current = roomId;

    // Start local stream first
    const stream = await startLocalStream();
    if (!stream) {
      setIsConnecting(false);
      return;
    }

    // Connect to signaling server
    connectWebSocket();
    
    // Start quality monitoring
    startQualityMonitoring();
  }, [roomId, user?.id, startLocalStream, connectWebSocket, startQualityMonitoring]);

  const leaveRoom = useCallback(() => {
    console.log('Leaving room');
    currentRoomRef.current = null;
    
    // Clear reconnection attempts
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Stop quality monitoring
    stopQualityMonitoring();

    // Send leave message
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave',
        userId: user?.id,
      }));
      wsRef.current.close();
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    // Stop local stream
    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());

    setLocalStream(null);
    localStreamRef.current = null;
    setScreenStream(null);
    setParticipants(new Map());
    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
    setIsVideoOn(true);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setError(null);
    setConnectionQuality({
      bitrate: 0,
      packetLoss: 0,
      latency: 0,
      quality: 'disconnected',
    });
  }, [user?.id, localStream, screenStream, stopQualityMonitoring]);

  const broadcastMediaState = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'media-state',
        userId: user?.id,
        isMuted,
        isVideoOn,
        isScreenSharing,
        isHandRaised,
      }));
    }
  }, [user?.id, isMuted, isVideoOn, isScreenSharing, isHandRaised]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuteState = !audioTrack.enabled;
        setIsMuted(newMuteState);

        // Notify others
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'media-state',
            userId: user?.id,
            isMuted: newMuteState,
            isVideoOn,
            isScreenSharing,
            isHandRaised,
          }));
        }
      }
    }
  }, [localStream, user?.id, isVideoOn, isScreenSharing, isHandRaised]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newVideoState = videoTrack.enabled;
        setIsVideoOn(newVideoState);

        // Notify others
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'media-state',
            userId: user?.id,
            isMuted,
            isVideoOn: newVideoState,
            isScreenSharing,
            isHandRaised,
          }));
        }
      }
    }
  }, [localStream, user?.id, isMuted, isScreenSharing, isHandRaised]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);

      // Replace screen track with camera track
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: 'always',
            displaySurface: 'monitor',
          } as any,
          audio: true,
        });
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Replace camera track with screen track
        const screenTrack = stream.getVideoTracks()[0];
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Handle screen share stop
        screenTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error('Error sharing screen:', err);
        toast({
          title: 'Screen Share Error',
          description: 'Failed to share screen. Please try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Notify others
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'media-state',
        userId: user?.id,
        isMuted,
        isVideoOn,
        isScreenSharing: !isScreenSharing,
        isHandRaised,
      }));
    }
  }, [isScreenSharing, screenStream, localStream, user?.id, isMuted, isVideoOn, isHandRaised, toast]);

  const toggleHandRaise = useCallback(() => {
    setIsHandRaised(prev => {
      const newValue = !prev;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'media-state',
          userId: user?.id,
          isMuted,
          isVideoOn,
          isScreenSharing,
          isHandRaised: newValue,
        }));
      }
      return newValue;
    });
  }, [user?.id, isMuted, isVideoOn, isScreenSharing]);

  const sendChatMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat-message',
        userId: user?.id,
        message,
        timestamp: new Date().toISOString(),
      }));
    }
  }, [user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  return {
    localStream,
    screenStream,
    participants: Array.from(participants.values()),
    isConnected,
    isConnecting,
    isMuted,
    isVideoOn,
    isScreenSharing,
    isHandRaised,
    error,
    connectionQuality,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHandRaise,
    sendChatMessage,
  };
}
