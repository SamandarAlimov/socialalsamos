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
    // Free TURN servers for NAT traversal
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
  const [participants, setParticipants] = useState<Participant[]>([]);
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
  const isPoliteRef = useRef(false);

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

  // Create peer connection with track handling
  const createPeerConnection = useCallback((participantId: string, stream: MediaStream): RTCPeerConnection => {
    console.log('[WebRTC] Creating peer connection for:', participantId);
    
    // Close existing connection if any
    const existingPc = peerConnectionsRef.current.get(participantId);
    if (existingPc) {
      console.log('[WebRTC] Closing existing connection for:', participantId);
      existingPc.close();
      peerConnectionsRef.current.delete(participantId);
    }

    const pc = new RTCPeerConnection(DEFAULT_CONFIG);

    // Add local tracks FIRST before anything else
    console.log('[WebRTC] Adding local tracks to peer connection for:', participantId);
    stream.getTracks().forEach(track => {
      console.log('[WebRTC] Adding track:', track.kind, 'enabled:', track.enabled, 'id:', track.id);
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebRTC] Sending ICE candidate to:', participantId, event.candidate.type);
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetUserId: participantId,
          userId: user?.id,
          candidate: event.candidate.toJSON(),
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received track from:', participantId, 'kind:', event.track.kind, 'streams:', event.streams.length);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        console.log('[WebRTC] Remote stream received:', remoteStream.id, 
          'audio tracks:', remoteStream.getAudioTracks().length,
          'video tracks:', remoteStream.getVideoTracks().length
        );
        
        setParticipants(prev => {
          const existing = prev.find(p => p.id === participantId);
          if (existing) {
            return prev.map(p => p.id === participantId ? { ...p, stream: remoteStream } : p);
          }
          return [...prev, {
            id: participantId,
            stream: remoteStream,
            isMuted: false,
            isVideoOn: true,
            isScreenSharing: false,
            isHandRaised: false,
          }];
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${participantId}:`, pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log('[WebRTC] Successfully connected to:', participantId);
        toast({
          title: 'Connected',
          description: 'Call connected successfully',
        });
      } else if (pc.connectionState === 'failed') {
        console.log('[WebRTC] Connection failed, attempting ICE restart');
        pc.restartIce();
      } else if (pc.connectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            console.log('[WebRTC] Still disconnected, restarting ICE');
            pc.restartIce();
          }
        }, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${participantId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log('[WebRTC] ICE failed, restarting');
        pc.restartIce();
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state with ${participantId}:`, pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state with ${participantId}:`, pc.signalingState);
    };

    peerConnectionsRef.current.set(participantId, pc);
    return pc;
  }, [user?.id, toast]);

  // Handle incoming offer
  const handleOffer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    console.log('[WebRTC] Handling offer from:', fromUserId);
    
    const stream = localStreamRef.current;
    if (!stream) {
      console.error('[WebRTC] No local stream available for handling offer');
      return;
    }

    let pc = peerConnectionsRef.current.get(fromUserId);
    
    // Handle offer collision using perfect negotiation
    const offerCollision = pc && (pc.signalingState !== 'stable');
    
    if (offerCollision) {
      if (!isPoliteRef.current) {
        console.log('[WebRTC] Ignoring offer due to collision - we are impolite');
        return;
      }
      // We are polite - rollback and accept the offer
      console.log('[WebRTC] Collision detected but we are polite - rolling back');
      await pc?.setLocalDescription({ type: 'rollback' });
    }

    if (!pc) {
      pc = createPeerConnection(fromUserId, stream);
    }

    try {
      console.log('[WebRTC] Setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process pending ICE candidates
      const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
      console.log('[WebRTC] Processing', pendingCandidates.length, 'pending ICE candidates');
      for (const candidate of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding pending ICE candidate:', err);
        }
      }
      pendingCandidatesRef.current.delete(fromUserId);

      // Create and send answer
      console.log('[WebRTC] Creating answer');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      console.log('[WebRTC] Sending answer to:', fromUserId);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          targetUserId: fromUserId,
          userId: user?.id,
          sdp: answer,
        }));
      }
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
    }
  }, [createPeerConnection, user?.id]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    console.log('[WebRTC] Handling answer from:', fromUserId);
    const pc = peerConnectionsRef.current.get(fromUserId);
    
    if (!pc) {
      console.error('[WebRTC] No peer connection found for:', fromUserId);
      return;
    }

    try {
      console.log('[WebRTC] Setting remote description (answer), current state:', pc.signalingState);
      
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('[WebRTC] Unexpected signaling state for answer:', pc.signalingState);
        return;
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Remote description (answer) set successfully');

      // Process pending ICE candidates
      const pendingCandidates = pendingCandidatesRef.current.get(fromUserId) || [];
      console.log('[WebRTC] Processing', pendingCandidates.length, 'pending ICE candidates after answer');
      for (const candidate of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding pending ICE candidate:', err);
        }
      }
      pendingCandidatesRef.current.delete(fromUserId);
    } catch (err) {
      console.error('[WebRTC] Error handling answer:', err);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTC] Added ICE candidate from:', fromUserId);
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    } else {
      console.log('[WebRTC] Queuing ICE candidate from:', fromUserId);
      const pending = pendingCandidatesRef.current.get(fromUserId) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(fromUserId, pending);
    }
  }, []);

  // Start local media stream
  const startLocalStream = useCallback(async (video = true, audio = true): Promise<MediaStream | null> => {
    try {
      console.log('[WebRTC] Starting local stream - video:', video, 'audio:', audio);
      
      const constraints: MediaStreamConstraints = {
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
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] Local stream obtained:', 
        'video tracks:', stream.getVideoTracks().length,
        'audio tracks:', stream.getAudioTracks().length
      );
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoOn(video);
      setIsMuted(false);
      
      return stream;
    } catch (err: any) {
      console.error('[WebRTC] Error accessing media devices:', err);
      
      let errorMessage = 'Failed to access camera/microphone.';
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera/microphone access denied. Please allow permissions.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera/microphone found.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera/microphone is in use by another application.';
      }
      
      setError(errorMessage);
      toast({
        title: 'Media Error',
        description: errorMessage,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Create offer and send to participant
  const createOfferFor = useCallback(async (participantId: string, stream: MediaStream) => {
    console.log('[WebRTC] Creating offer for:', participantId);
    
    const pc = createPeerConnection(participantId, stream);
    
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          targetUserId: participantId,
          userId: user?.id,
          sdp: offer,
        }));
        console.log('[WebRTC] Offer sent to:', participantId);
      }
    } catch (err) {
      console.error('[WebRTC] Error creating offer for:', participantId, err);
    }
  }, [createPeerConnection, user?.id]);

  // Connect to WebSocket signaling server
  const connectWebSocket = useCallback((roomIdToJoin: string, stream: MediaStream) => {
    if (!user?.id) {
      console.error('[WebRTC] Cannot connect WebSocket - no user ID');
      return;
    }

    console.log('[WebRTC] Connecting to WebSocket for room:', roomIdToJoin);
    const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/webrtc-signaling`;
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('[WebRTC] WebSocket connected, joining room:', roomIdToJoin);
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);
      
      wsRef.current?.send(JSON.stringify({
        type: 'join',
        roomId: roomIdToJoin,
        userId: user.id,
      }));
    };

    wsRef.current.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WebRTC] Received message:', data.type);

        switch (data.type) {
          case 'room-joined': {
            console.log('[WebRTC] Joined room, existing participants:', data.participants);
            setIsConnected(true);
            
            const existingParticipants = data.participants || [];
            
            // Determine politeness based on participant count
            // First person to join is impolite (sends offers)
            // Second person is polite (receives offers)
            isPoliteRef.current = existingParticipants.length > 0;
            console.log('[WebRTC] Is polite (second joiner):', isPoliteRef.current);
            
            // Add placeholder participants
            if (existingParticipants.length > 0) {
              setParticipants(existingParticipants.map((id: string) => ({
                id,
                stream: null,
                isMuted: false,
                isVideoOn: true,
                isScreenSharing: false,
                isHandRaised: false,
              })));
            }
            
            // Only first joiner (impolite) creates offers to existing participants
            if (!isPoliteRef.current) {
              for (const participantId of existingParticipants) {
                if (participantId !== user.id) {
                  console.log('[WebRTC] Creating offer for existing participant:', participantId);
                  await createOfferFor(participantId, stream);
                }
              }
            }
            break;
          }

          case 'user-joined': {
            if (data.userId !== user.id) {
              console.log('[WebRTC] New user joined:', data.userId);
              
              // Add placeholder participant
              setParticipants(prev => {
                if (prev.find(p => p.id === data.userId)) return prev;
                return [...prev, {
                  id: data.userId,
                  stream: null,
                  isMuted: false,
                  isVideoOn: true,
                  isScreenSharing: false,
                  isHandRaised: false,
                }];
              });
              
              // Existing user (impolite) creates offer to new user (polite)
              console.log('[WebRTC] Creating offer for new participant:', data.userId);
              await createOfferFor(data.userId, stream);
            }
            break;
          }

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
              setParticipants(prev => prev.map(p => 
                p.id === data.userId ? {
                  ...p,
                  isMuted: data.isMuted,
                  isVideoOn: data.isVideoOn,
                  isScreenSharing: data.isScreenSharing,
                  isHandRaised: data.isHandRaised,
                } : p
              ));
            }
            break;

          case 'user-left': {
            console.log('[WebRTC] User left:', data.userId);
            const pc = peerConnectionsRef.current.get(data.userId);
            if (pc) {
              pc.close();
              peerConnectionsRef.current.delete(data.userId);
            }
            pendingCandidatesRef.current.delete(data.userId);
            setParticipants(prev => prev.filter(p => p.id !== data.userId));
            break;
          }

          case 'error':
            console.error('[WebRTC] Server error:', data.message);
            setError(data.message);
            toast({
              title: 'Connection Error',
              description: data.message,
              variant: 'destructive',
            });
            break;
        }
      } catch (err) {
        console.error('[WebRTC] Error processing message:', err);
      }
    };

    wsRef.current.onerror = (err) => {
      console.error('[WebRTC] WebSocket error:', err);
      setError('Connection error');
    };

    wsRef.current.onclose = () => {
      console.log('[WebRTC] WebSocket closed');
      setIsConnected(false);
      
      if (currentRoomRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        console.log(`[WebRTC] Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (currentRoomRef.current && localStreamRef.current) {
            connectWebSocket(currentRoomRef.current, localStreamRef.current);
          }
        }, RECONNECT_DELAY * reconnectAttemptsRef.current);
      }
    };
  }, [user?.id, createOfferFor, handleOffer, handleAnswer, handleIceCandidate, toast]);

  // Join room
  const joinRoom = useCallback(async () => {
    if (!roomId || !user?.id) {
      console.error('[WebRTC] Cannot join room - missing roomId or userId');
      return;
    }

    console.log('[WebRTC] Joining room:', roomId);
    setIsConnecting(true);
    setError(null);
    currentRoomRef.current = roomId;

    // Start local stream FIRST
    const stream = await startLocalStream();
    if (!stream) {
      setIsConnecting(false);
      return;
    }

    // Then connect to signaling server with stream reference
    connectWebSocket(roomId, stream);
    
    // Start quality monitoring
    startQualityMonitoring();
  }, [roomId, user?.id, startLocalStream, connectWebSocket, startQualityMonitoring]);

  // Leave room and cleanup
  const leaveRoom = useCallback(() => {
    console.log('[WebRTC] Leaving room');
    currentRoomRef.current = null;
    
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    stopQualityMonitoring();

    // Send leave message
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave',
        userId: user?.id,
      }));
      wsRef.current.close();
    }
    wsRef.current = null;

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, id) => {
      console.log('[WebRTC] Closing peer connection:', id);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('[WebRTC] Stopping track:', track.kind);
        track.stop();
      });
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }

    setLocalStream(null);
    localStreamRef.current = null;
    setScreenStream(null);
    setParticipants([]);
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
  }, [user?.id, screenStream, stopQualityMonitoring]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuteState = !audioTrack.enabled;
        setIsMuted(newMuteState);
        console.log('[WebRTC] Audio muted:', newMuteState);

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
  }, [user?.id, isVideoOn, isScreenSharing, isHandRaised]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newVideoState = videoTrack.enabled;
        setIsVideoOn(newVideoState);
        console.log('[WebRTC] Video enabled:', newVideoState);

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
  }, [user?.id, isMuted, isScreenSharing, isHandRaised]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      
      // Replace screen track with camera track
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        setScreenStream(stream);
        setIsScreenSharing(true);

        const screenTrack = stream.getVideoTracks()[0];
        
        // Replace camera track with screen track
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => {
          setScreenStream(null);
          setIsScreenSharing(false);
          
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];
          if (videoTrack) {
            peerConnectionsRef.current.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(videoTrack);
            });
          }
        };
      } catch (err) {
        console.error('[WebRTC] Error sharing screen:', err);
      }
    }

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
  }, [isScreenSharing, screenStream, user?.id, isMuted, isVideoOn, isHandRaised]);

  // Toggle hand raise
  const toggleHandRaise = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'media-state',
        userId: user?.id,
        isMuted,
        isVideoOn,
        isScreenSharing,
        isHandRaised: newState,
      }));
    }
  }, [user?.id, isMuted, isVideoOn, isScreenSharing, isHandRaised]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentRoomRef.current) {
        leaveRoom();
      }
    };
  }, [leaveRoom]);

  return {
    localStream,
    screenStream,
    participants,
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
  };
}
