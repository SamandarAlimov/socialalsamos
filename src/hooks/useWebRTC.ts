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
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const politeRef = useRef<Map<string, boolean>>(new Map());

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

  // Create peer connection with proper track handling
  const createPeerConnection = useCallback((participantId: string): RTCPeerConnection => {
    console.log('[WebRTC] Creating peer connection for:', participantId);
    
    // Close existing connection if any
    const existingPc = peerConnectionsRef.current.get(participantId);
    if (existingPc) {
      console.log('[WebRTC] Closing existing connection for:', participantId);
      existingPc.close();
      peerConnectionsRef.current.delete(participantId);
    }

    const pc = new RTCPeerConnection(DEFAULT_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebRTC] Sending ICE candidate to:', participantId);
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          targetUserId: participantId,
          userId: user?.id,
          candidate: event.candidate.toJSON(),
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received track from:', participantId, 'kind:', event.track.kind);
      const stream = event.streams[0];
      
      if (stream) {
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
            stream: stream,
          });
          return updated;
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${participantId}:`, pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        console.log('[WebRTC] Connection failed, attempting restart');
        pc.restartIce();
      } else if (pc.connectionState === 'connected') {
        console.log('[WebRTC] Successfully connected to:', participantId);
        toast({
          title: 'Connected',
          description: 'Call connected successfully',
        });
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

    pc.onnegotiationneeded = async () => {
      console.log('[WebRTC] Negotiation needed for:', participantId);
      try {
        makingOfferRef.current.set(participantId, true);
        await pc.setLocalDescription();
        if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            targetUserId: participantId,
            userId: user?.id,
            sdp: pc.localDescription,
          }));
        }
      } catch (err) {
        console.error('[WebRTC] Error during negotiation:', err);
      } finally {
        makingOfferRef.current.set(participantId, false);
      }
    };

    // Add local stream tracks to the peer connection
    const stream = localStreamRef.current;
    if (stream) {
      console.log('[WebRTC] Adding local tracks to peer connection');
      stream.getTracks().forEach(track => {
        console.log('[WebRTC] Adding track:', track.kind, 'enabled:', track.enabled);
        pc.addTrack(track, stream);
      });
    } else {
      console.warn('[WebRTC] No local stream available when creating peer connection');
    }

    peerConnectionsRef.current.set(participantId, pc);
    return pc;
  }, [user?.id, toast]);

  // Handle incoming offer using "perfect negotiation" pattern
  const handleOffer = useCallback(async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    console.log('[WebRTC] Handling offer from:', fromUserId);
    
    let pc = peerConnectionsRef.current.get(fromUserId);
    const offerCollision = makingOfferRef.current.get(fromUserId) || 
                          (pc?.signalingState !== 'stable' && pc?.signalingState !== undefined);
    
    // Determine politeness - lower user ID is polite
    const isPolite = (user?.id || '') < fromUserId;
    politeRef.current.set(fromUserId, isPolite);
    
    // Handle glare (simultaneous offers)
    if (offerCollision && !isPolite) {
      console.log('[WebRTC] Ignoring offer due to glare - we are impolite');
      return;
    }

    if (!pc) {
      pc = createPeerConnection(fromUserId);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Remote description set for:', fromUserId);

      // Process any pending ICE candidates
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
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Remote description (answer) set for:', fromUserId);

      // Process any pending ICE candidates
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
      // Queue candidate if remote description not set yet
      console.log('[WebRTC] Queuing ICE candidate from:', fromUserId);
      const pending = pendingCandidatesRef.current.get(fromUserId) || [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(fromUserId, pending);
    }
  }, []);

  // Start local media stream
  const startLocalStream = useCallback(async (video = true, audio = true) => {
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

  // Connect to WebSocket signaling server
  const connectWebSocket = useCallback((roomIdToJoin: string) => {
    if (!user?.id) {
      console.error('[WebRTC] Cannot connect WebSocket - no user ID');
      return;
    }

    console.log('[WebRTC] Connecting to WebSocket for room:', roomIdToJoin);
    const wsUrl = `wss://mbhjganbihamoiqmankv.supabase.co/functions/v1/webrtc-signaling`;
    
    // Close existing connection if any
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
          case 'room-joined':
            console.log('[WebRTC] Joined room, existing participants:', data.participants);
            setIsConnected(true);
            
            // Create offers for all existing participants
            for (const participantId of data.participants || []) {
              if (participantId !== user.id) {
                console.log('[WebRTC] Creating offer for existing participant:', participantId);
                const pc = createPeerConnection(participantId);
                
                try {
                  const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                  });
                  await pc.setLocalDescription(offer);
                  
                  wsRef.current?.send(JSON.stringify({
                    type: 'offer',
                    targetUserId: participantId,
                    userId: user.id,
                    sdp: offer,
                  }));
                  console.log('[WebRTC] Offer sent to:', participantId);
                } catch (err) {
                  console.error('[WebRTC] Error creating/sending offer:', err);
                }
              }
            }
            break;

          case 'user-joined':
            if (data.userId !== user.id) {
              console.log('[WebRTC] New user joined:', data.userId);
              
              // Add placeholder participant
              setParticipants(prev => {
                const updated = new Map(prev);
                if (!updated.has(data.userId)) {
                  updated.set(data.userId, {
                    id: data.userId,
                    stream: null,
                    isMuted: false,
                    isVideoOn: true,
                    isScreenSharing: false,
                    isHandRaised: false,
                  });
                }
                return updated;
              });
              
              // Create peer connection and send offer to new user
              console.log('[WebRTC] Creating offer for new participant:', data.userId);
              const pc = createPeerConnection(data.userId);
              
              try {
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true,
                });
                await pc.setLocalDescription(offer);
                
                wsRef.current?.send(JSON.stringify({
                  type: 'offer',
                  targetUserId: data.userId,
                  userId: user.id,
                  sdp: offer,
                }));
                console.log('[WebRTC] Offer sent to new user:', data.userId);
              } catch (err) {
                console.error('[WebRTC] Error creating offer for new user:', err);
              }
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
            console.log('[WebRTC] User left:', data.userId);
            const pc = peerConnectionsRef.current.get(data.userId);
            if (pc) {
              pc.close();
              peerConnectionsRef.current.delete(data.userId);
            }
            pendingCandidatesRef.current.delete(data.userId);
            makingOfferRef.current.delete(data.userId);
            politeRef.current.delete(data.userId);
            
            setParticipants(prev => {
              const updated = new Map(prev);
              updated.delete(data.userId);
              return updated;
            });
            break;

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
      
      // Attempt reconnection if we're still supposed to be in the room
      if (currentRoomRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        console.log(`[WebRTC] Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (currentRoomRef.current) {
            connectWebSocket(currentRoomRef.current);
          }
        }, RECONNECT_DELAY * reconnectAttemptsRef.current);
      }
    };
  }, [user?.id, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, toast]);

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

    // Start local stream first
    const stream = await startLocalStream();
    if (!stream) {
      setIsConnecting(false);
      return;
    }

    // Connect to signaling server
    connectWebSocket(roomId);
    
    // Start quality monitoring
    startQualityMonitoring();
  }, [roomId, user?.id, startLocalStream, connectWebSocket, startQualityMonitoring]);

  // Leave room and cleanup
  const leaveRoom = useCallback(() => {
    console.log('[WebRTC] Leaving room');
    currentRoomRef.current = null;
    
    // Clear reconnection attempts
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
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
    wsRef.current = null;

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, id) => {
      console.log('[WebRTC] Closing peer connection:', id);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    makingOfferRef.current.clear();
    politeRef.current.clear();

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
  }, [user?.id, isMuted, isScreenSharing, isHandRaised]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);

      // Replace screen track with camera track
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
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
        console.error('[WebRTC] Error sharing screen:', err);
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
  }, [isScreenSharing, screenStream, user?.id, isMuted, isVideoOn, isHandRaised, toast]);

  // Toggle hand raise
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

  // Send chat message
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
